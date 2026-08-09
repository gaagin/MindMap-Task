import { TaskNode } from '../types';

export interface NotionConnectionResult {
  success: boolean;
  title?: string;
  properties?: any;
  error?: string;
}

export interface NotionSyncResult {
  success: boolean;
  pageId?: string;
  url?: string;
  error?: string;
}

/**
 * Test integration connection and fetch target database schema
 */
export async function testNotionConnection(apiKey: string, databaseId: string): Promise<NotionConnectionResult> {
  try {
    const res = await fetch('/api/notion/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, databaseId })
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Не удалось связаться с базой данных Notion.' };
    }

    return {
      success: true,
      title: data.title,
      properties: data.properties
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка сети.' };
  }
}

/**
 * Dynamically map a MindMap TaskNode to Notion API page properties
 */
export function mapTaskToNotionProperties(task: TaskNode, schema: any): any {
  const props: any = {};

  // 1. Title Property (Required)
  let titleKey = 'Name';
  if (schema) {
    const foundKey = Object.keys(schema).find(k => schema[k].type === 'title');
    if (foundKey) titleKey = foundKey;
  }
  props[titleKey] = {
    title: [
      {
        text: {
          content: task.text || 'Без названия'
        }
      }
    ]
  };

  if (!schema) {
    return props;
  }

  // 2. Status Property (Status, Select or Checkbox)
  const statusProp = Object.keys(schema).find(
    k => (k.toLowerCase() === 'status' || k.toLowerCase() === 'статус') && schema[k].type === 'status'
  );
  if (statusProp) {
    props[statusProp] = {
      status: {
        name: task.completed ? 'Done' : (task.status === 'progress' ? 'In Progress' : 'To Do')
      }
    };
  } else {
    // Check if there is a completed checkbox
    const checkboxProp = Object.keys(schema).find(
      k => (k.toLowerCase() === 'completed' || k.toLowerCase() === 'done' || k.toLowerCase() === 'выполнено') && schema[k].type === 'checkbox'
    );
    if (checkboxProp) {
      props[checkboxProp] = {
        checkbox: !!task.completed
      };
    } else {
      // Check for Select-type status
      const selectStatusProp = Object.keys(schema).find(
        k => (k.toLowerCase() === 'status' || k.toLowerCase() === 'статус') && schema[k].type === 'select'
      );
      if (selectStatusProp) {
        props[selectStatusProp] = {
          select: {
            name: task.completed ? 'Done' : (task.status === 'progress' ? 'In Progress' : 'To Do')
          }
        };
      }
    }
  }

  // 3. Priority Property (Select)
  const priorityProp = Object.keys(schema).find(
    k => (k.toLowerCase() === 'priority' || k.toLowerCase() === 'приоритет') && schema[k].type === 'select'
  );
  if (priorityProp) {
    let selectName = 'Medium';
    if (task.priority === 'low') selectName = 'Low';
    if (task.priority === 'medium') selectName = 'Medium';
    if (task.priority === 'high') selectName = 'High';
    if (task.priority === 'urgent') selectName = 'Urgent';
    if (task.priority === 'none') selectName = 'None';
    
    // Check if the select options actually contain this priority name (lowercase/uppercase check)
    const options = schema[priorityProp].select?.options || [];
    const matchedOption = options.find((o: any) => o.name.toLowerCase() === selectName.toLowerCase());
    
    props[priorityProp] = {
      select: {
        name: matchedOption ? matchedOption.name : (options[0]?.name || selectName)
      }
    };
  }

  // 4. Due Date Property (Date)
  const dateProp = Object.keys(schema).find(
    k => (k.toLowerCase() === 'due date' || k.toLowerCase() === 'due' || k.toLowerCase() === 'срок' || k.toLowerCase() === 'дата') && schema[k].type === 'date'
  );
  if (dateProp && task.dueDate) {
    props[dateProp] = {
      date: {
        start: task.dueDate
      }
    };
  }

  // 5. Notes / Description (Rich Text)
  const notesProp = Object.keys(schema).find(
    k => (k.toLowerCase() === 'notes' || k.toLowerCase() === 'description' || k.toLowerCase() === 'заметки' || k.toLowerCase() === 'описание') && schema[k].type === 'rich_text'
  );
  if (notesProp && task.notes) {
    props[notesProp] = {
      rich_text: [
        {
          text: {
            content: task.notes.substring(0, 2000)
          }
        }
      ]
    };
  }

  return props;
}

/**
 * Creates a page in Notion database
 */
export async function createNotionPage(
  task: TaskNode,
  apiKey: string,
  databaseId: string,
  schema?: any
): Promise<NotionSyncResult> {
  try {
    const pageProperties = mapTaskToNotionProperties(task, schema);
    
    // Check if task has a customized visual color, we can set it as page icon
    let icon = undefined;
    if (task.color) {
      // Notion accepts emoji icons
      if (task.completed) {
        icon = { type: 'emoji', emoji: '✅' };
      } else if (task.priority === 'urgent') {
        icon = { type: 'emoji', emoji: '🚨' };
      } else if (task.priority === 'high') {
        icon = { type: 'emoji', emoji: '🔥' };
      } else {
        icon = { type: 'emoji', emoji: '📌' };
      }
    }

    const res = await fetch('/api/notion/create-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, databaseId, properties: pageProperties, icon })
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Не удалось создать страницу в Notion.' };
    }

    return {
      success: true,
      pageId: data.pageId,
      url: data.url
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка сети.' };
  }
}

/**
 * Updates a page in Notion
 */
export async function updateNotionPage(
  task: TaskNode,
  apiKey: string,
  pageId: string,
  schema?: any
): Promise<NotionSyncResult> {
  try {
    const pageProperties = mapTaskToNotionProperties(task, schema);

    const res = await fetch('/api/notion/update-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, pageId, properties: pageProperties })
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Не удалось обновить страницу в Notion.' };
    }

    return {
      success: true,
      pageId: data.pageId,
      url: data.url
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Ошибка сети.' };
  }
}
