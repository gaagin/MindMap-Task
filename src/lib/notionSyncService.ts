import { Client } from '@notionhq/client';

/**
 * Interface representing a Task item in our service database
 */
export interface ServiceTask {
  id: string;
  text: string;           // Task Title / Name
  completed: boolean;     // Done flag
  status?: 'todo' | 'progress' | 'waiting' | 'done';
  notionPageId?: string;  // Notion Page ID (saved after creation in Notion)
  updatedAt?: string;     // ISO Date string of last update in local database
  notionLastSyncedAt?: string; // ISO string when last synced to prevent infinite loops
}

/**
 * Interface for Notion Sync Configuration
 */
export interface NotionConfig {
  notionKey?: string;
  databaseId?: string;
}

/**
 * In-Memory tracker to prevent infinite synchronization loops.
 * Stores last sync timestamp per task ID / notion page ID.
 */
const syncTimestampCache = new Map<string, number>();
const activeSyncLocks = new Set<string>();

/**
 * Helper to get an instance of Notion SDK client
 */
export function getNotionClient(customKey?: string): Client {
  const apiKey = customKey || process.env.NOTION_KEY;
  if (!apiKey) {
    throw new Error('NOTION_KEY is not defined. Please set NOTION_KEY environment variable or pass a token.');
  }
  return new Client({ auth: apiKey });
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
 * Helper to get Notion Database ID from config or environment
 */
export function getNotionDatabaseId(customDbId?: string): string {
  const dbId = customDbId || process.env.NOTION_DATABASE_ID;
  if (!dbId) {
    throw new Error('NOTION_DATABASE_ID is not defined. Please set NOTION_DATABASE_ID environment variable.');
  }
  return formatNotionDatabaseId(dbId);
}

/**
 * Convert local task status to Notion Status option string
 */
function mapStatusToNotion(task: ServiceTask): string {
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

// ============================================================================
// 1. SERVICE -> NOTION CRUD OPERATIONS
// ============================================================================

/**
 * 1.1 createTaskInNotion
 * Creates a new page in Notion Database for a given task.
 * Returns the created page.id to save as `notionPageId` in local database.
 */
export async function createTaskInNotion(
  task: ServiceTask,
  config?: NotionConfig
): Promise<string> {
  const taskLockKey = `create_${task.id}`;
  if (activeSyncLocks.has(taskLockKey)) {
    console.log(`[NotionSync] Loop Prevention: Creation lock active for task ${task.id}. Skipping.`);
    return task.notionPageId || '';
  }

  activeSyncLocks.add(taskLockKey);

  try {
    const notion = getNotionClient(config?.notionKey);
    const databaseId = getNotionDatabaseId(config?.databaseId);
    const statusVal = mapStatusToNotion(task);

    console.log(`[NotionSync] Creating task in Notion: "${task.text}" (App_ID: ${task.id})`);

    // Prepare properties for Notion Database
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

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });

    const notionPageId = response.id;
    const syncedAtMs = Date.now();

    // Store sync timestamp to avoid infinite feedback loop
    syncTimestampCache.set(task.id, syncedAtMs);
    syncTimestampCache.set(notionPageId, syncedAtMs);

    console.log(`[NotionSync] Successfully created page in Notion. Page ID: ${notionPageId}`);
    return notionPageId;
  } catch (error: any) {
    console.error(`[NotionSync Error] Failed to create task ${task.id} in Notion:`, error.message || error);
    throw error;
  } finally {
    activeSyncLocks.delete(taskLockKey);
  }
}

/**
 * 1.2 updateTaskInNotion
 * Updates existing Notion page properties based on task's notionPageId.
 */
export async function updateTaskInNotion(
  task: ServiceTask,
  config?: NotionConfig
): Promise<boolean> {
  if (!task.notionPageId) {
    console.warn(`[NotionSync Warn] Cannot update in Notion: task ${task.id} has no notionPageId. Creating instead.`);
    const newPageId = await createTaskInNotion(task, config);
    task.notionPageId = newPageId;
    return true;
  }

  const taskLockKey = `update_${task.notionPageId}`;
  if (activeSyncLocks.has(taskLockKey)) {
    console.log(`[NotionSync] Loop Prevention: Lock active for page ${task.notionPageId}. Skipping update.`);
    return false;
  }

  activeSyncLocks.add(taskLockKey);

  try {
    const notion = getNotionClient(config?.notionKey);
    const statusVal = mapStatusToNotion(task);

    console.log(`[NotionSync] Updating Notion page ${task.notionPageId} for task "${task.text}"`);

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

    await notion.pages.update({
      page_id: task.notionPageId,
      properties,
    });

    const syncedAtMs = Date.now();
    syncTimestampCache.set(task.id, syncedAtMs);
    syncTimestampCache.set(task.notionPageId, syncedAtMs);

    console.log(`[NotionSync] Successfully updated page in Notion: ${task.notionPageId}`);
    return true;
  } catch (error: any) {
    console.error(`[NotionSync Error] Failed to update Notion page ${task.notionPageId}:`, error.message || error);
    throw error;
  } finally {
    activeSyncLocks.delete(taskLockKey);
  }
}

/**
 * 1.3 deleteTaskInNotion
 * Archives page in Notion (archived: true / in_trash: true)
 */
export async function deleteTaskInNotion(
  notionPageId: string,
  config?: NotionConfig
): Promise<boolean> {
  if (!notionPageId) return false;

  try {
    const notion = getNotionClient(config?.notionKey);
    console.log(`[NotionSync] Archiving page in Notion: ${notionPageId}`);

    await notion.pages.update({
      page_id: notionPageId,
      archived: true,
    });

    console.log(`[NotionSync] Successfully archived page in Notion: ${notionPageId}`);
    return true;
  } catch (error: any) {
    console.error(`[NotionSync Error] Failed to archive page ${notionPageId} in Notion:`, error.message || error);
    throw error;
  }
}

// ============================================================================
// 2. NOTION -> SERVICE (POLLING & BIDIRECTIONAL SYNC ENGINE)
// ============================================================================

export interface BidirectionalSyncResult {
  updatedLocalTasks: ServiceTask[];
  createdInNotionCount: number;
  updatedInNotionCount: number;
  updatedFromNotionCount: number;
  createdFromNotionCount: number;
  errors: string[];
}

/**
 * Perform a full two-way synchronization between local tasks and Notion Database.
 * Resolves conflicts by comparing `last_edited_time` vs `updatedAt`.
 * Uses App_ID to link records and prevent duplicate entries and loop storms.
 */
export async function syncBidirectional(
  localTasks: ServiceTask[],
  config?: NotionConfig
): Promise<BidirectionalSyncResult> {
  const result: BidirectionalSyncResult = {
    updatedLocalTasks: [...localTasks],
    createdInNotionCount: 0,
    updatedInNotionCount: 0,
    updatedFromNotionCount: 0,
    createdFromNotionCount: 0,
    errors: [],
  };

  try {
    const notion = getNotionClient(config?.notionKey);
    const databaseId = getNotionDatabaseId(config?.databaseId);

    console.log(`[NotionSync] Starting bidirectional sync with database ${databaseId}...`);

    // 1. Fetch all active pages from Notion Database
    const queryResponse = await (notion as any).databases.query({
      database_id: databaseId,
      filter: {
        archived: {
          equals: false,
        },
      },
    });

    const notionPages = queryResponse.results;
    console.log(`[NotionSync] Fetched ${notionPages.length} active pages from Notion.`);

    // Map existing local tasks by ID and by notionPageId for fast lookup
    const taskMapByAppId = new Map<string, ServiceTask>();
    const taskMapByNotionId = new Map<string, ServiceTask>();

    localTasks.forEach(task => {
      taskMapByAppId.set(task.id, task);
      if (task.notionPageId) {
        taskMapByNotionId.set(task.notionPageId, task);
      }
    });

    // 2. Process pages fetched from Notion
    for (const page of notionPages as any[]) {
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
          console.log(`[NotionSync Loop Prevention] Echo edit detected for task "${matchedTask.text}" (${matchedTask.id}). Skipping.`);
          continue;
        }

        // Compare timestamps: Which side is newer?
        if (lastEditedMsNotion > localUpdatedMs + 1000) {
          // Notion is newer -> Update Local Task
          console.log(`[NotionSync] Updating local task "${matchedTask.id}" from Notion changes (Notion time: ${lastEditedTimeNotion})`);

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
          console.log(`[NotionSync] Local task "${matchedTask.id}" is newer than Notion. Pushing to Notion...`);
          try {
            await updateTaskInNotion(matchedTask, config);
            result.updatedInNotionCount++;
          } catch (err: any) {
            result.errors.push(`Failed pushing task ${matchedTask.id} to Notion: ${err.message}`);
          }
        }
      } else {
        // --- NO LOCAL MATCH -> CREATE LOCAL TASK FROM NOTION PAGE ---
        console.log(`[NotionSync] New page detected in Notion ("${title}"). Creating local task...`);

        const newTaskId = appId || `notion_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newLocalTask: ServiceTask = {
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
            await updateTaskInNotion(newLocalTask, config);
          } catch (err: any) {
            console.warn(`[NotionSync] Failed writing back App_ID to new Notion page:`, err.message);
          }
        }

        result.createdFromNotionCount++;
      }
    }

    // 3. Process local tasks that are not yet in Notion
    for (const localTask of result.updatedLocalTasks) {
      if (!localTask.notionPageId) {
        console.log(`[NotionSync] Unsynced local task "${localTask.text}" (${localTask.id}). Creating in Notion...`);
        try {
          const newNotionPageId = await createTaskInNotion(localTask, config);
          localTask.notionPageId = newNotionPageId;
          localTask.notionLastSyncedAt = new Date().toISOString();
          result.createdInNotionCount++;
        } catch (err: any) {
          result.errors.push(`Failed to create task ${localTask.id} in Notion: ${err.message}`);
        }
      }
    }

    console.log(`[NotionSync] Synchronization finished. Status summary:`, {
      createdInNotion: result.createdInNotionCount,
      updatedInNotion: result.updatedInNotionCount,
      createdFromNotion: result.createdFromNotionCount,
      updatedFromNotion: result.updatedFromNotionCount,
      errorsCount: result.errors.length,
    });

    return result;
  } catch (error: any) {
    console.error(`[NotionSync Error] Bidirectional sync failed:`, error.message || error);
    result.errors.push(`Sync error: ${error.message || error}`);
    return result;
  }
}
