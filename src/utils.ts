import { Folder, Project, TaskNode, Priority, WorkspaceState, TagCategory } from './types';

// Helper to generate UUIDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Generate the beautiful default empty workspace
export function createDemoWorkspace(): WorkspaceState {
  const tagCategories: TagCategory[] = [
    {
      id: 'cat-phase',
      name: 'Этап разработки',
      color: '#f59e0b', // Amber
      tags: ['MVP', 'Разработка', 'Трафик', 'Дизайн', 'Тех-задание']
    },
    {
      id: 'cat-department',
      name: 'Отдел/Тематика',
      color: '#3b82f6', // Indigo
      tags: ['Генеральный-план', 'SMM', 'PR', 'Сайт', 'Юридическое', 'Безопасность', 'Инвесторы', 'Презентация', 'Питч', 'Слайды']
    },
    {
      id: 'cat-personal',
      name: 'Личное',
      color: '#10b981', // Emerald
      tags: ['Стиль-жизни', 'Утро', 'Осознанность', 'Фокус', 'Сон', 'Здоровье']
    }
  ];

  return {
    folders: [],
    projects: [],
    nodes: {},
    activeProjectId: null,
    tagCategories
  };
}

// Global key for localStorage persistence
const STORAGE_KEY = 'task_mindmaps_state';

// Load workspace from local storage or fallback to demo
export function loadWorkspace(): WorkspaceState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized || serialized === 'null' || serialized === 'undefined') {
      const demo = createDemoWorkspace();
      saveWorkspace(demo);
      return demo;
    }
    const state = JSON.parse(serialized) as WorkspaceState;
    if (!state || typeof state !== 'object') {
      const demo = createDemoWorkspace();
      saveWorkspace(demo);
      return demo;
    }
    
    // Safety fallback in case fields are missing
    if (!state || typeof state !== 'object') {
      return createDemoWorkspace();
    }
    if (!Array.isArray(state.folders)) state.folders = [];
    if (!Array.isArray(state.projects)) state.projects = [];
    if (!state.nodes || typeof state.nodes !== 'object') state.nodes = {};

    // Remove old demo folders/projects/nodes from previous storage sessions
    state.folders = state.folders.filter(f => f.id !== 'f-work' && f.id !== 'f-sub-goals' && f.id !== 'f-personal');
    state.projects = state.projects.filter(p => p.id !== 'p-startup' && p.id !== 'p-habit');
    if (state.nodes['p-startup']) delete state.nodes['p-startup'];
    if (state.nodes['p-habit']) delete state.nodes['p-habit'];

    if (state.tagCategories === undefined) {
      state.tagCategories = [
        {
          id: 'cat-phase',
          name: 'Этап разработки',
          color: '#f59e0b', // Amber
          tags: ['MVP', 'Разработка', 'Трафик', 'Дизайн', 'Тех-задание']
        },
        {
          id: 'cat-department',
          name: 'Отдел/Тематика',
          color: '#3b82f6', // Indigo
          tags: ['Генеральный-план', 'SMM', 'PR', 'Сайт', 'Юридическое', 'Безопасность', 'Инвесторы', 'Презентация', 'Питч', 'Слайды']
        },
        {
          id: 'cat-personal',
          name: 'Личное',
          color: '#10b981', // Emerald
          tags: ['Стиль-жизни', 'Утро', 'Осознанность', 'Фокус', 'Сон', 'Здоровье']
        }
      ];
    }
    if ((!state.activeProjectId || !state.projects.some(p => p.id === state.activeProjectId)) && state.projects.length > 0) {
      state.activeProjectId = state.projects[0].id;
    } else if (state.projects.length === 0) {
      state.activeProjectId = null;
    }
    if (!state.googleSheetsFileId) {
      state.googleSheetsFileId = localStorage.getItem('google_sheets_sync_file_id') || undefined;
    }
    if (!state.taskSheetsSpreadsheetId) {
      state.taskSheetsSpreadsheetId = localStorage.getItem('task_sheets_spreadsheet_id') || undefined;
    }

    // Filter out deleted elements using milli_deleted_registry
    try {
      const deletionsJson = localStorage.getItem('milli_deleted_registry') || '[]';
      const deletions = JSON.parse(deletionsJson) || [];
      state.deletions = deletions; // Ensure deletions list is preserved directly inside active state representation
      if (Array.isArray(deletions) && deletions.length > 0) {
        const isDeleted = (type: string, id: string) => {
          return deletions.some((d: any) => d && d.type === type && d.id === id);
        };
        
        state.folders = state.folders.filter(f => !isDeleted('folder', f.id));
        state.projects = state.projects.filter(p => !isDeleted('project', p.id));
        if (state.tagCategories) {
          state.tagCategories = state.tagCategories.filter(tc => !isDeleted('tagCategory', tc.id));
        }
        
        const filteredNodes: Record<string, TaskNode[]> = {};
        Object.keys(state.nodes || {}).forEach(pid => {
          if (!isDeleted('project', pid)) {
            const list = (state.nodes[pid] || []).filter(n => !isDeleted('node', n.id));
            if (list.length > 0) {
              filteredNodes[pid] = list;
            }
          }
        });
        state.nodes = filteredNodes;
      }
    } catch (e) {
      console.error('Failed to filter local workspace against deletions on load:', e);
    }

    return state;
  } catch (error) {
    console.error('Failed to load workspace, starting clean demo', error);
    return createDemoWorkspace();
  }
}

// Save workspace to local storage
export function saveWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save workspace to localStorage:', error);
  }
}

// Sizing / connection lines calculus
export function getBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  // Center midpoints for the curved path
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(dx * 0.45, 50); // organic scaling of curvature
  
  const c1x = x1 + controlOffset * (x2 > x1 ? 1 : -1);
  const c1y = y1;
  const c2x = x2 - controlOffset * (x2 > x1 ? 1 : -1);
  const c2y = y2;
  
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// Pretty formatting utility for file sizes
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to find all downstream descendants of a node recursively
export function getDescendants(nodeId: string, allNodes: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  const findDescendants = (parentId: string) => {
    const children = allNodes.filter(n => n.parentId === parentId);
    children.forEach(child => {
      result.push(child);
      findDescendants(child.id);
    });
  };
  findDescendants(nodeId);
  return result;
}

// Helper to calculate progress of a node based on its descendants/subtasks
export function calculateProgress(nodeId: string, allNodes: TaskNode[]): number | null {
  const node = allNodes.find(n => n.id === nodeId);
  if (!node) return null;

  const children = allNodes.filter(n => n.parentId === nodeId && !n.isWorkflowRectangle);
  if (children.length === 0) {
    if (node.completed) return 100;
    return node.progress !== undefined ? node.progress : 0;
  }

  // Cache visited sets to prevent potential cycles or stack overflows
  const visited = new Set<string>([nodeId]);

  const getProgress = (id: string): number => {
    if (visited.has(id)) return 0;
    visited.add(id);

    const currNode = allNodes.find(n => n.id === id);
    if (!currNode) return 0;
    if (currNode.completed) return 100;

    const subChildren = allNodes.filter(n => n.parentId === id && !n.isWorkflowRectangle);
    if (subChildren.length === 0) {
      return currNode.progress !== undefined ? currNode.progress : 0;
    }

    const sum = subChildren.reduce((acc, child) => acc + getProgress(child.id), 0);
    return Math.round(sum / subChildren.length);
  };

  const totalSum = children.reduce((acc, child) => acc + getProgress(child.id), 0);
  return Math.round(totalSum / children.length);
}

// Function to recursively synchronize completion state of all nodes (bottom-up propagation)
export function syncCompletion(nodesList: TaskNode[]): TaskNode[] {
  let changed = true;
  let current = [...nodesList];
  let iterations = 0;

  while (changed && iterations < 8) {
    changed = false;
    current = current.map(node => {
      // Find direct children
      const children = current.filter(n => n.parentId === node.id && !n.isWorkflowRectangle);
      let nextNode = { ...node };
      let nodeChanged = false;

      if (children.length > 0) {
        // A node/container is marked completed if and only if all its sub-elements/children are completed
        const allCompleted = children.every(c => c.completed);
        if (nextNode.completed !== allCompleted) {
          nextNode.completed = allCompleted;
          nodeChanged = true;
        }

        // If a task has subtasks with date and time, set the latest date and time for it
        const subtasksWithDates = children.filter(c => c.dueDate && !c.archived);
        if (subtasksWithDates.length > 0) {
          let latestSub = subtasksWithDates[0];
          for (let i = 1; i < subtasksWithDates.length; i++) {
            const curr = subtasksWithDates[i];
            const latestStr = `${latestSub.dueDate}T${latestSub.dueTime || '00:00'}`;
            const currStr = `${curr.dueDate}T${curr.dueTime || '00:00'}`;
            if (currStr > latestStr) {
              latestSub = curr;
            }
          }

          if (nextNode.dueDate !== latestSub.dueDate) {
            nextNode.dueDate = latestSub.dueDate;
            nodeChanged = true;
          }
          if (nextNode.dueTime !== latestSub.dueTime) {
            nextNode.dueTime = latestSub.dueTime;
            nodeChanged = true;
          }
        }
      }

      if (nodeChanged) {
        changed = true;
        return nextNode;
      }
      return node;
    });
    iterations++;
  }
  return current;
}

// Function to toggle a node and recursively match all of its subtask descendants
export function toggleNodeAndDescendants(nodeId: string, completed: boolean, allNodes: TaskNode[]): TaskNode[] {
  const descendants = getDescendants(nodeId, allNodes);
  const idsToToggle = [nodeId, ...descendants.map(d => d.id)];
  
  return allNodes.map(n => {
    if (idsToToggle.includes(n.id)) {
      return { ...n, completed: completed };
    }
    return n;
  });
}

// Function to toggle a node's archived state and recursively match all of its subtask descendants
export function toggleNodeArchive(nodeId: string, archived: boolean, allNodes: TaskNode[]): TaskNode[] {
  const descendants = getDescendants(nodeId, allNodes);
  const idsToToggle = [nodeId, ...descendants.map(d => d.id)];
  
  return allNodes.map(n => {
    if (idsToToggle.includes(n.id)) {
      return { ...n, archived: archived };
    }
    return n;
  });
}

// Function to synthesize a dual-tone pleasant crystal chime for reminder notifications
export function playNotificationChime(): void {
  try {
    // Vibrate the phone if supported (highly noticeable on Android!)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 250, 100, 300, 150, 400]);
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Create dual-tone bell play wrapper
    const playChimeTone = (time: number, freq: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      // Quick exponential volume profile to mimic a real bell strike
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(volume, time + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    };
    
    const now = ctx.currentTime;
    // Harmony of bells playing an atmospheric crystal arpeggio - lasts ~5.5s
    // Step 1: initial soft strike
    playChimeTone(now, 523.25, 2.0, 0.15); // C5
    playChimeTone(now + 0.1, 659.25, 2.0, 0.12); // E5
    playChimeTone(now + 0.2, 783.99, 2.2, 0.15); // G5
    playChimeTone(now + 0.3, 1046.50, 2.5, 0.18); // C6
    
    // Step 2: repeat harmony for a prolonged ring after 1.2 seconds
    playChimeTone(now + 1.2, 587.33, 2.0, 0.15); // D5
    playChimeTone(now + 1.3, 739.99, 2.0, 0.12); // F#5
    playChimeTone(now + 1.4, 880.00, 2.2, 0.15); // A5
    playChimeTone(now + 1.5, 1174.66, 2.5, 0.18); // D6
    
    // Step 3: third final resolution after 2.4 seconds to make the alert lasting and obvious
    playChimeTone(now + 2.4, 659.25, 2.5, 0.12); // E5
    playChimeTone(now + 2.5, 783.99, 2.5, 0.15); // G5
    playChimeTone(now + 2.6, 1046.50, 3.0, 0.18); // C6
    playChimeTone(now + 2.7, 1318.51, 3.2, 0.15); // E6
  } catch (error) {
    console.warn("Chime playback was blocked or failed:", error);
  }
}

// Tree helper: verify if candidate parent contains child, avoiding cyclical mapping bugs
export function isDescendantOrSelf(candidateParentId: string, nodeId: string, allNodes: TaskNode[]): boolean {
  if (candidateParentId === nodeId) return true;
  let currentId: string | null = candidateParentId;
  while (currentId !== null) {
    const current = allNodes.find(n => n.id === currentId);
    if (!current) break;
    if (current.parentId === nodeId) return true;
    currentId = current.parentId;
    if (currentId === candidateParentId) break; // cycle protection
  }
  return false;
}

// Calculates Pomodoro total time and sessions count for any node.
// If the node is a container, it dynamically sums up the statistics from all tasks inside the container.
export function getPomoStatsForNode(node: TaskNode, allNodes: TaskNode[]) {
  if (node.isContainer) {
    let totalTime = 0;
    let totalSessions = 0;
    for (const n of allNodes) {
      if (n.id !== node.id && !n.isContainer && !n.isWorkflowRectangle && isDescendantOrSelf(n.id, node.id, allNodes)) {
        totalTime += n.pomodoroTotalTime || 0;
        totalSessions += n.pomodoroSessionsCount || 0;
      }
    }
    return {
      pomodoroTotalTime: totalTime,
      pomodoroSessionsCount: totalSessions,
      isSummed: true
    };
  }
  return {
    pomodoroTotalTime: node.pomodoroTotalTime || 0,
    pomodoroSessionsCount: node.pomodoroSessionsCount || 0,
    isSummed: false
  };
}

// Formats total seconds spent on Pomodoro sessions into human readable string.
export function formatTotalPomoTime(totalSeconds: number): string {
  if (!totalSeconds) return '0 сек';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  const parts = [];
  if (hrs > 0) parts.push(`${hrs} ч`);
  if (mins > 0) parts.push(`${mins} мин`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} сек`);
  return parts.join(' ');
}

// Transparent Google API Proxy fetch helper to route request securely via dev/prod server
export async function proxiedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = '';
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = (input as Request).url;
  }

  if (url && url.includes('googleapis.com')) {
    const proxyUrl = '/api/google-proxy';
    const finalHeaders = new Headers();

    // Port over headers
    if (init && init.headers) {
      const initHeaders = new Headers(init.headers);
      initHeaders.forEach((value, key) => {
        finalHeaders.set(key, value);
      });
    } else if (input && typeof input === 'object' && 'headers' in input) {
      const inputHeaders = (input as Request).headers;
      if (inputHeaders && typeof inputHeaders.forEach === 'function') {
        inputHeaders.forEach((value, key) => {
          finalHeaders.set(key, value);
        });
      }
    }

    finalHeaders.set('x-target-url', url);

    let body = init?.body;
    if (!body && input && typeof input === 'object' && 'body' in input) {
      try {
        body = await (input as Request).clone().text();
      } catch (err) {
        console.warn('Failed to clone request body for proxying', err);
      }
    }

    const proxyInit: RequestInit = {
      method: init?.method || (input && typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET'),
      headers: finalHeaders,
      body: body,
      credentials: init?.credentials,
      mode: 'cors',
      cache: init?.cache,
      redirect: init?.redirect,
      referrer: init?.referrer,
    };

    try {
      const response = await window.fetch(proxyUrl, proxyInit);
      if (response.status === 404 || response.status === 502 || response.status === 504) {
        console.warn(`Proxy request to ${proxyUrl} returned status ${response.status}. Falling back to direct client-side fetch to: ${url}`);
        return await window.fetch(input, init);
      }
      return response;
    } catch (err) {
      console.warn('Proxy fetch threw an error, falling back directly to Google API:', err);
      return await window.fetch(input, init);
    }
  }

  return window.fetch(input, init);
}

// Helper to check if a task is overdue (not completed, has dueDate and date or time is in the past)
// Also checks if any subtask is overdue when allNodes is provided.
export function isNodeOverdue(node: TaskNode, allNodes?: TaskNode[]): boolean {
  if (node.isContainer || node.completed || node.archived || node.isWorkflowRectangle) return false;

  const checkSingleOverdue = (targetNode: TaskNode): boolean => {
    if (!targetNode.dueDate) return false;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    if (targetNode.dueDate < currentDateStr) {
      return true;
    }
    if (targetNode.dueDate === currentDateStr && targetNode.dueTime) {
      return targetNode.dueTime < currentTimeStr;
    }

    return false;
  };

  // If the node itself is overdue
  if (checkSingleOverdue(node)) {
    return true;
  }

  // If any subtask (descendant in mind map tree) is overdue
  if (allNodes && allNodes.length > 0) {
    const descendants = getDescendants(node.id, allNodes);
    return descendants.some(desc => !desc.isContainer && !desc.isWorkflowRectangle && !desc.completed && !desc.archived && checkSingleOverdue(desc));
  }

  return false;
}

// Helper to check if a container contains any overdue task
export function isContainerOverdue(containerNode: TaskNode, allNodes: TaskNode[]): boolean {
  if (!containerNode.isContainer) return false;
  return allNodes.some(n => 
    !n.isContainer && 
    !n.isWorkflowRectangle &&
    !n.completed &&
    !n.archived &&
    isDescendantOrSelf(n.id, containerNode.id, allNodes) && 
    n.id !== containerNode.id &&
    isNodeOverdue(n)
  );
}





