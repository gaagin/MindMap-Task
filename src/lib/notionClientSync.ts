/**
 * Client-side Notion Synchronization Helper
 * Bypasses local backend APIs by making direct HTTP requests to Notion API via a CORS proxy.
 */

// In-Memory tracker to prevent infinite synchronization loops.
const syncTimestampCache = new Map<string, number>();
const activeSyncLocks = new Set<string>();

export interface BidirectionalSyncResult {
  success: boolean;
  updatedLocalTasks: any[];
  createdInNotionCount: number;
  updatedInNotionCount: number;
  updatedFromNotionCount: number;
  createdFromNotionCount: number;
  error?: string;
  errors: string[];
}

/**
 * Format raw Notion Database ID or URL to standard UUID with hyphens:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
export function formatNotionDatabaseId(rawInput: string): string {
  if (!rawInput) return '';

  let cleaned = rawInput.trim();

  // If a full URL was pasted (e.g., https://www.notion.so/myworkspace/8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d?v=...)
  const urlMatch = cleaned.match(/([a-f0-9]{32})/i) || cleaned.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (urlMatch) {
    cleaned = urlMatch[1];
  }

  // Remove existing hyphens
  const hexOnly = cleaned.replace(/-/g, '');

  // Format 32-hex string into UUID with hyphens (8-4-4-4-12)
  if (hexOnly.length === 32 && /^[a-f0-9]{32}$/i.test(hexOnly)) {
    return `${hexOnly.slice(0, 8)}-${hexOnly.slice(8, 12)}-${hexOnly.slice(12, 16)}-${hexOnly.slice(16, 20)}-${hexOnly.slice(20)}`;
  }

  return rawInput.trim();
}

/**
 * Convert local task status to Notion Status option string
 */
function mapStatusToNotion(task: { completed: boolean; status?: string }): string {
  if (task.completed || task.status === 'done') {
    return 'Done';
  }
  if (task.status === 'progress') {
    return 'In Progress';
  }
  return 'To Do';
}

/**
 * Convert Notion Status property to local task completion & status fields
 */
function mapNotionStatusToTask(notionStatus: string): { completed: boolean; status: 'todo' | 'progress' | 'done' } {
  const normalized = (notionStatus || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'готово' || normalized === 'completed') {
    return { completed: true, status: 'done' };
  }
  if (normalized === 'in progress' || normalized === 'в процессе' || normalized === 'doing') {
    return { completed: false, status: 'progress' };
  }
  return { completed: false, status: 'todo' };
}

/**
 * Test Connection directly from the client via a CORS proxy
 */
export async function testNotionConnectionClient(
  notionKey: string,
  databaseId: string
): Promise<{ success: boolean; databaseTitle?: string; missingProperties?: string[]; error?: string }> {
  try {
    if (!notionKey || !databaseId) {
      return {
        success: false,
        error: 'Пожалуйста, заполните NOTION_KEY и NOTION_DATABASE_ID.'
      };
    }

    const cleanDatabaseId = formatNotionDatabaseId(databaseId);
    const targetUrl = `https://api.notion.com/v1/databases/${cleanDatabaseId}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    const res = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `Ошибка Notion API (${res.status}): ${errorText}`
      };
    }

    const dbInfo = await res.json();
    const props = dbInfo.properties || {};
    const hasTitle = Boolean(props.Title || props.Name);
    const hasStatus = Boolean(props.Status);
    const hasAppId = Boolean(props.App_ID);

    const missingProperties: string[] = [];
    if (!hasTitle) missingProperties.push('Title (или Name)');
    if (!hasStatus) missingProperties.push('Status (select или status)');
    if (!hasAppId) missingProperties.push('App_ID (rich_text или number)');

    let titleText = 'Untitled Database';
    if (dbInfo.title && Array.isArray(dbInfo.title) && dbInfo.title.length > 0) {
      titleText = dbInfo.title.map((t: any) => t.plain_text || t.text?.content || '').join('');
    }

    return {
      success: true,
      databaseTitle: titleText,
      missingProperties
    };
  } catch (err: any) {
    console.error('[testNotionConnectionClient Error]', err);
    return {
      success: false,
      error: `Ошибка сети при проверке связи: ${err.message || err}`
    };
  }
}

/**
 * Create a page in Notion Database directly via CORS proxy
 */
async function createTaskInNotionClient(
  task: any,
  notionKey: string,
  databaseId: string
): Promise<string> {
  const taskLockKey = `create_${task.id}`;
  if (activeSyncLocks.has(taskLockKey)) {
    console.log(`[NotionSync] Loop Prevention: Creation lock active for task ${task.id}. Skipping.`);
    return task.notionPageId || '';
  }

  activeSyncLocks.add(taskLockKey);

  try {
    const cleanDatabaseId = formatNotionDatabaseId(databaseId);
    const statusVal = mapStatusToNotion(task);

    console.log(`[NotionSyncClient] Creating task in Notion: "${task.text}" (App_ID: ${task.id})`);

    const properties: Record<string, any> = {
      Title: {
        title: [
          {
            text: {
              content: task.text || 'Untitled Task',
            },
          },
        ],
      },
      App_ID: {
        rich_text: [
          {
            text: {
              content: String(task.id),
            },
          },
        ],
      },
      Status: {
        select: {
          name: statusVal,
        },
      },
    };

    const targetUrl = `https://api.notion.com/v1/pages`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: cleanDatabaseId },
        properties,
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ошибка создания страницы в Notion (${res.status}): ${errText}`);
    }

    const responseData = await res.json();
    const notionPageId = responseData.id;
    const syncedAtMs = Date.now();

    // Store sync timestamp to avoid infinite feedback loop
    syncTimestampCache.set(task.id, syncedAtMs);
    syncTimestampCache.set(notionPageId, syncedAtMs);

    console.log(`[NotionSyncClient] Successfully created page in Notion. Page ID: ${notionPageId}`);
    return notionPageId;
  } catch (error: any) {
    console.error(`[NotionSyncClient Error] Failed to create task ${task.id} in Notion:`, error.message || error);
    throw error;
  } finally {
    activeSyncLocks.delete(taskLockKey);
  }
}

/**
 * Update a page in Notion Database directly via CORS proxy
 */
async function updateTaskInNotionClient(
  task: any,
  notionKey: string,
  databaseId: string
): Promise<boolean> {
  if (!task.notionPageId) {
    console.warn(`[NotionSyncClient Warn] Cannot update in Notion: task ${task.id} has no notionPageId. Creating instead.`);
    const newPageId = await createTaskInNotionClient(task, notionKey, databaseId);
    task.notionPageId = newPageId;
    return true;
  }

  const taskLockKey = `update_${task.notionPageId}`;
  if (activeSyncLocks.has(taskLockKey)) {
    console.log(`[NotionSyncClient] Loop Prevention: Lock active for page ${task.notionPageId}. Skipping update.`);
    return false;
  }

  activeSyncLocks.add(taskLockKey);

  try {
    const statusVal = mapStatusToNotion(task);

    console.log(`[NotionSyncClient] Updating Notion page ${task.notionPageId} for task "${task.text}"`);

    const properties: Record<string, any> = {
      Title: {
        title: [
          {
            text: {
              content: task.text || 'Untitled Task',
            },
          },
        ],
      },
      App_ID: {
        rich_text: [
          {
            text: {
              content: String(task.id),
            },
          },
        ],
      },
      Status: {
        select: {
          name: statusVal,
        },
      },
    };

    const targetUrl = `https://api.notion.com/v1/pages/${task.notionPageId}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    const res = await fetch(proxyUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties,
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ошибка обновления страницы в Notion (${res.status}): ${errText}`);
    }

    const syncedAtMs = Date.now();
    syncTimestampCache.set(task.id, syncedAtMs);
    syncTimestampCache.set(task.notionPageId, syncedAtMs);

    console.log(`[NotionSyncClient] Successfully updated page in Notion: ${task.notionPageId}`);
    return true;
  } catch (error: any) {
    console.error(`[NotionSyncClient Error] Failed to update Notion page ${task.notionPageId}:`, error.message || error);
    throw error;
  } finally {
    activeSyncLocks.delete(taskLockKey);
  }
}

/**
 * Perform direct client-side bidirectional synchronization
 */
export async function syncBidirectionalClient(
  localTasks: any[],
  notionKey: string,
  databaseId: string
): Promise<BidirectionalSyncResult> {
  const result: BidirectionalSyncResult = {
    success: true,
    updatedLocalTasks: JSON.parse(JSON.stringify(localTasks)), // Deep clone to avoid mutating React state directly
    createdInNotionCount: 0,
    updatedInNotionCount: 0,
    updatedFromNotionCount: 0,
    createdFromNotionCount: 0,
    errors: [],
  };

  try {
    if (!notionKey || !databaseId) {
      throw new Error('Укажите NOTION_KEY и NOTION_DATABASE_ID');
    }

    const cleanDatabaseId = formatNotionDatabaseId(databaseId);
    console.log(`[NotionSyncClient] Starting bidirectional sync with database ${cleanDatabaseId}...`);

    const targetUrl = `https://api.notion.com/v1/databases/${cleanDatabaseId}/query`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    // 1. Fetch all active pages from Notion Database
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ошибка запроса к Notion API (${res.status}): ${errText}`);
    }

    const queryResponse = await res.json();
    const notionPages = queryResponse.results || [];
    console.log(`[NotionSyncClient] Fetched ${notionPages.length} active pages from Notion.`);

    // Map existing local tasks by ID and by notionPageId for fast lookup
    const taskMapByAppId = new Map<string, any>();
    const taskMapByNotionId = new Map<string, any>();

    result.updatedLocalTasks.forEach(task => {
      taskMapByAppId.set(task.id, task);
      if (task.notionPageId) {
        taskMapByNotionId.set(task.notionPageId, task);
      }
    });

    // 2. Process pages fetched from Notion
    for (const page of notionPages) {
      const pageId = page.id;
      const lastEditedTimeNotion = page.last_edited_time; // ISO string from Notion
      const lastEditedMsNotion = new Date(lastEditedTimeNotion).getTime();

      // Extract properties from Notion Page
      const props = page.properties || {};

      // Extract Title
      let title = '';
      if (props.Title?.title && Array.isArray(props.Title.title) && props.Title.title.length > 0) {
        title = props.Title.title.map((t: any) => t.plain_text || t.text?.content || '').join('');
      } else if (props.Name?.title) {
        title = props.Name.title.map((t: any) => t.plain_text || t.text?.content || '').join('');
      }

      // Extract App_ID
      let appId = '';
      if (props.App_ID?.rich_text && Array.isArray(props.App_ID.rich_text) && props.App_ID.rich_text.length > 0) {
        appId = props.App_ID.rich_text.map((t: any) => t.plain_text || t.text?.content || '').join('').trim();
      } else if (props.App_ID?.number !== undefined && props.App_ID?.number !== null) {
        appId = String(props.App_ID.number);
      }

      // Extract Status
      let statusStr = '';
      if (props.Status?.select?.name) {
        statusStr = props.Status.select.name;
      } else if (props.Status?.status?.name) {
        statusStr = props.Status.status.name;
      }

      const { completed, status } = mapNotionStatusToTask(statusStr);

      // Check if this page matches an existing local task by App_ID or pageId
      let matchedTask = (appId ? taskMapByAppId.get(appId) : undefined) || taskMapByNotionId.get(pageId);

      if (matchedTask) {
        // --- MATCH FOUND ---
        const localUpdatedMs = new Date(matchedTask.updatedAt || 0).getTime();
        const lastSyncMs = syncTimestampCache.get(matchedTask.id) || syncTimestampCache.get(pageId) || 0;

        // Loop protection check: If last_edited_time in Notion matches our last sync timestamp (+/- 3 seconds)
        const isEchoEditFromApp = Math.abs(lastEditedMsNotion - lastSyncMs) < 3000;

        if (isEchoEditFromApp) {
          console.log(`[NotionSync Client Loop Prevention] Echo edit detected for task "${matchedTask.text}" (${matchedTask.id}). Skipping.`);
          continue;
        }

        // Compare timestamps: Which side is newer?
        if (lastEditedMsNotion > localUpdatedMs + 1000) {
          // Notion is newer -> Update Local Task
          console.log(`[NotionSync Client] Updating local task "${matchedTask.id}" from Notion changes (Notion time: ${lastEditedTimeNotion})`);

          matchedTask.text = title || matchedTask.text;
          matchedTask.completed = completed;
          matchedTask.status = status;
          matchedTask.notionPageId = pageId;
          matchedTask.updatedAt = lastEditedTimeNotion;
          matchedTask.notionLastSyncedAt = new Date().toISOString();

          // Update sync cache
          syncTimestampCache.set(matchedTask.id, lastEditedMsNotion);
          syncTimestampCache.set(pageId, lastEditedMsNotion);

          result.updatedFromNotionCount++;
        } else if (localUpdatedMs > lastEditedMsNotion + 1000) {
          // Local task is newer -> Push updates to Notion
          console.log(`[NotionSync Client] Local task "${matchedTask.id}" is newer than Notion. Pushing to Notion...`);
          try {
            await updateTaskInNotionClient(matchedTask, notionKey, databaseId);
            result.updatedInNotionCount++;
          } catch (err: any) {
            result.errors.push(`Failed pushing task ${matchedTask.id} to Notion: ${err.message}`);
          }
        }
      } else {
        // --- NO LOCAL MATCH -> CREATE LOCAL TASK FROM NOTION PAGE ---
        console.log(`[NotionSync Client] New page detected in Notion ("${title}"). Creating local task...`);

        const newTaskId = appId || `notion_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newLocalTask: any = {
          id: newTaskId,
          text: title || 'Notion Import',
          completed,
          status,
          notionPageId: pageId,
          updatedAt: lastEditedTimeNotion,
          notionLastSyncedAt: new Date().toISOString(),
        };

        result.updatedLocalTasks.push(newLocalTask);
        taskMapByAppId.set(newTaskId, newLocalTask);
        taskMapByNotionId.set(pageId, newLocalTask);

        // If page in Notion lacked App_ID property, update Notion page with generated App_ID!
        if (!appId) {
          try {
            await updateTaskInNotionClient(newLocalTask, notionKey, databaseId);
          } catch (err: any) {
            console.warn(`[NotionSync Client] Failed writing back App_ID to new Notion page:`, err.message);
          }
        }

        result.createdFromNotionCount++;
      }
    }

    // 3. Process local tasks that are not yet in Notion
    for (const localTask of result.updatedLocalTasks) {
      if (!localTask.notionPageId) {
        console.log(`[NotionSync Client] Unsynced local task "${localTask.text}" (${localTask.id}). Creating in Notion...`);
        try {
          const newNotionPageId = await createTaskInNotionClient(localTask, notionKey, databaseId);
          localTask.notionPageId = newNotionPageId;
          localTask.notionLastSyncedAt = new Date().toISOString();
          result.createdInNotionCount++;
        } catch (err: any) {
          result.errors.push(`Failed to create task ${localTask.id} in Notion: ${err.message}`);
        }
      }
    }

    console.log(`[NotionSyncClient] Bidirectional sync completed successfully.`);
    return result;
  } catch (error: any) {
    console.error(`[NotionSyncClient Error] Bidirectional sync failed:`, error.message || error);
    result.success = false;
    result.error = error.message || error;
    result.errors.push(`Sync error: ${error.message || error}`);
    return result;
  }
}
