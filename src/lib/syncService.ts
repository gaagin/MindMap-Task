import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { WorkspaceState, TaskNode, Folder, Project, TagCategory, DeletionRecord } from '../types';

const DELETIONS_KEY = 'milli_deleted_registry';

/**
 * Register a deleted element so we can synchronize its deletion with the cloud.
 */
export function logDeletion(type: 'folder' | 'project' | 'node' | 'tagCategory', id: string) {
  try {
    const listJson = localStorage.getItem(DELETIONS_KEY) || '[]';
    const list = JSON.parse(listJson) as DeletionRecord[];
    if (!list.some(item => item.id === id && item.type === type)) {
      list.push({ type, id, deletedAt: new Date().toISOString() });
      localStorage.setItem(DELETIONS_KEY, JSON.stringify(list));
    }
  } catch (error) {
    console.error('Failed to log deletion:', error);
  }
}

export function getLocalDeletions(): DeletionRecord[] {
  try {
    const listJson = localStorage.getItem(DELETIONS_KEY) || '[]';
    return JSON.parse(listJson) as DeletionRecord[];
  } catch {
    return [];
  }
}

export function clearLocalDeletions(uploaded: DeletionRecord[]) {
  try {
    const current = getLocalDeletions();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    // Tombstone retention window (30 days) to prevent deleted items from reappearing.
    const filtered = current.filter(item => {
      try {
        return new Date(item.deletedAt || 0).getTime() > thirtyDaysAgo;
      } catch {
        return true; 
      }
    });
    
    localStorage.setItem(DELETIONS_KEY, JSON.stringify(filtered));
    console.log(`[Sync] Kept ${filtered.length} tombstones for 30-day cross-device preservation.`);
  } catch (error) {
    console.error('Failed to clear deletions registry:', error);
  }
}

// ----------------- FIREBASE SYNC -----------------

/**
 * Recursively removes any undefined fields or converts them to null to prevent Firestore invalid data errors.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  if (obj === null) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        res[key] = sanitizeForFirestore(val);
      }
    }
    return res;
  }
  return obj;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Fully symmetrical logic for merging two workspace states.
 * Ensures that updatedAt timestamps and deletions are strictly and authoritatively respected.
 */
export function mergeWorkspaceStates(
  local: WorkspaceState,
  cloud: WorkspaceState,
  mergedDeletions: DeletionRecord[]
): WorkspaceState {
  const isDeleted = (type: string, id: string) => {
    return mergedDeletions.some(d => d.type === type && d.id === id);
  };

  // 1. Merge Folders
  const mergedFoldersMap = new Map<string, Folder>();
  (local.folders || []).forEach(f => {
    if (!isDeleted('folder', f.id)) {
      mergedFoldersMap.set(f.id, { ...f, updatedAt: f.updatedAt || new Date(0).toISOString() });
    }
  });

  (cloud.folders || []).forEach(sf => {
    if (isDeleted('folder', sf.id)) return;
    const existingF = mergedFoldersMap.get(sf.id);
    if (!existingF) {
      mergedFoldersMap.set(sf.id, sf);
    } else {
      const localTime = new Date(existingF.updatedAt || 0).getTime();
      const remoteTime = new Date(sf.updatedAt || 0).getTime();
      if (remoteTime > localTime) {
        mergedFoldersMap.set(sf.id, sf);
      }
    }
  });

  // 2. Merge Projects
  const mergedProjectsMap = new Map<string, Project>();
  (local.projects || []).forEach(p => {
    if (!isDeleted('project', p.id)) {
      mergedProjectsMap.set(p.id, { ...p, updatedAt: p.updatedAt || new Date(0).toISOString() });
    }
  });

  (cloud.projects || []).forEach(sp => {
    if (isDeleted('project', sp.id)) return;
    const existingP = mergedProjectsMap.get(sp.id);
    if (!existingP) {
      mergedProjectsMap.set(sp.id, sp);
    } else {
      const localTime = new Date(existingP.updatedAt || 0).getTime();
      const remoteTime = new Date(sp.updatedAt || 0).getTime();
      if (remoteTime > localTime) {
        mergedProjectsMap.set(sp.id, sp);
      }
    }
  });

  // 3. Merge Nodes (flat merge)
  const mergedNodesMap = new Map<string, TaskNode>();
  Object.values(local.nodes || {}).flat().forEach(node => {
    if (node && !isDeleted('node', node.id)) {
      mergedNodesMap.set(node.id, { ...node, updatedAt: node.updatedAt || new Date(0).toISOString() });
    }
  });

  Object.values(cloud.nodes || {}).flat().forEach(sn => {
    if (!sn || isDeleted('node', sn.id)) return;
    const existingN = mergedNodesMap.get(sn.id);
    if (!existingN) {
      mergedNodesMap.set(sn.id, sn);
    } else {
      const localTime = new Date(existingN.updatedAt || 0).getTime();
      const remoteTime = new Date(sn.updatedAt || 0).getTime();
      if (remoteTime > localTime) {
        const mergedFiles = (sn.files || []).map(remoteFile => {
          if (remoteFile.dataUrl?.startsWith('_OMITTED_DUE_TO_SIZE_')) {
            const localFile = (existingN.files || []).find(lf => lf.id === remoteFile.id);
            if (localFile && localFile.dataUrl && !localFile.dataUrl.startsWith('_OMITTED_DUE_TO_SIZE_')) {
              return {
                ...remoteFile,
                dataUrl: localFile.dataUrl
              };
            }
          }
          return remoteFile;
        });
        mergedNodesMap.set(sn.id, {
          ...sn,
          files: mergedFiles
        });
      }
    }
  });

  // Group nodes back into project maps
  const finalNodesMap: Record<string, TaskNode[]> = {};
  mergedNodesMap.forEach(node => {
    if (mergedProjectsMap.has(node.projectId)) {
      if (!finalNodesMap[node.projectId]) finalNodesMap[node.projectId] = [];
      finalNodesMap[node.projectId].push(node);
    }
  });

  // 4. Merge TagCategories
  const mergedTagCatsMap = new Map<string, TagCategory>();
  (local.tagCategories || []).forEach(tc => {
    if (!isDeleted('tagCategory', tc.id)) {
      mergedTagCatsMap.set(tc.id, { ...tc, updatedAt: tc.updatedAt || new Date(0).toISOString() });
    }
  });

  (cloud.tagCategories || []).forEach(stc => {
    if (isDeleted('tagCategory', stc.id)) return;
    const existingTC = mergedTagCatsMap.get(stc.id);
    if (!existingTC) {
      mergedTagCatsMap.set(stc.id, stc);
    } else {
      const localTime = new Date(existingTC.updatedAt || 0).getTime();
      const remoteTime = new Date(stc.updatedAt || 0).getTime();
      if (remoteTime > localTime) {
        mergedTagCatsMap.set(stc.id, stc);
      }
    }
  });

  const finalFolders = Array.from(mergedFoldersMap.values());
  const finalProjects = Array.from(mergedProjectsMap.values());
  const finalTagCats = Array.from(mergedTagCatsMap.values());

  let finalActiveProjectId = local.activeProjectId;
  if (finalProjects.length > 0) {
    if (!finalActiveProjectId || !mergedProjectsMap.has(finalActiveProjectId)) {
      finalActiveProjectId = finalProjects[0].id;
    }
  } else {
    finalActiveProjectId = null;
  }

  return {
    folders: finalFolders,
    projects: finalProjects,
    nodes: finalNodesMap,
    activeProjectId: finalActiveProjectId,
    tagCategories: finalTagCats,
    deletions: mergedDeletions
  };
}

/**
 * Saves current WorkspaceState snapshot to Firestore database dynamically.
 */
export async function saveToFirebaseDirectly(userId: string, state: WorkspaceState): Promise<{ success: boolean; isOfflineQueued?: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'workspaces', userId);
    
    // Fetch existing cloud doc to merge
    let cloudData: any = null;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        cloudData = snap.data();
      }
    } catch (e) {
      console.warn('[saveToFirebaseDirectly] Failed to fetch existing cloud doc, proceeding with overwrite/local override:', e);
    }

    const cloudDeletions: DeletionRecord[] = cloudData?.deletions || [];
    const localDeletions = getLocalDeletions();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    // Merge deletions and prune older than 30 days
    const mergedDeletions: DeletionRecord[] = [];
    const appendUniqueDeletion = (rec: DeletionRecord) => {
      try {
        const deletedAtMs = new Date(rec.deletedAt || 0).getTime();
        if (deletedAtMs < thirtyDaysAgo) return; 
      } catch {
        // Keep it if parsing fails
      }
      if (!mergedDeletions.some(m => m.id === rec.id && m.type === rec.type)) {
        mergedDeletions.push(rec);
      }
    };
    cloudDeletions.forEach(appendUniqueDeletion);
    localDeletions.forEach(appendUniqueDeletion);

    // Update local deletion registry to be fully aligned
    try {
      localStorage.setItem('milli_deleted_registry', JSON.stringify(mergedDeletions));
    } catch (e) {
      console.error(e);
    }

    const cloudState: WorkspaceState = {
      folders: cloudData?.folders || [],
      projects: cloudData?.projects || [],
      nodes: cloudData?.nodes || {},
      activeProjectId: cloudData?.activeProjectId || null,
      tagCategories: cloudData?.tagCategories || [],
    };

    const mergedState = cloudData
      ? mergeWorkspaceStates(state, cloudState, mergedDeletions)
      : state;

    // Load and include local active Pomodoro state if any
    let activePomodoro = null;
    try {
      const localPomoSaved = localStorage.getItem('task_mindmap_pomodoro');
      if (localPomoSaved) {
        activePomodoro = JSON.parse(localPomoSaved);
      }
    } catch (e) {
      console.error('Failed to parse local Pomodoro state for Firestore syncer:', e);
    }

    const rawPayload = {
      userId,
      folders: mergedState.folders.map(f => ({ ...f, updatedAt: f.updatedAt || new Date().toISOString() })),
      projects: mergedState.projects.map(p => ({ ...p, updatedAt: p.updatedAt || new Date().toISOString() })),
      nodes: Object.keys(mergedState.nodes).reduce((acc, key) => {
        acc[key] = mergedState.nodes[key].map(n => ({ ...n, updatedAt: n.updatedAt || new Date().toISOString() }));
        return acc;
      }, {} as Record<string, TaskNode[]>),
      activeProjectId: mergedState.activeProjectId,
      tagCategories: (mergedState.tagCategories || []).map(t => ({ ...t, updatedAt: t.updatedAt || new Date().toISOString() })),
      activePomodoro,
      deletions: mergedDeletions,
      updatedAt: new Date().toISOString()
    };
    
    const payload = sanitizeForFirestore(rawPayload);
    
    // Estimate payload size in KB
    const serialized = JSON.stringify(payload);
    const sizeInKb = Math.round(serialized.length / 1024);
    if (sizeInKb > 1000) {
      throw new Error(`Размер вашей карты (${sizeInKb} KB) превышает лимит базы данных Firestore (1000 KB). Пожалуйста, удалите некоторые вложения!`);
    }

    const currentTimeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Превышено время ожидания сервера (${currentTimeoutMs / 1000}с). Снимок сохранён локально, и синхронизируется при стабильном подключении.`)), currentTimeoutMs)
    );

    await Promise.race([
      setDoc(docRef, payload),
      timeoutPromise
    ]);

    console.log(`Firebase cloud sync completed successfully.`);
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, `workspaces/${userId}`);
    }
    
    if (error?.message && error.message.includes('Превышено время ожидания сервера')) {
      console.info('Firebase sync offline queued:', error.message);
      return { 
        success: true, 
        isOfflineQueued: true, 
        error: error.message 
      };
    }

    console.error('Firebase snapshot save error:', error);
    return { 
      success: false, 
      error: error?.message || 'Превышено время ожидания сервера.' 
    };
  }
}

/**
 * Fetch latest WorkspaceState snapshot from Firestore database.
 */
export async function loadFromFirebaseDirectly(userId: string): Promise<WorkspaceState | null> {
  try {
    const docRef = doc(db, 'workspaces', userId);
    const currentTimeoutMs = 60000;
    
    const snap = await Promise.race([
      getDoc(docRef),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Превышено время ожидания загрузки (${currentTimeoutMs / 1000}с).`)), currentTimeoutMs)
      )
    ]);

    if (snap.exists()) {
      return snap.data() as WorkspaceState;
    }
    return null;
  } catch (error: any) {
    if (error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, `workspaces/${userId}`);
    }
    if (error?.message && error.message.includes('Превышено время ожидания')) {
      console.warn('Firebase snapshot load timeout:', error.message);
    } else {
      console.error('Firebase snapshot load error:', error);
    }
    throw error || new Error('Превышено время ожидания загрузки. Пожалуйста, проверьте интернет-соединение.');
  }
}
