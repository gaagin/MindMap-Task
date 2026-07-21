import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, 
  Layers,
  Search,
  Undo2,
  ListTodo,
  FileText,
  Trash2,
  Trash,
  SlidersHorizontal,
  X,
  Kanban,
  Network,
  Smartphone,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Star,
  Cloud,
  Database,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  Calendar,
  GanttChart,
  Table,
  Bell,
  BellRing,
  Upload,
  Download,
  Info,
  FileSpreadsheet,
  Eye,
  Check,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Clock,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Shield,
  Plus,
  Copy,
  FolderPlus,
  Grid
} from 'lucide-react';
import { WorkspaceState, TaskNode, Folder, Project, Priority, TagCategory, SyncReport } from './types';
import { loadWorkspace, saveWorkspace, generateId, syncCompletion, toggleNodeAndDescendants, toggleNodeArchive, playNotificationChime, pruneWorkspaceTaskHistories, runAutomatedBackup, suggestEstimatedTime } from './utils';
import Sidebar from './components/Sidebar';
import MindMapCanvas from './components/MindMapCanvas';
import TaskDetailsPanel from './components/TaskDetailsPanel';
import KanbanView from './components/KanbanView';
import MobileListView from './components/MobileListView';
import CalendarView from './components/CalendarView';
import GanttView from './components/GanttView';
import TableView from './components/TableView';
import EisenhowerMatrixView from './components/EisenhowerMatrixView';
import AnyDoView from './components/AnyDoView';
import GeminiAiConsole from './components/GeminiAiConsole';

// Import Google Sheets & Firebase Auth systems
import { 
  initAuth, 
  googleSignIn, 
  logout,
  setAccessToken,
  db,
  signInGuest
} from './lib/firebase';
import { 
  saveToFirebaseDirectly, 
  loadFromFirebaseDirectly, 
  syncWithGoogleSheets, 
  logDeletion,
  mergeWorkspaceStates
} from './lib/syncService';

import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';

/**
 * Automatically computes precisely what entities were changed and stamps them with updatedAt.
 */
function enrichStateWithTimestamps(prev: WorkspaceState, next: WorkspaceState): WorkspaceState {
  const now = new Date().toISOString();

  // 1. Folders
  const enrichedFolders = next.folders.map(nf => {
    const pf = prev.folders.find(f => f.id === nf.id);
    if (!pf || pf.name !== nf.name || pf.parentId !== nf.parentId) {
      return { ...nf, updatedAt: now };
    }
    return nf;
  });

  // Projects
  const enrichedProjects = next.projects.map(np => {
    const pp = prev.projects.find(p => p.id === np.id);
    if (!pp || pp.name !== np.name || pp.folderId !== np.folderId || JSON.stringify(pp.tagCategories) !== JSON.stringify(np.tagCategories)) {
      return { ...np, updatedAt: now };
    }
    return np;
  });

  // 3. Nodes
  const enrichedNodes: Record<string, TaskNode[]> = {};
  for (const pid of Object.keys(next.nodes)) {
    const nextArr = next.nodes[pid] || [];
    const prevArr = prev.nodes[pid] || [];
    enrichedNodes[pid] = nextArr.map(nn => {
      const pn = prevArr.find(n => n.id === nn.id) || 
                 Object.values(prev.nodes).flat().find(n => n.id === nn.id);
      
      if (!pn) {
        return { ...nn, updatedAt: now };
      }
      
      const changed = 
        pn.text !== nn.text ||
        pn.x !== nn.x ||
        pn.y !== nn.y ||
        pn.parentId !== nn.parentId ||
        pn.priority !== nn.priority ||
        pn.completed !== nn.completed ||
        pn.notes !== nn.notes ||
        pn.color !== nn.color ||
        pn.collapsed !== nn.collapsed ||
        pn.isCardCollapsed !== nn.isCardCollapsed ||
        pn.dueDate !== nn.dueDate ||
        pn.dueTime !== nn.dueTime ||
        pn.startDate !== nn.startDate ||
        pn.startTime !== nn.startTime ||
        pn.reminderDate !== nn.reminderDate ||
        pn.reminderTime !== nn.reminderTime ||
        pn.reminderMinutesBefore !== nn.reminderMinutesBefore ||
        pn.reminderDismissed !== nn.reminderDismissed ||
        pn.pomodoroTotalTime !== nn.pomodoroTotalTime ||
        pn.pomodoroSessionsCount !== nn.pomodoroSessionsCount ||
        pn.archived !== nn.archived ||
        pn.isNotTask !== nn.isNotTask ||
        pn.defaultView !== nn.defaultView ||
        pn.externalLink !== nn.externalLink ||
        pn.progress !== nn.progress ||
        pn.isFloating !== nn.isFloating ||
        pn.isContainer !== nn.isContainer ||
        pn.isWorkflowRectangle !== nn.isWorkflowRectangle ||
        pn.workflowShape !== nn.workflowShape ||
        pn.isZoneTriggerDisabled !== nn.isZoneTriggerDisabled ||
        pn.width !== nn.width ||
        pn.height !== nn.height ||
        JSON.stringify(pn.files) !== JSON.stringify(nn.files) ||
        JSON.stringify(pn.tags) !== JSON.stringify(nn.tags) ||
        JSON.stringify(pn.history) !== JSON.stringify(nn.history) ||
        JSON.stringify(pn.tagCategories) !== JSON.stringify(nn.tagCategories) ||
        JSON.stringify(pn.workflowConnections) !== JSON.stringify(nn.workflowConnections) ||
        JSON.stringify(pn.savedFilters) !== JSON.stringify(nn.savedFilters);

      if (changed) {
        return { ...nn, updatedAt: now };
      }
      return nn;
    });
  }

  // 4. TagCategories
  const enrichedTagCats = (next.tagCategories || []).map(nc => {
    const pc = (prev.tagCategories || []).find(c => c.id === nc.id);
    if (!pc || pc.name !== nc.name || pc.color !== nc.color || JSON.stringify(pc.tags) !== JSON.stringify(nc.tags)) {
      return { ...nc, updatedAt: now };
    }
    return nc;
  });

  return {
    ...next,
    folders: enrichedFolders,
    projects: enrichedProjects,
    nodes: enrichedNodes,
    tagCategories: enrichedTagCats
  };
}


// Persistent set of legacy/existing category IDs loaded from the initial workspace state.
// This allows us to recognize and restrict existing tags/categories to only the ADIB map.
let legacyCategoryIds: Set<string> | null = null;

/**
 * Keeps global WorkspaceState and all active projects fully in sync regarding tagCategories,
 * but separates them per map/project. Existing tags and categories remain on the ADIB map only.
 */
function normalizeWorkspaceState(wsState: WorkspaceState): WorkspaceState {
  if (!wsState || typeof wsState !== 'object') {
    return wsState;
  }

  try {
    const folders = Array.isArray(wsState.folders) ? wsState.folders.filter(Boolean) : [];
    const projects = Array.isArray(wsState.projects) ? wsState.projects.filter(p => p && typeof p === 'object') : [];
    const nodes = wsState.nodes && typeof wsState.nodes === 'object' ? wsState.nodes : {};
    const deletions = Array.isArray(wsState.deletions) ? wsState.deletions : [];

    const isDeleted = (type: string, id: string) => {
      return deletions.some(d => d.type === type && d.id === id);
    };

    // Gather all existing tag categories from both the root list and all projects' lists
    const rootCats = Array.isArray(wsState.tagCategories) ? wsState.tagCategories : [];
    const projectCats = projects.flatMap(p => p && Array.isArray(p.tagCategories) ? p.tagCategories : []);
    const allCats = [...rootCats, ...projectCats].filter(cat => cat && cat.id && !isDeleted('tagCategory', cat.id));

    // Initialize legacy categories Set on first load
    if (!legacyCategoryIds) {
      legacyCategoryIds = new Set(rootCats.map(c => c.id));
    }

    // Deduplicate and resolve conflicts using the updatedAt timestamp of each category
    const latestCategoriesMap = new Map<string, TagCategory>();
    allCats.forEach(cat => {
      const existing = latestCategoriesMap.get(cat.id);
      if (!existing) {
        latestCategoriesMap.set(cat.id, cat);
      } else {
        const existingTime = new Date(existing.updatedAt || 0).getTime();
        const incomingTime = new Date(cat.updatedAt || 0).getTime();
        if (incomingTime > existingTime) {
          latestCategoriesMap.set(cat.id, cat);
        }
      }
    });

    const finalRootCats = Array.from(latestCategoriesMap.values());

    // Sync projects by isolating their tag categories:
    // 1. Projects with "ADIB" in their name keep/merge all legacy categories
    // 2. Other projects filter out legacy categories and keep only their project-specific ones
    const updatedProjects = projects.map(p => {
      if (!p) return p;
      const isAdib = p.name && (p.name.toUpperCase().includes('ADIB') || p.name.toUpperCase() === 'ADIB');
      
      const pCats = Array.isArray(p.tagCategories) ? p.tagCategories : [];
      
      if (isAdib) {
        // ADIB project keeps legacy categories + any other categories explicitly in its list
        const map = new Map<string, TagCategory>();
        finalRootCats.filter(c => legacyCategoryIds?.has(c.id)).forEach(c => map.set(c.id, c));
        pCats.forEach(c => map.set(c.id, c));
        
        return {
          ...p,
          tagCategories: Array.from(map.values()).filter(c => c && c.id && !isDeleted('tagCategory', c.id))
        };
      } else {
        // Other projects filter out legacy categories to start completely clean and separate
        const projectSpecificCats = pCats.filter(c => c && c.id && !legacyCategoryIds?.has(c.id) && !isDeleted('tagCategory', c.id));
        return {
          ...p,
          tagCategories: projectSpecificCats
        };
      }
    });

    // Gather all active categories from all updated projects for the root state representation
    const finalAllCats = updatedProjects.flatMap(p => p.tagCategories || []);
    const finalDeduplicatedRootCatsMap = new Map<string, TagCategory>();
    finalAllCats.forEach(c => finalDeduplicatedRootCatsMap.set(c.id, c));
    const finalNormalizedRootCats = Array.from(finalDeduplicatedRootCatsMap.values());

    // Normalize all nodes to fix any NaN values
    const normalizedNodes: Record<string, TaskNode[]> = {};
    Object.entries(nodes).forEach(([pid, nodeList]) => {
      if (Array.isArray(nodeList)) {
        normalizedNodes[pid] = nodeList.map(n => {
          let estTime = n.estimatedTime;
          if (estTime !== undefined && estTime !== null) {
            if (typeof estTime === 'string') {
              const parsed = parseFloat(estTime);
              estTime = isNaN(parsed) ? undefined : parsed;
            } else if (typeof estTime === 'number') {
              estTime = isNaN(estTime) ? undefined : estTime;
            } else {
              estTime = undefined;
            }
          } else {
            estTime = undefined;
          }

          return {
            ...n,
            text: n.text || '',
            x: Number(n.x) || 0,
            y: Number(n.y) || 0,
            estimatedTime: estTime,
            completed: !!n.completed,
            archived: !!n.archived,
            isNotTask: !!n.isNotTask,
            parentId: n.parentId || null
          };
        });
      } else {
        normalizedNodes[pid] = [];
      }
    });

    return {
      ...wsState,
      folders,
      projects: updatedProjects,
      nodes: normalizedNodes,
      tagCategories: finalNormalizedRootCats,
      deletions
    };
  } catch (err) {
    console.error('Failed to normalize workspace state, returning loaded state unmodified:', err);
    return wsState;
  }
}

function getSyncHash(wsState: WorkspaceState | null | undefined): string {
  if (!wsState) return '';
  
  // 1. Serialize folders deterministically
  const folders = (wsState.folders || [])
    .map(f => ({ 
      id: f.id, 
      name: f.name || '', 
      parentId: f.parentId || null 
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 2. Serialize projects deterministically
  const projects = (wsState.projects || [])
    .map(p => ({ 
      id: p.id, 
      name: p.name || '', 
      folderId: p.folderId || null 
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 3. Serialize nodes deterministically
  const sortedProjectIds = Object.keys(wsState.nodes || {}).sort();
  const nodes: any[] = [];
  for (const pid of sortedProjectIds) {
    const projectNodes = (wsState.nodes[pid] || [])
      .map(n => ({
        id: n.id,
        projectId: n.projectId,
        text: n.text || '',
        x: Math.round(Number(n.x) || 0),
        y: Math.round(Number(n.y) || 0),
        parentId: n.parentId || null,
        priority: n.priority || 'none',
        tags: [...(n.tags || [])].sort(),
        notes: n.notes || '',
        completed: !!n.completed,
        color: n.color || '',
        collapsed: !!n.collapsed,
        dueDate: n.dueDate || null,
        dueTime: n.dueTime || null,
        startDate: n.startDate || null,
        startTime: n.startTime || null,
        reminderDate: n.reminderDate || null,
        reminderTime: n.reminderTime || null,
        reminderMinutesBefore: n.reminderMinutesBefore !== undefined ? n.reminderMinutesBefore : null,
        reminderDismissed: !!n.reminderDismissed,
        pomodoroTotalTime: n.pomodoroTotalTime !== undefined ? n.pomodoroTotalTime : null,
        pomodoroSessionsCount: n.pomodoroSessionsCount !== undefined ? n.pomodoroSessionsCount : null,
        estimatedTime: n.estimatedTime !== undefined && n.estimatedTime !== null && !isNaN(n.estimatedTime) ? n.estimatedTime : null,
        archived: !!n.archived,
        isNotTask: !!n.isNotTask,
        defaultView: n.defaultView || null,
        externalLink: n.externalLink || '',
        isCardCollapsed: !!n.isCardCollapsed,
        progress: n.progress !== undefined ? Math.round(Number(n.progress) || 0) : null,
        isFloating: !!n.isFloating,
        isContainer: !!n.isContainer,
        isWorkflowRectangle: !!n.isWorkflowRectangle,
        workflowShape: n.workflowShape || 'rectangle',
        isZoneTriggerDisabled: !!n.isZoneTriggerDisabled,
        width: n.width !== undefined ? Math.round(Number(n.width) || 0) : null,
        height: n.height !== undefined ? Math.round(Number(n.height) || 0) : null,
        history: (n.history || []).map(h => ({ id: h.id, text: h.text, notes: h.notes, timestamp: h.timestamp })),
        tagCategories: (n.tagCategories || []).map(t => ({ id: t.id, name: t.name, color: t.color, tags: [...(t.tags || [])].sort() })),
        files: (n.files || []).map(f => ({ id: f.id, name: f.name, type: f.type, size: f.size, dataUrl: f.dataUrl })),
        savedFilters: n.savedFilters ? {
          filterStatus: n.savedFilters.filterStatus || null,
          filterPriority: n.savedFilters.filterPriority || null,
          filterTag: n.savedFilters.filterTag || null,
          filterDueDate: n.savedFilters.filterDueDate || null,
          filterAttachments: n.savedFilters.filterAttachments || null,
          filterNotes: n.savedFilters.filterNotes || null,
          filterCategoryId: n.savedFilters.filterCategoryId || null,
          kanbanGroupBy: n.savedFilters.kanbanGroupBy || null,
          kanbanContainerFilterId: n.savedFilters.kanbanContainerFilterId || null,
        } : null,
        workflowConnections: (n.workflowConnections || [])
          .map(wc => ({
            id: wc.id,
            toNodeId: wc.toNodeId,
            fromSide: wc.fromSide,
            toSide: wc.toSide,
            text: wc.text || '',
            bendOffsetX: wc.bendOffsetX !== undefined ? wc.bendOffsetX : null,
            bendOffsetY: wc.bendOffsetY !== undefined ? wc.bendOffsetY : null
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    nodes.push({ projectId: pid, list: projectNodes });
  }

  // 4. Serialize tag categories deterministically
  const tagCategories = (wsState.tagCategories || [])
    .map(t => ({
      id: t.id,
      name: t.name || '',
      color: t.color || '',
      tags: [...(t.tags || [])].sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 5. Serialize deletions deterministically to prevent cross-device races
  const deletions = (wsState.deletions || [])
    .map(d => ({
      type: d.type || '',
      id: d.id || '',
      deletedAt: d.deletedAt || ''
    }))
    .sort((a, b) => {
      const cmpType = a.type.localeCompare(b.type);
      if (cmpType !== 0) return cmpType;
      return a.id.localeCompare(b.id);
    });

  return JSON.stringify({
    folders,
    projects,
    nodes,
    activeProjectId: wsState.activeProjectId || null,
    tagCategories,
    googleSheetsFileId: wsState.googleSheetsFileId || null,
    taskSheetsSpreadsheetId: wsState.taskSheetsSpreadsheetId || null,
    deletions,
    globalSettings: wsState.globalSettings || null
  });
}

/**
 * Recursively performs a robust deep semantic comparison between two WorkspaceState objects
 * to prevent unnecessary triggers and infinite synchronization loops caused by Firestore sanitization key deletion,
 * field omissions, or dynamic key ordering variations.
 */
function isStateSemanticallyEqual(a: any, b: any): boolean {
  if (a === b) return true;
  try {
    return getSyncHash(a) === getSyncHash(b);
  } catch {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

export default function App() {
  // Load initial state
  const [state, setRawState] = useState<WorkspaceState>(() => normalizeWorkspaceState(loadWorkspace()));
  const isFirstRender = React.useRef(true);
  const ignoreNextStateChangeRef = React.useRef(false);
  const hasCheckedUrlParamRef = React.useRef(false);
  const lastStateRef = React.useRef<WorkspaceState | null>(null);
  const isFirstSnapshotRef = React.useRef(true);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);

  // 4-second safety timeout for offline boot
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialSyncComplete(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Intercept all state changes, update modification timestamps automatically, ensuring symmetrical sync compatibility
  const setState = (updater: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState)) => {
    setRawState(prev => {
      const nextTyped = typeof updater === 'function' ? updater(prev) : updater;
      const next = {
        ...nextTyped,
        tagCategories: nextTyped.projects.flatMap(p => p.tagCategories || [])
      };
      const enriched = enrichStateWithTimestamps(prev, next);
      return normalizeWorkspaceState(enriched);
    });
  };

  // Google Authentication & Symmetrical Sync statuses
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [hasCheckedInitialAuth, setHasCheckedInitialAuth] = useState(false);
  const [isAutoLoginPopupBlocked, setIsAutoLoginPopupBlocked] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const isSyncingSheetsRef = useRef(false);
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const [syncModalTab, setSyncModalTab] = useState<'sheets' | 'backups'>('sheets');
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [backupRestoreSuccess, setBackupRestoreSuccess] = useState<string | null>(null);
  const [backupRestoreConfirmId, setBackupRestoreConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (isSyncMenuOpen || syncModalTab === 'backups') {
      try {
        const raw = localStorage.getItem('milli_workspace_backups');
        if (raw) {
          const parsed = JSON.parse(raw) || [];
          parsed.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setBackupsList(parsed);
        } else {
          setBackupsList([]);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [isSyncMenuOpen, syncModalTab]);

  const handleRestoreBackup = async (backup: any) => {
    try {
      const restoredState = JSON.parse(JSON.stringify(backup.state));
      const normalized = normalizeWorkspaceState(restoredState);
      
      ignoreNextStateChangeRef.current = true;
      lastSyncedStateHashRef.current = getSyncHash(normalized);
      setUnsyncedEditsCount(0);
      setRawState(normalized);
      saveWorkspace(normalized);

      setBackupRestoreSuccess(`Данные успешно восстановлены на состояние от ${new Date(backup.timestamp).toLocaleString('ru-RU')}!`);
      setBackupRestoreConfirmId(null);

      if (currentUser) {
        setSyncStatus(prev => ({ ...prev, firebase: 'syncing' }));
        const res = await saveToFirebaseDirectly(currentUser.uid, normalized, sessionStartTimeRef.current);
        if (res.success) {
          setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        } else {
          setSyncStatus(prev => ({ ...prev, firebase: 'error' }));
          console.error('[Restore Backup] Failed to upload restored state to Firebase:', res.error);
        }
      }
    } catch (e) {
      console.error('Failed to restore backup:', e);
    }
  };

  const handleCreateManualBackup = () => {
    try {
      const backupsKey = 'milli_workspace_backups';
      const rawBackups = localStorage.getItem(backupsKey);
      let backups = [];
      if (rawBackups) {
        backups = JSON.parse(rawBackups) || [];
      }
      
      const newId = `manual_${Date.now()}`;
      const newBackup = {
        id: newId,
        timestamp: new Date().toISOString(),
        state: JSON.parse(JSON.stringify(state))
      };
      
      backups.unshift(newBackup);
      
      // Prune list to 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      backups = backups.filter((b: any) => {
        try {
          return new Date(b.timestamp).getTime() > thirtyDaysAgo;
        } catch {
          return true;
        }
      });
      
      localStorage.setItem(backupsKey, JSON.stringify(backups));
      setBackupsList(backups);
      setBackupRestoreSuccess("Точка восстановления успешно создана вручную!");
    } catch (e) {
      console.error('Failed to create manual backup:', e);
    }
  };
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileViewDropdownOpen, setIsMobileViewDropdownOpen] = useState(false);
  const [syncOnExit, setSyncOnExit] = useState<boolean>(() => {
    const saved = localStorage.getItem('milli_sync_on_exit');
    return saved !== null ? saved === 'true' : true;
  });
  const [forceCloudSyncLoading, setForceCloudSyncLoading] = useState<'upload' | 'download' | null>(null);
  const [forceCloudSyncFeedback, setForceCloudSyncFeedback] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    local: 'saved' | 'saving' | 'error';
    firebase: 'idle' | 'saved' | 'syncing' | 'error';
    sheets: 'idle' | 'synced' | 'syncing' | 'error';
    lastSyncedTime?: string;
  }>({
    local: 'saved',
    firebase: 'idle',
    sheets: 'idle'
  });

  // Real-time Cloud Conflict resolution & alerts based on user requests
  const [hasCloudUpdates, setHasCloudUpdates] = useState(false);
  const [cloudUpdateState, setCloudUpdateState] = useState<WorkspaceState | null>(null);

  const handleApplyCloudState = () => {
    if (!cloudUpdateState) return;
    ignoreNextStateChangeRef.current = true;
    const normalized = normalizeWorkspaceState(cloudUpdateState);
    lastSyncedStateHashRef.current = getSyncHash(normalized);
    setRawState(normalized);
    setUnsyncedEditsCount(0);
    setHasCloudUpdates(false);
    setCloudUpdateState(null);
    setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
  };

  const [unsyncedEditsCount, setUnsyncedEditsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('unsynced_edits_count');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    localStorage.setItem('unsynced_edits_count', String(unsyncedEditsCount));
  }, [unsyncedEditsCount]);

  const lastSyncedStateHashRef = React.useRef<string>('');

  useEffect(() => {
    if (state && !lastSyncedStateHashRef.current) {
      lastSyncedStateHashRef.current = getSyncHash(state);
    }
  }, []);

  const [syncReport, setSyncReport] = useState<SyncReport | null>(() => {
    try {
      const saved = localStorage.getItem('milli_last_sync_report');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  // Sidebar visibility state, persisted to prevent unexpected collapses
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_sidebar_open');
      if (saved !== null) return saved === 'true';
    } catch (e) {
      console.error('Failed to parse sidebar open state:', e);
    }
    // Default open on desktop, closed on mobile/tablet
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  });

  useEffect(() => {
    localStorage.setItem('task_mindmap_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);


  
  // Synchronized global state for active Pomodoro session
  const [globalPomo, setGlobalPomo] = useState<{
    nodeId: string;
    nodeText: string;
    isRunning: boolean;
    isPaused: boolean;
    isBreak: boolean;
    duration: number;
    endTime: number | null;
    timeLeft: number;
  } | null>(null);

  const currentUserRef = React.useRef(currentUser);
  currentUserRef.current = currentUser;

  const stateRef = React.useRef(state);
  stateRef.current = state;

  const sessionStartTimeRef = React.useRef(new Date().toISOString());

  useEffect(() => {
    const checkPomo = () => {
      try {
        const saved = localStorage.getItem('task_mindmap_pomodoro');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.isRunning) {
            let remaining = parsed.timeLeft;
            if (parsed.endTime && !parsed.isPaused) {
              const now = Date.now();
              remaining = Math.max(0, Math.round((parsed.endTime - now) / 1000));
              parsed.timeLeft = remaining;
            }

            // Check if timer finished (remaining <= 0)
            if (parsed.endTime && !parsed.isPaused && remaining <= 0) {
              playNotificationChime();

              let customMins = 25;
              try {
                const savedCustom = localStorage.getItem('task_mindmap_pomo_custom_minutes');
                if (savedCustom) customMins = parseInt(savedCustom, 10);
              } catch (err) {}

              const nextPomoState = {
                ...parsed,
                isRunning: false,
                isBreak: false,
                duration: customMins * 60,
                endTime: null,
                timeLeft: customMins * 60
              };

              // 1. First save the next pomodoro state synchronously to localStorage
              localStorage.setItem('task_mindmap_pomodoro', JSON.stringify(nextPomoState));
              setGlobalPomo(nextPomoState);

              // 2. Compute the next workspace state with the node's updated pomodoro statistics
              let updatedWorkspaceState: WorkspaceState | null = null;
              if (parsed.nodeId) {
                const nodeId = parsed.nodeId;
                const durationSaved = parsed.duration;
                const prev = stateRef.current;

                let foundProjectId: string | null = null;
                let targetNode: TaskNode | undefined = undefined;

                for (const [pid, nodeList] of Object.entries(prev.nodes)) {
                  const found = (nodeList as TaskNode[]).find(n => n.id === nodeId);
                  if (found) {
                    foundProjectId = pid;
                    targetNode = found;
                    break;
                  }
                }

                if (targetNode && foundProjectId) {
                  const minutesToSubtract = Math.round(durationSaved / 60);
                  const currentEst = targetNode.estimatedTime !== undefined && targetNode.estimatedTime !== null && !isNaN(targetNode.estimatedTime)
                    ? targetNode.estimatedTime
                    : 0;
                  const nextEst = targetNode.estimatedTime !== undefined && targetNode.estimatedTime !== null && !isNaN(targetNode.estimatedTime)
                    ? Math.max(0, parseFloat((currentEst - minutesToSubtract).toFixed(2)))
                    : undefined;

                  const updatedNode = {
                    ...targetNode,
                    pomodoroTotalTime: (targetNode.pomodoroTotalTime || 0) + durationSaved,
                    pomodoroSessionsCount: (targetNode.pomodoroSessionsCount || 0) + 1,
                    estimatedTime: nextEst,
                    updatedAt: new Date().toISOString()
                  };

                  const updatedList = prev.nodes[foundProjectId].map(n => n.id === nodeId ? updatedNode : n);
                  const syncedNodes = syncCompletion(updatedList);
                  
                  updatedWorkspaceState = {
                    ...prev,
                    nodes: {
                      ...prev.nodes,
                      [foundProjectId]: syncedNodes
                    }
                  };
                }
              }

              // 3. Apply state change locally
              if (updatedWorkspaceState) {
                // Synchronously save workspace to localStorage first to prevent data loss on immediate refresh
                saveWorkspace(updatedWorkspaceState);
                setState(updatedWorkspaceState);
              }

              // 4. Symmetrically sync to Firestore immediately
              const userObj = currentUserRef.current;
              if (userObj) {
                const finalStateToSave = updatedWorkspaceState || stateRef.current;
                
                // Set syncing status
                setSyncStatus(prev => ({ ...prev, firebase: 'syncing' }));
                
                // Save both updated workspace nodes and next idle pomodoro state in a single atomic snapshot write
                saveToFirebaseDirectly(userObj.uid, finalStateToSave, sessionStartTimeRef.current)
                  .then(res => {
                    if (res.success) {
                      lastSyncedStateHashRef.current = getSyncHash(finalStateToSave);
                      setUnsyncedEditsCount(0);
                      setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
                    } else {
                      setSyncStatus(prev => ({ ...prev, firebase: 'error' }));
                    }
                  })
                  .catch(err => {
                    console.error('[Firebase Pomo Sync] Failed to save updated workspace on complete:', err);
                    setSyncStatus(prev => ({ ...prev, firebase: 'error' }));
                  });
              }

              window.dispatchEvent(new Event('task_mindmap_pomo_update'));
              return;
            }

            setGlobalPomo(parsed);
            return;
          }
        }
        setGlobalPomo(null);
      } catch (e) {
        setGlobalPomo(null);
      }
    };

    checkPomo();
    const interval = setInterval(checkPomo, 1000);
    window.addEventListener('storage', checkPomo);
    window.addEventListener('task_mindmap_pomo_update', checkPomo);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkPomo);
      window.removeEventListener('task_mindmap_pomo_update', checkPomo);
    };
  }, []);

  const formatGlobalPomoTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Selected task node for detail panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsPanelTab, setDetailsPanelTab] = useState<'details' | 'chat'>('details');
  const [detailsPanelFullscreen, setDetailsPanelFullscreen] = useState(false);

  // Selected task nodes for multiple selection
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Copying nodes / projects state
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copySourceNodeIds, setCopySourceNodeIds] = useState<string[]>([]); // empty list indicates copying ALL nodes of current project
  const [copyTargetProjectId, setCopyTargetProjectId] = useState<string>('');

  // Sync isDrawerOpen when selectedNodeId becomes null
  useEffect(() => {
    if (selectedNodeId === null) {
      setIsDrawerOpen(false);
    }
  }, [selectedNodeId]);

  // Reset detailsPanelFullscreen when drawer is closed
  useEffect(() => {
    if (!isDrawerOpen) {
      setDetailsPanelFullscreen(false);
    }
  }, [isDrawerOpen]);

  // Sync selectedNodeId with browser URL search parameters for easy sharing and home screen shortcutting
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const currentTask = url.searchParams.get('task') || url.searchParams.get('t');
      if (selectedNodeId) {
        if (currentTask !== selectedNodeId) {
          url.searchParams.set('task', selectedNodeId);
          window.history.replaceState(null, '', url.toString());
        }
      } else {
        if (currentTask) {
          url.searchParams.delete('task');
          url.searchParams.delete('t');
          window.history.replaceState(null, '', url.toString());
        }
      }
    } catch (err) {
      console.error('Failed to update URL search parameters:', err);
    }
  }, [selectedNodeId]);

  // Global drag-selection states
  const [globalSelectionStart, setGlobalSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [globalSelectionEnd, setGlobalSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isGlobalDragSelecting, setIsGlobalDragSelecting] = useState(false);

  const handleGlobalMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If NOT Ctrl + Left click, check if we should clear multi-selection when clicking on empty space
    if (!(e.ctrlKey && e.button === 0)) {
      if (e.button === 0) {
        const target = e.target as HTMLElement;
        // Do not clear if clicking on form elements, interactive items, or actual task cards
        if (target.closest('button, input, textarea, select, a, [role="button"], [data-drag-ignore], .modal, .dropdown, [data-task-id], [data-node-id], [id^="kanban-card-"], [id^="mobile-task-card-"]')) {
          return;
        }
        // Deselect everything
        setSelectedNodeIds([]);
        setIsMultiSelectMode(false);
      }
      return;
    }

    // Do not start if clicking inside buttons, inputs, dropdowns, etc.
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"], [data-drag-ignore], .modal, .dropdown')) {
      return;
    }

    // Prevent default browser behaviors (like text selection or panning)
    e.preventDefault();

    // Reset current selection
    setSelectedNodeIds([]);
    setIsMultiSelectMode(false);

    // Record the starting point of the mouse click relative to the container
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setGlobalSelectionStart({ x, y });
    setGlobalSelectionEnd({ x, y });
    setIsGlobalDragSelecting(true);
  };

  const handleGlobalMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isGlobalDragSelecting || !globalSelectionStart) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setGlobalSelectionEnd({ x, y });

    // Calculate selection bounds in viewport coordinates
    // because we need to compare with element.getBoundingClientRect()
    const startViewportX = globalSelectionStart.x + rect.left;
    const startViewportY = globalSelectionStart.y + rect.top;
    const currentViewportX = e.clientX;
    const currentViewportY = e.clientY;

    const x1 = Math.min(startViewportX, currentViewportX);
    const y1 = Math.min(startViewportY, currentViewportY);
    const x2 = Math.max(startViewportX, currentViewportX);
    const y2 = Math.max(startViewportY, currentViewportY);

    // Only start selecting if drag box has a minimal size
    if (Math.abs(x1 - x2) > 4 || Math.abs(y1 - y2) > 4) {
      if (!isMultiSelectMode) {
        setIsMultiSelectMode(true);
      }

      // Query all elements representing tasks/nodes on screen
      const elements = document.querySelectorAll('[data-task-id], [data-node-id], [id^="kanban-card-"], [id^="mobile-task-card-"]');
      const selectedIds: string[] = [];

      elements.forEach(el => {
        const elRect = el.getBoundingClientRect();

        // Check intersection between element bounding rect and selection marquee bounds
        const intersects = !(
          elRect.right < x1 ||
          elRect.left > x2 ||
          elRect.bottom < y1 ||
          elRect.top > y2
        );

        if (intersects) {
          let nodeId = el.getAttribute('data-task-id') || el.getAttribute('data-node-id');
          if (!nodeId) {
            const idAttr = el.getAttribute('id');
            if (idAttr) {
              if (idAttr.startsWith('kanban-card-')) {
                nodeId = idAttr.replace('kanban-card-', '');
              } else if (idAttr.startsWith('mobile-task-card-')) {
                nodeId = idAttr.replace('mobile-task-card-', '');
              }
            }
          }
          if (nodeId && !selectedIds.includes(nodeId)) {
            selectedIds.push(nodeId);
          }
        }
      });

      setSelectedNodeIds(selectedIds);
    }
  };

  const handleKanbanSortByChange = (val: 'default' | 'priority' | 'dueDate') => {
    setState(prev => ({
      ...prev,
      globalSettings: {
        ...(prev.globalSettings || {}),
        kanbanSortBy: val,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleKanbanCollapseCompletedChange = (val: boolean) => {
    setState(prev => ({
      ...prev,
      globalSettings: {
        ...(prev.globalSettings || {}),
        kanbanCollapseCompleted: val,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleKanbanShowSubtasksChange = (val: boolean) => {
    setState(prev => ({
      ...prev,
      globalSettings: {
        ...(prev.globalSettings || {}),
        kanbanShowSubtasks: val,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleKanbanFiltersCollapsedChange = (val: boolean) => {
    setState(prev => ({
      ...prev,
      globalSettings: {
        ...(prev.globalSettings || {}),
        kanbanFiltersCollapsed: val,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleCategoriesExpandedChange = (val: boolean) => {
    setState(prev => ({
      ...prev,
      globalSettings: {
        ...(prev.globalSettings || {}),
        categoriesExpanded: val,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleGlobalMouseUp = () => {
    setIsGlobalDragSelecting(false);
    setGlobalSelectionStart(null);
    setGlobalSelectionEnd(null);
  };

  const handleSelectNode = (id: string | null, eOrIsMulti?: any, initialTab: 'details' | 'chat' = 'details') => {
    let isMulti = false;
    
    if (typeof eOrIsMulti === 'boolean') {
      isMulti = eOrIsMulti;
    } else if (eOrIsMulti) {
      isMulti = !!(eOrIsMulti.ctrlKey || eOrIsMulti.metaKey);
    }
    
    if (isMultiSelectMode && id !== null) {
      isMulti = true;
    }

    if (id === null) {
      if (!isMulti) {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setIsMultiSelectMode(false);
        setIsDrawerOpen(false);
      }
      return;
    }

    if (isMulti) {
      setIsMultiSelectMode(true);
      setSelectedNodeIds(prev => {
        let next = [...prev];
        if (selectedNodeId && !next.includes(selectedNodeId)) {
          next.push(selectedNodeId);
        }
        if (next.includes(id)) {
          next = next.filter(nid => nid !== id);
        } else {
          next.push(id);
        }
        if (next.length === 0) {
          setTimeout(() => setIsMultiSelectMode(false), 0);
        }
        return next;
      });
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(id);
      setDetailsPanelTab(initialTab);
      setIsDrawerOpen(true);
    }
  };

  const handleSelectCanvasNode = (id: string | null, eOrIsMulti?: any) => {
    let isMulti = false;
    
    if (typeof eOrIsMulti === 'boolean') {
      isMulti = eOrIsMulti;
    } else if (eOrIsMulti) {
      isMulti = !!(eOrIsMulti.ctrlKey || eOrIsMulti.metaKey);
    }
    
    if (isMultiSelectMode && id !== null) {
      isMulti = true;
    }

    if (id === null) {
      if (!isMulti) {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setIsMultiSelectMode(false);
        setIsDrawerOpen(false);
      }
      return;
    }

    if (isMulti) {
      setIsMultiSelectMode(true);
      setSelectedNodeIds(prev => {
        let next = [...prev];
        if (selectedNodeId && !next.includes(selectedNodeId)) {
          next.push(selectedNodeId);
        }
        if (next.includes(id)) {
          next = next.filter(nid => nid !== id);
        } else {
          next.push(id);
        }
        if (next.length === 0) {
          setTimeout(() => setIsMultiSelectMode(false), 0);
        }
        return next;
      });
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(id);
      if (viewMode === 'canvas' && searchQuery.trim() !== "") {
        const node = activeNodes.find(n => n.id === id);
        if (node && isNodeMatched(node)) {
          if (node.isContainer) {
            setFocusedContainerId(id);
            setFocusedTaskId(null);
          } else {
            setFocusedTaskId(id);
            setFocusedContainerId(null);
          }
        }
      }
    }
  };

  const handleSelectAndCenterNode = (id: string | null, eOrIsMulti?: any) => {
    if (!id) {
      handleSelectNode(null, eOrIsMulti);
      return;
    }
    
    // Find absolute coordinates of the target node and which project it belongs to
    let targetNode: TaskNode | undefined;
    let targetProjectId: string | undefined;
    
    for (const [projectId, nodeList] of Object.entries(state.nodes)) {
      const found = (nodeList as TaskNode[]).find(n => n.id === id);
      if (found) {
        targetNode = found;
        targetProjectId = projectId;
        break;
      }
    }

    if (targetProjectId && targetProjectId !== state.activeProjectId) {
      // Switch project
      setState(prev => ({
        ...prev,
        activeProjectId: targetProjectId!
      }));
    }

    handleSelectNode(id, eOrIsMulti);

    if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
      const targetZoom = 1.05;
      setPanX(-targetNode.x * targetZoom);
      setPanY(-targetNode.y * targetZoom);
      setZoom(targetZoom);
      
      // Auto-scroll alternate views if they are active
      setTimeout(() => {
        const kanbanCard = document.getElementById(`kanban-card-${id}`);
        if (kanbanCard) {
          kanbanCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const mobileCard = document.getElementById(`mobile-task-card-${id}`);
        if (mobileCard) {
          mobileCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  };

  // Reminders check engine
  const [triggeredReminders, setTriggeredReminders] = useState<{
    nodeId: string;
    projectId: string;
    text: string;
    targetTime: string;
    mirrorGroupId?: string;
  }[]>([]);
  const [activeReminderIndex, setActiveReminderIndex] = useState(0);
  const [showCustomSnooze, setShowCustomSnooze] = useState(false);

  // Auto-clamp active reminder index when items get dismissed
  useEffect(() => {
    if (activeReminderIndex >= triggeredReminders.length) {
      setActiveReminderIndex(Math.max(0, triggeredReminders.length - 1));
    }
  }, [triggeredReminders.length, activeReminderIndex]);

  // Reset custom snooze view when switching between reminders
  useEffect(() => {
    setShowCustomSnooze(false);
  }, [activeReminderIndex]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

      const triggered: {
        nodeId: string;
        projectId: string;
        text: string;
        targetTime: string;
        mirrorGroupId?: string;
      }[] = [];

      const seenMirrorGroupIds = new Set<string>();

      Object.entries(state.nodes).forEach(([projectId, nodeList]) => {
        (nodeList as TaskNode[]).forEach((node) => {
          if (node.reminderDate && node.reminderTime && !node.reminderDismissed && !node.completed) {
            // Deduplicate triggered mirrors within the same check cycle
            if (node.mirrorGroupId) {
              if (seenMirrorGroupIds.has(node.mirrorGroupId)) {
                return;
              }
              seenMirrorGroupIds.add(node.mirrorGroupId);
            }

            const reminderDateTime = new Date(`${node.reminderDate}T${node.reminderTime}`);
            const currentDateTime = new Date(`${todayDateStr}T${timeStr}`);

            if (!isNaN(reminderDateTime.getTime()) && reminderDateTime <= currentDateTime) {
              triggered.push({
                nodeId: node.id,
                projectId,
                text: node.text,
                targetTime: `${node.reminderDate} ${node.reminderTime}`,
                mirrorGroupId: node.mirrorGroupId,
              });
            }
          }
        });
      });

      if (triggered.length > 0) {
        setTriggeredReminders(prev => {
          const prevIds = new Set(prev.map(r => r.nodeId));
          const prevMirrorGroupIds = new Set(prev.map(r => r.mirrorGroupId).filter(Boolean) as string[]);
          const newReminders = triggered.filter(r => {
            if (prevIds.has(r.nodeId)) return false;
            if (r.mirrorGroupId && prevMirrorGroupIds.has(r.mirrorGroupId)) return false;
            return true;
          });
          if (newReminders.length > 0) {
            playNotificationChime();

            // Dispatch native system notifications (highly visible on mobile lock-screen & status-bar!)
            newReminders.forEach((reminder) => {
              if ('Notification' in window && Notification.permission === 'granted') {
                const title = 'Напоминание о задаче 🔔';
                const options = {
                  body: `Срок: ${reminder.text}`,
                  icon: '/icon.svg',
                  badge: '/icon.svg',
                  vibrate: [200, 100, 250, 100, 300, 150, 400],
                  tag: reminder.nodeId,
                  requireInteraction: true // Keep it showing until the user explicitly taps or clears it
                };

                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then((reg) => {
                    reg.showNotification(title, options);
                  }).catch(() => {
                    try {
                      new Notification(title, {
                        body: options.body,
                        tag: options.tag,
                        requireInteraction: true
                      });
                    } catch (e) {
                      console.warn('Native notification fallback failed:', e);
                    }
                  });
                } else {
                  try {
                    new Notification(title, {
                      body: options.body,
                      tag: options.tag,
                      requireInteraction: true
                    });
                  } catch (e) {
                    console.warn('Native notification failed:', e);
                  }
                }
              }
            });
          }
          return [...prev, ...newReminders];
        });
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [state.nodes]);

  // Track last created task/container node to enable quick ESC cancel
  const [lastCreatedNodeId, setLastCreatedNodeId] = useState<string | null>(null);

  // Sync lastCreatedNodeId to null when selectedNodeId changes to another node or becomes null
  useEffect(() => {
    if (selectedNodeId !== lastCreatedNodeId) {
      setLastCreatedNodeId(null);
    }
  }, [selectedNodeId, lastCreatedNodeId]);

  // Search keyword for filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  // Advanced Filtering Panel and states
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterDueDate, setFilterDueDate] = useState<string>('all');
  const [filterAttachments, setFilterAttachments] = useState<string>('all');
  const [filterNotes, setFilterNotes] = useState<string>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<'status' | 'category' | 'priority' | 'container' | null>('status');
  const [kanbanContainerFilterId, setKanbanContainerFilterId] = useState<string | null>('all');

  const [preFocusFilters, setPreFocusFilters] = useState<{
    filterStatus: string;
    filterPriority: string;
    filterTag: string;
    filterDueDate: string;
    filterAttachments: string;
    filterNotes: string;
    filterCategoryId: string | null;
    kanbanGroupBy: 'status' | 'category' | 'priority' | 'container' | null;
    kanbanContainerFilterId: string | null;
    viewMode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower' | 'anydo';
  } | null>(null);

  const filtersRef = React.useRef({
    filterStatus,
    filterPriority,
    filterTag,
    filterDueDate,
    filterAttachments,
    filterNotes,
    filterCategoryId,
    kanbanGroupBy,
    kanbanContainerFilterId
  });
  filtersRef.current = {
    filterStatus,
    filterPriority,
    filterTag,
    filterDueDate,
    filterAttachments,
    filterNotes,
    filterCategoryId,
    kanbanGroupBy,
    kanbanContainerFilterId
  };

  // Canvas zoom & pan view attributes
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);

  // View Mode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower' | 'anydo'
  const [viewMode, setViewMode] = useState<'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower' | 'anydo'>('canvas');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('milli_focused_task_id') || null;
    } catch {
      return null;
    }
  });
  const [isMobileViewSwitcherOpen, setIsMobileViewSwitcherOpen] = useState(false);
  const [isContainerFocused, setIsContainerFocused] = useState(false);
  const [focusedContainerId, setFocusedContainerId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('milli_focused_container_id') || null;
    } catch {
      return null;
    }
  });
  const [isViewFullScreen, setIsViewFullScreen] = useState(false);

  useEffect(() => {
    try {
      if (focusedTaskId) {
        localStorage.setItem('milli_focused_task_id', focusedTaskId);
      } else {
        localStorage.removeItem('milli_focused_task_id');
      }
    } catch (e) {
      console.error(e);
    }
  }, [focusedTaskId]);

  useEffect(() => {
    try {
      if (focusedContainerId) {
        localStorage.setItem('milli_focused_container_id', focusedContainerId);
      } else {
        localStorage.removeItem('milli_focused_container_id');
      }
    } catch (e) {
      console.error(e);
    }
  }, [focusedContainerId]);

  const [isBottomViewsExpanded, setIsBottomViewsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_views_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem('task_mindmap_views_expanded', String(isBottomViewsExpanded));
  }, [isBottomViewsExpanded]);

  // Track focus transitions to restore/apply filters
  const lastAppliedFocusIdRef = React.useRef<string | null>(null);
  const prevFocusedContainerIdRef = React.useRef<string | null>(null);
  const lastProcessedFocusedTaskIdRef = React.useRef<string | null>(null);

  // Auto-switch viewMode and load/restore filters on focused node change
  useEffect(() => {
    const focusId = focusedTaskId || focusedContainerId;
    const prevFocusedContainerId = prevFocusedContainerIdRef.current;
    
    // Check if we just exited container focus mode (was focusing a container, now none)
    const exitedContainerFocus = prevFocusedContainerId !== null && focusedContainerId === null;
    
    if (focusId !== lastAppliedFocusIdRef.current) {
      if (focusId) {
        // Entering focus mode!
        if (state.activeProjectId) {
          const activeProjectNodes = state.nodes[state.activeProjectId] || [];
          const node = activeProjectNodes.find(n => n.id === focusId);
          if (node) {
            // If we were NOT in focus mode, save the current filters as pre-focus filters
            if (!lastAppliedFocusIdRef.current) {
              setPreFocusFilters({
                ...filtersRef.current,
                viewMode: viewMode
              });
            }

            if (searchQuery.trim() !== "" && (viewMode === 'canvas' || (!lastAppliedFocusIdRef.current && viewMode === 'canvas'))) {
              setViewMode('canvas');
            } else if (node.defaultView) {
              setViewMode(node.defaultView);
            } else {
              if (viewMode !== 'canvas') {
                // Keep the current view mode if we focused a node from outside the canvas (e.g. from GanttView zoom-focus)
              } else {
                setViewMode('canvas');
              }
            }
            
            if (node.savedFilters) {
              if (node.savedFilters.filterStatus !== undefined) setFilterStatus(node.savedFilters.filterStatus);
              if (node.savedFilters.filterPriority !== undefined) setFilterPriority(node.savedFilters.filterPriority);
              if (node.savedFilters.filterTag !== undefined) setFilterTag(node.savedFilters.filterTag);
              if (node.savedFilters.filterDueDate !== undefined) setFilterDueDate(node.savedFilters.filterDueDate);
              if (node.savedFilters.filterAttachments !== undefined) setFilterAttachments(node.savedFilters.filterAttachments);
              if (node.savedFilters.filterNotes !== undefined) setFilterNotes(node.savedFilters.filterNotes);
              if (node.savedFilters.filterCategoryId !== undefined) setFilterCategoryId(node.savedFilters.filterCategoryId);
              if (node.savedFilters.kanbanGroupBy !== undefined) setKanbanGroupBy(node.savedFilters.kanbanGroupBy);
              if (node.savedFilters.kanbanContainerFilterId !== undefined) setKanbanContainerFilterId(node.savedFilters.kanbanContainerFilterId);
            }
            
            lastAppliedFocusIdRef.current = focusId;
          }
        }
      } else {
        // Exiting focus mode!
        // Restore pre-focus filters if they exist
        if (preFocusFilters) {
          setFilterStatus(preFocusFilters.filterStatus);
          setFilterPriority(preFocusFilters.filterPriority);
          setFilterTag(preFocusFilters.filterTag);
          setFilterDueDate(preFocusFilters.filterDueDate);
          setFilterAttachments(preFocusFilters.filterAttachments);
          setFilterNotes(preFocusFilters.filterNotes);
          setFilterCategoryId(preFocusFilters.filterCategoryId);
          setKanbanGroupBy(preFocusFilters.kanbanGroupBy);
          setKanbanContainerFilterId(preFocusFilters.kanbanContainerFilterId);
          if (exitedContainerFocus) {
            setViewMode(viewMode === 'gantt' ? 'gantt' : 'canvas');
          } else if (preFocusFilters.viewMode) {
            setViewMode(viewMode === 'gantt' ? 'gantt' : preFocusFilters.viewMode);
          }
          setPreFocusFilters(null);
        } else if (exitedContainerFocus) {
          setViewMode(viewMode === 'gantt' ? 'gantt' : 'canvas');
        }
        lastAppliedFocusIdRef.current = null;
      }
    } else {
      // If overall focusId did not change, but we exited container focus mode (e.g. nested transitions)
      if (exitedContainerFocus) {
        setViewMode(viewMode === 'gantt' ? 'gantt' : 'canvas');
      }
    }
    
    prevFocusedContainerIdRef.current = focusedContainerId;
  }, [focusedTaskId, focusedContainerId, state.activeProjectId, state.nodes, preFocusFilters, viewMode, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsViewFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-collapse branches and expand card details when a task is focused
  useEffect(() => {
    if (focusedTaskId) {
      if (focusedTaskId !== lastProcessedFocusedTaskIdRef.current) {
        lastProcessedFocusedTaskIdRef.current = focusedTaskId;
        if (state.activeProjectId) {
          const pid = state.activeProjectId;
          const currentNodes = state.nodes[pid] || [];
          const node = currentNodes.find(n => n.id === focusedTaskId);
          if (node && (!node.collapsed || node.isCardCollapsed)) {
            setState(prev => ({
              ...prev,
              nodes: {
                ...prev.nodes,
                [pid]: prev.nodes[pid].map(n => n.id === focusedTaskId ? { 
                  ...n, 
                  collapsed: true, 
                  isCardCollapsed: false, 
                  updatedAt: new Date().toISOString() 
                } : n)
              }
            }));
          }
        }
      }
    } else {
      lastProcessedFocusedTaskIdRef.current = null;
    }
  }, [focusedTaskId, state.activeProjectId, state.nodes]);

  // Auto-center on focused task change
  useEffect(() => {
    if (focusedTaskId) {
      let targetNode: TaskNode | undefined;
      for (const [projectId, nodeList] of Object.entries(state.nodes)) {
        const found = (nodeList as TaskNode[]).find(n => n.id === focusedTaskId);
        if (found) {
          targetNode = found;
          break;
        }
      }
      if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
        const targetZoom = 1.05;
        setPanX(-targetNode.x * targetZoom);
        setPanY(-targetNode.y * targetZoom);
        setZoom(targetZoom);
      }
    }
  }, [focusedTaskId, state.nodes]);

  // Dark Mode
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('task_mindmap_dark');
    if (saved !== null) return saved === 'true';
    return false; // Initialize in light mode as standard default!
  });

  // Simple Undo/Redo stack for nodes (for active safety)
  const [undoStack, setUndoStack] = useState<Record<string, TaskNode[][]>>({});

  // Version Control & Symmetrical Release Updates
  const APP_VERSION = "2.5.0";
  const [showVersionUpdateAlert, setShowVersionUpdateAlert] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [aiConsoleOpen, setAiConsoleOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('task_mindmap_app_version');
      if (stored !== APP_VERSION) {
        setShowVersionUpdateAlert(true);
        localStorage.setItem('task_mindmap_app_version', APP_VERSION);
      }
    } catch (e) {
      console.error('Failed to log version update:', e);
    }
  }, []);

  // Run automated 30-day task history pruning and daily backup snapshot on boot
  useEffect(() => {
    // 1. Prune task histories older than 30 days
    setRawState(prevState => {
      const pruned = pruneWorkspaceTaskHistories(prevState);
      // 2. Save automated workspace-level daily backup snapshot
      runAutomatedBackup(pruned);
      return pruned;
    });
  }, []);

  useEffect(() => {
    if ('Notification' in window) {
      const perm = Notification.permission;
      const dismissed = localStorage.getItem('task_mindmap_dismissed_notifications_banner') === 'true';
      if (perm === 'default' && !dismissed) {
        const t = setTimeout(() => {
          setShowNotificationPrompt(true);
        }, 3000); // 3 seconds delay for polished entry
        return () => clearTimeout(t);
      }
    }
  }, []);

  const handleRequestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => {
        setShowNotificationPrompt(false);
        if (permission === 'granted') {
          playNotificationChime();
          const options = {
            body: 'Вы успешно подписались на системные напоминания о задачах!',
            icon: '/icon.svg',
            badge: '/icon.svg',
            vibrate: [200, 100, 200, 100, 300],
            tag: 'permission-success'
          };
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification('Уведомления включены! 🔔', options);
            });
          } else {
            new Notification('Уведомления включены! 🔔', options);
          }
        }
      });
    }
  };

  const handleDismissNotificationPrompt = () => {
    localStorage.setItem('task_mindmap_dismissed_notifications_banner', 'true');
    setShowNotificationPrompt(false);
  };

  // 1. Firebase Auth listener registration
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        isFirstSnapshotRef.current = true;
        setCurrentUser(user);
        setGoogleToken(token);
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        setHasCheckedInitialAuth(true);
        setIsAutoLoginPopupBlocked(false);
      },
      () => {
        isFirstSnapshotRef.current = true;
        setCurrentUser(null);
        setGoogleToken(null);
        setSyncStatus(prev => ({ ...prev, firebase: 'idle', sheets: 'idle' }));
        setHasCheckedInitialAuth(true);

        // Automatic anonymous authentication if the user did not explicitly log out
        try {
          const explicitLogout = localStorage.getItem('explicit_logout') === 'true';
          if (!explicitLogout) {
            console.log('[Auth] Automatic anonymous guest sign in triggered');
            signInGuest().catch(err => {
              console.error('[Auth] Failed to automatically sign in guest:', err);
            });
          }
        } catch (e) {
          console.error('[Auth] Error checking explicit logout state:', e);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // 1b. Programmatic Google Sign-In is only triggered by user actions (like click) to prevent the browser's popup blocker.

  // Keep track of latest state and unsynced counts for real-time listener to avoid resubscription on every character change
  stateRef.current = state;
  
  const unsyncedEditsCountRef = React.useRef(unsyncedEditsCount);
  unsyncedEditsCountRef.current = unsyncedEditsCount;

  const googleTokenRef = React.useRef(googleToken);
  googleTokenRef.current = googleToken;

  const syncOnExitRef = React.useRef(syncOnExit);
  syncOnExitRef.current = syncOnExit;

  useEffect(() => {
    const handleSessionFocus = () => {
      // If there are no unsynced edits, we can safely advance session start time to now.
      // Any new edits made after this moment will be considered part of the new active session.
      if (unsyncedEditsCountRef.current === 0) {
        sessionStartTimeRef.current = new Date().toISOString();
        console.log('[Sync] Fresh active session started at:', sessionStartTimeRef.current);
      }
    };

    window.addEventListener('focus', handleSessionFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleSessionFocus();
      }
    });

    return () => {
      window.removeEventListener('focus', handleSessionFocus);
    };
  }, []);

  // 3. Real-time Firestore snapshot synchronization for instant Desktop-to-Mobile and Mobile-To-Desktop updates
  useEffect(() => {
    if (!currentUser) return;

    const docRef = doc(db, 'workspaces', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) return;
      const cloudData = snap.data();
      if (!cloudData) return;

      // Real-time Pomodoro state synchronization across devices
      if (cloudData.activePomodoro) {
        try {
          const localPomoSaved = localStorage.getItem('task_mindmap_pomodoro');
          const localPomo = localPomoSaved ? JSON.parse(localPomoSaved) : null;
          const cloudPomo = cloudData.activePomodoro;

          const isPomoSubstantivelyDifferent = !localPomo || 
            localPomo.nodeId !== cloudPomo.nodeId ||
            localPomo.isRunning !== cloudPomo.isRunning ||
            localPomo.isPaused !== cloudPomo.isPaused ||
            localPomo.isBreak !== cloudPomo.isBreak ||
            // Support small clock deviations between devices by checking if endTime difference is larger than 2 seconds
            Math.abs((localPomo.endTime || 0) - (cloudPomo.endTime || 0)) > 2000 ||
            localPomo.nodeText !== cloudPomo.nodeText;

          if (isPomoSubstantivelyDifferent) {
            console.log('[Sync] Received substantive active Pomodoro update from Firestore, updating local state.');
            localStorage.setItem('task_mindmap_pomodoro', JSON.stringify(cloudPomo));
            window.dispatchEvent(new Event('task_mindmap_pomo_update'));
          }
        } catch (e) {
          console.error('[Sync] Error syncing active Pomodoro from Firestore snapshot:', e);
        }
      } else {
        try {
          const localPomoSaved = localStorage.getItem('task_mindmap_pomodoro');
          if (localPomoSaved) {
            const localPomo = JSON.parse(localPomoSaved);
            if (localPomo && localPomo.isRunning) {
              console.log('[Sync] Pomodoro cleared in cloud, resetting local timer.');
              localStorage.removeItem('task_mindmap_pomodoro');
              window.dispatchEvent(new Event('task_mindmap_pomo_update'));
            }
          }
        } catch (e) {
          console.error('[Sync] Error checking local active Pomodoro when cloud is empty:', e);
        }
      }

      const localDeletions = (() => {
        try {
          const listJson = localStorage.getItem('milli_deleted_registry') || '[]';
          return JSON.parse(listJson) || [];
        } catch {
          return [];
        }
      })();
      const cloudDeletions = cloudData.deletions || [];
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const mergedDeletions: any[] = [];
      const appendUnique = (rec: any) => {
        try {
          const deletedAtMs = new Date(rec.deletedAt || 0).getTime();
          if (deletedAtMs < thirtyDaysAgo) return; // Prune deletions older than 30 days
        } catch {
          // Safeguard
        }
        if (!mergedDeletions.some(m => m.id === rec.id && m.type === rec.type)) {
          mergedDeletions.push(rec);
        }
      };
      (localDeletions || []).forEach(appendUnique);
      (cloudDeletions || []).forEach(appendUnique);

      // Save them back to local storage
      try {
        localStorage.setItem('milli_deleted_registry', JSON.stringify(mergedDeletions));
      } catch (e) {
        console.error(e);
      }

      const isDeleted = (type: string, id: string) => {
        return mergedDeletions.some(d => d.type === type && d.id === id);
      };

      const filteredFolders = (cloudData.folders || []).filter((f: any) => !isDeleted('folder', f.id));
      const filteredProjects = (cloudData.projects || []).filter((p: any) => !isDeleted('project', p.id));
      const filteredNodes: Record<string, TaskNode[]> = {};
      Object.keys(cloudData.nodes || {}).forEach(pid => {
        const list = (cloudData.nodes[pid] || []).filter((n: any) => !isDeleted('node', n.id));
        if (list.length > 0) {
          filteredNodes[pid] = list;
        }
      });
      const filteredTagCats = (cloudData.tagCategories || []).filter((tc: any) => !isDeleted('tagCategory', tc.id));

      const cloudState: WorkspaceState = {
        folders: filteredFolders,
        projects: filteredProjects,
        nodes: filteredNodes,
        activeProjectId: cloudData.activeProjectId || null,
        tagCategories: filteredTagCats,
        googleSheetsFileId: cloudData.googleSheetsFileId || undefined,
        taskSheetsSpreadsheetId: cloudData.taskSheetsSpreadsheetId || undefined,
        deletions: mergedDeletions,
        globalSettings: cloudData.globalSettings || undefined
      };

      const currentState = stateRef.current;
      const normalizedCloud = normalizeWorkspaceState(cloudState);
      const isEquivalent = isStateSemanticallyEqual(currentState, normalizedCloud);
      const fromCache = !!snap.metadata?.fromCache;
      if (!fromCache) {
        setIsInitialSyncComplete(true);
      }

      const cloudHash = getSyncHash(normalizedCloud);
      const isCloudSameAsLastSynced = cloudHash === lastSyncedStateHashRef.current;

      if (!isEquivalent) {
        // If the cloud nodes/projects/folders are identical to what we last successfully synced,
        // there are no actual new changes in the cloud. It's just lagging behind our local unsynced edits.
        // We can safely ignore this nodes mismatch.
        if (isCloudSameAsLastSynced && !isFirstSnapshotRef.current) {
          console.log('[Sync] Ignoring cloud snapshot because cloud nodes list matches our last successfully synced state.');
        } else if (isFirstSnapshotRef.current) {
          if (!fromCache) {
            isFirstSnapshotRef.current = false;
          }
          // Merge local (currentState) and cloud (normalizedCloud) states symmetrically
          const merged = mergeWorkspaceStates(currentState, normalizedCloud, mergedDeletions);
          const mergedHash = getSyncHash(merged);

          ignoreNextStateChangeRef.current = true;
          lastSyncedStateHashRef.current = mergedHash; // Update hash to prevent loops
          setRawState(merged);
          setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));

          // If the merged state is different from cloud, we have local changes (e.g. startup pomo completion) that need syncing back to the cloud
          if (mergedHash !== cloudHash) {
            setUnsyncedEditsCount(1);
          } else {
            setUnsyncedEditsCount(0);
          }
          setHasCloudUpdates(false);
          setCloudUpdateState(null);
        } else if (unsyncedEditsCountRef.current === 0) {
          if (!fromCache) {
            isFirstSnapshotRef.current = false;
          }
          ignoreNextStateChangeRef.current = true;
          lastSyncedStateHashRef.current = cloudHash; // Update hash to prevent loops
          setRawState(normalizedCloud);
          setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
          setUnsyncedEditsCount(0); // Safely clear any stale locally registered counts
          setHasCloudUpdates(false);
          setCloudUpdateState(null);
        } else {
          // Force notification to user that another device has fresher updates
          setHasCloudUpdates(true);
          setCloudUpdateState(cloudState);
        }
      } else {
        if (!fromCache) {
          isFirstSnapshotRef.current = false;
        }
        setHasCloudUpdates(false);
        setCloudUpdateState(null);
      }
    }, (error) => {
      console.error('[Firebase snapshot listener error]:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 2. Local save & Automatic Firebase snapshot update upon state modifications (fully offline-first optimized)
  useEffect(() => {
    saveWorkspace(state);

    const isFirstTime = lastStateRef.current === null;
    const stateChanged = !isFirstTime && state !== lastStateRef.current;
    lastStateRef.current = state;

    if (isFirstTime) {
      if (isFirstRender.current) {
        isFirstRender.current = false;
      }
    } else if (stateChanged) {
      if (isFirstRender.current) {
        isFirstRender.current = false;
      } else if (ignoreNextStateChangeRef.current) {
        // Skip incrementing unsynced edits count when the update was caused by Google Sheets sync download/merge or Firestore snapshot
        ignoreNextStateChangeRef.current = false;
      } else {
        setUnsyncedEditsCount(prev => prev + 1);
      }
    } else {
      if (isFirstRender.current) {
        isFirstRender.current = false;
      }
    }
    
    // Only save to Firebase if the state actually changed or there are pending unsynced edits.
    // This prevents a stale client session from overwriting newer changes in the cloud on auth load.
    if (currentUser && isInitialSyncComplete && (stateChanged || unsyncedEditsCountRef.current > 0)) {
      const currentHash = getSyncHash(state);
      if (currentHash === lastSyncedStateHashRef.current) {
        return; // Already synced! Prevents infinite trigger loops
      }

      const countSaved = unsyncedEditsCount;
      const timer = setTimeout(async () => {
        setSyncStatus(prev => ({ ...prev, firebase: 'syncing' }));
        const res = await saveToFirebaseDirectly(currentUser.uid, state, sessionStartTimeRef.current);
        setSyncStatus(prev => ({
          ...prev,
          firebase: res.success ? 'saved' : 'error'
        }));
        if (res.success) {
          lastSyncedStateHashRef.current = getSyncHash(state); // Update hash on successful upload
          setUnsyncedEditsCount(prev => Math.max(0, prev - countSaved));
        }
      }, 3000); // 3s snapshot rate-limiting debounce for faster, safe autosaving without infinite loading indicators
      return () => clearTimeout(timer);
    }
  }, [state, currentUser, isInitialSyncComplete]);

  // Symmetrical Google Sheets merge trigger method
  const runSheetsSymmetricalSync = async (token: string, currentWorkspace: WorkspaceState) => {
    if (isSyncingSheetsRef.current) return;
    isSyncingSheetsRef.current = true;
    setIsSyncingSheets(true);
    setSyncStatus(prev => ({ ...prev, sheets: 'syncing' }));
    setSheetsError(null);

    try {
      const result = await syncWithGoogleSheets(token, currentWorkspace);
      if (result.success) {
        // Correctly set block flag before state reset to prevent trigger loop
        ignoreNextStateChangeRef.current = true;
        const normalized = normalizeWorkspaceState(result.state);
        lastSyncedStateHashRef.current = getSyncHash(normalized); // Update hash to prevent loop reflection
        setRawState(normalized);
        setSyncStatus(prev => ({
          ...prev,
          sheets: 'synced',
          lastSyncedTime: new Date().toLocaleTimeString() + ', ' + new Date().toLocaleDateString()
        }));
        
        if (result.report) {
          setSyncReport(result.report);
          localStorage.setItem('milli_last_sync_report', JSON.stringify(result.report));
        }
        
        // Zero out progress tracking on successful symmetrical sheet consolidation
        setUnsyncedEditsCount(0);
        setSheetsError(null);
      } else {
        setSyncStatus(prev => ({ ...prev, sheets: 'error' }));
        const errMsg = result.error || 'Failed to synchronize. Response state was not successful.';
        
        const isStaleToken = errMsg.includes('401') || errMsg.includes('UNAUTHENTICATED') || errMsg.toLowerCase().includes('auth');
        const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('TypeError') || errMsg.includes('NetworkError');
        
        if (isStaleToken) {
          console.warn('Google Sheets token expired (handled):', errMsg);
          setSheetsError('Сессия Google Таблиц завершена. Вы можете мгновенно и автоматически продлить её без выбора аккаунта — нажмите кнопку «Обновить авторизацию Google» ниже.');
          setGoogleToken(null); // Clear the stale token to prevent background sync loop error spam
          setAccessToken(null); // Clear stored token from localStorage
        } else if (isNetworkError) {
          console.warn('Google Sheets api network error or CORS blocked (handled):', errMsg);
          setSheetsError('Bilateral Symmetrical Sync Error: Failed to fetch. Ошибка сетевого соединения с Google (автономный режим или блокировка CORS).');
          setGoogleToken(null); // Prevent background sync loop error spam on network blocks
          setAccessToken(null);
        } else {
          console.error('Google Sheets sync failed:', errMsg);
          setSheetsError(errMsg);
        }
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      const isStaleToken = errMsg.includes('401') || errMsg.includes('UNAUTHENTICATED') || errMsg.toLowerCase().includes('auth');
      const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('TypeError') || errMsg.includes('NetworkError');
      
      if (isStaleToken) {
        console.warn('Google Sheets sync exception (OAuth token expired, handled):', errMsg);
      } else {
        console.error('Error running symmetrical sheets sync:', e);
      }
      setSyncStatus(prev => ({ ...prev, sheets: 'error' }));
      
      if (isStaleToken) {
        setSheetsError('Сессия Google Таблиц завершена. Вы можете мгновенно и автоматически продлить её без выбора аккаунта — нажмите кнопку «Обновить авторизацию Google» ниже.');
        setGoogleToken(null); // Clear the stale token to prevent background sync loop error spam
        setAccessToken(null); // Clear stored token from localStorage
      } else if (isNetworkError) {
        setSheetsError('Bilateral Symmetrical Sync Error: Failed to fetch. Ошибка сетевого соединения с Google (автономный режим или блокировка CORS).');
        setGoogleToken(null); // Prevent background sync loop error spam on network blocks
        setAccessToken(null);
      } else {
        setSheetsError(errMsg);
      }
    } finally {
      isSyncingSheetsRef.current = false;
      setIsSyncingSheets(false);
    }
  };



  // Close / stop the active Pomodoro session
  const handleClosePomo = () => {
    if (!globalPomo) return;

    // If it is an active work session (not break), save accumulated elapsed time
    if (!globalPomo.isBreak && globalPomo.nodeId) {
      const elapsed = globalPomo.duration - globalPomo.timeLeft;
      if (elapsed > 0) {
        let foundNode: TaskNode | undefined;
        let foundPid: string | undefined;
        for (const [pid, nodeList] of Object.entries(state.nodes)) {
          const n = (nodeList as TaskNode[]).find(item => item.id === globalPomo.nodeId);
          if (n) {
            foundNode = n;
            foundPid = pid;
            break;
          }
        }

        if (foundNode && foundPid) {
          const minutesToSubtract = Math.round(elapsed / 60);
          const currentEst = foundNode.estimatedTime !== undefined && foundNode.estimatedTime !== null && !isNaN(foundNode.estimatedTime)
            ? foundNode.estimatedTime
            : 0;
          const nextEst = foundNode.estimatedTime !== undefined && foundNode.estimatedTime !== null && !isNaN(foundNode.estimatedTime)
            ? Math.max(0, parseFloat((currentEst - minutesToSubtract).toFixed(2)))
            : undefined;

          const updatedNode = {
            ...foundNode,
            pomodoroTotalTime: (foundNode.pomodoroTotalTime || 0) + elapsed,
            pomodoroSessionsCount: (foundNode.pomodoroSessionsCount || 0) + 1,
            estimatedTime: nextEst
          };
          
          setState(prev => {
            const currentNodes = prev.nodes[foundPid!] || [];
            const updatedList = currentNodes.map(n => n.id === updatedNode.id ? updatedNode : n);
            const syncedNodes = syncCompletion(updatedList);
            return {
              ...prev,
              nodes: {
                ...prev.nodes,
                [foundPid!]: syncedNodes
              }
            };
          });
        }
      }
    }

    localStorage.removeItem('task_mindmap_pomodoro');
    window.dispatchEvent(new Event('task_mindmap_pomo_update'));

    if (currentUser) {
      try {
        const docRef = doc(db, 'workspaces', currentUser.uid);
        updateDoc(docRef, {
          activePomodoro: null
        }).catch(err => {
          console.warn('[Firebase Pomo Sync] Failed to clear activePomodoro on close:', err);
        });
      } catch (err) {
        console.error('[Firebase Pomo Sync] Error building Firestore path for clear activePomodoro:', err);
      }
    }
  };

  // Quick single-button Google Sheets sync handler
  const handleQuickSheetsSync = async () => {
    if (isSyncingSheetsRef.current) return;
    let token = googleToken;
    try {
      if (!token) {
        const res = await googleSignIn();
        if (res) {
          setCurrentUser(res.user);
          setGoogleToken(res.accessToken);
          token = res.accessToken;
        } else {
          return;
        }
      }
      if (token) {
        await runSheetsSymmetricalSync(token, state);
      }
    } catch (e: any) {
      console.error('Error in quick sheets sync:', e);
      setSheetsError(e?.message || String(e));
      setSyncStatus(prev => ({ ...prev, sheets: 'error' }));
    }
  };

  // Manual forced cloud sync actions to solve multi-device desynchronizations immediately
  const forceUploadToCloud = async (currentWorkspace: WorkspaceState) => {
    if (!currentUser) return;
    setForceCloudSyncLoading('upload');
    setForceCloudSyncFeedback(null);
    try {
      const res = await saveToFirebaseDirectly(currentUser.uid, currentWorkspace);
      if (res.success) {
        lastSyncedStateHashRef.current = getSyncHash(currentWorkspace); // Update hash to prevent reflection loops
        setUnsyncedEditsCount(0);
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        if (res.isOfflineQueued) {
          setForceCloudSyncFeedback('Снимок успешно сохранен локально! Синхронизация с облаком произойдет автоматически при восстановлении стабильного интернет-соединения.');
        } else {
          setForceCloudSyncFeedback('Успешно выгружено в облако! Теперь откройте это приложение на другом устройстве и нажмите кнопку "Загрузить из облака".');
        }
      } else {
        setForceCloudSyncFeedback(`Ошибка выгрузки: ${res.error || 'Проверьте интернет-соединение или права доступа.'}`);
      }
    } catch (e: any) {
      setForceCloudSyncFeedback(`Ошибка: ${e?.message || String(e)}`);
    } finally {
      setForceCloudSyncLoading(null);
    }
  };

  const forceDownloadFromCloud = async () => {
    if (!currentUser) return;
    setForceCloudSyncLoading('download');
    setForceCloudSyncFeedback(null);
    try {
      const cloudData = await loadFromFirebaseDirectly(currentUser.uid);
      if (cloudData) {
        const localDeletions = (() => {
          try {
            const listJson = localStorage.getItem('milli_deleted_registry') || '[]';
            return JSON.parse(listJson) || [];
          } catch {
            return [];
          }
        })();
        const cloudDeletions = cloudData.deletions || [];
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const mergedDeletions: any[] = [];
        const appendUnique = (rec: any) => {
          try {
            const deletedAtMs = new Date(rec.deletedAt || 0).getTime();
            if (deletedAtMs < thirtyDaysAgo) return; // Prune deletions older than 30 days
          } catch {
            // Safeguard
          }
          if (!mergedDeletions.some(m => m.id === rec.id && m.type === rec.type)) {
            mergedDeletions.push(rec);
          }
        };
        (localDeletions || []).forEach(appendUnique);
        (cloudDeletions || []).forEach(appendUnique);

        try {
          localStorage.setItem('milli_deleted_registry', JSON.stringify(mergedDeletions));
        } catch (e) {
          console.error(e);
        }

        const isDeleted = (type: string, id: string) => {
          return mergedDeletions.some(d => d.type === type && d.id === id);
        };

        const filteredFolders = (cloudData.folders || []).filter((f: any) => !isDeleted('folder', f.id));
        const filteredProjects = (cloudData.projects || []).filter((p: any) => !isDeleted('project', p.id));
        const filteredNodes: Record<string, TaskNode[]> = {};
        Object.keys(cloudData.nodes || {}).forEach(pid => {
          const list = (cloudData.nodes[pid] || []).filter((n: any) => !isDeleted('node', n.id));
          if (list.length > 0) {
            filteredNodes[pid] = list;
          }
        });
        const filteredTagCats = (cloudData.tagCategories || []).filter((tc: any) => !isDeleted('tagCategory', tc.id));

        const cloudState: WorkspaceState = {
          folders: filteredFolders,
          projects: filteredProjects,
          nodes: filteredNodes,
          activeProjectId: cloudData.activeProjectId || null,
          tagCategories: filteredTagCats,
          googleSheetsFileId: cloudData.googleSheetsFileId || undefined,
          taskSheetsSpreadsheetId: cloudData.taskSheetsSpreadsheetId || undefined,
          deletions: mergedDeletions
        };
        ignoreNextStateChangeRef.current = true;
        const normalized = normalizeWorkspaceState(cloudState);
        lastSyncedStateHashRef.current = getSyncHash(normalized); // Update hash to prevent reflection loops
        setRawState(normalized);
        setUnsyncedEditsCount(0);
        setHasCloudUpdates(false);
        setCloudUpdateState(null);
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        setForceCloudSyncFeedback('Успешно загружено! Данные на этом устройстве полностью заменены версией из вашего облака.');
      } else {
        setForceCloudSyncFeedback('В облаке не найдено сохраненных данных. Пожалуйста, сначала сделайте "Выгрузить в облако" на первом устройстве!');
      }
    } catch (e: any) {
      setForceCloudSyncFeedback(`Ошибка загрузки: ${e?.message || String(e)}`);
    } finally {
      setForceCloudSyncLoading(null);
    }
  };

  // 3. Auto Symmetrical Google Sheets merge on startup / login auth
  useEffect(() => {
    if (googleToken && isInitialSyncComplete) {
      runSheetsSymmetricalSync(googleToken, state);
    }
  }, [googleToken, isInitialSyncComplete]);

  // 4. Background Symmetrical Sheets Sync with 3s fast responsive debounce during continuous editing states
  // Only triggers background auto-sync when there are actual unsynced edits, saving Google API quota limits!
  useEffect(() => {
    if (googleToken && isInitialSyncComplete && unsyncedEditsCount > 0) {
      const currentHash = getSyncHash(state);
      if (currentHash === lastSyncedStateHashRef.current) {
        return; // Already synced! Prevents infinite trigger loops
      }

      const debounceTime = 10000; // 10s debounce after user stops editing the mind map
      const timer = setTimeout(() => {
        runSheetsSymmetricalSync(googleToken, state);
      }, debounceTime); // Optimized rate-limiting debounce
      return () => clearTimeout(timer);
    }
  }, [state, googleToken, unsyncedEditsCount, isInitialSyncComplete]);

  // 5. Instant Sync on Exit (visibilitychange / pagehide / window backgrounding)
  // Especially tuned to ensure smartphones (iOS/Android Safari/Chrome) sync immediately when minimized or closed
  useEffect(() => {
    const triggerInstantSyncOnExit = async () => {
      if (!syncOnExitRef.current) return;
      
      // Save instantly to Firestore (bypassing the 10-second rate-limiting debounce)
      if (currentUserRef.current && isInitialSyncComplete && unsyncedEditsCountRef.current > 0) {
        console.log('[Sync] Smartphone exit / background hide detected. Running instant Firestore sync...');
        const currentWorkspace = stateRef.current;
        const countSaved = unsyncedEditsCountRef.current;
        
        try {
          const res = await saveToFirebaseDirectly(currentUserRef.current.uid, currentWorkspace, sessionStartTimeRef.current);
          if (res.success) {
            lastSyncedStateHashRef.current = getSyncHash(currentWorkspace);
            setUnsyncedEditsCount(prev => Math.max(0, prev - countSaved));
            setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
          }
        } catch (err) {
          console.error('[Sync] Instant Firebase exit sync failed:', err);
        }
      }

      // Save instantly to Google Sheets
      if (googleTokenRef.current && isInitialSyncComplete && unsyncedEditsCountRef.current > 0) {
        console.log('[Sync] Smartphone exit / background hide detected. Running instant Google Sheets sync...');
        const currentWorkspace = stateRef.current;
        try {
          await syncWithGoogleSheets(googleTokenRef.current, currentWorkspace);
          setSyncStatus(prev => ({
            ...prev,
            sheets: 'synced',
            lastSyncedTime: new Date().toLocaleTimeString() + ', ' + new Date().toLocaleDateString()
          }));
          setUnsyncedEditsCount(0);
        } catch (err) {
          console.error('[Sync] Instant Google Sheets exit sync failed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerInstantSyncOnExit();
      }
    };

    const handlePageHide = () => {
      triggerInstantSyncOnExit();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isInitialSyncComplete]);

  // Synchronize Google Sheets IDs from state to localStorage
  useEffect(() => {
    if (state.googleSheetsFileId) {
      localStorage.setItem('google_sheets_sync_file_id', state.googleSheetsFileId);
    }
    if (state.taskSheetsSpreadsheetId) {
      localStorage.setItem('task_sheets_spreadsheet_id', state.taskSheetsSpreadsheetId);
    }
  }, [state.googleSheetsFileId, state.taskSheetsSpreadsheetId]);

  // Handle media/dark mode class on body element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('task_mindmap_dark', String(darkMode));
  }, [darkMode]);

  // Load specified task URL link parameter on startup
  useEffect(() => {
    if (hasCheckedUrlParamRef.current) return;
    
    // Check if state is initialized with nodes
    const nodeKeys = Object.keys(state.nodes);
    if (nodeKeys.length === 0) return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlAction = urlParams.get('action');

      if (urlAction === 'new-task') {
        hasCheckedUrlParamRef.current = true;
        
        let pid = state.activeProjectId;
        if (!pid && nodeKeys.length > 0) {
          pid = nodeKeys[0];
          setState(prev => ({ ...prev, activeProjectId: pid! }));
        }

        if (pid) {
          const currentNodes = [...(state.nodes[pid] || [])];
          pushToUndo(pid, currentNodes);

          // Find or create the inbox container
          let inboxContainer = currentNodes.find(n => n.isContainer && (n.text.includes('INBOX') || n.text.includes('ВХОДЯЩИЕ')));
          let finalParentId = 'inbox';
          let posX = 0;
          let posY = 0;

          if (inboxContainer) {
            finalParentId = inboxContainer.id;
            posX = inboxContainer.x + (Math.random() - 0.5) * 40;
            posY = inboxContainer.y + (Math.random() - 0.5) * 40;
          } else {
            const newContainerId = 'gtd-inbox-' + generateId();
            inboxContainer = {
              id: newContainerId,
              projectId: pid,
              text: "📥 ВХОДЯЩИЕ (INBOX)",
              x: -500,
              y: -100,
              parentId: null,
              isFloating: true,
              isContainer: true,
              priority: 'none',
              tags: [],
              notes: "Контейнер Входящих задач.",
              completed: false,
              files: []
            };
            finalParentId = newContainerId;
            posX = -500;
            posY = -100;
            currentNodes.push(inboxContainer);
          }

          const newTaskId = 'node-' + generateId();
          const newTaskNode: TaskNode = {
            id: newTaskId,
            projectId: pid,
            text: 'Новая задача',
            x: posX,
            y: posY,
            parentId: finalParentId,
            isFloating: true,
            priority: 'none',
            tags: ['Входящие'],
            notes: 'Эта задача была записана во Входящие (INBOX).',
            completed: false,
            files: [],
            color: '#6366f1',
            estimatedTime: 30
          };

          setState(prev => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [pid!]: [...currentNodes, newTaskNode]
            }
          }));

          setSelectedNodeId(newTaskId);
          setIsDrawerOpen(true);
          setLastCreatedNodeId(newTaskId);

          // Clear action parameter from browser URL
          try {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('action');
            window.history.replaceState(null, '', cleanUrl.toString());
          } catch (e) {
            console.error('Failed to clean URL parameters:', e);
          }
          return;
        }
      }

      const urlTaskId = urlParams.get('task') || urlParams.get('t');
      if (!urlTaskId) {
        hasCheckedUrlParamRef.current = true;
        return;
      }

      // Search cross-project to find which project owns this task
      let targetProjectId: string | null = null;
      let targetNode: TaskNode | null = null;
      const projectIds = Object.keys(state.nodes);
      for (const projectId of projectIds) {
        const nodeArray = state.nodes[projectId];
        if (!nodeArray) continue;
        const foundNode = nodeArray.find(n => n.id === urlTaskId);
        if (foundNode) {
          targetProjectId = projectId;
          targetNode = foundNode;
          break;
        }
      }

      if (targetProjectId && targetNode) {
        hasCheckedUrlParamRef.current = true;
        
        // Match project
        setState(prev => {
          if (prev.activeProjectId === targetProjectId) return prev;
          return { ...prev, activeProjectId: targetProjectId! };
        });
        
        // Select the task/node and switch view to canvas
        setSelectedNodeId(urlTaskId);
        setIsDrawerOpen(false); // Do not open properties drawer by default; keep canvas visible
        setViewMode('canvas'); // Explicitly open the mind map canvas view

        // Calculate and set absolute coordinates to recenter the canvas on startup
        if (targetNode.x !== undefined && targetNode.y !== undefined) {
          const targetZoom = 1.05;
          setPanX(-targetNode.x * targetZoom);
          setPanY(-targetNode.y * targetZoom);
          setZoom(targetZoom);
        }
      }
    } catch (err) {
      console.error('Failed to parse load URL parameters:', err);
    }
  }, [state.nodes]);

  // Back up history before doing node modifications
  const pushToUndo = (projectId: string, currentNodes: TaskNode[]) => {
    setUndoStack(prev => {
      const projectStack = prev[projectId] || [];
      // Max 15 undo operations
      const updated = [JSON.parse(JSON.stringify(currentNodes)), ...projectStack].slice(0, 15);
      return {
        ...prev,
        [projectId]: updated
      };
    });
  };

  const handleUndo = () => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const projectStack = undoStack[pid] || [];
    if (projectStack.length === 0) return;

    const previousNodesState = projectStack[0];
    const remainingStack = projectStack.slice(1);

    setUndoStack(prev => ({
      ...prev,
      [pid]: remainingStack
    }));

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: previousNodesState
      }
    }));
  };

  // Handle keyboard shortcuts (Delete to delete selected task, Escape to cancel newly added task during focus)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      if (e.key === 'Escape' || e.key === 'Esc') {
        if (selectedNodeId && selectedNodeId === lastCreatedNodeId) {
          if (isTyping) {
            target.blur();
          }
          handleDeleteNode(selectedNodeId, true); // True to skip confirming if it happens to be a container
          setLastCreatedNodeId(null);
          setSelectedNodeId(null);
          e.preventDefault();
          return;
        }
      }

      if (isTyping) {
        return; // Ignore other shortcuts (like Delete) while typing in inputs
      }

      // Ctrl + Z to Undo last task operation
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Del' || e.key === 'Backspace') {
        if (selectedNodeId) {
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [selectedNodeId, lastCreatedNodeId, state, undoStack, handleUndo]);

  // Adjust sidebar on startup based on screen width ONLY on initial load if no preference is saved
  useEffect(() => {
    const saved = localStorage.getItem('task_mindmap_sidebar_open');
    if (saved === null) {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    }
  }, []);



  // Switch project handler
  const handleSelectProject = (projectId: string) => {
    setState(prev => ({
      ...prev,
      activeProjectId: projectId
    }));
    // Recenter canvas on change
    setPanX(0);
    setPanY(0);
    setZoom(1);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setIsMultiSelectMode(false);
    setSearchQuery('');
    setFocusedTaskId(null);
    setFocusedContainerId(null);
    
    // Automatically close the sidebar overlay drawer on mobile/tablet screen widths
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  // ----- FOLDER OPERATIONS -----
  const handleCreateFolder = (name: string, parentId: string | null) => {
    const newFolder: Folder = {
      id: 'f-' + generateId(),
      name,
      parentId
    };
    setState(prev => ({
      ...prev,
      folders: [...prev.folders, newFolder]
    }));
  };

  const handleRenameFolder = (id: string, name: string) => {
    setState(prev => ({
      ...prev,
      folders: prev.folders.map(f => f.id === id ? { ...f, name } : f)
    }));
  };

  const handleDeleteFolder = (id: string) => {
    logDeletion('folder', id);
    setState(prev => {
      // Subfolders and projects attached to deleted folder are unlinked/moved to root parent
      const subFolders = prev.folders.map(f => f.parentId === id ? { ...f, parentId: null } : f);
      const subProjects = prev.projects.map(p => p.folderId === id ? { ...p, folderId: null } : p);
      const filteredFolders = subFolders.filter(f => f.id !== id);

      return {
        ...prev,
        folders: filteredFolders,
        projects: subProjects
      };
    });
  };


  // ----- PROJECT OPERATIONS -----
  const handleCreateProject = (name: string, folderId: string | null) => {
    const projectId = 'p-' + generateId();
    
    // Individual default categories with unique IDs for this project
    const defaultCategories: TagCategory[] = [];

    const newProject: Project = {
      id: projectId,
      name,
      folderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tagCategories: defaultCategories
    };

    // A mindmap must always start with a visual Root Node!
    const defaultRootNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: projectId,
      text: `👑 ${name}`,
      x: 0,
      y: 0,
      parentId: null,
      priority: 'low',
      tags: ['Главная'],
      notes: `Вы создали новую интеллект-карту задач "${name}". Нажмите на кнопку "+" внизу карты, чтобы создать новую ветку. Вы также можете свободно таскать карточки по экрану, менять им цвета, крепить файлы и ставить приоритеты!`,
      completed: false,
      files: [],
      color: '#6366f1' // Indigo default
    };

    setState(prev => ({
      ...prev,
      projects: [...prev.projects, newProject],
      nodes: {
        ...prev.nodes,
        [projectId]: [defaultRootNode]
      },
      activeProjectId: projectId
    }));

    // Recenter
    setPanX(0);
    setPanY(0);
    setZoom(1);
    setSelectedNodeId(defaultRootNode.id);
  };

  const handleCreateTargetProject = (name: string) => {
    if (!name.trim()) return;
    const newProjId = 'p-' + generateId();
    const defaultRootNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: newProjId,
      text: `👑 ${name}`,
      x: 0,
      y: 0,
      parentId: null,
      priority: 'low',
      tags: ['Главная'],
      notes: `Вы создали новую интеллект-карту задач "${name}". Нажмите на кнопку "+" внизу карты, чтобы создать новую ветку!`,
      completed: false,
      files: [],
      color: '#6366f1'
    };

    const newProject: Project = {
      id: newProjId,
      name,
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tagCategories: []
    };

    setState(prev => ({
      ...prev,
      projects: [...prev.projects, newProject],
      nodes: {
        ...prev.nodes,
        [newProjId]: [defaultRootNode]
      }
    }));

    setCopyTargetProjectId(newProjId);
  };

  const handleCreateGtdWorkflow = () => {
    const projectId = 'p-gtd-' + generateId();
    
    const defaultCategories: TagCategory[] = [];

    const newProject: Project = {
      id: projectId,
      name: "⚙️ Мой GTD Воркфлоу",
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tagCategories: defaultCategories
    };

    // GTD node IDs
    const rootId = 'node-root-' + generateId();
    const inboxId = 'gtd-inbox-' + generateId();
    const actionableId = 'gtd-wf-actionable-' + generateId();
    const somedayId = 'gtd-someday-' + generateId();
    const referenceId = 'gtd-reference-' + generateId();
    const timeId = 'gtd-wf-time-' + generateId();
    const doItId = 'gtd-wf-do-it-' + generateId();
    const delegateId = 'gtd-delegate-' + generateId();
    const nextActionsId = 'gtd-next-actions-' + generateId();

    const gtdNodes: TaskNode[] = [
      // 1. Root / Center Node
      {
        id: rootId,
        projectId: projectId,
        text: "⚙️ GTD Метод",
        x: -100,
        y: -300,
        parentId: null,
        priority: 'low',
        tags: ['Главная'],
        notes: "Интерактивная карта Getting Things Done (GTD). Слева направо: Входящие -> Анализ -> Действия / Делегирование / Справочник.",
        completed: false,
        files: [],
        color: '#6366f1'
      },

      // 2. Inbox Container
      {
        id: inboxId,
        projectId: projectId,
        text: "📥 ВХОДЯЩИЕ (INBOX)",
        x: -550,
        y: -100,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'low',
        tags: [],
        notes: "Сюда поступает все новое. Разбирайте регулярно!",
        completed: false,
        files: [],
        color: '#3b82f6',
        width: 320,
        height: 380,
        workflowConnections: [
          {
            id: 'conn-inbox-act-' + generateId(),
            fromSide: 'right',
            toNodeId: actionableId,
            toSide: 'left',
            text: 'Анализ ➡️'
          }
        ]
      },
      // Inbox Tasks
      {
        id: 'gtd-inbox-t1-' + generateId(),
        projectId: projectId,
        text: "📖 Прочесть статью о GTD и Майнд-Картах",
        x: -550,
        y: -150,
        parentId: inboxId,
        priority: 'medium',
        tags: ['Входящие'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-inbox-t2-' + generateId(),
        projectId: projectId,
        text: "🚗 Записаться на техобслуживание авто",
        x: -550,
        y: -80,
        parentId: inboxId,
        priority: 'low',
        tags: ['Входящие'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-inbox-t3-' + generateId(),
        projectId: projectId,
        text: "💡 Идея нового приложения для путешествий",
        x: -550,
        y: -10,
        parentId: inboxId,
        priority: 'low',
        tags: ['Входящие'],
        notes: '',
        completed: false,
        files: []
      },

      // 3. Workflow Decision "Actionable?"
      {
        id: actionableId,
        projectId: projectId,
        text: "❓ Требует действий?",
        x: -100,
        y: -100,
        parentId: null,
        isFloating: true,
        isWorkflowRectangle: true,
        workflowShape: 'rhomb',
        priority: 'low',
        tags: [],
        notes: "Примите решение: несет ли эта информация конкретные действия?",
        completed: false,
        files: [],
        color: '#a855f7',
        workflowConnections: [
          {
            id: 'conn-act-some-' + generateId(),
            fromSide: 'right',
            toNodeId: somedayId,
            toSide: 'left',
            text: 'Нет ➡️'
          },
          {
            id: 'conn-act-time-' + generateId(),
            fromSide: 'bottom',
            toNodeId: timeId,
            toSide: 'top',
            text: 'Да ⬇️'
          }
        ]
      },

      // 4. Someday/Maybe Container
      {
        id: somedayId,
        projectId: projectId,
        text: "💭 КОГДА-НИБУДЬ (SOMEDAY/MAYBE)",
        x: 350,
        y: -250,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'low',
        tags: [],
        notes: "Для задач без жестких сроков или долгосрочных мечтаний.",
        completed: false,
        files: [],
        color: '#ec4899',
        width: 300,
        height: 250
      },
      {
        id: 'gtd-some-t1-' + generateId(),
        projectId: projectId,
        text: "🎸 Научиться играть на электрогитаре",
        x: 350,
        y: -280,
        parentId: somedayId,
        priority: 'low',
        tags: ['Мечты'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-some-t2-' + generateId(),
        projectId: projectId,
        text: "✈️ Спланировать поездку в Исландию",
        x: 350,
        y: -210,
        parentId: somedayId,
        priority: 'low',
        tags: ['Мечты'],
        notes: '',
        completed: false,
        files: []
      },

      // 5. Reference Container
      {
        id: referenceId,
        projectId: projectId,
        text: "📚 СПРАВОЧНИК (REFERENCE)",
        x: 750,
        y: -250,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'low',
        tags: [],
        notes: "Просто информация для быстрого поиска и хранения.",
        completed: false,
        files: [],
        color: '#64748b',
        width: 300,
        height: 250
      },
      {
        id: 'gtd-ref-t1-' + generateId(),
        projectId: projectId,
        text: "🔑 Ссылка на базу знаний компании",
        x: 750,
        y: -280,
        parentId: referenceId,
        priority: 'low',
        tags: ['Справка'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-ref-t2-' + generateId(),
        projectId: projectId,
        text: "📋 Список кодов от ворот офиса",
        x: 750,
        y: -210,
        parentId: referenceId,
        priority: 'low',
        tags: ['Справка'],
        notes: '',
        completed: false,
        files: []
      },

      // 6. Workflow Step "Less than 2 min?"
      {
        id: timeId,
        projectId: projectId,
        text: "⏱️ Меньше 2 минут?",
        x: -100,
        y: 150,
        parentId: null,
        isFloating: true,
        isWorkflowRectangle: true,
        workflowShape: 'rhomb',
        priority: 'low',
        tags: [],
        notes: "Если задача простая и короткая, сделайте её сразу!",
        completed: false,
        files: [],
        color: '#f59e0b',
        workflowConnections: [
          {
            id: 'conn-time-do-' + generateId(),
            fromSide: 'left',
            toNodeId: doItId,
            toSide: 'right',
            text: 'Да ⬅️'
          },
          {
            id: 'conn-time-next-' + generateId(),
            fromSide: 'right',
            toNodeId: nextActionsId,
            toSide: 'left',
            text: 'Нет ➡️'
          },
          {
            id: 'conn-time-del-' + generateId(),
            fromSide: 'bottom',
            toNodeId: delegateId,
            toSide: 'top',
            text: 'Делегировать ⬇️'
          }
        ]
      },

      // 7. Workflow Step "Do It Immediately!"
      {
        id: doItId,
        projectId: projectId,
        text: "✅ Сделай прямо сейчас!",
        x: -380,
        y: 350,
        parentId: null,
        isFloating: true,
        isWorkflowRectangle: true,
        workflowShape: 'rectangle',
        priority: 'low',
        tags: [],
        notes: "Задачи до 2 минут делаются мгновенно, чтобы не тратить время на планирование.",
        completed: false,
        files: [],
        color: '#10b981'
      },

      // 8. Delegate Container
      {
        id: delegateId,
        projectId: projectId,
        text: "👥 ДЕЛЕГИРОВАНО (WAITING)",
        x: 200,
        y: 350,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'low',
        tags: [],
        notes: "Задачи, переданные команде или ожидающие ответа.",
        completed: false,
        files: [],
        color: '#f59e0b',
        width: 320,
        height: 300
      },
      {
        id: 'gtd-del-t1-' + generateId(),
        projectId: projectId,
        text: "👤 [Иван] Подготовить фин. отчет",
        x: 200,
        y: 300,
        parentId: delegateId,
        priority: 'high',
        tags: ['Делегировано'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-del-t2-' + generateId(),
        projectId: projectId,
        text: "👤 [Анна] Утвердить дизайн-макет",
        x: 200,
        y: 370,
        parentId: delegateId,
        priority: 'medium',
        tags: ['Делегировано'],
        notes: '',
        completed: false,
        files: []
      },

      // 9. Next Actions Container
      {
        id: nextActionsId,
        projectId: projectId,
        text: "⚡ СЛЕДУЮЩИЕ ДЕЙСТВИЯ",
        x: 750,
        y: 250,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'low',
        tags: [],
        notes: "Главный рабочий список следующих шагов.",
        completed: false,
        files: [],
        color: '#10b981',
        width: 320,
        height: 400
      },
      {
        id: 'gtd-next-t1-' + generateId(),
        projectId: projectId,
        text: "🔥 Подготовить ТЗ для веб-сайта",
        x: 750,
        y: 190,
        parentId: nextActionsId,
        priority: 'high',
        tags: ['Действие'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-next-t2-' + generateId(),
        projectId: projectId,
        text: "📞 Созвониться с клиентом по договору",
        x: 750,
        y: 260,
        parentId: nextActionsId,
        priority: 'medium',
        tags: ['Действие'],
        notes: '',
        completed: false,
        files: []
      },
      {
        id: 'gtd-next-t3-' + generateId(),
        projectId: projectId,
        text: "✉️ Ответить на важные письма в почте",
        x: 750,
        y: 330,
        parentId: nextActionsId,
        priority: 'low',
        tags: ['Действие'],
        notes: '',
        completed: false,
        files: []
      }
    ];

    setState(prev => ({
      ...prev,
      projects: [...prev.projects, newProject],
      nodes: {
        ...prev.nodes,
        [projectId]: gtdNodes
      },
      activeProjectId: projectId
    }));

    // Recenter nicely around the GTD flow
    setPanX(150);
    setPanY(150);
    setZoom(0.75);
    setSelectedNodeId(inboxId);
  };

  const handleRenameProject = (id: string, name: string) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p)
    }));
  };

  const handleDeleteProject = (id: string) => {
    logDeletion('project', id);
    // Log deletions of all task nodes that belong to this deleted project
    const projectNodes = state.nodes[id] || [];
    projectNodes.forEach(node => logDeletion('node', node.id));

    setState(prev => {
      const remainingProjects = prev.projects.filter(p => p.id !== id);
      const nextActiveId = remainingProjects.length > 0 ? remainingProjects[0].id : null;
      
      const copyNodes = { ...prev.nodes };
      delete copyNodes[id];

      return {
        ...prev,
        projects: remainingProjects,
        nodes: copyNodes,
        activeProjectId: nextActiveId
      };
    });
    setSelectedNodeId(null);
  };

  const handleMoveProject = (id: string, folderId: string | null) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, folderId, updatedAt: new Date().toISOString() } : p)
    }));
  };

  // ----- TAG CATEGORY OPERATIONS -----
  const handleCreateTagCategory = (name: string, color: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => {
      const projectIndex = prev.projects.findIndex(p => p.id === pid);
      if (projectIndex === -1) return prev;

      const newCat: TagCategory = {
        id: 'cat-' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        name,
        color,
        tags: [],
        updatedAt: new Date().toISOString()
      };

      const updatedProjects = [...prev.projects];
      const project = { ...updatedProjects[projectIndex] };
      project.tagCategories = [...(project.tagCategories || []), newCat];
      project.updatedAt = new Date().toISOString();
      updatedProjects[projectIndex] = project;

      return {
        ...prev,
        projects: updatedProjects
      };
    });
  };

  const handleUpdateTagCategory = (id: string, name: string, color: string, tags: string[]) => {
    setState(prev => {
      const updatedProjects = prev.projects.map(p => {
        if (p.id !== prev.activeProjectId) return p;
        const cats = p.tagCategories || [];
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          tagCategories: cats.map(c => c.id === id ? { ...c, name, color, tags, updatedAt: new Date().toISOString() } : c)
        };
      });

      return {
        ...prev,
        projects: updatedProjects
      };
    });
  };

  const handleDeleteTagCategory = (id: string) => {
    logDeletion('tagCategory', id);
    setState(prev => {
      const updatedProjects = prev.projects.map(p => {
        if (p.id !== prev.activeProjectId) return p;
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          tagCategories: (p.tagCategories || []).filter(c => c.id !== id)
        };
      });

      return {
        ...prev,
        projects: updatedProjects
      };
    });
  };


  // ----- TASK NODE CANVAS OPERATIONS -----
  const activeNodes = state.activeProjectId ? (state.nodes[state.activeProjectId] || []) : [];

  const displayedNodesForViews = useMemo(() => {
    return activeNodes.filter(node => {
      // If we have a focused container, we want to see only tasks belonging to this container (or the container itself)
      if (focusedContainerId) {
        if (node.id !== focusedContainerId) {
          let isDescendant = false;
          let currentParentId = node.parentId;
          while (currentParentId) {
            if (currentParentId === focusedContainerId) {
              isDescendant = true;
              break;
            }
            const parent = activeNodes.find(n => n.id === currentParentId);
            currentParentId = parent ? parent.parentId : null;
          }
          if (!isDescendant) {
            return false;
          }
        }
      }

      // If we have a focused task, we want to see only the task itself and its descendants (subtasks) in all views
      if (focusedTaskId) {
        if (viewMode === 'canvas') {
          if (node.id !== focusedTaskId) {
            let isDescendant = false;
            let currentParentId = node.parentId;
            while (currentParentId) {
              if (currentParentId === focusedTaskId) {
                isDescendant = true;
                break;
              }
              const parent = activeNodes.find(n => n.id === currentParentId);
              currentParentId = parent ? parent.parentId : null;
            }
            if (!isDescendant) {
              return false;
            }
          }
        } else {
          // If we change the view (viewMode !== 'canvas'), show ONLY its direct child tasks (subtasks)
          return node.parentId === focusedTaskId;
        }
      }

      // We no longer hide container descendants here so they are visible on the main screen in all views.
      // MindMapCanvas handles its own canvas-specific container visibility filtering internally.

      if (filterStatus === "not_tasks") {
        return !!node.isNotTask;
      } else if (node.isNotTask && viewMode !== 'canvas') {
        return false;
      }

      if (viewMode !== 'canvas' && node.isWorkflowRectangle) {
        return false;
      }

      if (filterStatus === "archived") {
        return !!node.archived;
      }
      
      const isSearching = searchQuery.trim() !== "";
      if (isSearching && node.archived) {
        // Find archived nodes in all views EXCEPT 'canvas' and container tasks
        const parentIsContainer = node.parentId ? activeNodes.find(p => p.id === node.parentId)?.isContainer : false;
        if (viewMode === 'canvas' || node.isContainer || parentIsContainer) {
          return false;
        }
        return true;
      }
      
      return !node.archived;
    });
  }, [activeNodes, filterStatus, searchQuery, viewMode, focusedContainerId, focusedTaskId]);

  // Single node or multi-node drag updating coordinates with simultaneous movement of all descendant nodes
  const handleUpdateNodeCoordinates = (id: string, x: number, y: number) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => {
      const projectNodes = prev.nodes[pid] || [];
      const targetNode = projectNodes.find(n => n.id === id);
      if (!targetNode) return prev;

      const dx = x - targetNode.x;
      const dy = y - targetNode.y;

      // If no actual changes, bypass to prevent unwanted re-renders
      if (dx === 0 && dy === 0) return prev;

      // Is this part of a multi-node drag?
      const isMultiDrag = selectedNodeIds && selectedNodeIds.includes(id);

      // Recursive / iterative check to see if a candidate is a descendant of the dragged node
      const isDescendant = (candidateId: string): boolean => {
        if (isMultiDrag) {
          if (selectedNodeIds.includes(candidateId)) return true;
          let currentId: string | null = candidateId;
          let iterations = 0;
          while (currentId !== null && iterations < 100) {
            iterations++;
            const current = projectNodes.find(n => n.id === currentId);
            if (!current) break;
            if (selectedNodeIds.includes(current.parentId || '')) return true;
            currentId = current.parentId;
          }
          return false;
        } else {
          if (candidateId === id) return true;
          let currentId: string | null = candidateId;
          let iterations = 0;
          while (currentId !== null && iterations < 100) {
            iterations++;
            const current = projectNodes.find(n => n.id === currentId);
            if (!current) break;
            if (current.parentId === id) return true;
            currentId = current.parentId;
          }
          return false;
        }
      };

      const updatedProjectNodes = projectNodes.map(n => {
        if (isDescendant(n.id)) {
          return {
            ...n,
            x: Math.round(n.id === id ? x : n.x + dx),
            y: Math.round(n.id === id ? y : n.y + dy)
          };
        }
        return n;
      });

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: updatedProjectNodes
        }
      };
    });
  };

  // Update node parent for nesting structure (dynamic hierarchy re-assignment)
  const handleUpdateNodeParent = (id: string, newParentId: string | null, newX?: number, newY?: number) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const outerNodesSnapshot = state.nodes[pid] || [];
    pushToUndo(pid, outerNodesSnapshot);

    setState(prev => {
      const currentNodes = prev.nodes[pid] || [];
      const parent = currentNodes.find(p => p.id === newParentId);
      const parentColor = parent ? parent.color : '';

      const isOverlapping = (tx: number, ty: number, nodeId: string) => {
        return currentNodes.some(other => {
          if (other.id === nodeId) return false;
          if (other.isContainer) {
            const halfW = (other.width || 520) / 2;
            const halfH = (other.height || 400) / 2;
            const dx = Math.abs(tx - other.x);
            const dy = Math.abs(ty - other.y);
            return dx < (halfW + 110) && dy < (halfH + 45);
          } else {
            const dx = Math.abs(tx - other.x);
            const dy = Math.abs(ty - other.y);
            return dx < 240 && dy < 90;
          }
        });
      };

      const targetNode = currentNodes.find(n => n.id === id);
      let isMirrorTriggered = false;
      let assignedMirrorGroupId = '';
      let mirrorCloneNode: TaskNode | null = null;
      let targetOldParent: TaskNode | null = null;

      if (targetNode) {
        const oldParentId = targetNode.parentId;
        const oldParent = oldParentId ? currentNodes.find(p => p.id === oldParentId) : null;
        targetOldParent = oldParent;
        const isOldParentSubtask = oldParent && !oldParent.isContainer;
        const isNewParentContainer = parent && parent.isContainer;

        if (isOldParentSubtask && isNewParentContainer) {
          isMirrorTriggered = true;
          assignedMirrorGroupId = targetNode.mirrorGroupId || `mirror-${targetNode.id}-${Date.now()}`;
        }
      }

      const updatedList = currentNodes.map(n => {
        if (n.id === id) {
          if (isMirrorTriggered) {
            // Keep original parent/coordinates, but add mirrorGroupId and update timestamp
            const updatedOriginal = {
              ...n,
              mirrorGroupId: assignedMirrorGroupId,
              mirrorParentId: targetOldParent ? targetOldParent.id : undefined,
              mirrorParentText: targetOldParent ? targetOldParent.text : undefined,
              updatedAt: new Date().toISOString()
            };

            // Compute mirror clone coordinates and container place
            let targetX = newX !== undefined ? newX : n.x;
            let targetY = newY !== undefined ? newY : n.y;
            let updatedContainerPlace = undefined;
            if (parent && parent.isContainer) {
              updatedContainerPlace = `${parent.text} (X: ${Math.round(parent.x)}, Y: ${Math.round(parent.y)})`;
            }

            mirrorCloneNode = {
              ...n,
              id: 'node-' + generateId(),
              x: Math.round(targetX),
              y: Math.round(targetY),
              parentId: newParentId,
              color: parentColor || n.color,
              isFloating: false,
              containerPlace: updatedContainerPlace,
              mirrorGroupId: assignedMirrorGroupId,
              mirrorParentId: targetOldParent ? targetOldParent.id : undefined,
              mirrorParentText: targetOldParent ? targetOldParent.text : undefined,
              updatedAt: new Date().toISOString()
            };

            return updatedOriginal;
          }

          // Calculate non-overlapping coordinates if re-parented to a non-container task node
          let targetX = newX !== undefined ? newX : n.x;
          let targetY = newY !== undefined ? newY : n.y;
          
          const isNewParent = n.parentId !== newParentId;

          if (newParentId !== null && parent && !parent.isContainer && isNewParent) {
            // New attachment of child task to parent task node!
            // Let's find an empty slot around the parent to prevent overlap/intersection
            const isLeft = parent.x < 0;
            const baseDx = isLeft ? -250 : 250;
            
            let foundX = parent.x + baseDx;
            let foundY = parent.y;
            let found = false;
            
            const yMultiplier = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8];
            const xOffsets = [0, 40, -40, 80, -80, 120, -120];
            
            for (const xOff of xOffsets) {
              const tx = parent.x + baseDx + (isLeft ? -xOff : xOff);
              for (const ym of yMultiplier) {
                const ty = parent.y + ym * 100;
                if (!isOverlapping(tx, ty, id)) {
                  foundX = tx;
                  foundY = ty;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            
            if (!found) {
              const siblingCount = currentNodes.filter(sib => sib.parentId === parent.id && sib.id !== id).length;
              foundX = parent.x + baseDx;
              foundY = parent.y + (siblingCount + 1) * 100;
            }
            
            targetX = foundX;
            targetY = foundY;
          } else if (newX === undefined && newY === undefined) {
            if (parent && !parent.isContainer) {
              const isLeft = parent.x < 0 || (parent.x === 0 && (currentNodes.filter(sib => sib.parentId === parent.id && sib.id !== id).length % 2 !== 0));
              targetX = parent.x + (isLeft ? -250 : 250);
              
              const siblings = currentNodes.filter(sib => sib.parentId === parent.id && sib.id !== id);
              if (siblings.length > 0) {
                const k = siblings.length;
                const sign = k % 2 === 0 ? 1 : -1;
                const factor = Math.floor((k + 1) / 2);
                targetY = parent.y + factor * 95 * sign;
              } else {
                targetY = parent.y;
              }
            } else if (parent && parent.isContainer) {
              // Keep exactly where dropped on the canvas as requested!
              targetX = n.x;
              targetY = n.y;
            }
          }

          const isInitiallyRoot = n.parentId === null && !n.isFloating;
          const updatedIsFloating = isInitiallyRoot ? false : (newParentId === null);

          // If parent is a container, update containerPlace property on the task node
          let updatedContainerPlace = n.containerPlace;
          if (parent && parent.isContainer) {
            updatedContainerPlace = `${parent.text} (X: ${Math.round(parent.x)}, Y: ${Math.round(parent.y)})`;
          } else if (newParentId === null) {
            updatedContainerPlace = undefined;
          }

          return {
            ...n,
            x: Math.round(targetX),
            y: Math.round(targetY),
            parentId: newParentId,
            color: parentColor || n.color,
            isFloating: updatedIsFloating,
            containerPlace: updatedContainerPlace
          };
        }
        return n;
      });

      let finalList = updatedList;
      if (mirrorCloneNode) {
        finalList = [...updatedList, mirrorCloneNode];
      }

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion(finalList)
        }
      };
    });
  };

  // Add multiple generated nodes from Gemini AI
  const handleAddMultipleNodes = (newNodes: TaskNode[]) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: syncCompletion([...currentNodes, ...newNodes])
      }
    }));
  };

  // Add child branching node beautifully
  const handleAddChildNode = (parentId: string, preventSelection = false) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const parent = currentNodes.find(n => n.id === parentId);
    if (!parent) return;

    // Organic layout coordinate calculations
    let newX = parent.x + 240;
    let newY = parent.y;

    if (parent.parentId === null) {
      // Branch is branching directly off the root node or a floating node. We balance sides left vs right!
      const siblingCount = currentNodes.filter(n => n.parentId === parentId).length;
      const isLeft = siblingCount % 2 !== 0;
      newX = parent.x + (isLeft ? -260 : 260);
      
      // cascade vertical index
      const sign = siblingCount % 4 < 2 ? -1 : 1;
      newY = parent.y + (Math.floor(siblingCount / 2) + 1) * 90 * sign;
    } else {
      // Branching off a sub-node: inherit left vs right direction perfectly to avoid overlay overlap
      const isParentLeft = parent.x < 0;
      newX = parent.x + (isParentLeft ? -240 : 240);
      newY = parent.y + (Math.random() - 0.5) * 140; // vertical scatter
    }

    const newChild: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: 'Новая подзадача',
      x: Math.round(newX),
      y: Math.round(newY),
      parentId: parentId,
      priority: 'low',
      tags: [],
      notes: '',
      completed: false,
      files: [],
      color: parent.color || '',
      estimatedTime: 30
    };

    setState(prev => {
      const current = prev.nodes[pid] || [];
      const parentNodeIndex = current.findIndex(n => n.id === parentId);
      const nodesCopy = [...current];
      if (parentNodeIndex !== -1) {
        nodesCopy[parentNodeIndex] = {
          ...nodesCopy[parentNodeIndex],
          isCardCollapsed: false,
          updatedAt: new Date().toISOString()
        };
      }
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion([...nodesCopy, newChild])
        }
      };
    });

    // Check if the parent node or any of its ancestors are collapsed
    let isParentOrAncestorCollapsed = !!parent.collapsed;
    let currParentId = parent.parentId;
    while (currParentId !== null && !isParentOrAncestorCollapsed) {
      const ancestor = currentNodes.find(n => n.id === currParentId);
      if (!ancestor) break;
      if (ancestor.collapsed) {
        isParentOrAncestorCollapsed = true;
      }
      currParentId = ancestor.parentId;
    }

    // Smoothly pan/recenter the viewport around the new node so it is fully visible on screen,
    // but ONLY if the parent branch is not collapsed (if collapsed, the child is invisible on the map canvas)
    if (!isParentOrAncestorCollapsed && !preventSelection) {
      setPanX(-Math.round(newX) * zoom);
      setPanY(-Math.round(newY) * zoom);
    }

    // Set lastCreatedNodeId so the new child node gets inline editing focused on the map,
    // and set selectedNodeId to the new child so it is focused/selected
    if (!preventSelection) {
      setLastCreatedNodeId(newChild.id);
      setSelectedNodeId(newChild.id);
      setIsDrawerOpen(true);
    }
  };

  // Add a fully independent task inside the temporary off-canvas INBOX container
  const handleAddInboxTask = (text: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = [...(state.nodes[pid] || [])];
    pushToUndo(pid, currentNodes);

    // Find the container node representing INBOX
    let inboxContainer = currentNodes.find(n => n.isContainer && (n.text.includes('INBOX') || n.text.includes('ВХОДЯЩИЕ')));
    let finalParentId = 'inbox';
    let posX = 0;
    let posY = 0;

    if (inboxContainer) {
      finalParentId = inboxContainer.id;
      posX = inboxContainer.x + (Math.random() - 0.5) * 40;
      posY = inboxContainer.y + (Math.random() - 0.5) * 40;
    } else {
      // Create a container named "📥 ВХОДЯЩИЕ (INBOX)" first!
      const newContainerId = 'gtd-inbox-' + generateId();
      inboxContainer = {
        id: newContainerId,
        projectId: pid,
        text: "📥 ВХОДЯЩИЕ (INBOX)",
        x: -500,
        y: -100,
        parentId: null,
        isFloating: true,
        isContainer: true,
        priority: 'none',
        tags: [],
        notes: "Контейнер Входящих задач.",
        completed: false,
        files: []
      };
      finalParentId = newContainerId;
      posX = -500;
      posY = -100;
      currentNodes.push(inboxContainer);
    }

    const newInboxNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: text.trim(),
      x: posX,
      y: posY,
      parentId: finalParentId,
      isFloating: true,
      priority: 'none',
      tags: ['Входящие'],
      notes: 'Эта задача была записана во Входящие (INBOX).',
      completed: false,
      files: [],
      estimatedTime: suggestEstimatedTime(text, Object.values(state.nodes).flat() as TaskNode[]) ?? 30
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newInboxNode]
      }
    }));

    setSelectedNodeId(newInboxNode.id);
    setIsDrawerOpen(true);
    setLastCreatedNodeId(newInboxNode.id);
  };

  // Add a fully independent floating node anywhere on the canvas
  const handleAddFloatingNode = (x: number, y: number, parentId: string | null = null, customText?: string, extraFields?: Partial<TaskNode>) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const isInsideContainer = parentId !== null;

    let targetX = Math.round(x);
    let targetY = Math.round(y);

    if (parentId && !extraFields?.useExactCoordinates) {
      const parentNode = currentNodes.find(n => n.id === parentId);
      if (parentNode) {
        // Find a beautiful non-overlapping position radially on the appropriate side
        let bestX = parentNode.x;
        let bestY = parentNode.y;
        let found = false;

        let preferredDirection: 'left' | 'right' = 'right';
        if (parentNode.parentId) {
          const grandparentNode = currentNodes.find(n => n.id === parentNode.parentId);
          if (grandparentNode) {
            preferredDirection = parentNode.x < grandparentNode.x ? 'left' : 'right';
          }
        } else {
          // For root nodes, balance children left and right based on existing count
          const existingChildren = currentNodes.filter(n => n.parentId === parentNode.id && !n.archived);
          preferredDirection = existingChildren.length % 2 === 0 ? 'right' : 'left';
        }

        // Generate fan of angles in front of the parent node's direction
        const angles: number[] = [];
        const numAngles = 18;
        const maxAngleSpread = (80 * Math.PI) / 180; // +/- 80 degrees from horizontal

        if (preferredDirection === 'right') {
          for (let i = 0; i < numAngles; i++) {
            const angle = -maxAngleSpread + (i * 2 * maxAngleSpread) / (numAngles - 1);
            angles.push(angle);
          }
        } else {
          for (let i = 0; i < numAngles; i++) {
            const angle = Math.PI - maxAngleSpread + (i * 2 * maxAngleSpread) / (numAngles - 1);
            angles.push(angle);
          }
        }

        // Try radiuses from 220 to 1020 in steps of 80 to keep it compact but clean
        for (let r = 220; r <= 1020 && !found; r += 80) {
          for (const angle of angles) {
            const candX = Math.round(parentNode.x + r * Math.cos(angle));
            const candY = Math.round(parentNode.y + r * Math.sin(angle));

            // Check if candX, candY overlaps with any existing non-archived node in currentNodes
            const overlap = currentNodes.some(n => {
              if (n.archived) return false;
              // determine width and height
              const w1 = 210; // candidate width
              const h1 = 70;  // candidate height
              const w2 = n.width || (n.isContainer ? 520 : (n.isWorkflowRectangle ? 170 : 210));
              const h2 = n.height || (n.isContainer ? 400 : (n.isWorkflowRectangle ? 70 : 70));

              // Check bounding box overlap with extra padding/gap
              const horizontalGap = 40;
              const verticalGap = 30;
              const isOverlapping = 
                Math.abs(candX - n.x) < (w1 + w2) / 2 + horizontalGap &&
                Math.abs(candY - n.y) < (h1 + h2) / 2 + verticalGap;
              return isOverlapping;
            });

            if (!overlap) {
              bestX = candX;
              bestY = candY;
              found = true;
              break;
            }
          }
        }

        if (!found) {
          bestX = Math.round(parentNode.x + (preferredDirection === 'right' ? 220 : -220));
          bestY = Math.round(parentNode.y);
        }

        targetX = bestX;
        targetY = bestY;
      }
    }

    const newFloatingNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: customText?.trim() || (isInsideContainer ? 'Новая подзадача' : 'Новая задача'),
      x: targetX,
      y: targetY,
      parentId: parentId, // can be a container or branch root
      isFloating: !isInsideContainer,
      priority: 'low',
      tags: [],
      notes: customText?.trim()
        ? `Задача была продиктована голосом: "${customText.trim()}"`
        : '',
      completed: false,
      files: [],
      color: isInsideContainer ? '#3b82f6' : '#10b981', // Blue inside container, green otherwise
      estimatedTime: customText ? (suggestEstimatedTime(customText, Object.values(state.nodes).flat() as TaskNode[]) ?? 30) : 30,
      ...extraFields
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newFloatingNode]
      }
    }));

    // Auto select the new floating node and open properties so user can rename/configure instantly
    setSelectedNodeId(newFloatingNode.id);
    setIsDrawerOpen(true);
    setLastCreatedNodeId(newFloatingNode.id);
  };

  // Add a fully independent styled container box anywhere on the canvas (supports parenting)
  const handleAddContainerNode = (x: number, y: number, parentId: string | null = null) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    // If there is a parent container, set its color or position offset slightly if needed
    const parentContainer = parentId ? currentNodes.find(n => n.id === parentId) : null;
    const initialColor = parentContainer ? parentContainer.color : '#f59e0b';

    const newContainerNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: 'Новая Область',
      x: Math.round(x),
      y: Math.round(y),
      parentId: parentId, // support adding inside a parent container
      isFloating: true,
      isContainer: true,
      priority: 'low',
      tags: [],
      notes: '',
      completed: false,
      files: [],
      color: initialColor
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newContainerNode]
      }
    }));

    // Auto select the new container node so user can rename instantly!
    setSelectedNodeId(newContainerNode.id);
    setIsDrawerOpen(true);
    setLastCreatedNodeId(newContainerNode.id);
  };

  // ----- BULK MULTIPLE SELECTION OPERATIONS -----
  const handleToggleSelectNode = (id: string) => {
    setSelectedNodeIds(prev => 
      prev.includes(id) ? prev.filter(nid => nid !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (ids: string[]) => {
    setSelectedNodeIds(prev => {
      const allSelected = ids.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !ids.includes(id));
      } else {
        return Array.from(new Set([...prev, ...ids]));
      }
    });
  };

  const handleBulkDelete = () => {
    const pid = state.activeProjectId;
    if (!pid || selectedNodeIds.length === 0) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const collectIdsToDelete = (targetId: string, list: string[] = []): string[] => {
      list.push(targetId);
      const children = currentNodes.filter(n => n.parentId === targetId);
      children.forEach(child => collectIdsToDelete(child.id, list));
      return list;
    };

    const allIdsToDelete: string[] = [];
    selectedNodeIds.forEach(id => {
      collectIdsToDelete(id, allIdsToDelete);
    });

    const uniqueIdsToDelete = Array.from(new Set(allIdsToDelete));
    uniqueIdsToDelete.forEach(nid => logDeletion('node', nid));

    setState(prev => {
      const remainingNodes = currentNodes.filter(n => !uniqueIdsToDelete.includes(n.id));
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion(remainingNodes)
        }
      };
    });

    setSelectedNodeIds([]);
    if (selectedNodeId && uniqueIdsToDelete.includes(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  };

  const handleBulkToggleCompleted = (completed: boolean) => {
    const pid = state.activeProjectId;
    if (!pid || selectedNodeIds.length === 0) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    let updatedNodes = [...currentNodes];
    selectedNodeIds.forEach(id => {
      updatedNodes = toggleNodeAndDescendants(id, completed, updatedNodes);
    });

    const synced = syncCompletion(updatedNodes);

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: synced
      }
    }));
  };

  const handleBulkChangePriority = (priority: Priority) => {
    const pid = state.activeProjectId;
    if (!pid || selectedNodeIds.length === 0) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const updatedNodes = currentNodes.map(n => {
      if (selectedNodeIds.includes(n.id)) {
        return { ...n, priority, updatedAt: new Date().toISOString() };
      }
      return n;
    });

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: updatedNodes
      }
    }));
  };

  const handlePerformCopy = (sourceNodeIds: string[], targetProjId: string, switchProject: boolean = true) => {
    const sourceProjId = state.activeProjectId;
    if (!sourceProjId || !targetProjId) return;

    const sourceNodes = state.nodes[sourceProjId] || [];
    const targetNodes = state.nodes[targetProjId] || [];

    // If sourceNodeIds is empty, we copy ALL non-archived nodes of the current project!
    const nodesToCopy = sourceNodeIds.length === 0 
      ? sourceNodes.filter(n => !n.archived)
      : sourceNodes.filter(n => sourceNodeIds.includes(n.id));

    if (nodesToCopy.length === 0) return;

    // Create a mapping of old ID -> new ID to maintain internal parent-child relationships
    const idMap = new Map<string, string>();
    nodesToCopy.forEach(n => {
      idMap.set(n.id, 'node-' + generateId());
    });

    const duplicatedNodes = nodesToCopy.map(n => {
      const newId = idMap.get(n.id)!;
      
      let newParentId: string | null = null;
      if (n.parentId && idMap.has(n.parentId)) {
        newParentId = idMap.get(n.parentId)!;
      } else if (n.parentId && n.parentId === 'inbox') {
        newParentId = 'inbox';
      } else if (n.parentId && targetProjId === sourceProjId) {
        newParentId = n.parentId;
      }

      // Symmetrical position adjustment: if copying to the SAME project, offset coordinates slightly to avoid direct overlaps!
      const offset = targetProjId === sourceProjId ? 50 : 0;

      // Update workflow connections internal links
      const updatedWorkflowConnections = n.workflowConnections?.map(wc => {
        return {
          ...wc,
          id: 'conn-' + generateId(),
          toNodeId: idMap.has(wc.toNodeId) ? idMap.get(wc.toNodeId)! : wc.toNodeId
        };
      });

      return {
        ...n,
        id: newId,
        projectId: targetProjId,
        parentId: newParentId,
        x: n.x + offset,
        y: n.y + offset,
        workflowConnections: updatedWorkflowConnections,
        updatedAt: new Date().toISOString()
      };
    });

    pushToUndo(targetProjId, targetNodes);

    setState(prev => {
      const prevTargetNodes = prev.nodes[targetProjId] || [];
      const mergedNodes = syncCompletion([...prevTargetNodes, ...duplicatedNodes]);
      return {
        ...prev,
        activeProjectId: switchProject ? targetProjId : prev.activeProjectId,
        nodes: {
          ...prev.nodes,
          [targetProjId]: mergedNodes
        }
      };
    });

    // Reset selection and close modal
    setSelectedNodeIds([]);
    setIsMultiSelectMode(false);
    setIsCopyModalOpen(false);
  };

  const handleDuplicateProject = (projectId: string) => {
    const projectToCopy = state.projects.find(p => p.id === projectId);
    if (!projectToCopy) return;

    const newProjectId = 'proj-' + generateId();
    const newProjectName = `${projectToCopy.name} (Копия)`;

    const newProject: Project = {
      ...projectToCopy,
      id: newProjectId,
      name: newProjectName,
      updatedAt: new Date().toISOString()
    };

    // Copy all nodes in this project
    const originalNodes = state.nodes[projectId] || [];
    const idMap = new Map<string, string>();
    originalNodes.forEach(n => {
      idMap.set(n.id, 'node-' + generateId());
    });

    const duplicatedNodes = originalNodes.map(n => {
      const newId = idMap.get(n.id)!;
      let newParentId: string | null = null;
      if (n.parentId && idMap.has(n.parentId)) {
        newParentId = idMap.get(n.parentId)!;
      } else if (n.parentId && n.parentId === 'inbox') {
        newParentId = 'inbox';
      }

      const updatedWorkflowConnections = n.workflowConnections?.map(wc => {
        return {
          ...wc,
          id: 'conn-' + generateId(),
          toNodeId: idMap.has(wc.toNodeId) ? idMap.get(wc.toNodeId)! : wc.toNodeId
        };
      });

      return {
        ...n,
        id: newId,
        projectId: newProjectId,
        parentId: newParentId,
        workflowConnections: updatedWorkflowConnections,
        updatedAt: new Date().toISOString()
      };
    });

    setState(prev => {
      return {
        ...prev,
        projects: [...prev.projects, newProject],
        nodes: {
          ...prev.nodes,
          [newProjectId]: syncCompletion(duplicatedNodes)
        }
      };
    });

    // Automatically select the new duplicated project
    handleSelectProject(newProjectId);
  };

  const handleBulkAddTag = (tag: string) => {
    const pid = state.activeProjectId;
    if (!pid || !tag.trim() || selectedNodeIds.length === 0) return;

    const cleanTag = tag.trim();
    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const updatedNodes = currentNodes.map(n => {
      if (selectedNodeIds.includes(n.id)) {
        const existingTags = n.tags || [];
        if (!existingTags.includes(cleanTag)) {
          return { 
            ...n, 
            tags: [...existingTags, cleanTag],
            updatedAt: new Date().toISOString()
          };
        }
      }
      return n;
    });

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: updatedNodes
      }
    }));
  };

  // Recursive deletion of subnodes to avoid orphan paths in mapping svg
  const handleDeleteNode = (id: string, skipConfirm = false) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    const targetNode = currentNodes.find(n => n.id === id);

    pushToUndo(pid, currentNodes);

    // Collect list of ids to delete (target + children recursively)
    const collectIdsToDelete = (targetId: string, list: string[] = []): string[] => {
      list.push(targetId);
      const children = currentNodes.filter(n => n.parentId === targetId);
      children.forEach(child => collectIdsToDelete(child.id, list));
      return list;
    };

    const idsToDelete = collectIdsToDelete(id);
    idsToDelete.forEach(nid => logDeletion('node', nid));

    setState(prev => {
      const remainingNodes = currentNodes.filter(n => !idsToDelete.includes(n.id));
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion(remainingNodes)
        }
      };
    });

    if (selectedNodeId && idsToDelete.includes(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  };

  // Toggle node checked completed state
  const handleToggleNodeCompleted = (id: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => {
      const currentNodes = prev.nodes[pid] || [];
      const targetNode = currentNodes.find(n => n.id === id);
      if (!targetNode) return prev;

      const nextCompleted = !targetNode.completed;

      // Toggle state of node and recursively all of its descendants
      const updatedNodes = toggleNodeAndDescendants(id, nextCompleted, currentNodes);

      // Bottom up check to keep all container and task parent states consistent
      const syncedNodes = syncCompletion(updatedNodes);

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncedNodes
        }
      };
    });
  };

  // Toggle node collapsed state for sub-branch hiding
  const handleToggleNodeCollapse = (id: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: prev.nodes[pid].map(n => n.id === id ? { ...n, collapsed: !n.collapsed } : n)
      }
    }));
  };

  // Helpers for Personal Tag Category to Delegate Container rules
  const getPersonalTags = (stateVal: WorkspaceState, projectId: string): string[] => {
    const rootCats = stateVal.tagCategories || [];
    const project = stateVal.projects.find(p => p.id === projectId);
    const projCats = project?.tagCategories || [];
    const allCats = [...rootCats, ...projCats];
    const personalCats = allCats.filter(cat => cat && cat.name && cat.name.toLowerCase() === 'personal');
    return Array.from(new Set(personalCats.flatMap(cat => cat.tags || [])));
  };

  const findDelegateContainer = (nodesList: TaskNode[]): TaskNode | null => {
    return nodesList.find(n => 
      !!n.isContainer && 
      (n.text.toLowerCase().includes('delegate') || n.text.toLowerCase().includes('делегир'))
    ) || null;
  };

  const createDelegateContainer = (projectId: string, currentNodes: TaskNode[]): TaskNode => {
    const minX = currentNodes.length > 0 ? Math.min(...currentNodes.map(n => n.x)) : 0;
    const maxY = currentNodes.length > 0 ? Math.max(...currentNodes.map(n => n.y)) : 0;
    
    return {
      id: 'gtd-delegate-' + generateId(),
      projectId: projectId,
      text: "👥 ДЕЛЕГИРОВАНО (WAITING)",
      x: minX + 500,
      y: maxY + 200,
      parentId: null,
      isFloating: true,
      isContainer: true,
      priority: 'low',
      tags: [],
      notes: "Задачи, переданные команде или ожидающие ответа.",
      completed: false,
      files: [],
      color: '#f59e0b',
      width: 320,
      height: 300,
      updatedAt: new Date().toISOString()
    };
  };

  const getHemkarlarTags = (stateVal: WorkspaceState, projectId: string): string[] => {
    const rootCats = stateVal.tagCategories || [];
    const project = stateVal.projects.find(p => p.id === projectId);
    const projCats = project?.tagCategories || [];
    const allCats = [...rootCats, ...projCats];
    const hemkarlarCats = allCats.filter(cat => cat && cat.name && cat.name.toLowerCase() === 'hemkarlar');
    return Array.from(new Set(hemkarlarCats.flatMap(cat => cat.tags || [])));
  };

  const findWaitingContainer = (nodesList: TaskNode[]): TaskNode | null => {
    return nodesList.find(n => 
      !!n.isContainer && 
      (n.text.toLowerCase().includes('waiting') || n.text.toLowerCase().includes('ожида'))
    ) || null;
  };

  const createWaitingContainer = (projectId: string, currentNodes: TaskNode[]): TaskNode => {
    const minX = currentNodes.length > 0 ? Math.min(...currentNodes.map(n => n.x)) : 0;
    const maxY = currentNodes.length > 0 ? Math.max(...currentNodes.map(n => n.y)) : 0;
    
    return {
      id: 'gtd-waiting-' + generateId(),
      projectId: projectId,
      text: "⏳ WAITING",
      x: minX + 500,
      y: maxY + 200,
      parentId: null,
      isFloating: true,
      isContainer: true,
      priority: 'low',
      tags: [],
      notes: "Задачи, переданные партнерам/коллегам и ожидающие ответа.",
      completed: false,
      files: [],
      color: '#6366f1',
      width: 320,
      height: 300,
      updatedAt: new Date().toISOString()
    };
  };

  const processNewTaskForPersonalTags = (
    text: string,
    tags: string[],
    priority: Priority,
    parentId: string | null,
    dueDate: string | undefined,
    extraFields?: Partial<TaskNode>
  ): { finalNewNode: TaskNode; mirrorCloneNode: TaskNode | null; extraNodesToAdd: TaskNode[] } => {
    const pid = state.activeProjectId;
    const currentNodes = state.nodes[pid || ''] || [];
    
    // Auto-populate parentId based on current focus or active container filters if not explicitly provided
    let finalParentId = parentId;
    if (!finalParentId) {
      if (focusedTaskId) {
        finalParentId = focusedTaskId;
      } else if (focusedContainerId) {
        finalParentId = focusedContainerId;
      } else if (kanbanContainerFilterId && kanbanContainerFilterId !== 'all' && kanbanContainerFilterId !== 'no-container') {
        finalParentId = kanbanContainerFilterId;
      }
    }

    // Create the base new target node exactly as before
    const parentNode = finalParentId ? currentNodes.find(n => n.id === finalParentId) : null;
    const parentX = parentNode ? parentNode.x : 350;
    const parentY = parentNode ? parentNode.y : 350;
    
    // Auto-populate priority from filter if priority is 'none'
    let finalPriority = priority;
    if (finalPriority === 'none' && filterPriority !== 'all') {
      finalPriority = filterPriority as Priority;
    }

    // Auto-populate tags from active tag filter and/or active tag category filter
    const finalTags = [...tags];
    if (filterTag !== 'all' && !finalTags.includes(filterTag)) {
      finalTags.push(filterTag);
    }
    if (filterCategoryId && pid) {
      const activeProj = state.projects.find(p => p.id === pid);
      if (activeProj) {
        const cat = activeProj.tagCategories?.find(c => c.id === filterCategoryId);
        if (cat && cat.tags && cat.tags.length > 0) {
          const hasCatTag = finalTags.some(t => cat.tags.includes(t));
          if (!hasCatTag) {
            finalTags.push(cat.tags[0]);
          }
        }
      }
    }

    // Auto-populate due date based on active due date filters if not explicitly provided
    const getLocalDateString = (offsetDays = 0) => {
      const d = new Date();
      if (offsetDays !== 0) {
        d.setDate(d.getDate() + offsetDays);
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    let finalDueDate = dueDate;
    if (!finalDueDate && filterDueDate !== 'all') {
      if (filterDueDate === 'today') {
        finalDueDate = getLocalDateString(0);
      } else if (filterDueDate === 'tomorrow') {
        finalDueDate = getLocalDateString(1);
      } else if (filterDueDate === 'this_week') {
        finalDueDate = getLocalDateString(0);
      } else if (filterDueDate === 'has_due_date') {
        finalDueDate = getLocalDateString(0);
      } else if (filterDueDate === 'overdue') {
        finalDueDate = getLocalDateString(-1);
      }
    }

    // Auto-populate completed status based on active status filter if not explicitly provided
    let finalCompleted = false;
    if (extraFields && extraFields.completed !== undefined) {
      finalCompleted = extraFields.completed;
    } else if (filterStatus === 'completed') {
      finalCompleted = true;
    }

    // Auto-populate notes based on notes filter
    let finalNotes = '';
    if (filterNotes === 'has_notes') {
      finalNotes = 'Добавьте заметку здесь...';
    }

    const newTargetNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid || '',
      text,
      x: parentNode ? parentX + Math.random() * 100 : 350 + Math.random() * 200,
      y: parentNode ? parentY + 120 + Math.random() * 80 : 350 + Math.random() * 200,
      parentId: finalParentId,
      isFloating: finalParentId ? undefined : true,
      priority: finalPriority,
      tags: finalTags,
      notes: finalNotes,
      completed: finalCompleted,
      files: [],
      dueDate: finalDueDate,
      color: '#6366f1',
      estimatedTime: suggestEstimatedTime(text, Object.values(state.nodes).flat() as TaskNode[]) ?? 30,
      ...extraFields
    };

    const personalTags = getPersonalTags(state, pid || '');
    const hasPersonalTag = (newTargetNode.tags || []).some(tag => personalTags.includes(tag));

    const hemkarlarTags = getHemkarlarTags(state, pid || '');
    const hasHemkarlarTag = (newTargetNode.tags || []).some(tag => hemkarlarTags.includes(tag));

    if (!hasPersonalTag && !hasHemkarlarTag) {
      return { finalNewNode: newTargetNode, mirrorCloneNode: null, extraNodesToAdd: [] };
    }

    if (hasHemkarlarTag) {
      let waitingContainer = findWaitingContainer(currentNodes);
      const extraNodesToAdd: TaskNode[] = [];
      if (!waitingContainer) {
        waitingContainer = createWaitingContainer(pid || '', currentNodes);
        extraNodesToAdd.push(waitingContainer);
      }

      const assignedMirrorGroupId = `mirror-${newTargetNode.id}-${Date.now()}`;
      newTargetNode.mirrorGroupId = assignedMirrorGroupId;
      newTargetNode.updatedAt = new Date().toISOString();

      const parentColor = waitingContainer ? waitingContainer.color : '';
      const updatedContainerPlace = waitingContainer ? `${waitingContainer.text} (X: ${Math.round(waitingContainer.x)}, Y: ${Math.round(waitingContainer.y)})` : '';

      const mirrorCloneNode: TaskNode = {
        ...newTargetNode,
        id: 'node-' + generateId(),
        parentId: waitingContainer.id,
        color: parentColor || newTargetNode.color,
        isFloating: false,
        containerPlace: updatedContainerPlace,
        mirrorGroupId: assignedMirrorGroupId,
        mirrorParentId: parentNode ? parentNode.id : undefined,
        mirrorParentText: parentNode ? parentNode.text : undefined,
        updatedAt: new Date().toISOString()
      };

      return { finalNewNode: newTargetNode, mirrorCloneNode, extraNodesToAdd };
    }

    // Has a personal tag!
    let delegateContainer = findDelegateContainer(currentNodes);
    const extraNodesToAdd: TaskNode[] = [];
    if (!delegateContainer) {
      delegateContainer = createDelegateContainer(pid || '', currentNodes);
      extraNodesToAdd.push(delegateContainer);
    }

    const isSubtask = parentNode && !parentNode.isContainer && !parentNode.isWorkflowRectangle;

    if (isSubtask) {
      const assignedMirrorGroupId = `mirror-${newTargetNode.id}-${Date.now()}`;
      newTargetNode.mirrorGroupId = assignedMirrorGroupId;
      newTargetNode.mirrorParentId = parentNode ? parentNode.id : undefined;
      newTargetNode.mirrorParentText = parentNode ? parentNode.text : undefined;
      newTargetNode.updatedAt = new Date().toISOString();

      const parentColor = delegateContainer ? delegateContainer.color : '';
      const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

      const mirrorCloneNode: TaskNode = {
        ...newTargetNode,
        id: 'node-' + generateId(),
        parentId: delegateContainer.id,
        color: parentColor || newTargetNode.color,
        isFloating: false,
        containerPlace: updatedContainerPlace,
        mirrorGroupId: assignedMirrorGroupId,
        mirrorParentId: parentNode ? parentNode.id : undefined,
        mirrorParentText: parentNode ? parentNode.text : undefined,
        updatedAt: new Date().toISOString()
      };

      return { finalNewNode: newTargetNode, mirrorCloneNode, extraNodesToAdd };
    } else {
      const parentColor = delegateContainer ? delegateContainer.color : '';
      const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

      newTargetNode.parentId = delegateContainer.id;
      newTargetNode.isFloating = false;
      newTargetNode.color = parentColor || newTargetNode.color;
      newTargetNode.containerPlace = updatedContainerPlace;
      newTargetNode.updatedAt = new Date().toISOString();

      return { finalNewNode: newTargetNode, mirrorCloneNode: null, extraNodesToAdd };
    }
  };

  // Create a new task originating from the Kanban Board view
  const handleCreateKanbanTask = (text: string, initialTags: string[], initialPriority: Priority = 'none', parentId: string | null = null, dueDate?: string, extraFields?: Partial<TaskNode>) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const { finalNewNode, mirrorCloneNode, extraNodesToAdd } = processNewTaskForPersonalTags(
      text,
      initialTags,
      initialPriority,
      parentId,
      dueDate,
      extraFields
    );

    setState(prev => {
      const current = prev.nodes[pid] || [];
      const nodesToAdd = [finalNewNode];
      if (mirrorCloneNode) {
        nodesToAdd.push(mirrorCloneNode);
      }
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion([...current, ...extraNodesToAdd, ...nodesToAdd])
        }
      };
    });
    
    setSelectedNodeId(finalNewNode.id);
    setIsDrawerOpen(true);
    setLastCreatedNodeId(finalNewNode.id);
  };

  // Create a new task originating from the Mobile list view (TickTick style)
  const handleCreateMobileTask = (text: string, tags: string[], priority: Priority, dueDate?: string, parentId?: string | null, dueTime?: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const { finalNewNode, mirrorCloneNode, extraNodesToAdd } = processNewTaskForPersonalTags(
      text,
      tags,
      priority,
      parentId || null,
      dueDate,
      dueTime ? { dueTime } : undefined
    );

    setState(prev => {
      const current = prev.nodes[pid] || [];
      const nodesToAdd = [finalNewNode];
      if (mirrorCloneNode) {
        nodesToAdd.push(mirrorCloneNode);
      }
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion([...current, ...extraNodesToAdd, ...nodesToAdd])
        }
      };
    });

    setSelectedNodeId(finalNewNode.id);
    setIsDrawerOpen(true);
    setLastCreatedNodeId(finalNewNode.id);
  };

  // Single node attribute editor update
  const handleUpdateNode = (updatedNode: TaskNode) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => {
      const currentNodes = prev.nodes[pid] || [];
      const targetNode = currentNodes.find(n => n.id === updatedNode.id);
      
      let mirrorCloneNode: TaskNode | null = null;
      let assignedMirrorGroupId = '';
      let isMirrorTriggered = false;

      let adjustedUpdatedNode = { ...updatedNode };

      const newTags = updatedNode.tags || [];
      const oldTags = targetNode ? (targetNode.tags || []) : [];

      // --- INTEGRATE HEMKARLAR TAG LOGIC ---
      const hemkarlarTags = getHemkarlarTags(prev, pid);
      const hasHemkarlarTagNow = newTags.some(tag => hemkarlarTags.includes(tag));
      const hadHemkarlarTagBefore = oldTags.some(tag => hemkarlarTags.includes(tag));
      const newlyAddedHemkarlarTag = hasHemkarlarTagNow && (!targetNode || !hadHemkarlarTagBefore);

      if (newlyAddedHemkarlarTag) {
        let waitingContainer = findWaitingContainer(currentNodes);
        let updatedNodesWithContainer = [...currentNodes];
        if (!waitingContainer) {
          waitingContainer = createWaitingContainer(pid, currentNodes);
          updatedNodesWithContainer.push(waitingContainer);
        }

        const parentNode = updatedNode.parentId ? updatedNodesWithContainer.find(n => n.id === updatedNode.parentId) : null;

        assignedMirrorGroupId = updatedNode.mirrorGroupId || `mirror-${updatedNode.id}-${Date.now()}`;
        adjustedUpdatedNode = {
          ...updatedNode,
          mirrorGroupId: assignedMirrorGroupId,
          updatedAt: new Date().toISOString()
        };

        const parentColor = waitingContainer ? waitingContainer.color : '';
        const updatedContainerPlace = waitingContainer ? `${waitingContainer.text} (X: ${Math.round(waitingContainer.x)}, Y: ${Math.round(waitingContainer.y)})` : '';

        mirrorCloneNode = {
          ...adjustedUpdatedNode,
          id: 'node-' + generateId(),
          parentId: waitingContainer.id,
          color: parentColor || adjustedUpdatedNode.color,
          isFloating: false,
          containerPlace: updatedContainerPlace,
          mirrorGroupId: assignedMirrorGroupId,
          mirrorParentId: parentNode ? parentNode.id : undefined,
          mirrorParentText: parentNode ? parentNode.text : undefined,
          updatedAt: new Date().toISOString()
        };

        let updatedList = updatedNodesWithContainer.map(n => n.id === adjustedUpdatedNode.id ? adjustedUpdatedNode : n);
        if (mirrorCloneNode) {
          updatedList = [...updatedList, mirrorCloneNode];
        }

        if (targetNode && targetNode.completed !== adjustedUpdatedNode.completed) {
          updatedList = toggleNodeAndDescendants(adjustedUpdatedNode.id, adjustedUpdatedNode.completed, updatedList);
        }

        if (targetNode && targetNode.archived !== adjustedUpdatedNode.archived) {
          updatedList = toggleNodeArchive(adjustedUpdatedNode.id, !!adjustedUpdatedNode.archived, updatedList);
        }

        const syncedNodes = syncCompletion(updatedList);

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [pid]: syncedNodes
          }
        };
      }
      // --- END INTEGRATE HEMKARLAR TAG LOGIC ---

      // --- INTEGRATE PERSONAL TAG LOGIC ---
      const personalTags = getPersonalTags(prev, pid);
      const hasPersonalTagNow = newTags.some(tag => personalTags.includes(tag));
      const hadPersonalTagBefore = oldTags.some(tag => personalTags.includes(tag));
      const newlyAddedPersonalTag = hasPersonalTagNow && (!targetNode || !hadPersonalTagBefore);

      if (newlyAddedPersonalTag) {
        let delegateContainer = findDelegateContainer(currentNodes);
        let updatedNodesWithContainer = [...currentNodes];
        if (!delegateContainer) {
          delegateContainer = createDelegateContainer(pid, currentNodes);
          updatedNodesWithContainer.push(delegateContainer);
        }

        const parentNode = updatedNode.parentId ? updatedNodesWithContainer.find(n => n.id === updatedNode.parentId) : null;
        const isSubtask = parentNode && !parentNode.isContainer && !parentNode.isWorkflowRectangle;

        if (isSubtask) {
          assignedMirrorGroupId = updatedNode.mirrorGroupId || `mirror-${updatedNode.id}-${Date.now()}`;
          adjustedUpdatedNode = {
            ...updatedNode,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: parentNode ? parentNode.id : undefined,
            mirrorParentText: parentNode ? parentNode.text : undefined,
            updatedAt: new Date().toISOString()
          };

          const parentColor = delegateContainer ? delegateContainer.color : '';
          const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

          mirrorCloneNode = {
            ...adjustedUpdatedNode,
            id: 'node-' + generateId(),
            parentId: delegateContainer.id,
            color: parentColor || adjustedUpdatedNode.color,
            isFloating: false,
            containerPlace: updatedContainerPlace,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: parentNode ? parentNode.id : undefined,
            mirrorParentText: parentNode ? parentNode.text : undefined,
            updatedAt: new Date().toISOString()
          };
        } else {
          const parentColor = delegateContainer ? delegateContainer.color : '';
          const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

          adjustedUpdatedNode = {
            ...updatedNode,
            parentId: delegateContainer.id,
            isFloating: false,
            color: parentColor || updatedNode.color,
            containerPlace: updatedContainerPlace,
            updatedAt: new Date().toISOString()
          };
        }

        let updatedList = updatedNodesWithContainer.map(n => n.id === adjustedUpdatedNode.id ? adjustedUpdatedNode : n);
        if (mirrorCloneNode) {
          updatedList = [...updatedList, mirrorCloneNode];
        }

        if (targetNode && targetNode.completed !== adjustedUpdatedNode.completed) {
          updatedList = toggleNodeAndDescendants(adjustedUpdatedNode.id, adjustedUpdatedNode.completed, updatedList);
        }

        if (targetNode && targetNode.archived !== adjustedUpdatedNode.archived) {
          updatedList = toggleNodeArchive(adjustedUpdatedNode.id, !!adjustedUpdatedNode.archived, updatedList);
        }

        const syncedNodes = syncCompletion(updatedList);

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [pid]: syncedNodes
          }
        };
      }
      // --- END INTEGRATE PERSONAL TAG LOGIC ---

      if (targetNode) {
        const oldParentId = targetNode.parentId;
        const oldParent = oldParentId ? currentNodes.find(p => p.id === oldParentId) : null;
        const isOldParentSubtask = oldParent && !oldParent.isContainer;

        const newParentId = updatedNode.parentId;
        const newParent = newParentId ? currentNodes.find(p => p.id === newParentId) : null;
        const isNewParentContainer = newParent && newParent.isContainer;

        if (isOldParentSubtask && isNewParentContainer) {
          isMirrorTriggered = true;
          assignedMirrorGroupId = targetNode.mirrorGroupId || `mirror-${targetNode.id}-${Date.now()}`;
          
          adjustedUpdatedNode = {
            ...updatedNode,
            parentId: targetNode.parentId,
            x: targetNode.x,
            y: targetNode.y,
            isFloating: targetNode.isFloating,
            containerPlace: targetNode.containerPlace,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: oldParent ? oldParent.id : undefined,
            mirrorParentText: oldParent ? oldParent.text : undefined
          };

          const parentColor = newParent ? newParent.color : '';
          const updatedContainerPlace = `${newParent.text} (X: ${Math.round(newParent.x)}, Y: ${Math.round(newParent.y)})`;

          mirrorCloneNode = {
            ...updatedNode,
            id: 'node-' + generateId(),
            parentId: newParentId,
            color: parentColor || updatedNode.color,
            isFloating: false,
            containerPlace: updatedContainerPlace,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: oldParent ? oldParent.id : undefined,
            mirrorParentText: oldParent ? oldParent.text : undefined,
            updatedAt: new Date().toISOString()
          };
        }
      }

      const nodeWithTimeStamp = {
        ...adjustedUpdatedNode,
        updatedAt: new Date().toISOString()
      };

      if (targetNode && targetNode.text !== adjustedUpdatedNode.text) {
        const isPlaceholder = (t: string) => {
          const lower = t.toLowerCase();
          return lower.includes('новая подзадача') || lower.includes('плавающая задача') || lower.includes('новые задачи') || lower.includes('новый контейнер') || lower.includes('новая задача') || t.trim() === '';
        };

        const wasPlaceholder = isPlaceholder(targetNode.text);
        const isNowPlaceholder = isPlaceholder(adjustedUpdatedNode.text);

        if ((wasPlaceholder && !isNowPlaceholder) || adjustedUpdatedNode.estimatedTime === 30 || adjustedUpdatedNode.estimatedTime === undefined) {
          const allWorkspaceNodes = Object.values(prev.nodes).flat();
          const suggested = suggestEstimatedTime(adjustedUpdatedNode.text, allWorkspaceNodes);
          if (suggested !== undefined) {
            nodeWithTimeStamp.estimatedTime = suggested;
          }
        }
      }

      let updatedList = currentNodes.map(n => n.id === adjustedUpdatedNode.id ? nodeWithTimeStamp : n);
      if (mirrorCloneNode) {
        updatedList = [...updatedList, mirrorCloneNode];
      }
      
      // If completed state was toggled from details panel, sync all descendants
      if (targetNode && targetNode.completed !== adjustedUpdatedNode.completed) {
        updatedList = toggleNodeAndDescendants(adjustedUpdatedNode.id, adjustedUpdatedNode.completed, updatedList);
      }

      // If archived state was toggled, sync all descendants
      if (targetNode && targetNode.archived !== adjustedUpdatedNode.archived) {
        updatedList = toggleNodeArchive(adjustedUpdatedNode.id, !!adjustedUpdatedNode.archived, updatedList);
      }

      // Automatically reconcile bottom-up completion constraints
      const syncedNodes = syncCompletion(updatedList);

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncedNodes
        }
      };
    });
  };

  // Update node in an explicit project, useful for reminders across different projects
  const updateNodeInProject = (projId: string, updatedNode: TaskNode) => {
    setState(prev => {
      const currentNodes = prev.nodes[projId] || [];
      const targetNode = currentNodes.find(n => n.id === updatedNode.id);

      const newTags = updatedNode.tags || [];
      const oldTags = targetNode ? (targetNode.tags || []) : [];

      // --- INTEGRATE HEMKARLAR TAG LOGIC ---
      const hemkarlarTags = getHemkarlarTags(prev, projId);
      const hasHemkarlarTagNow = newTags.some(tag => hemkarlarTags.includes(tag));
      const hadHemkarlarTagBefore = oldTags.some(tag => hemkarlarTags.includes(tag));
      const newlyAddedHemkarlarTag = hasHemkarlarTagNow && (!targetNode || !hadHemkarlarTagBefore);

      if (newlyAddedHemkarlarTag) {
        let waitingContainer = findWaitingContainer(currentNodes);
        let updatedNodesWithContainer = [...currentNodes];
        if (!waitingContainer) {
          waitingContainer = createWaitingContainer(projId, currentNodes);
          updatedNodesWithContainer.push(waitingContainer);
        }

        const parentNode = updatedNode.parentId ? updatedNodesWithContainer.find(n => n.id === updatedNode.parentId) : null;

        let adjustedUpdatedNode = { ...updatedNode };
        let mirrorCloneNode: TaskNode | null = null;
        let assignedMirrorGroupId = '';

        assignedMirrorGroupId = updatedNode.mirrorGroupId || `mirror-${updatedNode.id}-${Date.now()}`;
        adjustedUpdatedNode = {
          ...updatedNode,
          mirrorGroupId: assignedMirrorGroupId,
          updatedAt: new Date().toISOString()
        };

        const parentColor = waitingContainer ? waitingContainer.color : '';
        const updatedContainerPlace = waitingContainer ? `${waitingContainer.text} (X: ${Math.round(waitingContainer.x)}, Y: ${Math.round(waitingContainer.y)})` : '';

        mirrorCloneNode = {
          ...adjustedUpdatedNode,
          id: 'node-' + generateId(),
          parentId: waitingContainer.id,
          color: parentColor || adjustedUpdatedNode.color,
          isFloating: false,
          containerPlace: updatedContainerPlace,
          mirrorGroupId: assignedMirrorGroupId,
          mirrorParentId: parentNode ? parentNode.id : undefined,
          mirrorParentText: parentNode ? parentNode.text : undefined,
          updatedAt: new Date().toISOString()
        };

        let updatedList = updatedNodesWithContainer.map(n => n.id === adjustedUpdatedNode.id ? adjustedUpdatedNode : n);
        if (mirrorCloneNode) {
          updatedList = [...updatedList, mirrorCloneNode];
        }

        if (targetNode && targetNode.completed !== adjustedUpdatedNode.completed) {
          updatedList = toggleNodeAndDescendants(adjustedUpdatedNode.id, adjustedUpdatedNode.completed, updatedList);
        }

        if (targetNode && targetNode.archived !== adjustedUpdatedNode.archived) {
          updatedList = toggleNodeArchive(adjustedUpdatedNode.id, !!adjustedUpdatedNode.archived, updatedList);
        }

        const syncedNodes = syncCompletion(updatedList);

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [projId]: syncedNodes
          }
        };
      }
      // --- END INTEGRATE HEMKARLAR TAG LOGIC ---

      // --- INTEGRATE PERSONAL TAG LOGIC ---
      const personalTags = getPersonalTags(prev, projId);
      const hasPersonalTagNow = newTags.some(tag => personalTags.includes(tag));
      const hadPersonalTagBefore = oldTags.some(tag => personalTags.includes(tag));
      const newlyAddedPersonalTag = hasPersonalTagNow && (!targetNode || !hadPersonalTagBefore);

      if (newlyAddedPersonalTag) {
        let delegateContainer = findDelegateContainer(currentNodes);
        let updatedNodesWithContainer = [...currentNodes];
        if (!delegateContainer) {
          delegateContainer = createDelegateContainer(projId, currentNodes);
          updatedNodesWithContainer.push(delegateContainer);
        }

        const parentNode = updatedNode.parentId ? updatedNodesWithContainer.find(n => n.id === updatedNode.parentId) : null;
        const isSubtask = parentNode && !parentNode.isContainer && !parentNode.isWorkflowRectangle;

        let adjustedUpdatedNode = { ...updatedNode };
        let mirrorCloneNode: TaskNode | null = null;
        let assignedMirrorGroupId = '';

        if (isSubtask) {
          assignedMirrorGroupId = updatedNode.mirrorGroupId || `mirror-${updatedNode.id}-${Date.now()}`;
          adjustedUpdatedNode = {
            ...updatedNode,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: parentNode ? parentNode.id : undefined,
            mirrorParentText: parentNode ? parentNode.text : undefined,
            updatedAt: new Date().toISOString()
          };

          const parentColor = delegateContainer ? delegateContainer.color : '';
          const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

          mirrorCloneNode = {
            ...adjustedUpdatedNode,
            id: 'node-' + generateId(),
            parentId: delegateContainer.id,
            color: parentColor || adjustedUpdatedNode.color,
            isFloating: false,
            containerPlace: updatedContainerPlace,
            mirrorGroupId: assignedMirrorGroupId,
            mirrorParentId: parentNode ? parentNode.id : undefined,
            mirrorParentText: parentNode ? parentNode.text : undefined,
            updatedAt: new Date().toISOString()
          };
        } else {
          const parentColor = delegateContainer ? delegateContainer.color : '';
          const updatedContainerPlace = delegateContainer ? `${delegateContainer.text} (X: ${Math.round(delegateContainer.x)}, Y: ${Math.round(delegateContainer.y)})` : '';

          adjustedUpdatedNode = {
            ...updatedNode,
            parentId: delegateContainer.id,
            isFloating: false,
            color: parentColor || updatedNode.color,
            containerPlace: updatedContainerPlace,
            updatedAt: new Date().toISOString()
          };
        }

        let updatedList = updatedNodesWithContainer.map(n => n.id === adjustedUpdatedNode.id ? adjustedUpdatedNode : n);
        if (mirrorCloneNode) {
          updatedList = [...updatedList, mirrorCloneNode];
        }

        if (targetNode && targetNode.completed !== adjustedUpdatedNode.completed) {
          updatedList = toggleNodeAndDescendants(adjustedUpdatedNode.id, adjustedUpdatedNode.completed, updatedList);
        }

        if (targetNode && targetNode.archived !== adjustedUpdatedNode.archived) {
          updatedList = toggleNodeArchive(adjustedUpdatedNode.id, !!adjustedUpdatedNode.archived, updatedList);
        }

        const syncedNodes = syncCompletion(updatedList);

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [projId]: syncedNodes
          }
        };
      }
      // --- END INTEGRATE PERSONAL TAG LOGIC ---
      
      const nodeWithTimeStamp = {
        ...updatedNode,
        updatedAt: new Date().toISOString()
      };

      if (targetNode && targetNode.text !== updatedNode.text) {
        const isPlaceholder = (t: string) => {
          const lower = t.toLowerCase();
          return lower.includes('новая подзадача') || lower.includes('плавающая задача') || lower.includes('новые задачи') || lower.includes('новый контейнер') || lower.includes('новая задача') || t.trim() === '';
        };

        const wasPlaceholder = isPlaceholder(targetNode.text);
        const isNowPlaceholder = isPlaceholder(updatedNode.text);

        if ((wasPlaceholder && !isNowPlaceholder) || updatedNode.estimatedTime === 30 || updatedNode.estimatedTime === undefined) {
          const allWorkspaceNodes = Object.values(prev.nodes).flat();
          const suggested = suggestEstimatedTime(updatedNode.text, allWorkspaceNodes);
          if (suggested !== undefined) {
            nodeWithTimeStamp.estimatedTime = suggested;
          }
        }
      }
      
      let updatedList = currentNodes.map(n => n.id === updatedNode.id ? nodeWithTimeStamp : n);
      if (targetNode && targetNode.completed !== updatedNode.completed) {
        updatedList = toggleNodeAndDescendants(updatedNode.id, updatedNode.completed, updatedList);
      }
      
      if (targetNode && targetNode.archived !== updatedNode.archived) {
        updatedList = toggleNodeArchive(updatedNode.id, !!updatedNode.archived, updatedList);
      }
      
      const syncedNodes = syncCompletion(updatedList);
      
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [projId]: syncedNodes
        }
      };
    });
  };

  // ----- SEARCH & HIGHLIGHT -----
  const isNodeMatched = (node: TaskNode): boolean => {
    if (filterStatus === "not_tasks") {
      if (!node.isNotTask) return false;
    } else if (node.isNotTask && viewMode !== 'canvas') {
      return false;
    }

    // 1. Text search (text, tags, notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const textMatches = node.text.toLowerCase().includes(q);
      const tagMatches = (node.tags || []).some(t => t.toLowerCase().includes(q));
      const notesMatches = (node.notes || "").toLowerCase().includes(q);
      if (!textMatches && !tagMatches && !notesMatches) {
        return false;
      }
    }

    // 2. Status filter
    if (filterStatus === "archived") {
      if (!node.archived) return false;
    } else {
      const isSearching = searchQuery.trim() !== "";
      if (node.archived) {
        if (isSearching && viewMode !== 'canvas' && !node.isContainer) {
          // Allow identifying/finding it in searches for non-canvas, non-container views
        } else {
          return false;
        }
      }
      if (filterStatus === "completed" && !node.completed) return false;
      if (filterStatus === "active" && node.completed) return false;
    }

    // 3. Priority filter
    if (filterPriority !== "all" && node.priority !== filterPriority) return false;

    // 4. Tag filter
    if (filterTag !== "all" && !(node.tags || []).includes(filterTag)) return false;

    // 5. Due date filter
    if (filterDueDate !== "all") {
      const hasDue = !!node.dueDate;
      if (filterDueDate === "has_due_date" && !hasDue) return false;
      if (filterDueDate === "no_due_date" && hasDue) return false;

      if (filterDueDate === "overdue" || filterDueDate === "today" || filterDueDate === "this_week") {
        if (!hasDue) return false;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const nodeDate = new Date(node.dueDate!);
        nodeDate.setHours(0, 0, 0, 0);
        
        const diffTime = nodeDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (filterDueDate === "overdue") {
          const isOverdue = diffDays < 0 && !node.completed;
          if (!isOverdue) return false;
        } else if (filterDueDate === "today") {
          if (diffDays !== 0) return false;
        } else if (filterDueDate === "this_week") {
          if (diffDays < 0 || diffDays > 7) return false;
        }
      }
    }

    // 6. Attachments filter
    if (filterAttachments === "has_files" && (!node.files || node.files.length === 0)) return false;
    if (filterAttachments === "no_files" && (node.files && node.files.length > 0)) return false;

    // 7. Notes filter
    if (filterNotes === "has_notes" && (!node.notes || node.notes.trim() === "")) return false;
    if (filterNotes === "no_notes" && (node.notes && node.notes.trim() !== "")) return false;

    return true;
  };

  const isAnyFilterActive = 
    filterStatus !== "all" || 
    filterPriority !== "all" || 
    filterTag !== "all" || 
    filterDueDate !== "all" || 
    filterAttachments !== "all" || 
    filterNotes !== "all" || 
    searchQuery.trim() !== "";

  const activeFilterCount = [
    filterStatus !== "all",
    filterPriority !== "all",
    filterTag !== "all",
    filterDueDate !== "all",
    filterAttachments !== "all",
    filterNotes !== "all",
    searchQuery.trim() !== "",
  ].filter(Boolean).length;

  const handleClearAllFilters = () => {
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterTag("all");
    setFilterDueDate("all");
    setFilterAttachments("all");
    setFilterNotes("all");
    setFilterCategoryId(null);
    setKanbanGroupBy("status");
    setKanbanContainerFilterId("all");
    setSearchQuery("");
  };

  const handleSaveFiltersForFocusedNode = () => {
    const focusId = focusedTaskId || focusedContainerId;
    if (!focusId || !state.activeProjectId) return;
    
    setState(prev => {
      const currentNodes = prev.nodes[state.activeProjectId!] || [];
      const updatedNodes = currentNodes.map(node => {
        if (node.id === focusId) {
          return {
            ...node,
            savedFilters: {
              filterStatus,
              filterPriority,
              filterTag,
              filterDueDate,
              filterAttachments,
              filterNotes,
              filterCategoryId,
              kanbanGroupBy,
              kanbanContainerFilterId
            },
            updatedAt: new Date().toISOString()
          };
        }
        return node;
      });
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [state.activeProjectId!]: updatedNodes
        }
      };
    });
  };

  const handleClearSavedFiltersForFocusedNode = () => {
    const focusId = focusedTaskId || focusedContainerId;
    if (!focusId || !state.activeProjectId) return;
    
    setState(prev => {
      const currentNodes = prev.nodes[state.activeProjectId!] || [];
      const updatedNodes = currentNodes.map(node => {
        if (node.id === focusId) {
          const updatedNode = { ...node };
          delete updatedNode.savedFilters;
          return {
            ...updatedNode,
            updatedAt: new Date().toISOString()
          };
        }
        return node;
      });
      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [state.activeProjectId!]: updatedNodes
        }
      };
    });
  };

  const allAvailableTags = Array.from(
    new Set(activeNodes.flatMap(n => n.tags || []))
  ).filter(Boolean);

  const searchedIds = isAnyFilterActive
    ? activeNodes.filter(n => isNodeMatched(n)).map(n => n.id)
    : [];

  const handleSelectSearchedNode = (nodeId: string) => {
    // Auto-expand parents if selected node is collapsed/hidden
    const pid = state.activeProjectId;
    if (pid) {
      const currentNodes = state.nodes[pid] || [];
      let updated = false;

      // Find all ancestors of the targeted node
      const ancestorIds: string[] = [];
      let currentId: string | null = nodeId;
      while (currentId !== null) {
        const current = currentNodes.find(n => n.id === currentId);
        if (current && current.parentId) {
          ancestorIds.push(current.parentId);
          currentId = current.parentId;
        } else {
          currentId = null;
        }
      }

      if (ancestorIds.length > 0) {
        const updatedNodes = currentNodes.map(n => {
          if (ancestorIds.includes(n.id) && n.collapsed) {
            updated = true;
            return { ...n, collapsed: false };
          }
          return n;
        });

        if (updated) {
          setState(prev => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [pid]: updatedNodes
            }
          }));
        }
      }
    }

    setSelectedNodeId(nodeId);
    // Pan canvas to center this searched node!
    const node = activeNodes.find(n => n.id === nodeId);
    if (node) {
      if (viewMode === 'canvas') {
        if (node.isContainer) {
          setFocusedContainerId(nodeId);
          setFocusedTaskId(null);
        } else {
          setFocusedTaskId(nodeId);
          setFocusedContainerId(null);
        }
      }
      setPanX(-node.x * zoom);
      setPanY(-node.y * zoom);

      // Auto-scroll Kanban or Mobile views if active
      setTimeout(() => {
        const kanbanCard = document.getElementById(`kanban-card-${nodeId}`);
        if (kanbanCard) {
          kanbanCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const mobileCard = document.getElementById(`mobile-task-card-${nodeId}`);
        if (mobileCard) {
          mobileCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }
  };

  const handleNextSearchMatch = () => {
    if (searchedIds.length <= 1) return;
    const nextIdx = (currentSearchIndex + 1) % searchedIds.length;
    setCurrentSearchIndex(nextIdx);
    handleSelectSearchedNode(searchedIds[nextIdx]);
  };

  const handlePrevSearchMatch = () => {
    if (searchedIds.length <= 1) return;
    const prevIdx = (currentSearchIndex - 1 + searchedIds.length) % searchedIds.length;
    setCurrentSearchIndex(prevIdx);
    handleSelectSearchedNode(searchedIds[prevIdx]);
  };

  // Auto focus first found node on search query change
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      if (searchedIds.length > 0) {
        setCurrentSearchIndex(0);
        handleSelectSearchedNode(searchedIds[0]);
      }
    } else {
      setCurrentSearchIndex(0);
    }
  }, [searchQuery, state.activeProjectId]);

  // ----- DATA PERSISTENCE IMPORT & EXPORT -----
  const handleExportData = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `mindmap_tasks_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      alert('Не удалось экспортировать файл бэкапа.');
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const file = filesList[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object' && parsed.folders && parsed.projects && parsed.nodes) {
          setState(parsed as WorkspaceState);
          alert('Резервная копия успешно восстановлена!');
        } else {
          alert('Неверный формат резервной копии. Файл должен иметь поля folders, projects, nodes.');
        }
      } catch (err) {
        alert('Ошибка при чтении файла резервной копии.');
      }
    };
    reader.readAsText(file);
    // Reset file input target
    e.target.value = '';
  };

  const handleResetDemo = () => {
    localStorage.removeItem('task_mindmaps_state');
    window.location.reload();
  };

  const focusedNodeId = focusedTaskId || focusedContainerId;
  const focusedNode = state.activeProjectId && focusedNodeId
    ? (state.nodes[state.activeProjectId] || []).find(n => n.id === focusedNodeId) || null
    : null;

  const handleToggleDefaultView = () => {
    if (!focusedNode || !state.activeProjectId) return;
    const isAlreadyDefault = focusedNode.defaultView === viewMode;
    handleUpdateNode({
      ...focusedNode,
      defaultView: isAlreadyDefault ? undefined : viewMode
    });
  };

  const viewsList = [
    { id: 'canvas', name: 'Холст', icon: Network },
    { id: 'kanban', name: 'Канбан', icon: Kanban },
    { id: 'mobile-list', name: 'Списки', icon: Smartphone },
    { id: 'calendar', name: 'Календарь', icon: Calendar },
    { id: 'gantt', name: 'Ганнт', icon: GanttChart },
    { id: 'table', name: 'Таблица', icon: Table },
    { id: 'eisenhower', name: 'Матрица', icon: LayoutGrid },
    { id: 'anydo', name: 'Any.do', icon: Grid },
  ];

  const selectedNode = activeNodes.find(n => n.id === selectedNodeId) || null;

  const isNetworkFailure = sheetsError?.includes('Failed to fetch') || sheetsError?.includes('NetworkError');
  const hasSyncOrAuthError = !!authError || (!!sheetsError && !isNetworkFailure) || (syncStatus.sheets === 'error' && !isNetworkFailure) || syncStatus.local === 'error';

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden text-slate-900 bg-[#FAFBFD] dark:bg-[#090714] dark:text-slate-100 font-sans transition-colors duration-150">
      
      {/* Sidebar drawer handles folders/projects */}
      <Sidebar
        folders={state.folders}
        projects={state.projects}
        activeProjectId={state.activeProjectId}
        onSelectProject={handleSelectProject}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onMoveProject={handleMoveProject}
        onExportData={handleExportData}
        onImportData={handleImportData}
        onResetDemo={handleResetDemo}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
        onCreateTagCategory={handleCreateTagCategory}
        onUpdateTagCategory={handleUpdateTagCategory}
        onDeleteTagCategory={handleDeleteTagCategory}
        currentWorkspaceState={state}
        onApplySyncedState={setState}
        version={APP_VERSION}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onCreateGtdWorkflow={handleCreateGtdWorkflow}
      />

      {/* Main Workspace Frame */}
      <main className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden relative transition-all duration-300 ease-out ${sidebarOpen ? 'lg:pl-72' : 'lg:pl-0'}`}>
        
        {isAutoLoginPopupBlocked && (
          <div className="absolute right-6 top-18 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs font-semibold py-2 px-3 rounded-xl shadow-xl flex items-center gap-2 z-40 animate-bounce">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping shrink-0" />
            <span>Браузер заблокировал автоматический вход. Нажмите <b>"Синхронизация"</b> для авторизации! 🚀</span>
            <button 
              type="button"
              onClick={() => setIsAutoLoginPopupBlocked(false)}
              className="ml-2 hover:text-amber-600 dark:hover:text-amber-150 font-extrabold cursor-pointer text-sm"
              title="Закрыть"
            >
              ✕
            </button>
          </div>
        )}
        
        {/* Workspace Top Action Bar Header */}
        <header className={`${isViewFullScreen ? 'hidden' : 'hidden sm:flex'} h-16 border-b items-center justify-between px-4 sm:px-6 glass-panel z-35 transition-all duration-300 ${
          (!currentUser || !googleToken)
            ? 'border-rose-150/55 dark:border-rose-900/30'
            : 'border-slate-150/40 dark:border-slate-800/30'
        }`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 z-30 pointer-events-auto ${
                sidebarOpen ? 'lg:hidden' : 'flex'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div 
              className="min-w-0 cursor-pointer lg:cursor-default"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setSidebarOpen(true);
                }
              }}
            >
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                {state.projects.find(p => p.id === state.activeProjectId)?.name || 'Карта задач'}
                {(!currentUser || !googleToken) && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 shadow-xs animate-pulse whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>Нужна авторизация!</span>
                  </span>
                )}
                {focusedContainerId && (() => {
                  const containerNode = activeNodes.find(n => n.id === focusedContainerId);
                  return (
                    <span className="inline-flex items-center gap-1.5 bg-amber-500/15 dark:bg-amber-550/20 border border-amber-200/50 dark:border-amber-900/40 px-2 py-0.5 rounded-full text-[10px] text-amber-700 dark:text-amber-400 font-bold shrink-0">
                      <span>📦 {containerNode?.text || 'Без названия'}{containerNode?.savedFilters && ' ★'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedContainerId(null);
                        }}
                        className="ml-1 px-1 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-[8px] font-extrabold uppercase transition-all cursor-pointer shadow-xs border-none"
                        title="Выйти из режима фокусировки"
                      >
                        Выйти
                      </button>
                    </span>
                  );
                })()}
                {focusedTaskId && (() => {
                  const taskNode = activeNodes.find(n => n.id === focusedTaskId);
                  return (
                    <span className="inline-flex items-center gap-1.5 bg-rose-500/15 dark:bg-rose-550/20 border border-rose-200/50 dark:border-rose-900/40 px-2 py-0.5 rounded-full text-[10px] text-rose-700 dark:text-rose-400 font-bold shrink-0">
                      <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="truncate max-w-[150px]">🎯 {taskNode?.text || 'Без названия'}{taskNode?.savedFilters && ' ★'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedTaskId(null);
                        }}
                        className="ml-1 px-1 py-0.5 rounded bg-rose-50 hover:bg-rose-650 text-white text-[8px] font-extrabold uppercase transition-all cursor-pointer shadow-xs border-none"
                        title="Выйти из режима фокуса"
                      >
                        Выйти
                      </button>
                    </span>
                  );
                })()}
              </h2>
            </div>
          </div>

          {viewMode !== 'mobile-list' && (() => {
            const actualTasks = activeNodes.filter(n => !n.isContainer && !n.isWorkflowRectangle);
            return (
              <div className="hidden sm:flex items-center gap-3.5 text-[11px] text-slate-500 dark:text-slate-400 font-sans select-none relative group z-30">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/40 px-3 py-1.5 rounded-2xl border border-slate-150 dark:border-slate-800/60 shadow-xs cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-950 transition-all duration-200">
                  {/* Symmetrical SVG Pie/Donut Chart */}
                  <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 32 32">
                      {/* Background total / pending circle */}
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        className="text-slate-200 dark:text-slate-800"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="transparent"
                      />
                      {/* Completed tasks sector circle */}
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        className="text-emerald-500 dark:text-emerald-400 transition-all duration-500"
                        strokeWidth="3.5"
                        strokeDasharray={2 * Math.PI * 12}
                        strokeDashoffset={2 * Math.PI * 12 * (1 - (actualTasks.length > 0 ? actualTasks.filter(n => n.completed).length / actualTasks.length : 0))}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                      />
                    </svg>
                    <span className="absolute text-[8px] font-extrabold text-slate-700 dark:text-slate-300 font-mono">
                      {actualTasks.length > 0 ? Math.round((actualTasks.filter(n => n.completed).length / actualTasks.length) * 100) : 0}%
                    </span>
                  </div>

                  {/* Stats Texts */}
                  <div className="flex flex-col text-[10px] leading-tight font-serif">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 dark:text-slate-500">Задач:</span>
                      <span className="font-extrabold text-slate-700 dark:text-slate-300 font-mono">{actualTasks.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 dark:text-slate-500">Выполнено:</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{actualTasks.filter(n => n.completed).length}</span>
                    </div>
                  </div>
                </div>

                {/* Elegant Tooltip Popover on Hover */}
                <div className="absolute top-12 left-0 z-50 hidden group-hover:block bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 p-3 rounded-xl shadow-2xl min-w-[180px] text-xs pointer-events-none select-none">
                  <div className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 border-b pb-1 border-slate-100 dark:border-slate-800">
                    Статистика прогресса
                  </div>
                  <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Всего задач:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{actualTasks.length}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Выполнено:</span>
                      <span className="font-bold">{actualTasks.filter(n => n.completed).length} ({actualTasks.length > 0 ? Math.round((actualTasks.filter(n => n.completed).length / actualTasks.length) * 100) : 0}%)</span>
                    </div>
                    <div className="flex justify-between text-amber-500 dark:text-amber-400">
                      <span>В процессе:</span>
                      <span className="font-bold">{actualTasks.length - actualTasks.filter(n => n.completed).length} ({actualTasks.length > 0 ? Math.round(((actualTasks.length - actualTasks.filter(n => n.completed).length) / actualTasks.length) * 100) : 0}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Center search bar & operations */}
          <div className="hidden sm:flex items-center gap-3">
            
            {/* Global running Pomodoro indicator widget */}
            {globalPomo && globalPomo.isRunning && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNodeId(globalPomo.nodeId);
                  setIsDrawerOpen(true);
                }}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/25 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-bold cursor-pointer transition-all duration-250 hover:scale-[1.03] select-none shadow-xs"
                title={`Активная сессия Pomodoro для задачи "${globalPomo.nodeText}". Нажмите для подробностей.`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-450"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="text-[11px] font-medium max-w-[130px] truncate">
                  🎯 {globalPomo.nodeText}
                </span>
                <span className="font-mono text-xs font-black tracking-wider leading-none">
                  {formatGlobalPomoTime(globalPomo.timeLeft)}
                </span>
              </button>
            )}
            
            {/* Elegant micro search input */}
            <div className="relative flex items-center gap-1 sm:gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-24 sm:w-40 md:w-56 focus:w-36 sm:focus:w-48 md:focus:w-56 transition-all duration-200 leading-none py-1.5 pl-7 sm:pl-8 pr-12 sm:pr-18 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-xs rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 placeholder-slate-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 sm:left-2.5 top-2" />
                
                {/* Clear button & Micro Counter Indicator */}
                {searchQuery.trim().length > 0 && (
                  <div className="absolute right-1.5 sm:right-2 top-1.5 flex items-center gap-1">
                    <span className="text-[10px] text-slate-400/80 font-mono font-medium select-none">
                      {searchedIds.length > 0 ? `${currentSearchIndex + 1}/${searchedIds.length}` : '0/0'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                      title="Очистить поиск"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Prev / Next Match buttons */}
              {searchedIds.length > 1 && (
                <div className="flex items-center border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg overflow-hidden divide-x divide-indigo-200 dark:divide-indigo-900 shadow-xs shrink-0">
                  <button
                    type="button"
                    onClick={handlePrevSearchMatch}
                    title="Перейти к предыдущей найденной задаче"
                    className="flex items-center justify-center p-1 sm:px-1.5 hover:bg-indigo-150 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 cursor-pointer transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextSearchMatch}
                    title="Перейти к следующей найденной задаче"
                    className="flex items-center justify-center p-1 sm:px-1.5 hover:bg-indigo-150 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 cursor-pointer transition-all"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Advanced Filters Button */}
            <button
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`p-1.5 select-none hover:scale-[1.02] border rounded-lg flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all duration-200 ${
                isAnyFilterActive 
                  ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-505/20 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400' 
                  : isFilterPanelOpen
                    ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-850 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/70'
              }`}
              title="Фильтрация по параметрам"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Фильтры</span>
              {isAnyFilterActive && (
                <span className="bg-indigo-600 text-white dark:bg-indigo-500 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Symmetrical Copy/Duplicate Project Tasks Button */}
            {state.activeProjectId && (
              <button
                onClick={() => {
                  setCopySourceNodeIds([]); // Empty array indicates copying ALL elements of active project
                  setIsCopyModalOpen(true);
                }}
                className="p-1.5 hover:scale-[1.02] border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-indigo-650 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100/70 rounded-lg flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all duration-200 shrink-0"
                title="Копировать / дублировать задачи этого проекта"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden lg:inline">Копировать задачи</span>
              </button>
            )}

            {/* Micro search results list box if search query is set */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-15 right-2 sm:right-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-2 w-[calc(100vw-2rem)] sm:w-72 max-h-56 overflow-y-auto z-50">
                <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-widest">
                  Найдено результатов ({searchedIds.length})
                </p>
                {searchedIds.length > 0 ? (
                  <div className="space-y-0.5 mt-1">
                    {activeNodes
                      .filter(n => searchedIds.includes(n.id))
                      .map(n => (
                        <div
                          key={n.id}
                          className="w-full text-left py-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg text-xs font-medium text-slate-705 dark:text-slate-300 flex items-center justify-between gap-1 group/search-item"
                        >
                          <button
                            onClick={() => handleSelectSearchedNode(n.id)}
                            className="flex-1 text-left truncate cursor-pointer"
                          >
                            <span className="truncate pr-1 block font-semibold">{n.text}</span>
                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                              <span>#{n.priority || 'none'}</span>
                              {n.archived && (
                                <span className="bg-amber-100 dark:bg-amber-950/45 text-amber-705 dark:text-amber-400 px-1 rounded-sm font-black text-[8.5px]">📦 АРХИВ</span>
                              )}
                            </div>
                          </button>
                          
                          {n.archived && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateNode({
                                  ...n,
                                  archived: false
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-900 text-[9px] text-amber-700 dark:text-amber-400 font-bold transition-all flex items-center gap-0.5 cursor-pointer shrink-0"
                              title="Вывести из архива"
                            >
                              <ArchiveRestore className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                              <span className="hidden sm:inline">Вывести</span>
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-400 italic">Ничего не найдено</div>
                )}
              </div>
            )}

            {/* Undo Action Trigger if active project history holds logs */}
            {state.activeProjectId && (undoStack[state.activeProjectId] || []).length > 0 && (
              <button
                onClick={handleUndo}
                title="Отменить последнее ветвление или удаление (Ctrl+Z)"
                className="p-1.5 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1 text-xs cursor-pointer focus:outline-none"
              >
                <Undo2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="inline text-[11px] font-bold">Отмена</span>
              </button>
            )}

            {/* Symmetrical Sync and Backup Trigger Button */}
            <button
              id="milli-sync-dashboard-btn"
              type="button"
              onClick={() => setIsSyncMenuOpen(true)}
              className={`flex items-center gap-1.5 py-1.5 px-3 border rounded-lg text-xs font-bold cursor-pointer transition-all duration-200 hover:scale-[1.01] shrink-0 ${
                isSyncingSheets || syncStatus.firebase === 'syncing'
                  ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 animate-pulse'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              title="Открыть панель резервного копирования и синхронизации"
            >
              <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="hidden lg:inline">Синхронизация</span>
              {hasSyncOrAuthError ? (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_6px_rgba(244,63,94,0.6)]" />
              ) : currentUser ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>

            {/* Quick Symmetrical Sheets Sync Button (Icon Only, No Words) */}
            <button
              id="milli-quick-sheets-sync-btn"
              type="button"
              onClick={handleQuickSheetsSync}
              className={`p-1.5 border rounded-lg cursor-pointer transition-all duration-200 hover:scale-[1.05] shrink-0 ${
                isSyncingSheets
                  ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 animate-pulse animate-duration-1000'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400'
              }`}
              title={
                googleToken 
                  ? "Быстрая синхронизация с Google Sheets" 
                  : "Войти и синхронизировать с Google Sheets"
              }
            >
              <FileSpreadsheet className={`w-4 h-4 ${isSyncingSheets ? 'animate-spin' : ''}`} />
          </button>


          </div>
        </header>

        {/* Floating search panel for mobile when toggled */}
        {isMobileSearchOpen && (
          <div className="fixed bottom-28 left-3 right-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 z-[120] flex items-center gap-1.5 sm:hidden animate-in slide-in-from-bottom-2 duration-200">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full transition-all duration-200 leading-none py-1.5 pl-8 pr-20 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-xs rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 placeholder-slate-400"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              {searchQuery.trim().length > 0 && (
                <div className="absolute right-2 top-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400/80 font-mono font-medium">
                    {searchedIds.length > 0 ? `${currentSearchIndex + 1}/${searchedIds.length}` : '0/0'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Очистить поиск"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {searchedIds.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevSearchMatch}
                  className="p-1.5 border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center cursor-pointer"
                  title="Предыдущее совпадение"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextSearchMatch}
                  className="p-1.5 border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center cursor-pointer"
                  title="Следующее совпадение"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ALWAYS VISIBLE Mobile Bottom Action and Views Bar */}
        <div className={`fixed bottom-0 left-0 right-0 z-[110] ${isDrawerOpen ? 'hidden' : 'flex'} sm:hidden flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.08)] border-t border-slate-200 dark:border-slate-800 shrink-0 select-none`}>
          {/* Row 2: Action controls */}
          <header className="h-14 flex items-center justify-between px-3 w-full">
            {/* Left: Hamburger menu & Undo/Cancel */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
                title="Меню"
              >
                <Menu className="w-4 h-4" />
              </button>

              {state.activeProjectId && (undoStack[state.activeProjectId] || []).length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  title="Отменить (Ctrl+Z)"
                  className="p-2 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center cursor-pointer"
                >
                  <Undo2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </button>
              )}
            </div>

            {/* Center: Views Picker / Switcher */}
            {state.activeProjectId && (
              <div className="flex-1 flex justify-center relative">
                {/* Backdrop overlay for click-away */}
                {isMobileViewSwitcherOpen && (
                  <div 
                    className="fixed inset-0 z-[115]" 
                    onClick={() => setIsMobileViewSwitcherOpen(false)}
                  />
                )}

                {(() => {
                  const activeOption = viewsList.find(o => o.id === viewMode);
                  if (!activeOption) return null;
                  const OptionIcon = activeOption.icon;
                  return (
                    <button
                      type="button"
                      onClick={() => setIsMobileViewSwitcherOpen(!isMobileViewSwitcherOpen)}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl flex items-center gap-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 cursor-pointer transition-colors shadow-xs relative z-[120]"
                    >
                      <OptionIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{activeOption.name}</span>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isMobileViewSwitcherOpen ? 'rotate-180' : ''}`} />
                    </button>
                  );
                })()}

                {/* Mobile views dropdown popover */}
                {isMobileViewSwitcherOpen && (
                  <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 w-56 z-[120] flex flex-col gap-1 select-text animate-in slide-in-from-bottom-2 duration-200">
                    <div className="px-2.5 py-1.5 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 tracking-wider uppercase flex items-center justify-between">
                      <span>Режим просмотра</span>
                      {focusedNode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleDefaultView();
                          }}
                          className={`p-1 rounded-lg transition-colors cursor-pointer border ${
                            focusedNode.defaultView === viewMode
                              ? 'bg-amber-500/10 text-amber-600 border-amber-300'
                              : 'text-slate-400 hover:text-slate-600 border-transparent hover:bg-slate-50 dark:hover:bg-slate-850'
                          }`}
                          title="Сделать по умолчанию"
                        >
                          <Star className={`w-3.5 h-3.5 ${focusedNode.defaultView === viewMode ? 'fill-amber-500 text-amber-500' : ''}`} />
                        </button>
                      )}
                    </div>
                    {viewsList.map(option => {
                      const OptionIcon = option.icon;
                      const isSelected = viewMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setViewMode(option.id as any);
                            setIsMobileViewSwitcherOpen(false);
                          }}
                          className={`w-full text-left font-bold px-3 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-xs ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <OptionIcon className={`w-4 h-4 ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`} />
                            <span>{option.name}</span>
                          </div>
                          {focusedNode && focusedNode.defaultView === option.id && (
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Right: Search, Filters, Sync, Sheets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                className={`p-2 rounded-lg border cursor-pointer transition-all ${
                  searchQuery.trim().length > 0 || isMobileSearchOpen
                    ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-200 dark:border-slate-850 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Поиск"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className={`p-2 border rounded-lg cursor-pointer transition-all ${
                  isAnyFilterActive
                    ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                    : isFilterPanelOpen
                      ? 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-850 text-slate-800 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-850 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Фильтры"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsSyncMenuOpen(true)}
                className={`p-2 border rounded-lg cursor-pointer transition-all ${
                  isSyncingSheets || syncStatus.firebase === 'syncing'
                    ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 animate-pulse'
                    : 'border-slate-200 dark:border-slate-850 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Синхронизация"
              >
                <Database className="w-4 h-4 text-indigo-500" />
              </button>

              <button
                type="button"
                onClick={handleQuickSheetsSync}
                className={`p-2 border rounded-lg cursor-pointer transition-all ${
                  isSyncingSheets
                    ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 animate-pulse'
                    : 'border-slate-200 dark:border-slate-850 text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Google Sheets"
              >
                <FileSpreadsheet className={`w-4 h-4 ${isSyncingSheets ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>
        </div>



        {/* Collapsible advanced filters subheader panel */}
        {isFilterPanelOpen && (
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center gap-4 text-xs z-10 transition-all duration-300 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Статус:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[95px]"
              >
                <option value="all">Активные разделы</option>
                <option value="active">Активные</option>
                <option value="completed">Выполненные</option>
                <option value="archived">📦 Архивные</option>
                <option value="not_tasks">🚫 Не-задачи</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Приоритет:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[110px]"
              >
                <option value="all">Все</option>
                <option value="none">Без приоритета</option>
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="urgent">Критический</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Теги:</span>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 max-w-[150px]"
              >
                <option value="all">Все теги</option>
                {/* Categorized tags */}
                {(() => {
                  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
                  const activeCategories = activeProject?.tagCategories || [];
                  return activeCategories.map(cat => {
                    const catTagsInUse = (cat.tags || []).filter(t => allAvailableTags.includes(t));
                    if (catTagsInUse.length === 0) return null;
                    return (
                      <optgroup key={cat.id} label={cat.name}>
                        {catTagsInUse.map(tag => (
                          <option key={tag} value={tag}>#{tag}</option>
                        ))}
                      </optgroup>
                    );
                  });
                })()}
                {/* Uncategorized tags */}
                {(() => {
                  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
                  const activeCategories = activeProject?.tagCategories || [];
                  const categorizedSet = new Set(activeCategories.flatMap(cat => cat.tags || []) || []);
                  const uncategorizedTags = allAvailableTags.filter(t => !categorizedSet.has(t));
                  if (uncategorizedTags.length === 0) return null;
                  return (
                    <optgroup label="Остальные">
                      {uncategorizedTags.map(tag => (
                        <option key={tag} value={tag}>#{tag}</option>
                      ))}
                    </optgroup>
                  );
                })()}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Срок:</span>
              <select
                value={filterDueDate}
                onChange={(e) => setFilterDueDate(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[125px]"
              >
                <option value="all">Любой срок</option>
                <option value="overdue">Просрочено</option>
                <option value="today">Сегодня</option>
                <option value="this_week">На этой неделе</option>
                <option value="has_due_date">С дедлайном</option>
                <option value="no_due_date">Без дедлайна</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Файлы:</span>
              <select
                value={filterAttachments}
                onChange={(e) => setFilterAttachments(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[95px]"
              >
                <option value="all">Все</option>
                <option value="has_files">С файлами</option>
                <option value="no_files">Без файлов</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Заметки:</span>
              <select
                value={filterNotes}
                onChange={(e) => setFilterNotes(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 dark:text-slate-300 min-w-[95px]"
              >
                <option value="all">Все</option>
                <option value="has_notes">С заметками</option>
                <option value="no_notes">Без заметок</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {(focusedTaskId || focusedContainerId) && (() => {
                const focusId = focusedTaskId || focusedContainerId;
                const node = activeNodes.find(n => n.id === focusId);
                const hasSaved = node && !!node.savedFilters;
                return (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSaveFiltersForFocusedNode}
                      className={`text-xs font-semibold flex items-center gap-1 cursor-pointer hover:underline py-1 px-2 rounded-lg transition-all border border-transparent ${
                        hasSaved 
                          ? 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15' 
                          : 'text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 bg-indigo-50/20'
                      }`}
                      title={hasSaved ? 'Обновить сохраненные настройки фильтров по умолчанию' : 'Сохранить текущие настройки фильтров по умолчанию'}
                    >
                      <Star className={`w-3.5 h-3.5 ${hasSaved ? 'fill-amber-500 text-amber-500' : ''}`} />
                      {hasSaved ? 'Обновить запомненные' : 'Запомнить фильтры'}
                    </button>
                    {hasSaved && (
                      <button
                        onClick={handleClearSavedFiltersForFocusedNode}
                        className="text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-450 font-semibold flex items-center gap-1 cursor-pointer hover:underline py-1 px-2 rounded-lg transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        title="Удалить сохраненные настройки фильтров по умолчанию"
                      >
                        <Trash className="w-3.5 h-3.5" />
                        Сбросить по умолчанию
                      </button>
                    )}
                  </div>
                );
              })()}

              {isAnyFilterActive && (
                <button
                  onClick={handleClearAllFilters}
                  className="text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer hover:underline py-1 px-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                >
                  <X className="w-3.5 h-3.5" />
                  Сбросить все
                </button>
              )}
            </div>
          </div>
        )}

        {/* The Mind Map Interactive Canvas Frame. Occupies 100% space! */}
        <div 
          className="flex-1 w-full min-h-0 relative bg-[#FAFBFD] dark:bg-slate-950/20 pb-14 sm:pb-0 flex flex-col"
          onMouseDown={handleGlobalMouseDown}
          onMouseMove={handleGlobalMouseMove}
          onMouseUp={handleGlobalMouseUp}
          onMouseLeave={handleGlobalMouseUp}
        >
          {/* Global Selection Marquee */}
          {isGlobalDragSelecting && globalSelectionStart && globalSelectionEnd && (
            <div
              className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-400/10 pointer-events-none rounded-sm transition-all duration-[10ms]"
              style={{
                left: Math.min(globalSelectionStart.x, globalSelectionEnd.x),
                top: Math.min(globalSelectionStart.y, globalSelectionEnd.y),
                width: Math.abs(globalSelectionStart.x - globalSelectionEnd.x),
                height: Math.abs(globalSelectionStart.y - globalSelectionEnd.y),
                zIndex: 9999
              }}
            />
          )}

          {/* Universal Focus Mode Banner for all non-canvas views */}
          {state.activeProjectId && viewMode !== 'canvas' && (focusedTaskId || focusedContainerId) && (() => {
            const focusId = focusedTaskId || focusedContainerId;
            const focusedNode = activeNodes.find(n => n.id === focusId);
            const hasSavedFilters = focusedNode && !!focusedNode.savedFilters;
            
            return (
              <div className="mx-4 sm:mx-6 mt-3 mb-1 p-2 px-3 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs flex items-center justify-between gap-3 select-none animate-in fade-in slide-in-from-top-2 z-30 shrink-0 pointer-events-auto">
                <div className="flex items-center gap-2 min-w-0">
                  {focusedContainerId ? (
                    <>
                      <span className="flex h-2 w-2 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0">📦 Контейнер:</span>
                        <strong className="font-extrabold text-amber-600 dark:text-amber-400 truncate">
                          {focusedNode?.text || 'Без названия'}
                        </strong>
                        {hasSavedFilters && (
                          <span className="shrink-0 text-[9px] font-extrabold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20" title="Применены фильтры по умолчанию">
                            ★ по умолчанию
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-2 w-2 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0">🎯 Задача:</span>
                        <strong className="font-extrabold text-rose-600 dark:text-rose-400 truncate">
                          {focusedNode?.text || 'Без названия'}
                        </strong>
                        {hasSavedFilters && (
                          <span className="shrink-0 text-[9px] font-extrabold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20" title="Применены фильтры по умолчанию">
                            ★ по умолчанию
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Remember/Reset Filters default configuration buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSaveFiltersForFocusedNode}
                      className={`p-1.5 rounded-lg border shadow-3xs cursor-pointer transition-colors flex items-center gap-1 ${
                        hasSavedFilters
                          ? 'border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900'
                      }`}
                      title={hasSavedFilters ? 'Фильтры сохранены по умолчанию. Кликните, чтобы обновить их текущими.' : 'Сохранить текущие фильтры как настройки по умолчанию для этого элемента'}
                    >
                      <Star className={`w-3.5 h-3.5 ${hasSavedFilters ? 'fill-amber-500 text-amber-500' : ''}`} />
                      <span className="text-[10px] font-bold hidden md:inline">
                        {hasSavedFilters ? 'Фильтры сохранены' : 'Запомнить фильтры'}
                      </span>
                    </button>
                    {hasSavedFilters && (
                      <button
                        onClick={handleClearSavedFiltersForFocusedNode}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer transition-colors"
                        title="Удалить сохраненные фильтры по умолчанию"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {focusedTaskId && (() => {
                    const focusedTask = activeNodes.find(n => n.id === focusedTaskId);
                    if (focusedTask && focusedTask.parentId) {
                      const parentTask = activeNodes.find(n => n.id === focusedTask.parentId);
                      return (
                        <button
                          onClick={() => setFocusedTaskId(focusedTask.parentId)}
                          className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer transition-colors"
                          title={`Вернуться к родителю: ${parentTask?.text || 'Без названия'}`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <button
                    onClick={() => {
                      if (focusedContainerId) setFocusedContainerId(null);
                      if (focusedTaskId) {
                        const focusedTask = activeNodes.find(n => n.id === focusedTaskId);
                        if (focusedTask && focusedTask.parentId) {
                          setFocusedTaskId(focusedTask.parentId);
                        } else {
                          setFocusedTaskId(null);
                        }
                      }
                    }}
                    className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-450 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer transition-colors"
                    title={
                      focusedTaskId && activeNodes.find(n => n.id === focusedTaskId)?.parentId
                        ? "Назад к родительской задаче"
                        : "Выйти из режима фокуса (назад к общему списку)"
                    }
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })()}
          
          {state.activeProjectId ? (
            viewMode === 'mobile-list' ? (
              <MobileListView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateMobileTask}
                onCreateTagCategory={handleCreateTagCategory}
                onUpdateTagCategory={handleUpdateTagCategory}
                onDeleteTagCategory={handleDeleteTagCategory}
                onFullScreenChange={setIsViewFullScreen}
                onFocusTaskOnCanvas={(taskId) => {
                  setFocusedTaskId(taskId);
                  setViewMode('canvas');
                }}
                onFocusedTaskIdChange={setFocusedTaskId}
                selectedNodeIds={selectedNodeIds}
                isMultiSelectMode={isMultiSelectMode}
                onToggleSelectNode={handleToggleSelectNode}
                onSelectNodes={(ids) => {
                  setSelectedNodeIds(ids);
                  setIsMultiSelectMode(ids.length > 0);
                }}
                onBulkDelete={handleBulkDelete}
                onBulkToggleCompleted={handleBulkToggleCompleted}
                setIsMultiSelectMode={setIsMultiSelectMode}
              />
            ) : viewMode === 'kanban' ? (
              <KanbanView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateKanbanTask}
                onCreateTagCategory={handleCreateTagCategory}
                selectedNodeIds={selectedNodeIds}
                onToggleSelectNode={handleToggleSelectNode}
                searchQuery={searchQuery}
                onFullScreenChange={setIsViewFullScreen}
                selectedCategoryId={filterCategoryId}
                onSelectCategoryId={setFilterCategoryId}
                kanbanGroupBy={kanbanGroupBy}
                onKanbanGroupByChange={setKanbanGroupBy}
                kanbanContainerFilterId={kanbanContainerFilterId}
                onKanbanContainerFilterIdChange={setKanbanContainerFilterId}
                sortBy={state.globalSettings?.kanbanSortBy}
                onSortByChange={handleKanbanSortByChange}
                collapseCompleted={state.globalSettings?.kanbanCollapseCompleted}
                onCollapseCompletedChange={handleKanbanCollapseCompletedChange}
                showSubtasks={state.globalSettings?.kanbanShowSubtasks}
                onShowSubtasksChange={handleKanbanShowSubtasksChange}
                isFiltersCollapsed={state.globalSettings?.kanbanFiltersCollapsed}
                onFiltersCollapsedChange={handleKanbanFiltersCollapsedChange}
                isCategoriesExpanded={state.globalSettings?.categoriesExpanded}
                onCategoriesExpandedChange={handleCategoriesExpandedChange}
                focusedContainerId={focusedContainerId}
                focusedTaskId={focusedTaskId}
                onFocusedTaskIdChange={setFocusedTaskId}
                filterStatus={filterStatus}
                filterPriority={filterPriority}
                filterTag={filterTag}
                filterDueDate={filterDueDate}
              />
            ) : viewMode === 'calendar' ? (
              <CalendarView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags, dueDate, dueTime) => {
                  handleCreateMobileTask(text, initialTags || [], 'none', dueDate, null, dueTime);
                }}
                setViewMode={setViewMode}
                onFullScreenChange={setIsViewFullScreen}
                onFocusedTaskIdChange={setFocusedTaskId}
              />
            ) : viewMode === 'gantt' ? (
              <GanttView
                nodes={displayedNodesForViews}
                allNodes={activeNodes}
                setViewMode={setViewMode}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags, dueDate) => {
                  handleCreateMobileTask(text, initialTags || [], 'none', dueDate);
                }}
                onFullScreenChange={setIsViewFullScreen}
                focusedTaskId={focusedTaskId}
                onFocusedTaskIdChange={setFocusedTaskId}
              />
            ) : viewMode === 'table' ? (
              <TableView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags) => {
                  handleCreateMobileTask(text, initialTags || [], 'none');
                }}
                selectedNodeIds={selectedNodeIds}
                onToggleSelectNode={handleToggleSelectNode}
                onToggleSelectAll={handleToggleSelectAll}
                onFullScreenChange={setIsViewFullScreen}
                onFocusedTaskIdChange={setFocusedTaskId}
              />
            ) : viewMode === 'eisenhower' ? (
              <EisenhowerMatrixView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateKanbanTask}
                selectedNodeIds={selectedNodeIds}
                searchQuery={searchQuery}
                onFullScreenChange={setIsViewFullScreen}
                onFocusedTaskIdChange={setFocusedTaskId}
              />
            ) : viewMode === 'anydo' ? (
              <AnyDoView
                nodes={activeNodes}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={handleSelectNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateKanbanTask}
                selectedNodeIds={selectedNodeIds}
                onToggleSelectNode={handleToggleSelectNode}
              />
            ) : (
              <MindMapCanvas
                nodes={displayedNodesForViews}
                darkMode={darkMode}
                googleToken={googleToken}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                lastCreatedNodeId={lastCreatedNodeId}
                onClearLastCreatedNodeId={() => setLastCreatedNodeId(null)}
                onSelectNode={handleSelectCanvasNode}
                selectedNodeIds={selectedNodeIds}
                isMultiSelectMode={isMultiSelectMode}
                onSelectNodes={(ids) => {
                  setSelectedNodeIds(ids);
                  setIsMultiSelectMode(ids.length > 0);
                }}
                onBulkDelete={handleBulkDelete}
                onBulkToggleCompleted={handleBulkToggleCompleted}
                onUpdateNodeCoordinates={handleUpdateNodeCoordinates}
                onUpdateNodeParent={handleUpdateNodeParent}
                onAddChildNode={handleAddChildNode}
                onAddFloatingNode={handleAddFloatingNode}
                onAddContainerNode={handleAddContainerNode}
                onAddInboxTask={handleAddInboxTask}
                onCopyNodes={(ids) => {
                  setCopySourceNodeIds(ids);
                  setIsCopyModalOpen(true);
                }}
                onDeleteNode={handleDeleteNode}
                onToggleNodeCompleted={handleToggleNodeCompleted}
                onToggleNodeCollapse={handleToggleNodeCollapse}
                onUpdateNode={handleUpdateNode}
                panX={panX}
                panY={panY}
                zoom={zoom}
                setPanX={setPanX}
                setPanY={setPanY}
                setZoom={setZoom}
                onOpenSidebar={() => setSidebarOpen(true)}
                onOpenDrawer={(initialFullscreen) => {
                  setIsDrawerOpen(true);
                  setDetailsPanelFullscreen(!!initialFullscreen);
                }}
                filterStatus={filterStatus}
                filterPriority={filterPriority}
                filterTag={filterTag}
                filterDueDate={filterDueDate}
                filterAttachments={filterAttachments}
                filterNotes={filterNotes}
                searchQuery={searchQuery}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                onContainerFocusChange={setIsContainerFocused}
                onFullScreenChange={setIsViewFullScreen}
                focusedTaskId={focusedTaskId}
                onFocusedTaskIdChange={setFocusedTaskId}
                focusedContainerId={focusedContainerId}
                onFocusedContainerIdChange={setFocusedContainerId}
              />
            )
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <p className="text-sm text-slate-400 font-serif max-w-sm">
                Нет открытых интеллект-карт. Создайте новую карту в левой панели, чтобы развернуть интерактивный холст целей!
              </p>
            </div>
          )}


        </div>

        {/* Unified Gorgeous Collapsible Bottom Views Panel */}
        {state.activeProjectId && (
          <div 
            className="hidden sm:block fixed z-[110] bottom-4 left-1/2 -translate-x-1/2"
          >
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-2 flex flex-col md:flex-row items-center gap-2 select-none">
              
              {/* Toggle Expand/Collapse Button (Header on mobile when expanded) */}
              <div className="flex items-center justify-between w-full md:w-auto shrink-0 gap-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-600 dark:text-indigo-400 pl-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span>Виды</span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsBottomViewsExpanded(!isBottomViewsExpanded)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title={isBottomViewsExpanded ? "Свернуть панель" : "Развернуть панель"}
                >
                  {isBottomViewsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>

              {isBottomViewsExpanded ? (
                <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 w-full md:w-auto">
                  {viewsList.map(option => {
                    const OptionIcon = option.icon;
                    const isSelected = viewMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setViewMode(option.id as any)}
                        className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/60 shadow-xs'
                            : 'text-slate-600 dark:text-slate-350 border-slate-100/50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <OptionIcon className="w-3.5 h-3.5" />
                        <span>{option.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {/* Compact Mode View Label */}
                  {(() => {
                    const activeOption = viewsList.find(o => o.id === viewMode);
                    if (!activeOption) return null;
                    const OptionIcon = activeOption.icon;
                    return (
                      <div className="px-3 py-1 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center gap-1.5 text-xs font-bold border border-indigo-200 dark:border-indigo-900/40">
                        <OptionIcon className="w-3.5 h-3.5 animate-bounce" style={{ animationDuration: '3s' }} />
                        <span>{activeOption.name}</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Focus Default View Controls */}
              {focusedNode && (
                <div className={`flex items-center gap-2 border-slate-200 dark:border-slate-800 shrink-0 ${
                  isBottomViewsExpanded ? 'w-full md:w-auto border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-3' : 'border-l pl-2'
                }`}>
                  <button
                    type="button"
                    onClick={handleToggleDefaultView}
                    className={`px-2.5 py-1 rounded-xl flex items-center gap-1.5 text-[11px] font-extrabold transition-all border shrink-0 cursor-pointer ${
                      focusedNode.defaultView === viewMode
                        ? 'bg-amber-500/10 dark:bg-amber-500/25 text-amber-600 dark:text-amber-450 border-amber-300 dark:border-amber-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/50'
                    }`}
                    title={
                      focusedNode.defaultView === viewMode
                        ? "Этот вид установлен по умолчанию для текущего фокуса. Нажмите, чтобы сбросить."
                        : "Сделать этот вид по умолчанию при открывании текущего контейнера/задачи в фокусе."
                    }
                  >
                    <Star className={`w-3.5 h-3.5 ${focusedNode.defaultView === viewMode ? 'fill-amber-500 text-amber-500' : 'text-slate-400'}`} />
                    <span className={isBottomViewsExpanded ? 'inline' : 'hidden md:inline'}>
                      {focusedNode.defaultView === viewMode ? 'По умолчанию' : 'Сделать по умолчанию'}
                    </span>
                  </button>
                  
                  {/* Tiny Indicator / Text showing current default view */}
                  {isBottomViewsExpanded && focusedNode.defaultView && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 italic font-bold truncate max-w-[150px]">
                      (дефолт: {viewsList.find(v => v.id === focusedNode.defaultView)?.name})
                    </span>
                  )}
                </div>
              )}
              
            </div>
          </div>
        )}

        {/* Task Properties slide-out drawer displays only on explicit open clicking Eye button */}
        {isDrawerOpen && selectedNode && (
          <TaskDetailsPanel
            node={selectedNode}
            allNodes={activeNodes}
            onClose={() => setIsDrawerOpen(false)}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onAddChildNode={handleAddChildNode}
            onSelectNode={handleSelectAndCenterNode}
            categories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
            onCreateTagCategory={handleCreateTagCategory}
            onUpdateTagCategory={handleUpdateTagCategory}
            onDeleteTagCategory={handleDeleteTagCategory}
            googleToken={googleToken}
            onUpdateNodeParent={handleUpdateNodeParent}
            initialTab={detailsPanelTab}
            initialFullscreen={detailsPanelFullscreen}
            lastCreatedNodeId={lastCreatedNodeId}
          />
        )}

        {aiConsoleOpen && (
          <div className={`fixed inset-y-0 z-45 flex flex-col transform transition-transform duration-300 ease-out border-l border-slate-200 dark:border-slate-800 ${
            isDrawerOpen && selectedNode ? 'right-0 md:right-[420px] w-full md:w-[350px]' : 'right-0 w-full md:w-[350px]'
          }`}>
            <GeminiAiConsole
              activeProjectId={state.activeProjectId}
              allNodes={activeNodes}
              onAddMultipleNodes={handleAddMultipleNodes}
              onUpdateNode={handleUpdateNode}
              onSelectNode={handleSelectAndCenterNode}
              selectedNode={selectedNode}
              onClose={() => setAiConsoleOpen(false)}
            />
          </div>
        )}
      </main>

      {/* Global Floating Active Pomodoro Badge */}
      {globalPomo && globalPomo.isRunning && (
        <div 
          onClick={() => {
            setSelectedNodeId(globalPomo.nodeId);
            setIsDrawerOpen(true);
          }}
          title={`Активный таймер Pomodoro: кликните, чтобы открыть задачу`}
          className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-rose-150 dark:border-rose-950/60 pl-3 pr-2 py-1.5 rounded-2xl shadow-[0_10px_25px_-5px_rgba(239,68,68,0.12),0_8px_10px_-6px_rgba(239,68,68,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)] cursor-pointer hover:scale-[1.04] active:scale-95 transition-all duration-300 select-none max-w-[calc(100vw-32px)]"
        >
          <div className="relative flex items-center justify-center">
            <span className="text-xl animate-bounce" style={{ animationDuration: '2s' }}>🍅</span>
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${globalPomo.isBreak ? 'bg-emerald-400' : 'bg-rose-450'}`}></span>
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${globalPomo.isBreak ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
          </div>
          <div className="flex flex-col min-w-0 pr-1">
            <span className={`text-[9px] font-extrabold uppercase tracking-wider ${globalPomo.isBreak ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-450'}`}>
              {globalPomo.isBreak ? '☕ Фокус окончен / Перерыв' : '🎯 Идет focus'}
            </span>
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate max-w-[155px] leading-tight flex items-center">
              {globalPomo.nodeText || 'Фокусировка'}
            </span>
          </div>
          <div className={`px-2 py-1.5 rounded-xl text-xs font-black font-mono tracking-wider leading-none transition-colors ${globalPomo.isBreak ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'}`}>
            {formatGlobalPomoTime(globalPomo.timeLeft)}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClosePomo();
            }}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Закрыть окошко Pomodoro"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Symmetrical Sync & Backup Dashboard Full Modal Backdrop Overlay */}
      {isSyncMenuOpen && (() => {
        const getQueuedDeletionsCount = () => {
          try {
            const listJson = localStorage.getItem('milli_deleted_registry') || '[]';
            return JSON.parse(listJson).length;
          } catch {
            return 0;
          }
        };
        
        const totalItemsCount = state.folders.length + 
          state.projects.length + 
          Object.values(state.nodes).flat().length + 
          (state.tagCategories || []).length;

        return (
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[999] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setIsSyncMenuOpen(false)}
          >
            <div 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 max-h-[92vh] relative text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4.5 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl shrink-0">
                    <Cloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
                      Резервное копирование и дельта-синхронизация
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      Взаимный обмен изменениями напрямую с вашей личной Google Таблицей
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSyncMenuOpen(false)}
                  className="p-1 px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all text-xs font-semibold"
                >
                  Закрыть
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                <button 
                  type="button"
                  onClick={() => setSyncModalTab('sheets')}
                  className={`flex-1 py-3 text-center text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                    syncModalTab === 'sheets' 
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800'
                  }`}
                >
                  📁 Google Таблицы
                </button>
                <button 
                  type="button"
                  onClick={() => setSyncModalTab('backups')}
                  className={`flex-1 py-3 text-center text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
                    syncModalTab === 'backups' 
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800'
                  }`}
                >
                  🛡️ Восстановление данных
                </button>
              </div>

              {/* Modal Content Scroll */}
              <div className="p-6 overflow-y-auto space-y-5.5 text-xs text-slate-700 dark:text-slate-300">
                
                {/* Connection status section */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      СТАТУС ПОДКЛЮЧЕНИЯ:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        hasSyncOrAuthError 
                          ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]' 
                          : currentUser 
                            ? 'bg-emerald-500 animate-pulse' 
                            : 'bg-amber-500 animate-ping'
                      }`} />
                      <span className="font-extrabold text-xs text-slate-800 dark:text-slate-150">
                        {hasSyncOrAuthError ? 'Ошибка синхронизации / авторизации' : currentUser ? 'Авторизован (Облачная синхронизация)' : 'Не авторизован (Локальный буфер)'}
                      </span>
                    </div>
                    
                    {currentUser && (
                      <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/50 rounded-lg max-w-xs">
                        {currentUser.photoURL ? (
                          <img referrerPolicy="no-referrer" src={currentUser.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-slate-200" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 font-bold flex items-center justify-center text-[10px] text-indigo-700 dark:text-indigo-400">
                            {currentUser.email?.[0].toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate leading-none text-[11px]">{currentUser.displayName || 'Пользователь Google'}</p>
                          <p className="text-[9px] text-slate-400 truncate leading-none mt-0.5">{currentUser.email}</p>
                          <p className="text-[8.5px] text-indigo-650 dark:text-indigo-400 font-mono leading-none mt-1 select-all" title="Ваш уникальный UID в системе Firebase">
                            UID: {currentUser.uid}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    {currentUser ? (
                      showLogoutConfirm ? (
                        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-1 duration-150">
                          <span className="text-[10px] text-rose-500 font-extrabold max-w-[120px] leading-tight">Выйти?</span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await logout();
                              } catch (e) {
                                console.error(e);
                              }
                              setShowLogoutConfirm(false);
                            }}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Да
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowLogoutConfirm(false)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Нет
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShowLogoutConfirm(true);
                          }}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all hover:scale-[1.01]"
                        >
                          <LogOut className="w-3.5 h-3.5 text-slate-400" />
                          <span>Выйти</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setAuthError(null);
                          try {
                            const res = await googleSignIn();
                            if (res) {
                              setCurrentUser(res.user);
                              setGoogleToken(res.accessToken);
                              setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
                            }
                          } catch (err: any) {
                            const msg = err?.message || String(err);
                            console.error("Sign in failed:", err);
                            if (msg.includes("unauthorized-domain") || (err?.code && err.code.includes("unauthorized-domain"))) {
                              setAuthError("unauthorized-domain");
                            } else {
                              setAuthError(msg);
                            }
                          }
                        }}
                        className="flex items-center gap-2.5 py-2.5 px-4.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] shadow-md hover:shadow-lg shrink-0 border border-indigo-700 dark:border-indigo-400"
                      >
                        <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                          <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.414 0-6.19-2.77-6.19-6.19 0-3.418 2.776-6.19 6.19-6.19 1.483 0 2.844.52 3.917 1.391l3.056-3.056C19.11 2.8 15.86 1.332 12.24 1.332 6.136 1.332 1.2 6.268 1.2 12.37s4.936 11.04 11.04 11.04c6.264 0 10.8-4.4 10.8-10.74 0-.74-.065-1.3-.18-1.85H12.24z"/>
                        </svg>
                        <span>Авторизоваться через Google</span>
                      </button>
                    )}
                  </div>
                </div>

                {syncModalTab === 'sheets' && (
                  <>
                    {/* Instant Sync on Exit Toggle */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-[12px] text-slate-800 dark:text-slate-200 leading-tight">
                        Умная синхронизация при выходе (для Смартфонов)
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        При сворачивании браузера, блокировке экрана или закрытии вкладки на смартфоне, приложение мгновенно выгрузит все несохраненные изменения в облако, чтобы они сразу появились на ПК.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newValue = !syncOnExit;
                      setSyncOnExit(newValue);
                      localStorage.setItem('milli_sync_on_exit', String(newValue));
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      syncOnExit ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        syncOnExit ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 
                  MANUAL FIRESTORE FORCE OVERRIDE BLOCK
                  Gives users absolute certainty to sync PC and Phone in 1 click
                */}
                {currentUser && (
                  <div className="bg-indigo-50/25 dark:bg-indigo-950/10 border border-indigo-150/80 dark:border-indigo-900/40 p-4.5 rounded-xl space-y-3.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 px-1.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded font-extrabold text-[10px]">
                        РЕШЕНИЕ СВЯЗИ
                      </div>
                      <h4 className="font-extrabold text-[12px] text-slate-800 dark:text-slate-200">
                        Принудительная синхронизация (ПК ⇄ Телефон)
                      </h4>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Если автоматический обмен застрял (или вы вошли под одним аккаунтом Google на ПК и телефоне, но изменения с одного девайса не отображаются на другом), воспользуйтесь кнопками <b>принудительного обхода</b>:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Left: Force Upload (Export) */}
                      <div className="border border-indigo-100/60 dark:border-indigo-950 bg-white dark:bg-slate-900 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                          <div className="font-extrabold text-[11px] text-indigo-750 dark:text-indigo-400 flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5" />
                            1. С ПК: ВЫГРУЗИТЬ В ОБЛАКО
                          </div>
                          <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-1 leading-normal">
                            Записать текущее состояние экрана в облако. Всё облако заменится вашей картой.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={forceCloudSyncLoading !== null}
                          onClick={() => forceUploadToCloud(state)}
                          className="mt-3 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-550 text-white rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {forceCloudSyncLoading === 'upload' ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Выгрузка...</span>
                            </>
                          ) : (
                            <span>Выгрузить в Облако</span>
                          )}
                        </button>
                      </div>

                      {/* Right: Force Download (Import) */}
                      <div className="border border-indigo-100/60 dark:border-indigo-950 bg-white dark:bg-slate-900 p-3 rounded-lg flex flex-col justify-between">
                        <div>
                          <div className="font-extrabold text-[11px] text-emerald-705 dark:text-emerald-400 flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5" />
                            2. НА ТЕЛЕФОНЕ: ЗАГРУЗИТЬ СЮДА
                          </div>
                          <p className="text-[10px] text-slate-550 dark:text-slate-400 mt-1 leading-normal">
                            Полностью перезаписать экран последними данными из облака (все локальные изменения исчезнут).
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={forceCloudSyncLoading !== null}
                          onClick={forceDownloadFromCloud}
                          className="mt-3 w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-550 text-white rounded-md text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {forceCloudSyncLoading === 'download' ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Загрузка...</span>
                            </>
                          ) : (
                            <span>Загрузить из Облака</span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Feedback Messages */}
                    {forceCloudSyncFeedback && (
                      <div className="bg-white dark:bg-slate-950 border border-indigo-100 dark:border-indigo-900 px-3 py-2.5 rounded-lg text-[11px] font-bold text-indigo-700 dark:text-indigo-400 flex items-start gap-2 animate-in fade-in duration-150">
                        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                        <span className="leading-snug">{forceCloudSyncFeedback}</span>
                      </div>
                    )}

                    {/* Troubleshooting list for separate accounts */}
                    <div className="bg-slate-100/50 dark:bg-slate-900/40 p-3 rounded-lg space-y-1.5">
                      <p className="font-extrabold text-[10px] text-slate-600 dark:text-slate-400">⚠️ Диагностический чек-лист:</p>
                      <ul className="list-disc list-inside space-y-1.5 text-slate-500 dark:text-slate-450 text-[10px] leading-relaxed">
                        <li>
                          <span className="font-bold text-slate-700 dark:text-slate-300">Проверьте UID (ID):</span> Сравните строку <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px]">UID</code> под вашей почтой на ПК и на Телефоне. Если эти буквы не совпадают — вы авторизованы под разными Google аккаунтами. <b>Они должны быть одинаковыми!</b>
                        </li>
                        <li>
                          <span className="font-bold text-slate-700 dark:text-slate-300">Блокировка Apple/Safari:</span> Мобильные системы очень часто замораживают веб-сокеты и соединение с Firestore при неактивном экране. Просто обновите вкладку на телефоне и нажмите <span className="underline">Загрузить из Облака</span>.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Unauthorized Domain Error Advice */}
                {authError && (
                  <div className="bg-red-50 dark:bg-rose-950/20 border border-red-200 dark:border-red-900 shadow-sm rounded-xl p-4 text-xs space-y-3">
                    <div className="flex items-center gap-1.5 text-red-650 dark:text-red-400 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>Ошибка авторизации (Unauthorized Domain)</span>
                    </div>
                    
                    {authError === 'unauthorized-domain' ? (
                      <div className="space-y-3 text-slate-600 dark:text-slate-350">
                        <p className="leading-relaxed">
                          Домен этой страницы не добавлен в список разрешённых для OAuth-авторизации в настройках вашего Firebase-проекта.
                        </p>
                        
                        <div className="bg-white dark:bg-slate-900 border border-red-105 dark:border-red-950 p-3 rounded-lg space-y-1.5">
                          <p className="font-bold text-slate-700 dark:text-slate-200">Как исправить за 1 минуту:</p>
                          <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                            <li>Перейдите в <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-650 dark:text-indigo-400 underline font-semibold">Консоль Firebase</a>.</li>
                            <li>Откройте проект <b>"Default Gemini Project"</b>.</li>
                            <li>Перейдите в раздел <b>Authentication</b> → вкладка <b>Settings</b> → <b>Authorized domains</b> (Разрешенные домены).</li>
                            <li>Нажмите кнопку <b>Add domain</b> и добавьте этот домен:</li>
                          </ol>
                          <div className="mt-2 flex items-center justify-between bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                            <span className="select-all truncate">{window.location.hostname}</span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(window.location.hostname);
                                alert('Скопировано!');
                              }}
                              className="text-indigo-600 dark:text-indigo-455 hover:underline cursor-pointer ml-1 text-[9px] font-bold"
                            >
                              Копировать
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-red-655 dark:text-red-400 leading-relaxed font-semibold">
                        {authError}
                      </p>
                    )}
                  </div>
                )}

                {/* Symmetrical Sync explainer section */}
                <div className="bg-indigo-50/45 dark:bg-indigo-950/15 border border-indigo-100/50 dark:border-indigo-900/35 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-none">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    Как работает дельта-синхронизация?
                  </h4>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-550 dark:text-slate-400 leading-relaxed font-normal text-[11px]">
                    <li>
                      <span className="font-semibold text-slate-700 dark:text-slate-350">Импортируются и экспортируются все данные</span>: папки, проекты, задачи и категории тегов на основе точных временных меток изменений.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-700 dark:text-slate-350">Двусторонний обмен</span>: любые новые элементы или корректировки (включая изменения на смартфонах или ПК) будут синхронизированы в обе стороны.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-700 dark:text-slate-350">Безопасное удаление</span>: ветви, задачи или категории, удаленные вами локально, автоматически списываются из облака при сеансе связи.
                    </li>
                  </ul>
                </div>

                {/* Bento Cards Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50/80 dark:bg-slate-850 border border-slate-200/50 dark:border-slate-855 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      ВСЕГО ОПЕРАЦИЙ В ПРИЛОЖЕНИИ
                    </span>
                    <span className="text-3xl font-extrabold text-indigo-650 dark:text-indigo-400 font-mono">
                      {totalItemsCount}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-1">
                      общая емкость структуры
                    </span>
                  </div>

                  <div className="bg-slate-50/80 dark:bg-slate-850 border border-slate-200/50 dark:border-slate-855 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      ИЗМЕНЕНИЙ В ОЧЕРЕДИ
                    </span>
                    <span className="text-3xl font-extrabold text-amber-500 font-mono">
                      {unsyncedEditsCount + getQueuedDeletionsCount()}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-1">
                      редактирований: {unsyncedEditsCount}, удаления: {getQueuedDeletionsCount()}
                    </span>
                  </div>
                </div>

                {/* Large Sync trigger button */}
                <div className="flex flex-col items-center gap-3 py-4 border-y border-slate-100 dark:border-slate-800">
                  {googleToken ? (
                    <button
                      type="button"
                      disabled={isSyncingSheets}
                      onClick={() => runSheetsSymmetricalSync(googleToken, state)}
                      className="w-full max-w-md bg-emerald-400 hover:bg-emerald-500 disabled:bg-emerald-400/55 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-slate-900 font-extrabold text-xs tracking-wider uppercase py-3.5 px-6 rounded-xl border border-emerald-400 dark:border-emerald-500 cursor-pointer shadow-md transition-all hover:scale-[1.015] flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                      <span>СИНХРОНИЗИРОВАТЬ С GOOGLE SHEETS</span>
                    </button>
                  ) : (
                    <div className="w-full max-w-md text-center p-3 border border-dashed border-slate-205 dark:border-slate-800 text-slate-400 rounded-xl bg-slate-50/30 italic">
                      Авторизуйтесь, чтобы запустить слияние с Google Sheets
                    </div>
                  )}

                  {syncStatus.sheets === 'synced' && syncStatus.lastSyncedTime && (
                    <div className="text-[10px] text-slate-455 dark:text-slate-400 italic">
                      Последняя синхронизация: {syncStatus.lastSyncedTime}
                    </div>
                  )}

                  {isSyncingSheets && (
                    <div className="text-[10px] text-indigo-505 font-bold animate-pulse">
                      Слияние изменений структуры дерева... Пожалуйста, подождите.
                    </div>
                  )}

                  {syncStatus.sheets === 'error' && (
                    isNetworkFailure ? (
                      <div className="w-full max-w-md bg-blue-50/70 dark:bg-slate-900/60 border border-blue-200 dark:border-slate-800 shadow-sm rounded-xl p-4 text-xs text-slate-700 dark:text-slate-350 space-y-2 mt-2">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-indigo-400 font-bold">
                          <Info className="w-4 h-4 shrink-0" />
                          <span>Google Sheets синхронизация приостановлена</span>
                        </div>
                        <p className="leading-relaxed text-slate-600 dark:text-slate-400">
                          Браузер ограничил сетевой запрос к API или вы работаете офлайн. Все ваши изменения надежно сохранены в локальном буфере и будут безопасно объединены с вашим облаком, как только возобновится подключение.
                        </p>
                        <div className="pt-2 flex items-center gap-2 justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              setSheetsError(null);
                              setSyncStatus(prev => ({ ...prev, sheets: 'idle' }));
                            }}
                            className="text-xs font-semibold px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all"
                          >
                            Скрыть уведомление
                          </button>
                          <button
                            type="button"
                            onClick={handleQuickSheetsSync}
                            className="text-xs font-semibold text-white px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-all"
                          >
                            Повторить попытку
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 shadow-sm rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 space-y-2.5 mt-2">
                      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-450 font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 animate-bounce" />
                        <span>Ошибка дельта-синхронизации (Google Sheets)</span>
                      </div>
                      
                      <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded border border-rose-100 dark:border-rose-900 font-mono text-[10px] text-rose-700 dark:text-rose-300 select-all overflow-x-auto whitespace-pre-wrap">
                        {sheetsError || 'Bilateral Symmetrical Sync Error: Failed to fetch'}
                      </div>

                      {sheetsError && (sheetsError.includes('401') || sheetsError.toUpperCase().includes('UNAUTHENTICATED')) && (
                        <div className="pt-1.5 pb-1">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setSheetsError(null);
                                setSyncStatus(prev => ({ ...prev, sheets: 'syncing' }));
                                const res = await googleSignIn();
                                if (res) {
                                  setCurrentUser(res.user);
                                  setGoogleToken(res.accessToken);
                                  // Changing googleToken will auto-trigger sync inside useEffect
                                } else {
                                  setSyncStatus(prev => ({ ...prev, sheets: 'error' }));
                                  setSheetsError('Не удалось войти.');
                                }
                              } catch (err: any) {
                                setSyncStatus(prev => ({ ...prev, sheets: 'error' }));
                                setSheetsError(err?.message || String(err));
                              }
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer transition-all shadow-md active:scale-[0.98]"
                          >
                            <span>Обновить авторизацию Google</span>
                          </button>
                        </div>
                      )}

                      <div className="text-[10.5px] space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                        <p className="font-bold text-slate-700 dark:text-slate-300">💡 Как это исправить:</p>
                        <ul className="list-decimal list-inside space-y-1.5 pl-1 leading-snug">
                          <li>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">Истекшее время авторизации</span>: 
                            Ваша сессия и Google-токен настроены на длительное действие до одного дня (24 часов). Если сессия завершилась, просто нажмите кнопку <b>"Выйти"</b> в окне "Статус подключения" выше, а затем повторно нажмите <b>"Авторизоваться через Google"</b> для полного обновления.
                          </li>
                          <li>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">Отключены Google API</span>: 
                            В консоли Google Cloud / Firebase проекта должны быть включены <b>Google Sheets API</b> и <b>Google Drive API</b>. Без этого запросы со стороны браузера отклоняются с ошибкой CORS.
                          </li>
                          <li>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">Блокировщики скриптов</span>: 
                            Ваш браузер или плагин (uBlock, AdBlock, Brave Shield) может блокировать сторонние запросы к доменам <i>googleapi</i>. Попробуйте отключить их для этого сайта.
                          </li>
                        </ul>
                      </div>
                    </div>
                  )
                  )}
                </div>

                {/* Sync Report detail lists */}
                <div className="space-y-3.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    ОТЧЕТ ПО СИНХРОНИЗАЦИИ ИЗМЕНЕНИЙ:
                  </span>

                  {syncReport ? (
                    <div className="space-y-4">
                      {/* Summary row */}
                      <div className="grid grid-cols-4 gap-2 bg-slate-50/50 dark:bg-slate-950/25 p-3 rounded-xl border border-slate-150 dark:border-slate-850 text-center text-xs font-mono font-bold">
                        <div>
                          <span className="block text-[8px] text-slate-400 font-sans uppercase">Выгружено</span>
                          <span className="text-emerald-550 dark:text-emerald-400">{syncReport.uploadedCount}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-slate-400 font-sans uppercase">Закачано</span>
                          <span className="text-indigo-600 dark:text-indigo-400">{syncReport.downloadedCount}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-slate-400 font-sans uppercase">Удалено в обл.</span>
                          <span className="text-rose-600 dark:text-rose-450">{syncReport.deletedTableCount}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] text-slate-400 font-sans uppercase">Удалено лок.</span>
                          <span className="text-amber-600 dark:text-amber-500">{syncReport.deletedLocallyCount}</span>
                        </div>
                      </div>

                      {/* Detailed rows */}
                      <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        <div className="px-3.5 py-1.5 bg-slate-50 dark:bg-slate-850 font-bold text-slate-400 uppercase tracking-wider text-[8px]">
                          ДЕТАЛИЗАЦИЯ ИЗМЕНЕНИЙ:
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-650 dark:text-slate-350">Папки (Folders):</span>
                          <span className="font-mono text-slate-400 dark:text-slate-450">{syncReport.foldersAdded} доб. / {syncReport.foldersUpdated} обн.</span>
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-650 dark:text-slate-350">Проекты (Projects):</span>
                          <span className="font-mono text-slate-400 dark:text-slate-450">{syncReport.projectsAdded} доб. / {syncReport.projectsUpdated} обн.</span>
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-650 dark:text-slate-350">Задачи / Ветки (Nodes):</span>
                          <span className="font-mono text-slate-400 dark:text-slate-450">{syncReport.nodesAdded} доб. / {syncReport.nodesUpdated} обн.</span>
                        </div>
                        <div className="px-4 py-2 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-650 dark:text-slate-350">Категории тегов (Tag Categories):</span>
                          <span className="font-mono text-slate-400 dark:text-slate-450">{syncReport.tagCategoriesAdded} r. / {syncReport.tagCategoriesUpdated} o.</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-155 dark:border-slate-800 rounded-xl text-slate-400 italic bg-slate-50/20">
                      Выполните первую синхронизацию, чтобы сформировать отчет по изменениям.
                    </div>
                  )}
                </div>
              </>
            )}



            {syncModalTab === 'backups' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Explainer / Header */}
                <div className="bg-indigo-50/45 dark:bg-indigo-950/15 border border-indigo-100/50 dark:border-indigo-900/35 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-none text-xs sm:text-sm">
                    <Shield className="w-4 h-4 text-indigo-500" />
                    Резервное копирование и автоматическая очистка (30 дней)
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-normal text-[11px]">
                    Система автоматически создает снимок всего вашего рабочего пространства раз в день при запуске приложения. 
                    В соответствии с вашей политикой безопасности, <b>все резервные копии и история изменений задач старше 30 дней автоматически удаляются</b> для оптимизации хранилища и защиты данных.
                  </p>
                </div>

                {/* Create manual checkpoint */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-855 rounded-xl">
                  <div>
                    <h5 className="font-bold text-slate-700 dark:text-slate-300">Создать копию вручную</h5>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Сохранить текущее состояние экрана прямо сейчас</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateManualBackup}
                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer transition-colors shadow-sm flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Создать снимок
                  </button>
                </div>

                {/* Notifications */}
                {backupRestoreSuccess && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3.5 text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{backupRestoreSuccess}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setBackupRestoreSuccess(null)}
                      className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-350 font-bold text-[10px] uppercase cursor-pointer"
                    >
                      Ок
                    </button>
                  </div>
                )}

                {/* Backups List */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-550 dark:text-slate-450 text-[10px] tracking-wider uppercase">
                    Доступные снимки и резервные копии ({backupsList.length})
                  </h4>

                  {backupsList.length === 0 ? (
                    <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400 dark:text-slate-500 italic">
                      Нет доступных резервных копий. Резервная копия создастся автоматически при дальнейших изменениях.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {backupsList.map((b) => {
                        const date = new Date(b.timestamp);
                        const isManual = b.id.startsWith('manual');
                        const foldersCount = b.state?.folders?.length || 0;
                        const projectsCount = b.state?.projects?.length || 0;
                        const tasksCount = Object.values(b.state?.nodes || {}).reduce(
                          (acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0
                        );

                        return (
                          <div 
                            key={b.id} 
                            className="p-3.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl flex items-center justify-between gap-4 transition-all"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                  {date.toLocaleString('ru-RU', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                  isManual 
                                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30' 
                                    : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30'
                                }`}>
                                  {isManual ? 'Вручную' : 'Авто'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                <span>📁 Папок: <b>{foldersCount}</b></span>
                                <span>📂 Проектов: <b>{projectsCount}</b></span>
                                <span>📝 Задач: <b>{tasksCount}</b></span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {backupRestoreConfirmId === b.id ? (
                                <div className="flex items-center gap-1.5 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/20 p-1.5 rounded-lg animate-in slide-in-from-right-2 duration-150">
                                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-450 px-1">Восстановить?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreBackup(b)}
                                    className="py-1 px-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] rounded cursor-pointer transition-colors"
                                  >
                                    Да
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBackupRestoreConfirmId(null)}
                                    className="py-1 px-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] rounded cursor-pointer transition-colors"
                                  >
                                    Нет
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBackupRestoreConfirmId(b.id);
                                    setBackupRestoreSuccess(null);
                                  }}
                                  className="py-1.5 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-indigo-600 dark:text-indigo-400 font-extrabold text-xs rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Восстановить
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

              {/* Modal Footer (direct sheet link) */}
              {localStorage.getItem('google_sheets_sync_file_id') && (
                <div className="border-t border-slate-150 dark:border-slate-850 p-4.5 bg-slate-50 dark:bg-slate-900/60 flex items-center shrink-0">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${localStorage.getItem('google_sheets_sync_file_id')}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-indigo-655 dark:text-indigo-400 hover:underline font-bold text-[11px]"
                  >
                    <svg className="w-4 h-4 fill-current text-emerald-500 shrink-0" viewBox="0 0 24 24">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3.5 14h-7V7h7v10z"/>
                    </svg>
                    <span>Открыть личную таблицу MindMap_Sync_Workbook ↗</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ================= COPY MODAL OVERLAY ================= */}
      {isCopyModalOpen && (() => {
        const sourceProjId = state.activeProjectId;
        if (!sourceProjId) return null;

        const sourceProject = state.projects.find(p => p.id === sourceProjId);
        const sourceNodes = state.nodes[sourceProjId] || [];
        const totalNodes = sourceNodes.filter(n => !n.archived).length;
        const selectedCount = copySourceNodeIds.length;
        
        return (
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setIsCopyModalOpen(false)}
          >
            <div 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 max-h-[92vh] relative text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4.5 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl shrink-0 text-indigo-600 dark:text-indigo-400">
                    <Copy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
                      Копирование задач
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      Перенос или дублирование задач между интеллект-картами
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCopyModalOpen(false)}
                  className="p-1 px-2.5 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all text-xs font-semibold"
                >
                  Отмена
                </button>
              </div>

              {/* Modal Content Inner Form */}
              <CopyModalInner 
                sourceProjId={sourceProjId}
                sourceProject={sourceProject}
                totalNodes={totalNodes}
                selectedCount={selectedCount}
                copySourceNodeIds={copySourceNodeIds}
                sourceNodes={sourceNodes}
                projects={state.projects}
                copyTargetProjectId={copyTargetProjectId}
                setCopyTargetProjectId={setCopyTargetProjectId}
                onPerformCopy={(scope, targetId, openTarget) => {
                  const nodeIdsToCopy = scope === 'selected' ? copySourceNodeIds : [];
                  handlePerformCopy(nodeIdsToCopy, targetId, openTarget);
                  setIsCopyModalOpen(false);
                }}
                onCreateProject={handleCreateTargetProject}
              />
            </div>
          </div>
        );
      })()}

      {/* ================= ACTIVE REMINDERS FLOATING NOTIFICATIONS OVERLAY ================= */}
      {triggeredReminders.length > 0 && (() => {
        const reminder = triggeredReminders[activeReminderIndex] || triggeredReminders[0];
        if (!reminder) return null;

        const targetList = state.nodes[reminder.projectId] || [];
        const targetNode = targetList.find(n => n.id === reminder.nodeId);
        const currentReminderDate = targetNode?.reminderDate || reminder.targetTime.split(' ')[0] || '';
        const currentReminderTime = targetNode?.reminderTime || reminder.targetTime.split(' ')[1] || '';
        const targetProject = state.projects.find(p => p.id === reminder.projectId);
        const projectName = targetProject ? targetProject.name : 'Личное';

        // Select color based on priority
        let priorityColor = 'border-slate-400';
        let priorityBg = 'bg-slate-500';
        let priorityText = 'Без приоритета';
        if (targetNode?.priority === 'urgent') {
          priorityColor = 'border-rose-500';
          priorityBg = 'bg-rose-500';
          priorityText = 'Срочно';
        } else if (targetNode?.priority === 'high') {
          priorityColor = 'border-orange-500';
          priorityBg = 'bg-orange-500';
          priorityText = 'Высокий';
        } else if (targetNode?.priority === 'medium') {
          priorityColor = 'border-amber-500';
          priorityBg = 'bg-amber-500';
          priorityText = 'Средний';
        } else if (targetNode?.priority === 'low') {
          priorityColor = 'border-blue-500';
          priorityBg = 'bg-blue-500';
          priorityText = 'Низкий';
        }

        // Quick snooze helper from CURRENT exact time to guarantee snooze is in future
        const handleQuickSnooze = (mins: number) => {
          if (!targetNode) return;
          try {
            const baseTime = new Date();
            const updatedTime = new Date(baseTime.getTime() + mins * 60 * 1000);
            const nextDateStr = updatedTime.getFullYear() + '-' + String(updatedTime.getMonth() + 1).padStart(2, '0') + '-' + String(updatedTime.getDate()).padStart(2, '0');
            const nextTimeStr = String(updatedTime.getHours()).padStart(2, '0') + ':' + String(updatedTime.getMinutes()).padStart(2, '0');
            
            updateNodeInProject(reminder.projectId, {
              ...targetNode,
              reminderDate: nextDateStr,
              reminderTime: nextTimeStr,
              reminderDismissed: false
            });
            setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
          } catch (err) { console.error(err); }
        };

        // Snooze all reminders at once by 15 minutes helper
        const handleSnoozeAll = () => {
          triggeredReminders.forEach(rem => {
            const list = state.nodes[rem.projectId] || [];
            const node = list.find(n => n.id === rem.nodeId);
            if (node) {
              const baseTime = new Date();
              const updatedTime = new Date(baseTime.getTime() + 15 * 60 * 1000);
              const nextDateStr = updatedTime.getFullYear() + '-' + String(updatedTime.getMonth() + 1).padStart(2, '0') + '-' + String(updatedTime.getDate()).padStart(2, '0');
              const nextTimeStr = String(updatedTime.getHours()).padStart(2, '0') + ':' + String(updatedTime.getMinutes()).padStart(2, '0');
              
              updateNodeInProject(rem.projectId, {
                ...node,
                reminderDate: nextDateStr,
                reminderTime: nextTimeStr,
                reminderDismissed: false
              });
            }
          });
          setTriggeredReminders([]);
        };

        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-[390px] w-[calc(100%-2rem)] px-2 md:px-0 pointer-events-auto animate-in slide-in-from-bottom duration-300">
            <div className={`bg-white dark:bg-slate-900 border-l-[6px] ${priorityColor} border-t border-r border-b border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col gap-3 p-4`}>
              
              {/* Header inside the popup */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="flex h-3 w-3 absolute -top-0.5 -right-0.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    </span>
                    <span className="flex-shrink-0 bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded-xl text-rose-600 dark:text-rose-400 block">
                      <BellRing className="w-4 h-4 animate-bounce" />
                    </span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-[10px] tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                      НАПОМИНАНИЕ
                    </h4>
                    {triggeredReminders.length > 1 && (
                      <span className="text-[10px] text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                        В очереди: {triggeredReminders.length}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {triggeredReminders.length > 1 && (
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-lg">
                      <button
                        disabled={activeReminderIndex === 0}
                        onClick={() => setActiveReminderIndex(prev => prev - 1)}
                        className="p-1 rounded hover:bg-slate-250 dark:hover:bg-slate-705 disabled:opacity-30 transition-colors cursor-pointer"
                        title="Предыдущее"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      </button>
                      <span className="text-[10.5px] font-bold font-mono px-1 select-none text-slate-700 dark:text-slate-300">
                        {activeReminderIndex + 1}/{triggeredReminders.length}
                      </span>
                      <button
                        disabled={activeReminderIndex === triggeredReminders.length - 1}
                        onClick={() => setActiveReminderIndex(prev => prev + 1)}
                        className="p-1 rounded hover:bg-slate-250 dark:hover:bg-slate-705 disabled:opacity-30 transition-colors cursor-pointer"
                        title="Следующее"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      if (targetNode) {
                        updateNodeInProject(reminder.projectId, {
                          ...targetNode,
                          reminderDismissed: true
                        });
                      }
                      setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
                    }}
                    className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer animate-pulse"
                    title="Закрыть напоминание"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Task Core Info */}
              <div className="flex items-start gap-3 pl-1 pt-0.5">
                {/* Complete checkbox button */}
                <button
                  onClick={() => {
                    if (targetNode) {
                      updateNodeInProject(reminder.projectId, {
                        ...targetNode,
                        completed: true,
                        reminderDismissed: true
                      });
                    }
                    setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
                  }}
                  className="mt-0.5 flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 border-slate-310 dark:border-slate-705 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-center group/check transition-all duration-200 cursor-pointer"
                  title="Выполнить задачу и закрыть"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover/check:opacity-100 transition-opacity" />
                </button>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-[14px] leading-snug break-words">
                    {reminder.text}
                  </p>
                  
                  {targetNode?.notes ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-h-[80px] overflow-y-auto bg-slate-50 dark:bg-slate-950/20 p-2 rounded-lg border border-slate-100 dark:border-slate-850/50 font-sans leading-relaxed whitespace-pre-wrap">
                      {targetNode.notes}
                    </p>
                  ) : null}

                  {/* Task Metadata pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-0.5">
                    <span className="text-[9.5px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 border border-indigo-100/60 dark:border-indigo-900/40 px-2 py-0.5 rounded-full font-bold">
                      📦 {projectName}
                    </span>
                    <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold border ${
                      targetNode?.priority === 'urgent' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-450 border-rose-200 dark:border-rose-900/50' :
                      targetNode?.priority === 'high' ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-450 border-orange-200 dark:border-orange-900/50' :
                      targetNode?.priority === 'medium' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-450 border-amber-200 dark:border-amber-900/50' :
                      targetNode?.priority === 'low' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-450 border-blue-200 dark:border-blue-900/50' :
                      'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}>
                      ⚡ {priorityText}
                    </span>
                    {targetNode?.dueDate && (
                      <span className="text-[9.5px] bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100/60 dark:border-rose-900/40 px-2 py-0.5 rounded-full font-bold">
                        🕒 {targetNode.dueDate} {targetNode.dueTime || ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Snooze Options Panels */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-1 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                    ОТЛОЖИТЬ НАПОМИНАНИЕ:
                  </span>
                  
                  {/* Toggle custom date pickers */}
                  <button
                    onClick={() => setShowCustomSnooze(!showCustomSnooze)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      showCustomSnooze 
                        ? 'bg-rose-500 text-white shadow-sm' 
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-705 dark:text-slate-350'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{showCustomSnooze ? 'Быстро' : 'Вручную'}</span>
                  </button>
                </div>

                {!showCustomSnooze ? (
                  /* Standard Quick Snooze presets with comfortable tap-friendly buttons */
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => handleQuickSnooze(15)}
                      className="px-2 py-2 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950/30 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 text-[11px] rounded-xl border border-slate-150 dark:border-slate-800/80 cursor-pointer font-bold transition-all active:scale-97"
                    >
                      +15 минут
                    </button>
                    <button
                      onClick={() => handleQuickSnooze(30)}
                      className="px-2 py-2 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950/30 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 text-[11px] rounded-xl border border-slate-150 dark:border-slate-800/80 cursor-pointer font-bold transition-all active:scale-97"
                    >
                      +30 минут
                    </button>
                    <button
                      onClick={() => handleQuickSnooze(60)}
                      className="px-2 py-2 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950/30 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 text-[11px] rounded-xl border border-slate-150 dark:border-slate-800/80 cursor-pointer font-bold transition-all active:scale-97"
                    >
                      +1 час
                    </button>
                    <button
                      onClick={() => handleQuickSnooze(180)}
                      className="px-2 py-2 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950/30 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 text-[11px] rounded-xl border border-slate-150 dark:border-slate-800/80 cursor-pointer font-bold transition-all active:scale-97"
                    >
                      +3 часа
                    </button>
                    <button
                      onClick={() => handleQuickSnooze(1440)}
                      className="px-2 py-2 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950/30 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-650 dark:text-slate-300 dark:hover:text-indigo-400 text-[11px] rounded-xl border border-slate-150 dark:border-slate-800/80 cursor-pointer font-bold transition-all active:scale-97 col-span-2 text-center"
                    >
                      Отложить на 1 день (24 часа)
                    </button>
                  </div>
                ) : (
                  /* Custom Snooze date time panel */
                  <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-800 p-2.5 rounded-xl space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">ДАТА:</label>
                        <input 
                          type="date"
                          value={currentReminderDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            if (!newDate || !targetNode) return;
                            updateNodeInProject(reminder.projectId, {
                              ...targetNode,
                              reminderDate: newDate,
                              reminderDismissed: false
                            });
                          }}
                          className="w-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-705 dark:text-slate-200 rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">ВРЕМЯ:</label>
                        <input 
                          type="time"
                          value={currentReminderTime}
                          onChange={(e) => {
                            const newTime = e.target.value;
                            if (!newTime || !targetNode) return;
                            updateNodeInProject(reminder.projectId, {
                              ...targetNode,
                              reminderTime: newTime,
                              reminderDismissed: false
                            });
                          }}
                          className="w-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-705 dark:text-slate-200 rounded-lg p-1.5 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        // Dismiss the visual reminder block once custom input is confirmed
                        setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
                      }}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm transition-all active:scale-98 text-center font-mono uppercase"
                    >
                      Применить и закрыть
                    </button>
                  </div>
                )}

                <div className="pl-2 grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => {
                      // Switch project if different
                      if (state.activeProjectId !== reminder.projectId) {
                        setState(prev => ({
                          ...prev,
                          activeProjectId: reminder.projectId
                        }));
                      }
                      // Select node and show details
                      setSelectedNodeId(reminder.nodeId);
                      setIsDrawerOpen(true);
                    }}
                    className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/40 text-indigo-650 dark:text-indigo-400 text-[10.5px] font-bold rounded-xl transition-all text-center cursor-pointer"
                  >
                    Открыть задачу
                  </button>
                  <button
                    onClick={() => {
                      if (targetNode) {
                        updateNodeInProject(reminder.projectId, {
                          ...targetNode,
                          reminderDismissed: true
                        });
                      }
                      setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
                    }}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-bold rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    Прочитано (ОК)
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Global Bulk Action Panel for Desktop */}
      <AnimatePresence>
        {selectedNodeIds.length > 0 && viewMode !== 'mobile-list' && viewMode !== 'canvas' && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-row items-center gap-3 px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_12px_40px_-6px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_-6px_rgba(0,0,0,0.5)] select-none text-slate-800 dark:text-slate-100 max-w-xl shrink-0"
          >
            <div className="flex items-center gap-2 px-1 shrink-0">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-[10px] font-black text-indigo-600 dark:text-indigo-400 font-mono">
                {selectedNodeIds.length}
              </span>
              <span className="text-xs font-bold tracking-tight text-slate-700 dark:text-slate-300">Выделено</span>
            </div>
            
            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBulkToggleCompleted(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Выполнить</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBulkToggleCompleted(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
              >
                <Circle className="w-3.5 h-3.5 text-slate-400" />
                <span>Сбросить статус</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBulkDelete();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-rose-500 hover:bg-rose-600 text-white shadow-sm transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCopySourceNodeIds(selectedNodeIds);
                  setIsCopyModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-650 dark:hover:text-indigo-400 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500" />
                <span>Копировать</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeIds([]);
                  setIsMultiSelectMode(false);
                }}
                className="flex items-center justify-center p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                title="Сбросить выделение"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// COPY / DUPLICATE TASKS INTERNAL MODAL COMPONENT
// ============================================================================

interface CopyModalInnerProps {
  sourceProjId: string;
  sourceProject: any;
  totalNodes: number;
  selectedCount: number;
  copySourceNodeIds: string[];
  sourceNodes: any[];
  projects: any[];
  copyTargetProjectId: string | null;
  setCopyTargetProjectId: (id: string | null) => void;
  onPerformCopy: (scope: 'selected' | 'all', targetId: string, openTarget: boolean) => void;
  onCreateProject: (name: string) => void;
}

function CopyModalInner({
  sourceProjId,
  sourceProject,
  totalNodes,
  selectedCount,
  copySourceNodeIds,
  projects,
  copyTargetProjectId,
  setCopyTargetProjectId,
  onPerformCopy,
  onCreateProject
}: CopyModalInnerProps) {
  const [scope, setScope] = useState<'selected' | 'all'>(selectedCount > 0 ? 'selected' : 'all');
  const [projSearch, setProjSearch] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [openTarget, setOpenTarget] = useState(true);
  const [showNewProjForm, setShowNewProjForm] = useState(false);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projSearch.toLowerCase())
  );

  const handleCreateAndSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    onCreateProject(newProjName.trim());
    setNewProjName('');
    setShowNewProjForm(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5.5 max-h-[70vh] text-slate-700 dark:text-slate-300">
      {/* 1. Scope Selection (Only if we have selected nodes) */}
      {selectedCount > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 block">
            Область копирования
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option A: Selected tasks */}
            <div 
              onClick={() => setScope('selected')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col justify-between gap-1.5 transition-all duration-200 select-none ${
                scope === 'selected'
                  ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/15 text-indigo-700 dark:text-indigo-400 font-bold'
                  : 'border-slate-150 dark:border-slate-800 bg-slate-50/30 hover:bg-slate-50 dark:bg-slate-900/10 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold truncate">Выбранные задачи</span>
                <span className="text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-md shrink-0">
                  {selectedCount} шт
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-medium">
                Будут скопированы только выделенные на данный момент задачи и их связи.
              </p>
            </div>

            {/* Option B: All project tasks */}
            <div 
              onClick={() => setScope('all')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col justify-between gap-1.5 transition-all duration-200 select-none ${
                scope === 'all'
                  ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/15 text-indigo-700 dark:text-indigo-400 font-bold'
                  : 'border-slate-150 dark:border-slate-800 bg-slate-50/30 hover:bg-slate-50 dark:bg-slate-900/10 dark:hover:bg-slate-900/30 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold truncate">Весь проект целиком</span>
                <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md shrink-0">
                  {totalNodes} шт
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-medium">
                Будет скопирован весь активный граф задач текущего проекта "{sourceProject?.name || ''}".
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Target Project Selection */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 block">
            Целевая интеллект-карта
          </label>
          <button
            type="button"
            onClick={() => setShowNewProjForm(!showNewProjForm)}
            className="text-[11px] font-extrabold text-indigo-650 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Новая карта...</span>
          </button>
        </div>

        {/* Create new project inline form */}
        {showNewProjForm && (
          <form 
            onSubmit={handleCreateAndSelect} 
            className="flex gap-2 p-3 bg-indigo-500/5 dark:bg-indigo-400/5 border border-indigo-150 dark:border-indigo-950/40 rounded-xl animate-in slide-in-from-top-2 duration-150"
          >
            <input
              type="text"
              placeholder="Введите название новой карты..."
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100"
              autoFocus
            />
            <button
              type="submit"
              disabled={!newProjName.trim()}
              className="bg-indigo-600 hover:bg-indigo-750 text-white disabled:opacity-50 text-[10px] font-extrabold uppercase tracking-wider py-1 px-3 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Создать</span>
            </button>
          </form>
        )}

        {/* Project List Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Поиск по интеллект-картам..."
            value={projSearch}
            onChange={(e) => setProjSearch(e.target.value)}
            className="w-full bg-slate-55 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100 placeholder-slate-405"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        {/* Project List Selection Container */}
        <div className="max-h-[190px] overflow-y-auto border border-slate-150 dark:border-slate-800/80 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/40 bg-slate-50/20 dark:bg-slate-900/20 p-1 space-y-0.5">
          {filteredProjects.length > 0 ? (
            filteredProjects.map(p => {
              const isSelected = copyTargetProjectId === p.id;
              const isCurrent = p.id === sourceProjId;
              
              return (
                <div
                  key={p.id}
                  onClick={() => setCopyTargetProjectId(p.id)}
                  className={`w-full text-left py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 cursor-pointer select-none transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-slate-705 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                  }`}
                  style={{ minHeight: '40px' }} // Touch target size friendly
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm shrink-0">🗺️</span>
                    <div className="truncate">
                      <span className="truncate block leading-tight">{p.name}</span>
                      <span className={`text-[9px] font-mono block mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                        {isCurrent ? 'Текущая карта (Задачи продублируются со смещением)' : 'Копирование в стороннюю карту'}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-white shrink-0" />
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-xs text-slate-400 italic">Интеллект-карты не найдены</div>
          )}
        </div>
      </div>

      {/* 3. Post Copy Switch Action Option */}
      <div className="flex items-center gap-2.5 pt-1">
        <input
          id="openTargetProjectAfterCopyCheckbox"
          type="checkbox"
          checked={openTarget}
          onChange={(e) => setOpenTarget(e.target.checked)}
          className="w-4 h-4 text-indigo-650 bg-slate-50 border-slate-200 rounded-md focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700 cursor-pointer"
        />
        <label 
          htmlFor="openTargetProjectAfterCopyCheckbox"
          className="text-xs text-slate-600 dark:text-slate-400 font-medium select-none cursor-pointer"
        >
          Автоматически перейти в выбранную карту после копирования
        </label>
      </div>

      {/* 4. Action Buttons Footer */}
      <div className="border-t border-slate-150 dark:border-slate-800 pt-4 flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => onPerformCopy(scope, copyTargetProjectId!, openTarget)}
          disabled={!copyTargetProjectId}
          className="bg-indigo-600 hover:bg-indigo-750 text-white disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-[0.98]"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Копировать задачи ({scope === 'selected' ? selectedCount : totalNodes} шт)</span>
        </button>
      </div>
    </div>
  );
}
