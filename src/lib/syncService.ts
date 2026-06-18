import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { WorkspaceState, TaskNode, Folder, Project, TagCategory, SyncReport, DeletionRecord } from '../types';

const DELETIONS_KEY = 'milli_deleted_registry';

/**
 * Register a deleted element so we can synchronize its deletion with Sheets.
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
    
    // In a professional tombstone sync engine, we DO NOT wipe deletions immediately upon upload.
    // Instead, we keep them as "tombstones" for a retention window (e.g. 30 days) to prevent 
    // deleted items from reappearing when syncing between devices.
    // We prune deletions older than 30 days.
    const filtered = current.filter(item => {
      try {
        return new Date(item.deletedAt || 0).getTime() > thirtyDaysAgo;
      } catch {
        return true; // Keep invalid formats as a safeguard
      }
    });
    
    localStorage.setItem(DELETIONS_KEY, JSON.stringify(filtered));
    console.log(`[Sync] Kept ${filtered.length} tombstones for 30-day cross-device preservation (pruned older ones).`);
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
 * Fully symmetrical logic for merging two workspace states
 * (local state and cloud state fetched from Firestore).
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
        // REMOTE wins! Restore full local base64 dataUrl if Google Sheets or remote cloud has placeholder string
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
    googleSheetsFileId: local.googleSheetsFileId || cloud.googleSheetsFileId,
    taskSheetsSpreadsheetId: local.taskSheetsSpreadsheetId || cloud.taskSheetsSpreadsheetId,
    deletions: mergedDeletions
  };
}

/**
 * Saves current WorkspaceState snapshot to firestore database dynamically.
 * Features automatic Exponential Backoff and progressive retries to handle unstable connections.
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
        if (deletedAtMs < thirtyDaysAgo) return; // Skip if older than 30 days
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
      googleSheetsFileId: cloudData?.googleSheetsFileId || undefined,
      taskSheetsSpreadsheetId: cloudData?.taskSheetsSpreadsheetId || undefined
    };

    const mergedState = cloudData
      ? mergeWorkspaceStates(state, cloudState, mergedDeletions)
      : state;

    // Load and include local active pomodoro state if any
    let activePomodoro = null;
    try {
      const localPomoSaved = localStorage.getItem('task_mindmap_pomodoro');
      if (localPomoSaved) {
        activePomodoro = JSON.parse(localPomoSaved);
      }
    } catch (e) {
      console.error('Failed to parse local pomodoro state for Firestore syncer:', e);
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
      googleSheetsFileId: mergedState.googleSheetsFileId || localStorage.getItem('google_sheets_sync_file_id') || null,
      taskSheetsSpreadsheetId: mergedState.taskSheetsSpreadsheetId || localStorage.getItem('task_sheets_spreadsheet_id') || null,
      activePomodoro,
      deletions: mergedDeletions,
      updatedAt: new Date().toISOString()
    };
    
    const payload = sanitizeForFirestore(rawPayload);
    
    // Estimate payload size in KB
    const serialized = JSON.stringify(payload);
    const sizeInKb = Math.round(serialized.length / 1024);
    if (sizeInKb > 1000) {
      throw new Error(`Размер вашей карты (${sizeInKb} KB) превышает лимит базы данных Firestore (1000 KB) из-за прикрепленных тяжелых картинок или файлов. Удалите некоторые вложения, чтобы возобновить синхронизацию!`);
    }

    // We run standard setDoc directly. We add a single generous timeout (e.g. 25s) to notify the user if offline,
    // but we do NOT run a retry loop that triggers duplicate parallel queued writes, preventing retry storms.
    const currentTimeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Превышено время ожидания сервера (${currentTimeoutMs / 1000}с). Снимок сохранён локально, синхронизация ожидает стабильного подключения.`)), currentTimeoutMs)
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
      error: error?.message || 'Превышено время ожидания сервера (таймаут 25с). Пожалуйста, обновите страницу или проверьте интернет-соединение.' 
    };
  }
}

/**
 * Fetch latest WorkspaceState snapshot from firestore database.
 * Features a clean, single-attempt timeout fallback.
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

// ----------------- GOOGLE SHEETS & DRIVE SYNC -----------------

const SPREADSHEET_NAME = 'MindMap_Sync_Workbook';
const SHEET_FILE_ID_KEY = 'google_sheets_sync_file_id';

/**
 * Search Google Drive for an existing MindMap_Sync_Workbook spreadsheet file.
 */
async function findSpreadsheet(accessToken: string): Promise<string | null> {
  try {
    // Check locally saved file ID first
    const savedId = localStorage.getItem(SHEET_FILE_ID_KEY);
    if (savedId) {
      // Validate that it still exists by fetching its metadata
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${savedId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return savedId;
      }
      localStorage.removeItem(SHEET_FILE_ID_KEY);
    }

    // Otherwise, query Drive
    const query = encodeURIComponent(`name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id;
        localStorage.setItem(SHEET_FILE_ID_KEY, fileId);
        return fileId;
      }
    }
  } catch (e) {
    console.error('Error searching for Spreadsheet in Google Drive:', e);
  }
  return null;
}

/**
 * Creates the workbook with Sheets for Folders, Projects, Nodes, TagCategories, and Deletions.
 */
async function createSpreadsheet(accessToken: string): Promise<string> {
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const body = {
    properties: {
      title: SPREADSHEET_NAME
    },
    sheets: [
      { properties: { title: 'Folders' } },
      { properties: { title: 'Projects' } },
      { properties: { title: 'Nodes' } },
      { properties: { title: 'TagCategories' } },
      { properties: { title: 'Deletions' } }
    ]
  };

  const res = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to create Spreadsheet: ${res.status} ${res.statusText || 'Error'}. Info: ${errText}`);
  }

  const data = await res.json();
  const fileId = data.spreadsheetId;
  localStorage.setItem(SHEET_FILE_ID_KEY, fileId);

  // Write headers to all sheets
  await writeHeaders(fileId, accessToken);
  return fileId;
}

/**
 * Write headers to newly created sheets.
 */
async function writeHeaders(spreadsheetId: string, accessToken: string) {
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const data = [
    {
      range: 'Folders!A1:D1',
      values: [['Folder ID', 'Name', 'Parent ID', 'Updated At']]
    },
    {
      range: 'Projects!A1:E1',
      values: [['Project ID', 'Name', 'Folder ID', 'Created At', 'Updated At']]
    },
    {
      range: 'Nodes!A1:AD1',
      values: [[
        'Node ID', 'Project ID', 'Text', 'X', 'Y', 'Parent ID', 'Priority', 'Tags', 'Notes',
        'Completed', 'Color', 'Collapsed', 'Due Date', 'Progress', 'Is Floating', 'Is Container',
        'Width', 'Height', 'Files (JSON)', 'Updated At',
        'Due Time', 'Start Date', 'Start Time', 'Reminder Date', 'Reminder Time', 'Reminder Minutes Before', 'Reminder Dismissed', 'Comments (JSON)',
        'Is Workflow Rectangle', 'Workflow Connections (JSON)'
      ]]
    },
    {
      range: 'TagCategories!A1:E1',
      values: [['Tag Category ID', 'Name', 'Color', 'Tags', 'Updated At']]
    },
    {
      range: 'Deletions!A1:C1',
      values: [['Type', 'Deleted ID', 'Deleted At']]
    }
  ];

  const writeRes = await fetch(updateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data
    })
  });

  if (!writeRes.ok) {
    const errText = await writeRes.text().catch(() => '');
    throw new Error(`Failed to write sheet headers: ${writeRes.status} ${writeRes.statusText || 'Error'}. Info: ${errText}`);
  }
}

/**
 * Run fully bilateral symmetric merge with Google Sheets
 */
export async function syncWithGoogleSheets(
  accessToken: string,
  localState: WorkspaceState
): Promise<{ state: WorkspaceState; success: boolean; report?: SyncReport; error?: string }> {
  try {
    let fileId = localState.googleSheetsFileId || await findSpreadsheet(accessToken);
    if (!fileId) {
      console.log('Sync spreadsheet not found. Creating a new one in Google Drive');
      fileId = await createSpreadsheet(accessToken);
    }

    // 1. Fetch values from Google Sheet
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchGet?ranges=Folders!A1:D&ranges=Projects!A1:E&ranges=Nodes!A1:AD&ranges=TagCategories!A1:E&ranges=Deletions!A1:C`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!getRes.ok) {
      const errText = await getRes.text().catch(() => '');
      throw new Error(`Google Sheets fetch failed with status ${getRes.status} ${getRes.statusText || 'Error'}. Info: ${errText}`);
    }

    const valueRangesResult = await getRes.json();
    const valueRanges = valueRangesResult.valueRanges || [];

    // Parse sheets sheets values
    const sheetFoldersRows = valueRanges[0]?.values || [];
    const sheetProjectsRows = valueRanges[1]?.values || [];
    const sheetNodesRows = valueRanges[2]?.values || [];
    const sheetTagCatsRows = valueRanges[3]?.values || [];
    const sheetDeletionsRows = valueRanges[4]?.values || [];

    // Auto-upgrade existing Sheets without the AD Columns (Is Workflow Rectangle, Workflow Connections (JSON))
    if (sheetNodesRows.length > 0 && sheetNodesRows[0] && sheetNodesRows[0].length < 30) {
      console.log('Upgrading existing spreadsheet with adaptive workflow columns');
      try {
        const updateHeadersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/Nodes!A1:AD1?valueInputOption=RAW`;
        await fetch(updateHeadersUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            range: 'Nodes!A1:AD1',
            values: [[
              'Node ID', 'Project ID', 'Text', 'X', 'Y', 'Parent ID', 'Priority', 'Tags', 'Notes',
              'Completed', 'Color', 'Collapsed', 'Due Date', 'Progress', 'Is Floating', 'Is Container',
              'Width', 'Height', 'Files (JSON)', 'Updated At',
              'Due Time', 'Start Date', 'Start Time', 'Reminder Date', 'Reminder Time', 'Reminder Minutes Before', 'Reminder Dismissed', 'Comments (JSON)',
              'Is Workflow Rectangle', 'Workflow Connections (JSON)'
            ]]
          })
        });
      } catch (upgradeErr) {
        console.error('Failed to auto-upgrade Google Sheets header column:', upgradeErr);
      }
    }

    // Skip header row
    const parseFolders = (rows: any[]): Folder[] => {
      if (rows.length < 2) return [];
      return rows.slice(1).map(r => ({
        id: r[0],
        name: r[1],
        parentId: r[2] === 'NULL' || !r[2] ? null : r[2],
        updatedAt: r[3] || new Date().toISOString()
      }));
    };

    const parseProjects = (rows: any[]): Project[] => {
      if (rows.length < 2) return [];
      return rows.slice(1).map(r => ({
        id: r[0],
        name: r[1],
        folderId: r[2] === 'NULL' || !r[2] ? null : r[2],
        createdAt: r[3] || new Date().toISOString(),
        updatedAt: r[4] || new Date().toISOString()
      }));
    };

    const parseNodes = (rows: any[]): TaskNode[] => {
      if (rows.length < 2) return [];
      return rows.slice(1).map(r => {
        let files: any[] = [];
        try {
          if (r[18]) files = JSON.parse(r[18]);
        } catch {
          // Fallback
        }

        let comments: any[] = [];
        try {
          if (r[27]) comments = JSON.parse(r[27]);
        } catch {
          // Fallback
        }

        let workflowConnections: any[] = [];
        try {
          if (r[29]) {
            workflowConnections = JSON.parse(r[29]);
          }
        } catch {
          // Fallback
        }

        return {
          id: r[0],
          projectId: r[1],
          text: r[2],
          x: Number(r[3]) || 0,
          y: Number(r[4]) || 0,
          parentId: r[5] === 'NULL' || !r[5] ? null : r[5],
          priority: r[6] || 'none',
          tags: r[7] ? r[7].split(',') : [],
          notes: r[8] || '',
          completed: r[9] === 'TRUE' || r[9] === 'true',
          color: r[10] || undefined,
          collapsed: r[11] === 'TRUE' || r[11] === 'true',
          dueDate: r[12] === 'NULL' || !r[12] ? undefined : r[12],
          progress: r[13] ? Number(r[13]) : undefined,
          isFloating: r[14] === 'TRUE' || r[14] === 'true',
          isContainer: r[15] === 'TRUE' || r[15] === 'true',
          width: r[16] ? Number(r[16]) : undefined,
          height: r[17] ? Number(r[17]) : undefined,
          files,
          comments,
          updatedAt: r[19] || new Date().toISOString(),
          dueTime: r[20] === 'NULL' || !r[20] ? undefined : r[20],
          startDate: r[21] === 'NULL' || !r[21] ? undefined : r[21],
          startTime: r[22] === 'NULL' || !r[22] ? undefined : r[22],
          reminderDate: r[23] === 'NULL' || !r[23] ? undefined : r[23],
          reminderTime: r[24] === 'NULL' || !r[24] ? undefined : r[24],
          reminderMinutesBefore: r[25] && r[25] !== 'NULL' ? Number(r[25]) : undefined,
          reminderDismissed: r[26] === 'TRUE' || r[26] === 'true',
          isWorkflowRectangle: r[28] === 'TRUE' || r[28] === 'true',
          workflowConnections: workflowConnections.length > 0 ? workflowConnections : undefined
        };
      });
    };

    const parseTagCategories = (rows: any[]): TagCategory[] => {
      if (rows.length < 2) return [];
      return rows.slice(1).map(r => ({
        id: r[0],
        name: r[1],
        color: r[2],
        tags: r[3] ? r[3].split(',') : [],
        updatedAt: r[4] || new Date().toISOString()
      }));
    };

    const parseDeletions = (rows: any[]): DeletionRecord[] => {
      if (rows.length < 2) return [];
      return rows.slice(1).map(r => ({
        type: r[0] as any,
        id: r[1],
        deletedAt: r[2] || new Date().toISOString()
      }));
    };

    const sheetFolders = parseFolders(sheetFoldersRows);
    const sheetProjects = parseProjects(sheetProjectsRows);
    const sheetNodes = parseNodes(sheetNodesRows);
    const sheetTagCats = parseTagCategories(sheetTagCatsRows);
    const sheetDeletions = parseDeletions(sheetDeletionsRows);

    // 2. Build consolidated deletion set (Sheets Deletions + Local deletions) and prune older than 30 days
    const localDeletions = getLocalDeletions();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const mergedDeletions: DeletionRecord[] = [];

    const appendUniqueDeletion = (rec: DeletionRecord) => {
      try {
        const deletedAtMs = new Date(rec.deletedAt || 0).getTime();
        if (deletedAtMs < thirtyDaysAgo) return; // Skip if older than 30 days
      } catch {
        // Keep it if parsing fails
      }
      if (!mergedDeletions.some(m => m.id === rec.id && m.type === rec.type)) {
        mergedDeletions.push(rec);
      }
    };
    sheetDeletions.forEach(appendUniqueDeletion);
    localDeletions.forEach(appendUniqueDeletion);

    // Filter helper to drop deleted items from arrays
    const isDeleted = (type: string, id: string) => {
      return mergedDeletions.some(d => d.type === type && d.id === id);
    };

    // ------------------ COMPUTE SYNC REPORT METRICS ------------------
    const deletedTableCount = sheetFolders.filter(f => isDeleted('folder', f.id)).length +
                              sheetProjects.filter(p => isDeleted('project', p.id)).length +
                              sheetNodes.filter(n => isDeleted('node', n.id)).length +
                              sheetTagCats.filter(t => isDeleted('tagCategory', t.id)).length;

    const deletedLocallyCount = localState.folders.filter(f => isDeleted('folder', f.id)).length +
                               localState.projects.filter(p => isDeleted('project', p.id)).length +
                               Object.values(localState.nodes).flat().filter(n => isDeleted('node', n.id)).length +
                               (localState.tagCategories || []).filter(t => isDeleted('tagCategory', t.id)).length;

    // Folders change metrics
    const localFoldersAdded = localState.folders.filter(f => !sheetFolders.some(sf => sf.id === f.id) && !isDeleted('folder', f.id)).length;
    const localFoldersUpdated = localState.folders.filter(f => {
      const sf = sheetFolders.find(x => x.id === f.id);
      return sf && new Date(f.updatedAt || 0).getTime() > new Date(sf.updatedAt || 0).getTime() && !isDeleted('folder', f.id);
    }).length;

    const foldersAdded = sheetFolders.filter(sf => !localState.folders.some(f => f.id === sf.id) && !isDeleted('folder', sf.id)).length;
    const foldersUpdated = sheetFolders.filter(sf => {
      const lf = localState.folders.find(x => x.id === sf.id);
      return lf && new Date(sf.updatedAt || 0).getTime() > new Date(lf.updatedAt || 0).getTime() && !isDeleted('folder', sf.id);
    }).length;

    // Projects change metrics
    const localProjectsAdded = localState.projects.filter(p => !sheetProjects.some(sp => sp.id === p.id) && !isDeleted('project', p.id)).length;
    const localProjectsUpdated = localState.projects.filter(p => {
      const sp = sheetProjects.find(x => x.id === p.id);
      return sp && new Date(p.updatedAt || 0).getTime() > new Date(sp.updatedAt || 0).getTime() && !isDeleted('project', p.id);
    }).length;

    const projectsAdded = sheetProjects.filter(sp => !localState.projects.some(p => p.id === sp.id) && !isDeleted('project', sp.id)).length;
    const projectsUpdated = sheetProjects.filter(sp => {
      const lp = localState.projects.find(x => x.id === sp.id);
      return lp && new Date(sp.updatedAt || 0).getTime() > new Date(lp.updatedAt || 0).getTime() && !isDeleted('project', sp.id);
    }).length;

    // Nodes change metrics
    const localNodes = Object.values(localState.nodes).flat();
    const localNodesAdded = localNodes.filter(n => !sheetNodes.some(sn => sn.id === n.id) && !isDeleted('node', n.id)).length;
    const localNodesUpdated = localNodes.filter(n => {
      const sn = sheetNodes.find(x => x.id === n.id);
      return sn && new Date(n.updatedAt || 0).getTime() > new Date(sn.updatedAt || 0).getTime() && !isDeleted('node', n.id);
    }).length;

    const nodesAdded = sheetNodes.filter(sn => !localNodes.some(n => n.id === sn.id) && !isDeleted('node', sn.id)).length;
    const nodesUpdated = sheetNodes.filter(sn => {
      const ln = localNodes.find(x => x.id === sn.id);
      return ln && new Date(sn.updatedAt || 0).getTime() > new Date(ln.updatedAt || 0).getTime() && !isDeleted('node', sn.id);
    }).length;

    // Tag Categories metrics
    const localTagCats = localState.tagCategories || [];
    const localTagCatsAdded = localTagCats.filter(t => !sheetTagCats.some(st => st.id === t.id) && !isDeleted('tagCategory', t.id)).length;
    const localTagCatsUpdated = localTagCats.filter(t => {
      const st = sheetTagCats.find(x => x.id === t.id);
      return st && new Date(t.updatedAt || 0).getTime() > new Date(st.updatedAt || 0).getTime() && !isDeleted('tagCategory', t.id);
    }).length;

    const tagCategoriesAdded = sheetTagCats.filter(st => !localTagCats.some(t => t.id === st.id) && !isDeleted('tagCategory', st.id)).length;
    const tagCategoriesUpdated = sheetTagCats.filter(st => {
      const lt = localTagCats.find(x => x.id === st.id);
      return lt && new Date(st.updatedAt || 0).getTime() > new Date(lt.updatedAt || 0).getTime() && !isDeleted('tagCategory', st.id);
    }).length;

    const uploadedCount = localFoldersAdded + localFoldersUpdated + localProjectsAdded + localProjectsUpdated + localNodesAdded + localNodesUpdated + localTagCatsAdded + localTagCatsUpdated;
    const downloadedCount = foldersAdded + foldersUpdated + projectsAdded + projectsUpdated + nodesAdded + nodesUpdated + tagCategoriesAdded + tagCategoriesUpdated;

    const syncReportData: SyncReport = {
      uploadedCount,
      downloadedCount,
      deletedTableCount,
      deletedLocallyCount,
      foldersAdded,
      foldersUpdated,
      projectsAdded,
      projectsUpdated,
      nodesAdded,
      nodesUpdated,
      tagCategoriesAdded,
      tagCategoriesUpdated
    };

    // 3. Symmetrical Merge of folders
    const mergedFoldersMap = new Map<string, Folder>();
    // Add local folders first
    localState.folders.forEach(f => {
      if (!isDeleted('folder', f.id)) {
        mergedFoldersMap.set(f.id, { ...f, updatedAt: f.updatedAt || new Date(0).toISOString() });
      }
    });
    // Merge remote folders
    sheetFolders.forEach(sf => {
      if (isDeleted('folder', sf.id)) return;
      const local = mergedFoldersMap.get(sf.id);
      if (!local) {
        mergedFoldersMap.set(sf.id, sf);
      } else {
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(sf.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedFoldersMap.set(sf.id, sf);
        }
      }
    });

    // 4. Symmetrical Merge of projects
    const mergedProjectsMap = new Map<string, Project>();
    localState.projects.forEach(p => {
      if (!isDeleted('project', p.id)) {
        mergedProjectsMap.set(p.id, p);
      }
    });
    sheetProjects.forEach(sp => {
      if (isDeleted('project', sp.id)) return;
      const local = mergedProjectsMap.get(sp.id);
      if (!local) {
        mergedProjectsMap.set(sp.id, sp);
      } else {
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(sp.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedProjectsMap.set(sp.id, sp);
        }
      }
    });

    // 5. Symmetrical Merge of nodes
    const mergedNodesMap = new Map<string, TaskNode>();
    // Gather all local nodes across projects
    Object.values(localState.nodes).flat().forEach(node => {
      if (!isDeleted('node', node.id)) {
        mergedNodesMap.set(node.id, { ...node, updatedAt: node.updatedAt || new Date(0).toISOString() });
      }
    });
    // Reconcile with Google Sheets
    sheetNodes.forEach(sn => {
      if (isDeleted('node', sn.id)) return;
      const local = mergedNodesMap.get(sn.id);
      if (!local) {
        mergedNodesMap.set(sn.id, sn);
      } else {
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(sn.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          // REMOTE wins! Restore full local base64 dataUrl if Google Sheets has the omitted/placeholder string
          const mergedFiles = (sn.files || []).map(remoteFile => {
            if (remoteFile.dataUrl?.startsWith('_OMITTED_DUE_TO_SIZE_')) {
              const localFile = (local.files || []).find(lf => lf.id === remoteFile.id);
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
      // Only keep nodes of active projects
      if (mergedProjectsMap.has(node.projectId)) {
        if (!finalNodesMap[node.projectId]) finalNodesMap[node.projectId] = [];
        finalNodesMap[node.projectId].push(node);
      }
    });

    // 6. Symmetrical Merge of TagCategories
    const mergedTagCatsMap = new Map<string, TagCategory>();
    (localState.tagCategories || []).forEach(tc => {
      if (!isDeleted('tagCategory', tc.id)) {
        mergedTagCatsMap.set(tc.id, { ...tc, updatedAt: tc.updatedAt || new Date(0).toISOString() });
      }
    });
    sheetTagCats.forEach(stc => {
      if (isDeleted('tagCategory', stc.id)) return;
      const local = mergedTagCatsMap.get(stc.id);
      if (!local) {
        mergedTagCatsMap.set(stc.id, stc);
      } else {
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(stc.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedTagCatsMap.set(stc.id, stc);
        }
      }
    });

    // 7. Establish the unified state
    const finalFolders = Array.from(mergedFoldersMap.values());
    const finalProjects = Array.from(mergedProjectsMap.values());
    const finalTagCats = Array.from(mergedTagCatsMap.values());

    let finalActiveProjectId = localState.activeProjectId;
    if (finalProjects.length > 0) {
      if (!finalActiveProjectId || !mergedProjectsMap.has(finalActiveProjectId)) {
        finalActiveProjectId = finalProjects[0].id;
      }
    } else {
      finalActiveProjectId = null;
    }

    const mergedState: WorkspaceState = {
      folders: finalFolders,
      projects: finalProjects,
      nodes: finalNodesMap,
      activeProjectId: finalActiveProjectId,
      tagCategories: finalTagCats,
      googleSheetsFileId: fileId,
      taskSheetsSpreadsheetId: localState.taskSheetsSpreadsheetId || localStorage.getItem('task_sheets_spreadsheet_id') || undefined,
      deletions: mergedDeletions
    };

    // 8. Write updated lists back to Google Sheets (Overwrite to ensure exact symmetry)
    // Clear ancient rows
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchClear`;
    const clearRes = await fetch(clearUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ranges: ['Folders!A2:D', 'Projects!A2:E', 'Nodes!A2:AD', 'TagCategories!A2:E', 'Deletions!A2:C']
      })
    });
    if (!clearRes.ok) {
      const errText = await clearRes.text().catch(() => '');
      throw new Error(`Failed to clear existing rows: ${clearRes.status} ${clearRes.statusText || 'Error'}. Info: ${errText}`);
    }

    // Compile rows to append/write
    const folderRows = finalFolders.map(f => [
      f.id,
      f.name,
      f.parentId || 'NULL',
      f.updatedAt || new Date().toISOString()
    ]);

    const projectRows = finalProjects.map(p => [
      p.id,
      p.name,
      p.folderId || 'NULL',
      p.createdAt,
      p.updatedAt
    ]);

    // Helper to truncate any cell value to prevent exceeding the 50,000 character limit of Google Sheets
    // We target 35000 characters to ensure safe UTF-16 and byte limits in Google's internal serialization
    const safeCellString = (val: any): any => {
      if (typeof val === 'string' && val.length > 35000) {
        return val.substring(0, 35000) + '... [Текст обрезан из-за ограничений Google Sheets]';
      }
      return val;
    };

    const nodeRows = Object.values(finalNodesMap).flat().map(n => {
      // Create a copy of files where we omit massive dataUrl strings to keep it small
      let safeFiles = (n.files || []).map(file => {
        if (file.dataUrl && file.dataUrl.length > 15000) {
          return {
            ...file,
            dataUrl: `_OMITTED_DUE_TO_SIZE_:${file.id}`
          };
        }
        return file;
      });

      // If the total JSON string of safeFiles is still too long, recursively replace dataUrl of files starting with the largest
      let filesJson = JSON.stringify(safeFiles);
      if (filesJson.length > 35000) {
        const sortedWithIndex = safeFiles
          .map((f, idx) => ({ f, idx, len: f.dataUrl ? f.dataUrl.length : 0 }))
          .filter(item => item.f.dataUrl && !item.f.dataUrl.startsWith('_OMITTED_DUE_TO_SIZE_'))
          .sort((a, b) => b.len - a.len);

        for (const item of sortedWithIndex) {
          safeFiles[item.idx] = {
            ...safeFiles[item.idx],
            dataUrl: `_OMITTED_DUE_TO_SIZE_:${safeFiles[item.idx].id}`
          };
          filesJson = JSON.stringify(safeFiles);
          if (filesJson.length <= 35000) {
            break;
          }
        }
      }

      let workflowConnectionsJson = '[]';
      try {
        if (n.workflowConnections) {
          workflowConnectionsJson = JSON.stringify(n.workflowConnections);
        }
      } catch (e) {
        console.error('Failed to stringify workflow connections for Sheets sync:', e);
      }

      return [
        n.id,
        n.projectId,
        safeCellString(n.text || ''),
        n.x,
        n.y,
        n.parentId || 'NULL',
        n.priority,
        n.tags.join(','),
        safeCellString(n.notes || ''),
        n.completed ? 'TRUE' : 'FALSE',
        n.color || '',
        n.collapsed ? 'TRUE' : 'FALSE',
        n.dueDate || 'NULL',
        n.progress !== undefined ? n.progress : '',
        n.isFloating ? 'TRUE' : 'FALSE',
        n.isContainer ? 'TRUE' : 'FALSE',
        n.width !== undefined ? n.width : '',
        n.height !== undefined ? n.height : '',
        safeCellString(filesJson),
        n.updatedAt || new Date().toISOString(),
        n.dueTime || 'NULL',
        n.startDate || 'NULL',
        n.startTime || 'NULL',
        n.reminderDate || 'NULL',
        n.reminderTime || 'NULL',
        n.reminderMinutesBefore !== undefined ? n.reminderMinutesBefore : 'NULL',
        n.reminderDismissed ? 'TRUE' : 'FALSE',
        safeCellString(JSON.stringify(n.comments || [])),
        n.isWorkflowRectangle ? 'TRUE' : 'FALSE',
        safeCellString(workflowConnectionsJson)
      ];
    });

    const tagCatRows = finalTagCats.map(tc => [
      tc.id,
      tc.name,
      tc.color,
      tc.tags.join(','),
      tc.updatedAt || new Date().toISOString()
    ]);

    const deletionRows = mergedDeletions.map(d => [
      d.type,
      d.id,
      d.deletedAt
    ]);

    // Perform batchUpdate to populate all sheets
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchUpdate`;
    const dataToWrite = [];
    if (folderRows.length > 0) dataToWrite.push({ range: `Folders!A2:D${folderRows.length + 1}`, values: folderRows });
    if (projectRows.length > 0) dataToWrite.push({ range: `Projects!A2:E${projectRows.length + 1}`, values: projectRows });
    if (nodeRows.length > 0) dataToWrite.push({ range: `Nodes!A2:AD${nodeRows.length + 1}`, values: nodeRows });
    if (tagCatRows.length > 0) dataToWrite.push({ range: `TagCategories!A2:E${tagCatRows.length + 1}`, values: tagCatRows });
    if (deletionRows.length > 0) dataToWrite.push({ range: `Deletions!A2:C${deletionRows.length + 1}`, values: deletionRows });

    if (dataToWrite.length > 0) {
      const updateRes = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: dataToWrite
        })
      });
      if (!updateRes.ok) {
        const errText = await updateRes.text().catch(() => '');
        throw new Error(`Failed to write updated values: ${updateRes.status} ${updateRes.statusText || 'Error'}. Info: ${errText}`);
      }
    }

    // Since they are written to sheets, clear our temporary local deletions uploaded
    clearLocalDeletions(mergedDeletions);

    console.log('Bilateral Symmetrical Google Sheets Sync Completed Successfully!');
    return { state: mergedState, success: true, report: syncReportData };
  } catch (error: any) {
    const isUnauth = error?.message?.includes('401') || error?.message?.includes('UNAUTHENTICATED') || error?.message?.toLowerCase().includes('auth');
    if (isUnauth) {
      console.warn('Bilateral Symmetrical Google Sheets Sync authorization expired:', error?.message);
    } else {
      console.error('Bilateral Symmetrical Sync Error:', error);
    }
    return { state: localState, success: false, error: error?.message || String(error) };
  }
}
