import { WorkspaceState } from '../types';

// Endpoints for Google Sheets & Drive REST APIs
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Creates a new Google Spreadsheet with two tabs: SyncState (for JSON metadata) and Tasks_View (for physical rows)
 */
export async function createSyncSpreadsheet(accessToken: string, title: string): Promise<string> {
  const response = await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title || 'Mind Map Tasks Sync',
      },
      sheets: [
        {
          properties: {
            title: 'SyncState',
            gridProperties: {
              columnCount: 3,
              rowCount: 10,
            },
          },
        },
        {
          properties: {
            title: 'Tasks_View',
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Не удалось создать таблицу: ${errText}`);
  }

  const data = await response.json();
  return data.spreadsheetId;
}

/**
 * Check if the sheets exist, if not, create them via batch update.
 */
async function ensureSheetTabsExist(accessToken: string, spreadsheetId: string): Promise<void> {
  const getUrl = `${SHEETS_API_URL}/${spreadsheetId}`;
  const response = await fetch(getUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) return;

  const data = await response.json();
  const existingTitles = data.sheets?.map((s: any) => s.properties?.title) || [];

  const requests: any[] = [];
  if (!existingTitles.includes('SyncState')) {
    requests.push({
      addSheet: {
        properties: {
          title: 'SyncState',
          gridProperties: { columnCount: 3, rowCount: 10 },
        },
      },
    });
  }

  if (!existingTitles.includes('Tasks_View')) {
    requests.push({
      addSheet: {
        properties: {
          title: 'Tasks_View',
        },
      },
    });
  }

  if (requests.length > 0) {
    await fetch(`${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  }
}

/**
 * Saves the local workspace state to a specified Google Spreadsheet.
 * Writes JSON model to 'SyncState' tab and interactive columns to 'Tasks_View' tab.
 */
export async function saveStateToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  state: WorkspaceState
): Promise<void> {
  // First, make sure the tabs we require are active in this spreadsheet
  await ensureSheetTabsExist(accessToken, spreadsheetId);

  // 1. Prepare JSON of state. Clean state of temporary properties if needed.
  const serializedState = JSON.stringify(state);

  // Write state JSON to SyncState!A1
  const updateJsonUrl = `${SHEETS_API_URL}/${spreadsheetId}/values/SyncState!A1?valueInputOption=RAW`;
  const jsonResponse = await fetch(updateJsonUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: 'SyncState!A1',
      majorDimension: 'ROWS',
      values: [[serializedState, new Date().toISOString(), 'MindMapWorkspaceState']],
    }),
  });

  if (!jsonResponse.ok) {
    const errText = await jsonResponse.text();
    throw new Error(`Ошибка при переносе JSON в SyncState: ${errText}`);
  }

  // 2. Clear entire Tasks_View tab and rewrite it as a nice visual table of all tasks across all projects
  // Clear the existing visual range
  const clearUrl = `${SHEETS_API_URL}/${spreadsheetId}/values/Tasks_View!A1:V1000:clear`;
  await fetch(clearUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  // Prepare task list columns for tabular output
  const headers = [
    'ID задачи',
    'Проект ID',
    'Проект название',
    'Текст задачи',
    'Выполнено',
    'Приоритет',
    'Прогресс %',
    'Дедлайн',
    'Теги',
    'Заметки/Описание',
    'ID Родителя',
    'Плавающая',
  ];

  const rows: any[][] = [headers];

  // Collect all task nodes
  Object.keys(state.nodes || {}).forEach(projectId => {
    const project = state.projects?.find(p => p.id === projectId);
    const projectName = project ? project.name : 'Неизвестный проект';
    const nodes = state.nodes[projectId] || [];

    nodes.forEach(node => {
      rows.push([
        node.id || '',
        node.projectId || '',
        projectName,
        node.text || '',
        node.completed ? 'Да' : 'Нет',
        node.priority || 'none',
        node.progress !== undefined ? node.progress : '',
        node.dueDate || '',
        node.tags ? node.tags.join(', ') : '',
        node.notes || '',
        node.parentId || '',
        node.isFloating ? 'Да' : 'Нет',
      ]);
    });
  });

  // Write Tasks_View spreadsheet
  if (rows.length > 0) {
    const updateTasksUrl = `${SHEETS_API_URL}/${spreadsheetId}/values/Tasks_View!A1?valueInputOption=RAW`;
    await fetch(updateTasksUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Tasks_View!A1',
        majorDimension: 'ROWS',
        values: rows,
      }),
    });
  }
}

/**
 * Loads the workspace state from a specified Google Spreadsheet.
 * Primarily reads from SyncState!A1 cellular JSON block.
 */
export async function loadStateFromGoogleSheets(
  accessToken: string,
  spreadsheetId: string
): Promise<WorkspaceState> {
  const getJsonUrl = `${SHEETS_API_URL}/${spreadsheetId}/values/SyncState!A1:A1`;
  const response = await fetch(getJsonUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Не удалось считать данные из SyncState. Проверьте правильность ID таблицы: ${errText}`);
  }

  const data = await response.json();
  const rows = data.values;

  if (!rows || rows.length === 0 || !rows[0][0]) {
    throw new Error('Таблица синхронизации пуста или не содержит данных в ячейке SyncState!A1.');
  }

  const stateStr = rows[0][0];
  try {
    const parsedState = JSON.parse(stateStr) as WorkspaceState;
    if (!parsedState.projects || !parsedState.nodes) {
      throw new Error('Ячейка SyncState!A1 содержит некорректный формат WorkspaceState.');
    }
    return parsedState;
  } catch (err: any) {
    throw new Error(`Ошибка десериализации JSON из Google Sheets: ${err.message}`);
  }
}

/**
 * Fetches a list of spreadsheet files from the user's Google Drive.
 */
export async function listSpreadsheetsFromDrive(accessToken: string): Promise<{ id: string; name: string }[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `${DRIVE_API_URL}?q=${query}&fields=files(id,name)&pageSize=50`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Не удалось загрузить список файлов из Google Диска: ${errText}`);
  }

  const data = await response.json();
  return data.files || [];
}
