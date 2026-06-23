import { doc, getDoc, getDocFromCache, setDoc, updateDoc, arrayUnion, deleteField, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { WorkspaceState, TaskNode, Folder, Project, TagCategory, DeletionRecord } from '../types';

const DELETIONS_KEY = 'milli_deleted_registry';

/**
 * Register a deleted element so we can synchronize its deletion with the cloud.
 */
export function logDeletion(type: 'folder' | 'project' | 'node' | 'tagCategory', id: string) {
  try {
    const listJson = localStorage.getItem(DELETIONS_KEY) || '[]';
    const parsed = JSON.parse(listJson);
    const list = Array.isArray(parsed) ? (parsed as DeletionRecord[]) : [];
    if (!list.some(item => item && item.id === id && item.type === type)) {
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
    const parsed = JSON.parse(listJson);
    return Array.isArray(parsed) ? (parsed as DeletionRecord[]) : [];
  } catch {
    return [];
  }
}

// ----------------- IN-MEMORY STATE CACHE FOR CHIP SHIELD DEEP COMPARISON -----------------
let lastSyncedStateInMemory: WorkspaceState | null = null;

export function updateLastSyncedStateCache(state: WorkspaceState | null) {
  if (state) {
    // Deep clone to ensure we hold a static snapshot, not a live reference
    lastSyncedStateInMemory = JSON.parse(JSON.stringify(state));
  } else {
    lastSyncedStateInMemory = null;
  }
}

/**
 * Perform static domain-specific deep comparison of 2 states to shield Firestore
 * from redundant write operations on small edits or accidental duplicate effect runs.
 * Conserves Firestore Write Operation quotas.
 */
export function isWorkspaceStateSemanticallyEqual(a: WorkspaceState, b: WorkspaceState): boolean {
  if (a.activeProjectId !== b.activeProjectId) return false;
  
  // Folders comparison
  const af = a.folders || [];
  const bf = b.folders || [];
  if (af.length !== bf.length) return false;
  const afMap = new Map(af.map(f => [f.id, f]));
  for (const f of bf) {
    const existing = afMap.get(f.id);
    if (!existing) return false;
    if (existing.name !== f.name || existing.parentId !== f.parentId || existing.updatedAt !== f.updatedAt) {
      return false;
    }
  }

  // Projects comparison
  const ap = a.projects || [];
  const bp = b.projects || [];
  if (ap.length !== bp.length) return false;
  const apMap = new Map(ap.map(p => [p.id, p]));
  for (const p of bp) {
    const existing = apMap.get(p.id);
    if (!existing) return false;
    if (existing.name !== p.name || existing.folderId !== p.folderId || existing.updatedAt !== p.updatedAt) {
      return false;
    }
  }

  // TagCategories comparison
  const at = a.tagCategories || [];
  const bt = b.tagCategories || [];
  if (at.length !== bt.length) return false;
  const atMap = new Map(at.map(t => [t.id, t]));
  for (const t of bt) {
    const existing = atMap.get(t.id);
    if (!existing) return false;
    if (existing.name !== t.name || existing.color !== t.color || existing.updatedAt !== t.updatedAt) {
      return false;
    }
    if (existing.tags.length !== t.tags.length || !existing.tags.every((val, idx) => val === t.tags[idx])) {
      return false;
    }
  }

  // Nodes comparison
  const anKeys = Object.keys(a.nodes || {});
  const bnKeys = Object.keys(b.nodes || {});
  if (anKeys.length !== bnKeys.length) return false;
  for (const pId of anKeys) {
    const anList = a.nodes[pId] || [];
    const bnList = b.nodes[pId] || [];
    if (anList.length !== bnList.length) return false;
    
    const anMap = new Map(anList.map(n => [n.id, n]));
    for (const n of bnList) {
      const existing = anMap.get(n.id);
      if (!existing) return false;
      // Compare key properties of the nodes
      if (
        existing.text !== n.text ||
        existing.notes !== n.notes ||
        existing.x !== n.x ||
        existing.y !== n.y ||
        existing.parentId !== n.parentId ||
        existing.priority !== n.priority ||
        existing.completed !== n.completed ||
        existing.color !== n.color ||
        existing.collapsed !== n.collapsed ||
        existing.isCardCollapsed !== n.isCardCollapsed ||
        existing.dueDate !== n.dueDate ||
        existing.dueTime !== n.dueTime ||
        existing.startDate !== n.startDate ||
        existing.startTime !== n.startTime ||
        existing.progress !== n.progress ||
        existing.isFloating !== n.isFloating ||
        existing.isContainer !== n.isContainer ||
        existing.isWorkflowRectangle !== n.isWorkflowRectangle ||
        existing.workflowShape !== n.workflowShape ||
        existing.zoneWidth !== n.zoneWidth ||
        existing.zoneHeight !== n.zoneHeight ||
        existing.width !== n.width ||
        existing.height !== n.height ||
        existing.updatedAt !== n.updatedAt ||
        existing.pomodoroTotalTime !== n.pomodoroTotalTime ||
        existing.pomodoroSessionsCount !== n.pomodoroSessionsCount ||
        existing.archived !== n.archived ||
        existing.externalLink !== n.externalLink
      ) {
        return false;
      }
      
      // Compare tags list within node
      if (existing.tags.length !== n.tags.length || !existing.tags.every((t_val, idx) => t_val === n.tags[idx])) {
        return false;
      }

      // Compare attachments lists length
      const eFiles = existing.files || [];
      const nFiles = n.files || [];
      if (eFiles.length !== nFiles.length) return false;
      // Check attachment metadata
      for (let i = 0; i < eFiles.length; i++) {
        if (eFiles[i].id !== nFiles[i].id || eFiles[i].name !== nFiles[i].name || eFiles[i].size !== nFiles[i].size) {
          return false;
        }
      }
    }
  }

  // Deletions comparison
  const ad = Array.isArray(a.deletions) ? a.deletions : [];
  const bd = Array.isArray(b.deletions) ? b.deletions : [];
  if (ad.length !== bd.length) return false;
  const adMap = new Map(ad.map(d => [`${d.type}:${d.id}`, d]));
  for (const d of bd) {
    if (!adMap.has(`${d.type}:${d.id}`)) return false;
  }

  return true;
}

// ----------------- RELATIONAL COMBINATION MERGER -----------------

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
        mergedNodesMap.set(sn.id, sn);
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

// ----------------- SANITIZATION AND DATES CONVERSION -----------------

/**
 * Converts Firestore server Timestamp representations into normal ISO string objects inside loaded state.
 * This guarantees perfect type integrity with client-side code and avoids component errors.
 */
export function convertTimestampsToIso(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertTimestampsToIso);
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = convertTimestampsToIso(obj[key]);
    }
    return res;
  }
  return obj;
}

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

  // Guard against corrupting Firestore FieldValue sentinels (serverTimestamp, deleteField, arrayUnion)
  if (typeof obj === 'object') {
    const constructorName = obj.constructor?.name || '';
    if (
      constructorName.includes('FieldValue') || 
      '_methodName' in obj || 
      (typeof obj.isEqual === 'function' && constructorName !== 'Object')
    ) {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    if (obj instanceof Date) {
      return obj;
    }
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

// ----------------- ERROR HANDLING BLOCK (SKILLS SECTION 3) -----------------

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
 * Executes a promise with a timeout window. Rejects if timeout expires.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// ----------------- DISCIPLINED POINT-LEVEL DELTA WRITES -----------------

/**
 * Saves current WorkspaceState changes to Firestore dynamically using point-level updates.
 * Implements strict state shielding via semantic equivalence comparison to conserve Firestore operations count.
 */
export async function saveToFirebaseDirectly(
  userId: string, 
  state: WorkspaceState
): Promise<{ success: boolean; isOfflineQueued?: boolean; error?: string; isQuotaExceeded?: boolean }> {
  try {
    const docRef = doc(db, 'workspaces', userId);

    // CRITICAL: Shield write operations check. If semantic check returns true, skip writing.
    // Minimizes read/write traffic significantly on accidental renders.
    if (lastSyncedStateInMemory && isWorkspaceStateSemanticallyEqual(state, lastSyncedStateInMemory)) {
      console.log('[Sync Shield] Skip redundant save. State holds no mutations.');
      return { success: true };
    }

    // Load active Local Deletions registry
    const localDeletions = getLocalDeletions();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Prune very old mutations
    const activeLocalDeletions = localDeletions.filter(rec => {
      try {
        return new Date(rec.deletedAt || 0).getTime() > thirtyDaysAgo;
      } catch {
        return true;
      }
    });

    // 1. Fetch current cloud document safely using standard offline-first friendly getDoc with cache fallback
    let cloudDocSnap = null;
    try {
      // 15-second timeout to fall back to cache quickly if connection is blocked or hanging
      cloudDocSnap = await withTimeout(getDoc(docRef), 15000, 'Firestore fetch timed out');
    } catch (e: any) {
      const isOfflineError = !navigator.onLine || 
        String(e?.message || '').toLowerCase().includes('offline') ||
        String(e?.message || '').toLowerCase().includes('timeout') ||
        e?.code === 'unavailable';
      if (isOfflineError) {
        console.warn('[Sync] Offline, timeout, or connection error; attempting to load from local Firestore cache for delta updates...', e);
        try {
          cloudDocSnap = await getDocFromCache(docRef);
          console.log('[Sync] Success loading from local cache for delta computation while offline.');
        } catch (cacheError) {
          console.warn('[Sync] Failed to perform initial document fetch (offline fallback and cache is empty):', cacheError);
        }
      } else {
        console.warn('[Sync] Failed to perform initial document fetch (offline fallback):', e);
      }
    }

    const payloadExists = cloudDocSnap && cloudDocSnap.exists();
    
    if (!payloadExists) {
      // SCENARIO A: Document does not exist. Initialize complete blueprint first
      const rawPayload = {
        userId,
        folders: state.folders.map(f => ({ ...f, updatedAt: f.updatedAt || new Date().toISOString() })),
        projects: state.projects.map(p => ({ ...p, updatedAt: p.updatedAt || new Date().toISOString() })),
        nodes: Object.keys(state.nodes).reduce((acc, pId) => {
          acc[pId] = (state.nodes[pId] || []).map(n => ({ ...n, updatedAt: n.updatedAt || new Date().toISOString() }));
          return acc;
        }, {} as Record<string, TaskNode[]>),
        activeProjectId: state.activeProjectId,
        tagCategories: (state.tagCategories || []).map(t => ({ ...t, updatedAt: t.updatedAt || new Date().toISOString() })),
        deletions: activeLocalDeletions,
        updatedAt: serverTimestamp() // Set secure server time (Pillar 13)
      };

      const sanitized = sanitizeForFirestore(rawPayload);
      await withTimeout(setDoc(docRef, sanitized), 25000, 'Firestore write/set timed out');
      updateLastSyncedStateCache(state); // Update local memory representation
      console.log('[Sync] Created brand new user workspace root doc with server timestamp.');
      return { success: true };
    }

    // SCENARIO B: Document already exists. Apply highly performant, point-level delta updates
    const cloudDataResponse = convertTimestampsToIso(cloudDocSnap!.data());
    const cloudState: WorkspaceState = {
      folders: cloudDataResponse?.folders || [],
      projects: cloudDataResponse?.projects || [],
      nodes: cloudDataResponse?.nodes || {},
      activeProjectId: cloudDataResponse?.activeProjectId || null,
      tagCategories: cloudDataResponse?.tagCategories || [],
      deletions: Array.isArray(cloudDataResponse?.deletions) ? cloudDataResponse.deletions : []
    };

    // Synthesize deletion tombstone collections
    const mergedDeletionsList: DeletionRecord[] = [];
    const pushIfUnique = (rec: DeletionRecord) => {
      if (!mergedDeletionsList.some(m => m.id === rec.id && m.type === rec.type)) {
        mergedDeletionsList.push(rec);
      }
    };
    (Array.isArray(cloudState.deletions) ? cloudState.deletions : []).forEach(pushIfUnique);
    activeLocalDeletions.forEach(pushIfUnique);

    // Merge conflicts on the client via Last Write Wins strategy
    const mergedState = mergeWorkspaceStates(state, cloudState, mergedDeletionsList);

    // Create the delta mutation map referencing nested pathways
    const deltaMap: Record<string, any> = {};

    // Point 1: Check activeProjectId change
    if (mergedState.activeProjectId !== cloudState.activeProjectId) {
      deltaMap['activeProjectId'] = mergedState.activeProjectId;
    }

    // Point 2: Compare and detect folder modifications
    const foldersChanged = JSON.stringify(mergedState.folders) !== JSON.stringify(cloudState.folders);
    if (foldersChanged) {
      deltaMap['folders'] = mergedState.folders.map(f => ({ ...f, updatedAt: f.updatedAt || new Date().toISOString() }));
    }

    // Point 3: Compare and detect project modifications
    const projectsChanged = JSON.stringify(mergedState.projects) !== JSON.stringify(cloudState.projects);
    if (projectsChanged) {
      deltaMap['projects'] = mergedState.projects.map(p => ({ ...p, updatedAt: p.updatedAt || new Date().toISOString() }));
    }

    // Point 4: Compare tagCategories
    const tagCatsChanged = JSON.stringify(mergedState.tagCategories) !== JSON.stringify(cloudState.tagCategories);
    if (tagCatsChanged) {
      deltaMap['tagCategories'] = (mergedState.tagCategories || []).map(t => ({ ...t, updatedAt: t.updatedAt || new Date().toISOString() }));
    }

    // Point 5: Compare nodes project-by-project and trigger granular point writes for affected nodes arrays
    const cloudNodePids = Object.keys(cloudState.nodes || {});
    const localNodePids = Object.keys(mergedState.nodes || {});
    const checkedPids = new Set([...cloudNodePids, ...localNodePids]);

    checkedPids.forEach(pId => {
      const localListObj = mergedState.nodes[pId];
      const cloudListObj = cloudState.nodes[pId];

      if (!localListObj) {
        // Project was removed, delete its nested nodes field completely
        deltaMap[`nodes.${pId}`] = deleteField();
      } else if (!cloudListObj || JSON.stringify(localListObj) !== JSON.stringify(cloudListObj)) {
        // Segment was mutated or added. Point write segment nodes!
        deltaMap[`nodes.${pId}`] = localListObj.map(n => ({ ...n, updatedAt: n.updatedAt || new Date().toISOString() }));
      }
    });

    // Point 6: Compare deletions and use arrayUnion to append new records
    const previousDeletionsMap = new Set((Array.isArray(cloudState.deletions) ? cloudState.deletions : []).map((d: any) => `${d.type}:${d.id}`));
    const newAdditionDeletions = mergedDeletionsList.filter(d => !previousDeletionsMap.has(`${d.type}:${d.id}`));
    if (newAdditionDeletions.length > 0) {
      deltaMap['deletions'] = arrayUnion(...newAdditionDeletions);
    }

    // If there are point modifications, append the root serverTimestamp and updateDoc
    if (Object.keys(deltaMap).length > 0) {
      deltaMap['updatedAt'] = serverTimestamp();
      
      const sanitizedDelta = sanitizeForFirestore(deltaMap);
      await withTimeout(updateDoc(docRef, sanitizedDelta), 25000, 'Firestore write/update timed out');
      console.log(`[Sync Delta] Successfully updated modified key fields in Firestore:`, Object.keys(deltaMap));
    } else {
      console.log('[Sync Delta] No point changes detected after structural merging.');
    }

    // Ensure we capture this state as successfully synced
    updateLastSyncedStateCache(state);
    return { success: true };

  } catch (error: any) {
    if (error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, `workspaces/${userId}`);
    }
    console.error('[Sync] Error during point-level delta snapshot save:', error);
    
    const errMessageStr = String(error?.message || '').toLowerCase();
    const isQuota = errMessageStr.includes('quota') || 
                    errMessageStr.includes('exhausted') || 
                    error?.code === 'resource-exhausted';
                    
    return { 
      success: false, 
      isQuotaExceeded: isQuota,
      error: error?.message || 'Failed to sync with standard Cloud storage.' 
    };
  }
}

/**
 * Fetch latest WorkspaceState snapshot from Firestore database.
 * Resolves standard Firestore types safely via timestamp-to-ISO utilities.
 */
export async function loadFromFirebaseDirectly(userId: string): Promise<WorkspaceState | null> {
  const docRef = doc(db, 'workspaces', userId);
  let snap;
  try {
    try {
      snap = await withTimeout(getDoc(docRef), 15000, 'Firestore fetch timed out');
    } catch (getDocErr: any) {
      const isOfflineError = !navigator.onLine || 
        String(getDocErr?.message || '').toLowerCase().includes('offline') ||
        String(getDocErr?.message || '').toLowerCase().includes('timeout') ||
        getDocErr?.code === 'unavailable';
      if (isOfflineError) {
        console.warn('[Sync] Offline or connection error detected during direct Firestore load. Attempting to load from local cache...');
        try {
          snap = await getDocFromCache(docRef);
          console.log('[Sync] Successfully loaded document from Firestore local cache.');
        } catch (cacheErr: any) {
          console.warn('[Sync] Failed to load document from Firestore cache:', cacheErr);
          throw getDocErr; // rethrow the original offline error
        }
      } else {
        throw getDocErr;
      }
    }

    if (snap && snap.exists()) {
      const converted = convertTimestampsToIso(snap.data());
      const stateObj = converted as WorkspaceState;
      // Initialize module cache
      updateLastSyncedStateCache(stateObj);
      return stateObj;
    }
    return null;
  } catch (error: any) {
    if (error?.code === 'permission-denied' || String(error?.message || '').toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, `workspaces/${userId}`);
    }
    
    const isOfflineMode = !navigator.onLine || 
      String(error?.message || '').toLowerCase().includes('offline') ||
      String(error?.message || '').toLowerCase().includes('timeout') ||
      error?.code === 'unavailable';
      
    if (isOfflineMode) {
      console.warn('[Sync] Firestore load failed due to being offline. Graceful degradation.', error);
      // Under offline conditions, return null instead of throwing terminal uncaught failures
      return null;
    }
    
    console.error('[Sync] Firestore document load error:', error);
    throw error || new Error('Could not download root workspace database.');
  }
}
