import { WorkspaceState, TaskNode, Folder, Project, TagCategory, DeletionRecord } from '../types';
import { proxiedFetch } from '../utils';

const DELETIONS_KEY = 'milli_deleted_registry';

/**
 * Register a deleted element so we can synchronize its deletion with Google Sheets.
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

export function clearLocalDeletions() {
  localStorage.removeItem(DELETIONS_KEY);
}

// ----------------- GOOGLE SHEETS API HELPER UTILITIES -----------------

async function googleApiCall(url: string, token: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const finalOptions: RequestInit = {
    ...options,
    headers
  };

  const response = await proxiedFetch(url, finalOptions);
  if (!response.ok) {
    let errMsg = `Google API Error (${response.status})`;
    try {
      const errJson = await response.json();
      errMsg = errJson?.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return response.json();
}

/**
 * Searches Google Drive for an existing synchronization spreadsheet or creates a new one.
 */
export async function getOrCreateSpreadsheet(token: string): Promise<string> {
  try {
    console.log('[Sheets Sync] Searching for existing Milli Sync Spreadsheet...');
    const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=name%3D%27Milli%20Task%20%26%20Mind%20Map%20Sync%20Data%27%20and%20mimeType%3D%27application%2fvnd.google-apps.spreadsheet%27%20and%20trashed%3Dfalse&fields=files(id)';
    const searchRes = await googleApiCall(searchUrl, token);
    
    if (searchRes.files && searchRes.files.length > 0) {
      const fileId = searchRes.files[0].id;
      console.log('[Sheets Sync] Found existing spreadsheet ID:', fileId);
      return fileId;
    }

    console.log('[Sheets Sync] Spreadsheet not found. Creating a brand new one...');
    const createUrl = 'https://sheets.googleapis.com/v1/spreadsheets';
    const body = {
      properties: {
        title: 'Milli Task & Mind Map Sync Data'
      },
      sheets: [
        { properties: { title: 'folders' } },
        { properties: { title: 'projects' } },
        { properties: { title: 'nodes' } },
        { properties: { title: 'tagCategories' } },
        { properties: { title: 'deletions' } },
        { properties: { title: 'metadata' } }
      ]
    };

    const createRes = await googleApiCall(createUrl, token, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const newSpreadsheetId = createRes.spreadsheetId;
    console.log('[Sheets Sync] Successfully created spreadsheet with ID:', newSpreadsheetId);

    // Write initial headers for all sheets
    await writeSheetHeaders(token, newSpreadsheetId);

    return newSpreadsheetId;
  } catch (error) {
    console.error('[Sheets Sync] Error getting or creating spreadsheet:', error);
    throw error;
  }
}

async function writeSheetHeaders(token: string, spreadsheetId: string) {
  const batchUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const data = [
    { range: 'folders!A1:F1', values: [['id', 'name', 'parentId', 'updatedAt', 'deviceId', 'version']] },
    { range: 'projects!A1:G1', values: [['id', 'name', 'folderId', 'createdAt', 'updatedAt', 'deviceId', 'version']] },
    { range: 'nodes!A1:AF1', values: [[
      'id', 'projectId', 'text', 'x', 'y', 'parentId', 'priority', 'tagsJson', 'notes', 'completed', 
      'filesJson', 'commentsJson', 'color', 'collapsed', 'isCardCollapsed', 'dueDate', 'dueTime', 
      'startDate', 'startTime', 'progress', 'isFloating', 'isContainer', 'isWorkflowRectangle', 
      'workflowShape', 'zoneWidth', 'zoneHeight', 'pomodoroTotalTime', 'pomodoroSessionsCount', 
      'archived', 'workflowConnectionsJson', 'updatedAt', 'deviceId'
    ]] },
    { range: 'tagCategories!A1:F1', values: [['id', 'name', 'color', 'tagsJson', 'updatedAt', 'deviceId']] },
    { range: 'deletions!A1:D1', values: [['type', 'id', 'deletedAt', 'deviceId']] },
    { range: 'metadata!A1:C1', values: [['key', 'value', 'updatedAt']] }
  ];

  await googleApiCall(batchUrl, token, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data
    })
  });
}

/**
 * Checks and creates missing sheets inside our spreadsheet.
 */
async function ensureSheetsExist(token: string, spreadsheetId: string) {
  try {
    const metaUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}`;
    const meta = await googleApiCall(metaUrl, token);
    const existingTitles = (meta.sheets || []).map((s: any) => s.properties.title);

    const requiredSheets = ['folders', 'projects', 'nodes', 'tagCategories', 'deletions', 'metadata'];
    const missingSheets = requiredSheets.filter(title => !existingTitles.includes(title));

    if (missingSheets.length > 0) {
      console.log('[Sheets Sync] Creating missing sheets:', missingSheets);
      const requests = missingSheets.map(title => ({
        addSheet: { properties: { title } }
      }));

      await googleApiCall(`${metaUrl}:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({ requests })
      });

      // Write headers for the missing sheets
      await writeSheetHeaders(token, spreadsheetId);
    }
  } catch (error) {
    console.error('[Sheets Sync] Error ensuring sheets exist:', error);
  }
}

// Helper to convert sheet values (array of arrays) into array of records/objects
function valuesToObjects(rows: any[][]): any[] {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  const objects: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj: any = {};
    headers.forEach((header: string, index: number) => {
      const val = row[index];
      obj[header] = val !== undefined ? val : '';
    });
    objects.push(obj);
  }
  return objects;
}

// Convert objects to sheet values matching header order
function objectsToValues(objects: any[], headers: string[]): any[][] {
  return objects.map(obj => {
    return headers.map(header => {
      const val = obj[header];
      return val !== undefined && val !== null ? val : '';
    });
  });
}

// ----------------- SYMMETRICAL MULTI-DEVICE SYNCHRONIZATION ALGORITHMS -----------------

/**
 * 1. sync_local_to_cloud()
 * Sends changes from device to Google Sheets with pre-write collision prevention.
 */
export async function sync_local_to_cloud(
  token: string,
  localState: WorkspaceState,
  deviceId: string
): Promise<{ success: boolean; state?: WorkspaceState; error?: string }> {
  try {
    const spreadsheetId = localState.googleSheetsFileId || localStorage.getItem('google_sheets_sync_file_id');
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is not linked. Create or Link a Google Sheet first.');
    }

    console.log('[Sheets Sync] Starting sync_local_to_cloud()...');
    await ensureSheetsExist(token, spreadsheetId);

    // Fetch all current cloud values first to check timestamps
    const batchGetUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values:batchGet?ranges=folders!A1:F999&ranges=projects!A1:G999&ranges=nodes!A1:AF999&ranges=tagCategories!A1:F999&ranges=deletions!A1:D999&ranges=metadata!A1:C999`;
    const getRes = await googleApiCall(batchGetUrl, token);
    const valueRanges = getRes.valueRanges || [];

    const cloudFoldersRaw = valueRanges[0]?.values || [];
    const cloudProjectsRaw = valueRanges[1]?.values || [];
    const cloudNodesRaw = valueRanges[2]?.values || [];
    const cloudTagCatsRaw = valueRanges[3]?.values || [];
    const cloudDeletionsRaw = valueRanges[4]?.values || [];
    const cloudMetadataRaw = valueRanges[5]?.values || [];

    const cloudFolders = valuesToObjects(cloudFoldersRaw);
    const cloudProjects = valuesToObjects(cloudProjectsRaw);
    const cloudNodes = valuesToObjects(cloudNodesRaw);
    const cloudTagCats = valuesToObjects(cloudTagCatsRaw);
    const cloudDeletions = valuesToObjects(cloudDeletionsRaw);
    const cloudMetadata = valuesToObjects(cloudMetadataRaw);

    // Retrieve global cloud updatedAt to check if cloud has newer changes
    const cloudMetaUpdatedAt = cloudMetadata.find(m => m.key === 'updatedAt')?.value || '1970-01-01T00:00:00.000Z';
    const localUpdatedAt = localState.updatedAt || new Date(0).toISOString();

    // Symmetrical Deletion Registry Merge
    const localDeletionsList = getLocalDeletions();
    const mergedDeletionsList: DeletionRecord[] = [];
    const pushIfUniqueDeletion = (rec: DeletionRecord) => {
      if (!mergedDeletionsList.some(m => m.id === rec.id && m.type === rec.type)) {
        mergedDeletionsList.push(rec);
      }
    };

    cloudDeletions.forEach((d: any) => {
      if (d.type && d.id) {
        pushIfUniqueDeletion({ type: d.type, id: d.id, deletedAt: d.deletedAt });
      }
    });
    localDeletionsList.forEach(pushIfUniqueDeletion);

    const isDeleted = (type: string, id: string) => {
      return mergedDeletionsList.some(d => d.type === type && d.id === id);
    };

    // --- MERGING LOGIC: "MOST RECENT TIMESTAMP WINS" at the level of each row ---

    // 1. Folders
    const finalFoldersMap = new Map<string, any>();
    // Insert all local
    localState.folders.forEach(f => {
      if (!isDeleted('folder', f.id)) {
        finalFoldersMap.set(f.id, {
          id: f.id,
          name: f.name,
          parentId: f.parentId || '',
          updatedAt: f.updatedAt || new Date().toISOString(),
          deviceId: deviceId,
          version: '1'
        });
      }
    });
    // Overlay cloud based on timestamps
    cloudFolders.forEach(cf => {
      if (isDeleted('folder', cf.id)) return;
      const localFolder = finalFoldersMap.get(cf.id);
      if (!localFolder) {
        finalFoldersMap.set(cf.id, cf);
      } else {
        const localTime = new Date(localFolder.updatedAt).getTime();
        const cloudTime = new Date(cf.updatedAt).getTime();
        if (cloudTime > localTime) {
          finalFoldersMap.set(cf.id, cf);
        }
      }
    });

    // 2. Projects
    const finalProjectsMap = new Map<string, any>();
    localState.projects.forEach(p => {
      if (!isDeleted('project', p.id)) {
        finalProjectsMap.set(p.id, {
          id: p.id,
          name: p.name,
          folderId: p.folderId || '',
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
          deviceId: deviceId,
          version: '1'
        });
      }
    });
    cloudProjects.forEach(cp => {
      if (isDeleted('project', cp.id)) return;
      const localProject = finalProjectsMap.get(cp.id);
      if (!localProject) {
        finalProjectsMap.set(cp.id, cp);
      } else {
        const localTime = new Date(localProject.updatedAt).getTime();
        const cloudTime = new Date(cp.updatedAt).getTime();
        if (cloudTime > localTime) {
          finalProjectsMap.set(cp.id, cp);
        }
      }
    });

    // 3. Nodes
    const finalNodesMap = new Map<string, any>();
    Object.values(localState.nodes).flat().forEach((n: TaskNode) => {
      if (n && !isDeleted('node', n.id)) {
        finalNodesMap.set(n.id, {
          id: n.id,
          projectId: n.projectId,
          text: n.text || '',
          x: String(n.x || 0),
          y: String(n.y || 0),
          parentId: n.parentId || '',
          priority: n.priority || 'none',
          tagsJson: JSON.stringify(n.tags || []),
          notes: n.notes || '',
          completed: n.completed ? 'TRUE' : 'FALSE',
          filesJson: JSON.stringify(n.files || []),
          commentsJson: JSON.stringify(n.comments || []),
          color: n.color || '',
          collapsed: n.collapsed ? 'TRUE' : 'FALSE',
          isCardCollapsed: n.isCardCollapsed ? 'TRUE' : 'FALSE',
          dueDate: n.dueDate || '',
          dueTime: n.dueTime || '',
          startDate: n.startDate || '',
          startTime: n.startTime || '',
          progress: String(n.progress || 0),
          isFloating: n.isFloating ? 'TRUE' : 'FALSE',
          isContainer: n.isContainer ? 'TRUE' : 'FALSE',
          isWorkflowRectangle: n.isWorkflowRectangle ? 'TRUE' : 'FALSE',
          workflowShape: n.workflowShape || '',
          zoneWidth: String(n.zoneWidth || 0),
          zoneHeight: String(n.zoneHeight || 0),
          pomodoroTotalTime: String(n.pomodoroTotalTime || 0),
          pomodoroSessionsCount: String(n.pomodoroSessionsCount || 0),
          archived: n.archived ? 'TRUE' : 'FALSE',
          workflowConnectionsJson: JSON.stringify(n.workflowConnections || []),
          updatedAt: n.updatedAt || new Date().toISOString(),
          deviceId: deviceId
        });
      }
    });
    cloudNodes.forEach(cn => {
      if (isDeleted('node', cn.id)) return;
      const localNode = finalNodesMap.get(cn.id);
      if (!localNode) {
        finalNodesMap.set(cn.id, cn);
      } else {
        const localTime = new Date(localNode.updatedAt).getTime();
        const cloudTime = new Date(cn.updatedAt).getTime();
        if (cloudTime > localTime) {
          finalNodesMap.set(cn.id, cn);
        }
      }
    });

    // 4. TagCategories
    const finalTagCatsMap = new Map<string, any>();
    (localState.tagCategories || []).forEach(tc => {
      if (!isDeleted('tagCategory', tc.id)) {
        finalTagCatsMap.set(tc.id, {
          id: tc.id,
          name: tc.name,
          color: tc.color,
          tagsJson: JSON.stringify(tc.tags || []),
          updatedAt: tc.updatedAt || new Date().toISOString(),
          deviceId: deviceId
        });
      }
    });
    cloudTagCats.forEach(ctc => {
      if (isDeleted('tagCategory', ctc.id)) return;
      const localTC = finalTagCatsMap.get(ctc.id);
      if (!localTC) {
        finalTagCatsMap.set(ctc.id, ctc);
      } else {
        const localTime = new Date(localTC.updatedAt).getTime();
        const cloudTime = new Date(ctc.updatedAt).getTime();
        if (cloudTime > localTime) {
          finalTagCatsMap.set(ctc.id, ctc);
        }
      }
    });

    // Build values to write
    const finalFolders = Array.from(finalFoldersMap.values());
    const finalProjects = Array.from(finalProjectsMap.values());
    const finalNodes = Array.from(finalNodesMap.values());
    const finalTagCats = Array.from(finalTagCatsMap.values());

    const folderHeaders = ['id', 'name', 'parentId', 'updatedAt', 'deviceId', 'version'];
    const projectHeaders = ['id', 'name', 'folderId', 'createdAt', 'updatedAt', 'deviceId', 'version'];
    const nodeHeaders = [
      'id', 'projectId', 'text', 'x', 'y', 'parentId', 'priority', 'tagsJson', 'notes', 'completed', 
      'filesJson', 'commentsJson', 'color', 'collapsed', 'isCardCollapsed', 'dueDate', 'dueTime', 
      'startDate', 'startTime', 'progress', 'isFloating', 'isContainer', 'isWorkflowRectangle', 
      'workflowShape', 'zoneWidth', 'zoneHeight', 'pomodoroTotalTime', 'pomodoroSessionsCount', 
      'archived', 'workflowConnectionsJson', 'updatedAt', 'deviceId'
    ];
    const tagCatHeaders = ['id', 'name', 'color', 'tagsJson', 'updatedAt', 'deviceId'];
    const deletionHeaders = ['type', 'id', 'deletedAt', 'deviceId'];
    const metadataHeaders = ['key', 'value', 'updatedAt'];

    const newUpdatedAt = new Date().toISOString();

    const folderRows = [folderHeaders, ...objectsToValues(finalFolders, folderHeaders)];
    const projectRows = [projectHeaders, ...objectsToValues(finalProjects, projectHeaders)];
    const nodeRows = [nodeHeaders, ...objectsToValues(finalNodes, nodeHeaders)];
    const tagCatRows = [tagCatHeaders, ...objectsToValues(finalTagCats, tagCatHeaders)];
    const deletionRows = [deletionHeaders, ...objectsToValues(mergedDeletionsList.map(d => ({
      type: d.type,
      id: d.id,
      deletedAt: d.deletedAt,
      deviceId: deviceId
    })), deletionHeaders)];

    // Metadata preparation
    const finalMetadata = [
      { key: 'activeProjectId', value: localState.activeProjectId || '', updatedAt: newUpdatedAt },
      { key: 'activePomodoro', value: localState.activePomodoro ? JSON.stringify(localState.activePomodoro) : '', updatedAt: newUpdatedAt },
      { key: 'updatedAt', value: newUpdatedAt, updatedAt: newUpdatedAt }
    ];
    const metadataRows = [metadataHeaders, ...objectsToValues(finalMetadata, metadataHeaders)];

    // Perform massive 1-step batched values update to override sheets, saving quota
    console.log('[Sheets Sync] Bulk uploading merged delta-update to Google Sheets...');
    const updateBatchUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const batchBody = {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'folders!A1:F999', values: folderRows },
        { range: 'projects!A1:G999', values: projectRows },
        { range: 'nodes!A1:AF999', values: nodeRows },
        { range: 'tagCategories!A1:F999', values: tagCatRows },
        { range: 'deletions!A1:D999', values: deletionRows },
        { range: 'metadata!A1:C10', values: metadataRows }
      ]
    };

    await googleApiCall(updateBatchUrl, token, {
      method: 'POST',
      body: JSON.stringify(batchBody)
    });

    console.log('[Sheets Sync] Upload successful! Cleared deletions queue.');
    clearLocalDeletions();

    // Map rows back to state format to return
    const updatedNodesObj: Record<string, TaskNode[]> = {};
    finalNodes.forEach(rn => {
      const pId = rn.projectId;
      if (!updatedNodesObj[pId]) updatedNodesObj[pId] = [];
      updatedNodesObj[pId].push({
        id: rn.id,
        projectId: rn.projectId,
        text: rn.text,
        x: Number(rn.x || 0),
        y: Number(rn.y || 0),
        parentId: rn.parentId || null,
        priority: rn.priority as any,
        tags: rn.tagsJson ? JSON.parse(rn.tagsJson) : [],
        notes: rn.notes || '',
        completed: rn.completed === 'TRUE',
        files: rn.filesJson ? JSON.parse(rn.filesJson) : [],
        comments: rn.commentsJson ? JSON.parse(rn.commentsJson) : [],
        color: rn.color || undefined,
        collapsed: rn.collapsed === 'TRUE',
        isCardCollapsed: rn.isCardCollapsed === 'TRUE',
        dueDate: rn.dueDate || undefined,
        dueTime: rn.dueTime || undefined,
        startDate: rn.startDate || undefined,
        startTime: rn.startTime || undefined,
        progress: rn.progress ? Number(rn.progress) : undefined,
        isFloating: rn.isFloating === 'TRUE',
        isContainer: rn.isContainer === 'TRUE',
        isWorkflowRectangle: rn.isWorkflowRectangle === 'TRUE',
        workflowShape: rn.workflowShape ? rn.workflowShape as any : undefined,
        zoneWidth: rn.zoneWidth ? Number(rn.zoneWidth) : undefined,
        zoneHeight: rn.zoneHeight ? Number(rn.zoneHeight) : undefined,
        pomodoroTotalTime: rn.pomodoroTotalTime ? Number(rn.pomodoroTotalTime) : undefined,
        pomodoroSessionsCount: rn.pomodoroSessionsCount ? Number(rn.pomodoroSessionsCount) : undefined,
        archived: rn.archived === 'TRUE',
        workflowConnections: rn.workflowConnectionsJson ? JSON.parse(rn.workflowConnectionsJson) : undefined,
        updatedAt: rn.updatedAt
      });
    });

    const parsedFolders: Folder[] = finalFolders.map(rf => ({
      id: rf.id,
      name: rf.name,
      parentId: rf.parentId || null,
      updatedAt: rf.updatedAt
    }));

    const parsedProjects: Project[] = finalProjects.map(rp => ({
      id: rp.id,
      name: rp.name,
      folderId: rp.folderId || null,
      createdAt: rp.createdAt,
      updatedAt: rp.updatedAt
    }));

    const parsedTagCategories: TagCategory[] = finalTagCats.map(rtc => ({
      id: rtc.id,
      name: rtc.name,
      color: rtc.color,
      tags: rtc.tagsJson ? JSON.parse(rtc.tagsJson) : [],
      updatedAt: rtc.updatedAt
    }));

    const activePomoMeta = finalMetadata.find(m => m.key === 'activePomodoro')?.value;
    const activePomodoroParsed = activePomoMeta ? JSON.parse(activePomoMeta) : null;

    const mergedState: WorkspaceState = {
      folders: parsedFolders,
      projects: parsedProjects,
      nodes: updatedNodesObj,
      activeProjectId: finalMetadata.find(m => m.key === 'activeProjectId')?.value || null,
      tagCategories: parsedTagCategories,
      deletions: mergedDeletionsList,
      activePomodoro: activePomodoroParsed,
      updatedAt: newUpdatedAt,
      googleSheetsFileId: spreadsheetId
    };

    return { success: true, state: mergedState };
  } catch (err: any) {
    console.error('[Sheets Sync] Error in sync_local_to_cloud:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * 2. sync_cloud_to_local()
 * Fetches latest updates from Google Sheets, implementing Quota-friendly Delta checks.
 */
export async function sync_cloud_to_local(
  token: string,
  localState: WorkspaceState,
  deviceId: string
): Promise<{ success: boolean; state?: WorkspaceState; error?: string }> {
  try {
    const spreadsheetId = localState.googleSheetsFileId || localStorage.getItem('google_sheets_sync_file_id');
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is not linked.');
    }

    console.log('[Sheets Sync] Starting sync_cloud_to_local()...');
    await ensureSheetsExist(token, spreadsheetId);

    // ZERO-QUERY OPTIMIZATION: Fetch Metadata table first to see if there are newer changes
    console.log('[Sheets Sync] Fetching metadata to verify sync time...');
    const metaGetUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/metadata!A1:C10`;
    const metaRes = await googleApiCall(metaGetUrl, token);
    const metadataObjects = valuesToObjects(metaRes.values || []);

    const cloudMetaUpdatedAt = metadataObjects.find(m => m.key === 'updatedAt')?.value || '1970-01-01T00:00:00.000Z';
    const localUpdatedAt = localState.updatedAt || '1970-01-01T00:00:00.000Z';

    const localTime = new Date(localUpdatedAt).getTime();
    const cloudTime = new Date(cloudMetaUpdatedAt).getTime();

    if (cloudTime <= localTime && localState.folders.length > 0) {
      console.log('[Sheets Sync] Quota Optimization: Cloud is not newer than local state. Skipping full sheets download.');
      return { success: true, state: localState };
    }

    // Cloud is newer or local is empty! Proceed to fetch all tables
    console.log('[Sheets Sync] Cloud is newer, launching full tables download...');
    const batchGetUrl = `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values:batchGet?ranges=folders!A1:F999&ranges=projects!A1:G999&ranges=nodes!A1:AF999&ranges=tagCategories!A1:F999&ranges=deletions!A1:D999`;
    const getRes = await googleApiCall(batchGetUrl, token);
    const valueRanges = getRes.valueRanges || [];

    const cloudFolders = valuesToObjects(valueRanges[0]?.values || []);
    const cloudProjects = valuesToObjects(valueRanges[1]?.values || []);
    const cloudNodes = valuesToObjects(valueRanges[2]?.values || []);
    const cloudTagCats = valuesToObjects(valueRanges[3]?.values || []);
    const cloudDeletions = valuesToObjects(valueRanges[4]?.values || []);

    // Merge Deletions lists
    const localDeletionsList = getLocalDeletions();
    const mergedDeletionsList: DeletionRecord[] = [];
    const pushIfUniqueDeletion = (rec: DeletionRecord) => {
      if (!mergedDeletionsList.some(m => m.id === rec.id && m.type === rec.type)) {
        mergedDeletionsList.push(rec);
      }
    };
    cloudDeletions.forEach((d: any) => {
      if (d.type && d.id) {
        pushIfUniqueDeletion({ type: d.type, id: d.id, deletedAt: d.deletedAt });
      }
    });
    localDeletionsList.forEach(pushIfUniqueDeletion);

    const isDeleted = (type: string, id: string) => {
      return mergedDeletionsList.some(d => d.type === type && d.id === id);
    };

    // Apply LWW merging algorithm
    const finalFoldersMap = new Map<string, any>();
    localState.folders.forEach(f => {
      if (!isDeleted('folder', f.id)) {
        finalFoldersMap.set(f.id, f);
      }
    });
    cloudFolders.forEach(cf => {
      if (isDeleted('folder', cf.id)) return;
      const localFolder = finalFoldersMap.get(cf.id);
      if (!localFolder) {
        finalFoldersMap.set(cf.id, {
          id: cf.id,
          name: cf.name,
          parentId: cf.parentId || null,
          updatedAt: cf.updatedAt
        });
      } else {
        const localTime = new Date(localFolder.updatedAt || 0).getTime();
        const cloudTime = new Date(cf.updatedAt || 0).getTime();
        if (cloudTime > localTime) {
          finalFoldersMap.set(cf.id, {
            id: cf.id,
            name: cf.name,
            parentId: cf.parentId || null,
            updatedAt: cf.updatedAt
          });
        }
      }
    });

    const finalProjectsMap = new Map<string, any>();
    localState.projects.forEach(p => {
      if (!isDeleted('project', p.id)) {
        finalProjectsMap.set(p.id, p);
      }
    });
    cloudProjects.forEach(cp => {
      if (isDeleted('project', cp.id)) return;
      const localProject = finalProjectsMap.get(cp.id);
      if (!localProject) {
        finalProjectsMap.set(cp.id, {
          id: cp.id,
          name: cp.name,
          folderId: cp.folderId || null,
          createdAt: cp.createdAt,
          updatedAt: cp.updatedAt
        });
      } else {
        const localTime = new Date(localProject.updatedAt || 0).getTime();
        const cloudTime = new Date(cp.updatedAt || 0).getTime();
        if (cloudTime > localTime) {
          finalProjectsMap.set(cp.id, {
            id: cp.id,
            name: cp.name,
            folderId: cp.folderId || null,
            createdAt: cp.createdAt,
            updatedAt: cp.updatedAt
          });
        }
      }
    });

    const finalNodesMap = new Map<string, TaskNode>();
    Object.values(localState.nodes).flat().forEach((n: TaskNode) => {
      if (n && !isDeleted('node', n.id)) {
        finalNodesMap.set(n.id, n);
      }
    });
    cloudNodes.forEach(cn => {
      if (isDeleted('node', cn.id)) return;
      const localNode = finalNodesMap.get(cn.id);
      const parsedNode: TaskNode = {
        id: cn.id,
        projectId: cn.projectId,
        text: cn.text || '',
        x: Number(cn.x || 0),
        y: Number(cn.y || 0),
        parentId: cn.parentId || null,
        priority: (cn.priority || 'none') as any,
        tags: cn.tagsJson ? JSON.parse(cn.tagsJson) : [],
        notes: cn.notes || '',
        completed: cn.completed === 'TRUE',
        files: cn.filesJson ? JSON.parse(cn.filesJson) : [],
        comments: cn.commentsJson ? JSON.parse(cn.commentsJson) : [],
        color: cn.color || undefined,
        collapsed: cn.collapsed === 'TRUE',
        isCardCollapsed: cn.isCardCollapsed === 'TRUE',
        dueDate: cn.dueDate || undefined,
        dueTime: cn.dueTime || undefined,
        startDate: cn.startDate || undefined,
        startTime: cn.startTime || undefined,
        progress: cn.progress ? Number(cn.progress) : undefined,
        isFloating: cn.isFloating === 'TRUE',
        isContainer: cn.isContainer === 'TRUE',
        isWorkflowRectangle: cn.isWorkflowRectangle === 'TRUE',
        workflowShape: cn.workflowShape ? cn.workflowShape as any : undefined,
        zoneWidth: cn.zoneWidth ? Number(cn.zoneWidth) : undefined,
        zoneHeight: cn.zoneHeight ? Number(cn.zoneHeight) : undefined,
        pomodoroTotalTime: cn.pomodoroTotalTime ? Number(cn.pomodoroTotalTime) : undefined,
        pomodoroSessionsCount: cn.pomodoroSessionsCount ? Number(cn.pomodoroSessionsCount) : undefined,
        archived: cn.archived === 'TRUE',
        workflowConnections: cn.workflowConnectionsJson ? JSON.parse(cn.workflowConnectionsJson) : undefined,
        updatedAt: cn.updatedAt
      };

      if (!localNode) {
        finalNodesMap.set(cn.id, parsedNode);
      } else {
        const localTime = new Date(localNode.updatedAt || 0).getTime();
        const cloudTime = new Date(cn.updatedAt || 0).getTime();
        if (cloudTime > localTime) {
          finalNodesMap.set(cn.id, parsedNode);
        }
      }
    });

    const finalTagCatsMap = new Map<string, any>();
    (localState.tagCategories || []).forEach(tc => {
      if (!isDeleted('tagCategory', tc.id)) {
        finalTagCatsMap.set(tc.id, tc);
      }
    });
    cloudTagCats.forEach(ctc => {
      if (isDeleted('tagCategory', ctc.id)) return;
      const localTC = finalTagCatsMap.get(ctc.id);
      const parsedTC: TagCategory = {
        id: ctc.id,
        name: ctc.name,
        color: ctc.color,
        tags: ctc.tagsJson ? JSON.parse(ctc.tagsJson) : [],
        updatedAt: ctc.updatedAt
      };

      if (!localTC) {
        finalTagCatsMap.set(ctc.id, parsedTC);
      } else {
        const localTime = new Date(localTC.updatedAt || 0).getTime();
        const cloudTime = new Date(ctc.updatedAt || 0).getTime();
        if (cloudTime > localTime) {
          finalTagCatsMap.set(ctc.id, parsedTC);
        }
      }
    });

    const groupedNodes: Record<string, TaskNode[]> = {};
    finalNodesMap.forEach(n => {
      if (!groupedNodes[n.projectId]) {
        groupedNodes[n.projectId] = [];
      }
      groupedNodes[n.projectId].push(n);
    });

    const activePomoMeta = metadataObjects.find(m => m.key === 'activePomodoro')?.value;
    const activePomodoroParsed = activePomoMeta ? JSON.parse(activePomoMeta) : null;

    const mergedState: WorkspaceState = {
      folders: Array.from(finalFoldersMap.values()),
      projects: Array.from(finalProjectsMap.values()),
      nodes: groupedNodes,
      activeProjectId: metadataObjects.find(m => m.key === 'activeProjectId')?.value || null,
      tagCategories: Array.from(finalTagCatsMap.values()),
      deletions: mergedDeletionsList,
      activePomodoro: activePomodoroParsed,
      updatedAt: cloudMetaUpdatedAt,
      googleSheetsFileId: spreadsheetId
    };

    return { success: true, state: mergedState };
  } catch (err: any) {
    console.error('[Sheets Sync] Error in sync_cloud_to_local:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Dummy standard sync room functions to keep code compile-friendly
export async function saveStateToSyncRoom(roomId: string, state: WorkspaceState): Promise<void> {}
export async function loadStateFromSyncRoom(roomId: string): Promise<WorkspaceState | null> { return null; }
export function isWorkspaceStateSemanticallyEqual(a: WorkspaceState, b: WorkspaceState): boolean { return false; }
export function mergeWorkspaceStates(a: WorkspaceState, b: WorkspaceState, del: DeletionRecord[]): WorkspaceState { return a; }
export async function saveToFirebaseDirectly(userId: string, state: WorkspaceState): Promise<any> { return { success: true }; }
export async function loadFromFirebaseDirectly(userId: string): Promise<any> { return null; }
