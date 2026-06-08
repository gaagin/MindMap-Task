import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { WorkspaceState, TaskNode, Folder, Project, TagCategory, SyncReport } from '../types';

// Registry for Deletion tracking
export interface DeletionRecord {
  type: 'folder' | 'project' | 'node' | 'tagCategory';
  id: string;
  deletedAt: string;
}

const DELETIONS_KEY = 'milli_deleted_registry';

/**
 * Register a deleted element so we can keep track of deletions.
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
    const filtered = current.filter(c => !uploaded.some(u => u.id === c.id && u.type === c.type));
    localStorage.setItem(DELETIONS_KEY, JSON.stringify(filtered));
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

/**
 * Saves current WorkspaceState snapshot to firestore database dynamically.
 */
export async function saveToFirebaseDirectly(userId: string, state: WorkspaceState) {
  try {
    const docRef = doc(db, 'workspaces', userId);
    const rawPayload = {
      userId,
      folders: state.folders.map(f => ({ ...f, updatedAt: f.updatedAt || new Date().toISOString() })),
      projects: state.projects.map(p => ({ ...p, updatedAt: p.updatedAt || new Date().toISOString() })),
      nodes: Object.keys(state.nodes).reduce((acc, key) => {
        acc[key] = state.nodes[key].map(n => ({ ...n, updatedAt: n.updatedAt || new Date().toISOString() }));
        return acc;
      }, {} as Record<string, TaskNode[]>),
      activeProjectId: state.activeProjectId,
      tagCategories: (state.tagCategories || []).map(t => ({ ...t, updatedAt: t.updatedAt || new Date().toISOString() })),
      updatedAt: new Date().toISOString(),
      deletions: getLocalDeletions()
    };
    
    const payload = sanitizeForFirestore(rawPayload);
    await setDoc(docRef, payload);
    console.log('Firebase cloud sync snapshot completed successfully.');
    return true;
  } catch (error) {
    console.error('Firebase snapshot save error:', error);
    return false;
  }
}

/**
 * Merges a local WorkspaceState and a cloud WorkspaceState using timestamps and deletion records.
 * Returns the merged state and a combined list of deletions that should remain.
 */
export function mergeWorkspaceStates(
  local: WorkspaceState,
  cloud: WorkspaceState & { deletions?: DeletionRecord[] },
  localDeletions: DeletionRecord[],
  cloudDeletions: DeletionRecord[] = cloud.deletions || []
): { mergedState: WorkspaceState; mergedDeletions: DeletionRecord[] } {
  const mergedDeletionsMap = new Map<string, DeletionRecord>();
  
  const combineDeletions = (...lists: DeletionRecord[][]) => {
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const rec of list) {
        if (!rec || !rec.id || !rec.type) continue;
        const key = `${rec.type}_${rec.id}`;
        const existingRec = mergedDeletionsMap.get(key);
        if (!existingRec || new Date(rec.deletedAt) > new Date(existingRec.deletedAt)) {
          mergedDeletionsMap.set(key, rec);
        }
      }
    }
  };
  
  combineDeletions(localDeletions, cloudDeletions);
  const mergedDeletions = Array.from(mergedDeletionsMap.values());

  const isDeleted = (type: DeletionRecord['type'], id: string, updatedAtStr?: string) => {
    const key = `${type}_${id}`;
    const rec = mergedDeletionsMap.get(key);
    if (!rec) return false;
    if (!updatedAtStr) return true;
    return new Date(rec.deletedAt) > new Date(updatedAtStr);
  };

  const mergeEntities = <T extends { id: string; updatedAt?: string }>(
    localArr: T[] = [],
    cloudArr: T[] = [],
    type: DeletionRecord['type']
  ): T[] => {
    const localMap = new Map(localArr.map(x => [x.id, x]));
    const cloudMap = new Map(cloudArr.map(x => [x.id, x]));
    const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);
    const result: T[] = [];

    for (const id of allIds) {
      const localVal = localMap.get(id);
      const cloudVal = cloudMap.get(id);

      const latestUpdate = [localVal?.updatedAt, cloudVal?.updatedAt]
        .filter(Boolean)
        .map(t => new Date(t!).toISOString())
        .sort()
        .pop();

      if (isDeleted(type, id, latestUpdate)) {
        continue;
      }

      if (localVal && cloudVal) {
        const localTime = localVal.updatedAt ? new Date(localVal.updatedAt).getTime() : 0;
        const cloudTime = cloudVal.updatedAt ? new Date(cloudVal.updatedAt).getTime() : 0;
        if (localTime >= cloudTime) {
          result.push(localVal);
        } else {
          result.push(cloudVal);
        }
      } else if (localVal) {
        result.push(localVal);
      } else if (cloudVal) {
        result.push(cloudVal);
      }
    }

    return result;
  };

  const folders = mergeEntities(local.folders, cloud.folders, 'folder');
  const projects = mergeEntities(local.projects, cloud.projects, 'project');
  const tagCategories = mergeEntities(local.tagCategories || [], cloud.tagCategories || [], 'tagCategory');

  const allProjectIds = new Set([
    ...Object.keys(local.nodes || {}),
    ...Object.keys(cloud.nodes || {})
  ]);

  const nodes: Record<string, TaskNode[]> = {};
  for (const pid of allProjectIds) {
    const localNodes = local.nodes[pid] || [];
    const cloudNodes = cloud.nodes[pid] || [];
    const mergedForProject = mergeEntities(localNodes, cloudNodes, 'node');
    if (mergedForProject.length > 0) {
      nodes[pid] = mergedForProject;
    }
  }

  let activeProjectId = local.activeProjectId;
  const localUpdate = [
    ...local.folders.map(f => f.updatedAt),
    ...local.projects.map(p => p.updatedAt),
    ...Object.values(local.nodes).flat().map(n => n.updatedAt)
  ].filter(Boolean).map(t => new Date(t!).getTime()).sort((a, b) => b - a)[0] || 0;

  const cloudUpdate = [
    ...(cloud.folders || []).map(f => f.updatedAt),
    ...(cloud.projects || []).map(p => p.updatedAt),
    ...Object.values(cloud.nodes || {}).flat().map(n => n.updatedAt)
  ].filter(Boolean).map(t => new Date(t!).getTime()).sort((a, b) => b - a)[0] || 0;

  if (cloudUpdate > localUpdate && cloud.activeProjectId) {
    activeProjectId = cloud.activeProjectId;
  }

  const mergedState: WorkspaceState = {
    folders,
    projects,
    nodes,
    activeProjectId,
    tagCategories
  };

  return { mergedState, mergedDeletions };
}

/**
 * Executes a full bidirectional synchronization of the WorkspaceState with Firebase.
 * Loads the cloud snapshot, merges it with the local state using timestamps and deletion records,
 * saves the merged result to both Firestore and returns the final state to update the local store.
 */
export async function syncWithFirebase(
  userId: string,
  localState: WorkspaceState
): Promise<{ success: boolean; state: WorkspaceState }> {
  try {
    const docRef = doc(db, 'workspaces', userId);
    const snap = await getDoc(docRef);
    
    const localDeletions = getLocalDeletions();
    
    let mergedState = localState;
    let finalDeletions = localDeletions;

    if (snap.exists()) {
      const cloudData = snap.data() as WorkspaceState & { deletions?: DeletionRecord[] };
      const cloudDeletions = cloudData.deletions || [];
      
      const mergeResult = mergeWorkspaceStates(localState, cloudData, localDeletions, cloudDeletions);
      mergedState = mergeResult.mergedState;
      finalDeletions = mergeResult.mergedDeletions;
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
      updatedAt: new Date().toISOString(),
      deletions: finalDeletions
    };

    const payload = sanitizeForFirestore(rawPayload);
    await setDoc(docRef, payload);

    clearLocalDeletions(finalDeletions);
    
    console.log('Firebase cloud synchrony completed perfectly.');
    return { success: true, state: mergedState };
  } catch (error) {
    console.error('Super sync with Firebase failed:', error);
    return { success: false, state: localState };
  }
}

/**
 * Fetch latest WorkspaceState snapshot from firestore database.
 */
export async function loadFromFirebaseDirectly(userId: string): Promise<WorkspaceState | null> {
  try {
    const docRef = doc(db, 'workspaces', userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as WorkspaceState;
    }
  } catch (error) {
    console.error('Firebase snapshot load error:', error);
  }
  return null;
}
