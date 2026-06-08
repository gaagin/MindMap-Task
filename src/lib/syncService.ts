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
      updatedAt: new Date().toISOString()
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
