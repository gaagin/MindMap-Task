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
    if (!state.folders) state.folders = [];
    if (!state.projects) state.projects = [];
    if (!state.nodes) state.nodes = {};

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
  const descendants = getDescendants(nodeId, allNodes);
  if (descendants.length === 0) return null;
  const completedCount = descendants.filter(d => d.completed).length;
  return Math.round((completedCount / descendants.length) * 100);
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
      const children = current.filter(n => n.parentId === node.id);
      if (children.length > 0) {
        // A node/container is marked completed if and only if all its sub-elements/children are completed
        const allCompleted = children.every(c => c.completed);
        if (node.completed !== allCompleted) {
          changed = true;
          return { ...node, completed: allCompleted };
        }
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
    // Harmonious pair: D5 (587.33Hz) strike followed by high A5 (880.00Hz) strike
    playChimeTone(now, 587.33, 1.2, 0.15);
    playChimeTone(now + 0.12, 880.00, 1.4, 0.12);
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
      if (n.id !== node.id && !n.isContainer && isDescendantOrSelf(n.id, node.id, allNodes)) {
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




