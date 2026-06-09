import React, { useState, useEffect, useMemo } from 'react';
import { 
  Menu, 
  Moon, 
  Sun, 
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
  Cloud,
  CloudOff,
  Wifi,
  WifiOff,
  Check,
  Database,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  GanttChart,
  Table,
  Bell,
  BellRing,
  Upload,
  Download,
  Info
} from 'lucide-react';
import { WorkspaceState, TaskNode, Folder, Project, Priority, TagCategory, SyncReport } from './types';
import { loadWorkspace, saveWorkspace, generateId, syncCompletion, toggleNodeAndDescendants, toggleNodeArchive, playNotificationChime } from './utils';
import Sidebar from './components/Sidebar';
import MindMapCanvas from './components/MindMapCanvas';
import TaskDetailsPanel from './components/TaskDetailsPanel';
import KanbanView from './components/KanbanView';
import MobileListView from './components/MobileListView';
import CalendarView from './components/CalendarView';
import GanttView from './components/GanttView';
import TableView from './components/TableView';

// Import Google Sheets & Firebase Auth systems
import { 
  initAuth, 
  googleSignIn, 
  logout,
  setAccessToken,
  db
} from './lib/firebase';
import { 
  saveToFirebaseDirectly, 
  loadFromFirebaseDirectly, 
  syncWithGoogleSheets, 
  logDeletion,
  mergeWorkspaceStates,
  getLocalDeletions
} from './lib/syncService';
import { doc, onSnapshot } from 'firebase/firestore';
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
        pn.progress !== nn.progress ||
        pn.isFloating !== nn.isFloating ||
        pn.isContainer !== nn.isContainer ||
        pn.width !== nn.width ||
        pn.height !== nn.height ||
        JSON.stringify(pn.files) !== JSON.stringify(nn.files) ||
        JSON.stringify(pn.tags) !== JSON.stringify(nn.tags);
//        JSON.stringify(pn.tags) !== JSON.stringify(nn.tags); // Note: I might have removed this inadvertently

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


/**
 * Keeps global WorkspaceState and all active projects fully in sync regarding tagCategories.
 * This guarantees categories and tags do not disappear when restoring snapshots from Firestore or Google Sheets.
 */
function normalizeWorkspaceState(wsState: WorkspaceState): WorkspaceState {
  if (!wsState) return wsState;

  const folders = wsState.folders || [];
  const projects = wsState.projects || [];
  const nodes = wsState.nodes || {};
  let tagCategories = wsState.tagCategories || [];

  // If root tagCategories are empty but projects have them, extract them
  if (tagCategories.length === 0) {
    const projectCats = projects.flatMap(p => p.tagCategories || []);
    const seen = new Set<string>();
    tagCategories = projectCats.filter(cat => {
      if (seen.has(cat.id)) return false;
      seen.add(cat.id);
      return true;
    });
  }

  // Hydrate empty projects, and merge tags globally to avoid losing any categories
  const updatedProjects = projects.map(p => {
    const pCats = p.tagCategories || [];
    
    // Merge project-specific and global categories
    const mergedCatsMap = new Map<string, TagCategory>();
    tagCategories.forEach(c => mergedCatsMap.set(c.id, c));
    pCats.forEach(c => {
      const existing = mergedCatsMap.get(c.id);
      if (!existing || new Date(c.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()) {
        mergedCatsMap.set(c.id, c);
      }
    });

    return {
      ...p,
      tagCategories: Array.from(mergedCatsMap.values())
    };
  });

  // Re-flatten to root categories to maintain absolute synchronization
  const finalRootCats = updatedProjects.flatMap(p => p.tagCategories || []);
  const seenIds = new Set<string>();
  const deduplicatedRootCats = finalRootCats.filter(cat => {
    if (seenIds.has(cat.id)) return false;
    seenIds.add(cat.id);
    return true;
  });

  return {
    ...wsState,
    folders,
    projects: updatedProjects,
    nodes,
    tagCategories: deduplicatedRootCats
  };
}

export default function App() {
  // Load initial state
  const [state, setRawState] = useState<WorkspaceState>(() => normalizeWorkspaceState(loadWorkspace()));
  const isFirstRender = React.useRef(true);
  const ignoreNextStateChangeRef = React.useRef(false);
  const hasCheckedUrlParamRef = React.useRef(false);
  const lastStateRef = React.useRef<WorkspaceState | null>(null);
  const isFirstSnapshotRef = React.useRef(true);

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

  // Google Authentication & Real-time Cloud Sync States (Notion-style)
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    local: 'saved' | 'saving' | 'error';
    firebase: 'idle' | 'saved' | 'syncing' | 'error';
  }>({
    local: 'saved',
    firebase: 'idle'
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

  // Network offline/online listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getSyncHash = (wsState: WorkspaceState) => {
    return JSON.stringify({
      folders: wsState.folders,
      projects: wsState.projects,
      nodes: wsState.nodes,
      activeProjectId: wsState.activeProjectId,
      tagCategories: wsState.tagCategories || []
    });
  };

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

  useEffect(() => {
    const checkPomo = () => {
      try {
        const saved = localStorage.getItem('task_mindmap_pomodoro');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.isRunning) {
            if (parsed.endTime && !parsed.isPaused) {
              const remaining = Math.max(0, Math.round((parsed.endTime - Date.now()) / 1000));
              parsed.timeLeft = remaining;
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

  // Sync isDrawerOpen when selectedNodeId becomes null
  useEffect(() => {
    if (selectedNodeId === null) {
      setIsDrawerOpen(false);
    }
  }, [selectedNodeId]);

  // Reminders check engine
  const [triggeredReminders, setTriggeredReminders] = useState<{
    nodeId: string;
    projectId: string;
    text: string;
    targetTime: string;
  }[]>([]);

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
      }[] = [];

      Object.entries(state.nodes).forEach(([projectId, nodeList]) => {
        (nodeList as TaskNode[]).forEach((node) => {
          if (node.reminderDate && node.reminderTime && !node.reminderDismissed && !node.completed) {
            const reminderDateTime = new Date(`${node.reminderDate}T${node.reminderTime}`);
            const currentDateTime = new Date(`${todayDateStr}T${timeStr}`);

            if (!isNaN(reminderDateTime.getTime()) && reminderDateTime <= currentDateTime) {
              triggered.push({
                nodeId: node.id,
                projectId,
                text: node.text,
                targetTime: `${node.reminderDate} ${node.reminderTime}`,
              });
            }
          }
        });
      });

      if (triggered.length > 0) {
        setTriggeredReminders(prev => {
          const prevIds = new Set(prev.map(r => r.nodeId));
          const newReminders = triggered.filter(r => !prevIds.has(r.nodeId));
          if (newReminders.length > 0) {
            playNotificationChime();
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

  // Canvas zoom & pan view attributes
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);

  // View Mode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table'
  const [viewMode, setViewMode] = useState<'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table'>('canvas');

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  // 1. Firebase Auth listener registration
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        isFirstSnapshotRef.current = true;
        setCurrentUser(user);
        setGoogleToken(token);
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
      },
      () => {
        isFirstSnapshotRef.current = true;
        setCurrentUser(null);
        setGoogleToken(null);
        setSyncStatus(prev => ({ ...prev, firebase: 'idle', sheets: 'idle' }));
      }
    );
    return () => unsubscribe();
  }, []);

  // Keep track of latest state and unsynced counts for real-time listener to avoid resubscription on every character change
  const stateRef = React.useRef(state);
  stateRef.current = state;
  
  const unsyncedEditsCountRef = React.useRef(unsyncedEditsCount);
  unsyncedEditsCountRef.current = unsyncedEditsCount;

  // 3. Real-time Firestore snapshot synchronization for instant Desktop-to-Mobile and Mobile-To-Desktop updates
  useEffect(() => {
    if (!currentUser) return;

    const docRef = doc(db, 'workspaces', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) return;
      const cloudData = snap.data();
      if (!cloudData) return;

      const cloudState: WorkspaceState = {
        folders: cloudData.folders || [],
        projects: cloudData.projects || [],
        nodes: cloudData.nodes || {},
        activeProjectId: cloudData.activeProjectId || null,
        tagCategories: cloudData.tagCategories || []
      };

      const remoteDeletions = cloudData.deletions || [];
      const localDeletions = getLocalDeletions();
      const currentState = stateRef.current;

      const { mergedState, mergedDeletions } = mergeWorkspaceStates(
        currentState,
        cloudState,
        localDeletions,
        remoteDeletions
      );

      const normalizedCurrent = normalizeWorkspaceState(currentState);
      const normalizedMerged = normalizeWorkspaceState(mergedState);

      const currentHash = getSyncHash(normalizedCurrent);
      const mergedHash = getSyncHash(normalizedMerged);

      if (currentHash !== mergedHash || isFirstSnapshotRef.current) {
        // Apply merged changes seamlessly
        isFirstSnapshotRef.current = false;
        ignoreNextStateChangeRef.current = true;
        
        // Save merged deletions back to localStorage
        localStorage.setItem('milli_deleted_registry', JSON.stringify(mergedDeletions));
        
        lastSyncedStateHashRef.current = mergedHash; // Update hash to ignore next autosave if clean
        setRawState(normalizedMerged);
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        setUnsyncedEditsCount(0); // Clear any local unsynced edits count since we reconciled
        setHasCloudUpdates(false);
        setCloudUpdateState(null);
      } else {
        isFirstSnapshotRef.current = false;
        setSyncStatus(prev => ({ ...prev, firebase: 'saved' }));
        setHasCloudUpdates(false);
        setCloudUpdateState(null);
      }
    }, (error) => {
      console.error('[Firebase snapshot listener error]:', error);
      setSyncStatus(prev => ({ ...prev, firebase: 'error' }));
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
    if (currentUser && (stateChanged || unsyncedEditsCountRef.current > 0)) {
      const currentHash = getSyncHash(state);
      if (currentHash === lastSyncedStateHashRef.current) {
        return; // Already synced! Prevents infinite trigger loops
      }

      setSyncStatus(prev => ({ ...prev, firebase: 'syncing' }));
      const countSaved = unsyncedEditsCount;
      const timer = setTimeout(async () => {
        const res = await saveToFirebaseDirectly(currentUser.uid, state);
        setSyncStatus(prev => ({
          ...prev,
          firebase: res.success ? 'saved' : 'error'
        }));
        if (res.success) {
          lastSyncedStateHashRef.current = getSyncHash(state); // Update hash on successful upload
          setUnsyncedEditsCount(prev => Math.max(0, prev - countSaved));
        }
      }, 1500); // 1.5s snapshot rate-limiting debounce
      return () => clearTimeout(timer);
    }
  }, [state, currentUser]);

  // Symmetrical Google Sheets merge trigger method (Deprecated in favor of Notion-style Firebase sync)
  const runSheetsSymmetricalSync = async (token: string, currentWorkspace: WorkspaceState) => {};

  // Manual forced cloud sync actions to solve multi-device desynchronizations immediately
  // Legacy manual cloud overrides (Notion-style Firebase sync is fully automatic now)
  const forceUploadToCloud = async (currentWorkspace: WorkspaceState) => {};
  const forceDownloadFromCloud = async () => {};

  // 3. Auto Symmetrical Google Sheets merge on startup / login auth
  useEffect(() => {
    if (googleToken) {
      runSheetsSymmetricalSync(googleToken, state);
    }
  }, [googleToken]);

  // 4. Background Symmetrical Sheets Sync with 3s fast responsive debounce during continuous editing states
  // Only triggers background auto-sync when there are actual unsynced edits, saving Google API quota limits!
  useEffect(() => {
    if (googleToken && unsyncedEditsCount > 0) {
      const currentHash = getSyncHash(state);
      if (currentHash === lastSyncedStateHashRef.current) {
        return; // Already synced! Prevents infinite trigger loops
      }

      const debounceTime = 3000; // Fast responsive 3s debounce after user stops editing the mind map
      const timer = setTimeout(() => {
        runSheetsSymmetricalSync(googleToken, state);
      }, debounceTime); // Optimized rate-limiting debounce
      return () => clearTimeout(timer);
    }
  }, [state, googleToken, unsyncedEditsCount]);

  // 5. Symmetrical Sheets Sync instantly on window tab switch or pageunload (visibilitychange / pagehide)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && googleToken) {
        syncWithGoogleSheets(googleToken, state);
      }
    };

    const handlePageHide = () => {
      if (googleToken) {
        syncWithGoogleSheets(googleToken, state);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [googleToken, state]);

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
        
        // Select the task/node
        setSelectedNodeId(urlTaskId);
        setIsDrawerOpen(true);

        // Calculate and set absolute coordinates to recenter the canvas on startup
        if (targetNode.x !== undefined && targetNode.y !== undefined) {
          // Adjust starting pan offset safely with standard coordinates
          const offsetWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
          const offsetHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
          const panX = -targetNode.x + offsetWidth / 2 - 200;
          const panY = -targetNode.y + offsetHeight / 2;
          setPanX(panX);
          setPanY(panY);
          setZoom(1.05);
        }
      }
    } catch (err) {
      console.error('Failed to parse load URL parameters:', err);
    }
  }, [state.nodes]);

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

      if (e.key === 'Delete' || e.key === 'Del') {
        if (selectedNodeId) {
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [selectedNodeId, lastCreatedNodeId, state]);

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
    setSearchQuery('');
    
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
    const newProject: Project = {
      id: projectId,
      name,
      folderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
        tags: []
      };

      const updatedProjects = [...prev.projects];
      const project = { ...updatedProjects[projectIndex] };
      project.tagCategories = [...(project.tagCategories || []), newCat];
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
        const cats = p.tagCategories || [];
        return {
          ...p,
          tagCategories: cats.map(c => c.id === id ? { ...c, name, color, tags } : c)
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
      const updatedProjects = prev.projects.map(p => ({
        ...p,
        tagCategories: (p.tagCategories || []).filter(c => c.id !== id)
      }));

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
      if (filterStatus === "archived") {
        return !!node.archived;
      }
      return !node.archived;
    });
  }, [activeNodes, filterStatus]);

  // Single node drag updating coordinates with simultaneous movement of all descendant nodes
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

      // Recursive / iterative check to see if a candidate is a descendant of the dragged node
      const isDescendant = (candidateId: string): boolean => {
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
      };

      const updatedProjectNodes = projectNodes.map(n => {
        if (isDescendant(n.id)) {
          return {
            ...n,
            x: n.id === id ? x : n.x + dx,
            y: n.id === id ? y : n.y + dy
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
  const handleUpdateNodeParent = (id: string, newParentId: string | null) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const parent = currentNodes.find(p => p.id === newParentId);
    const parentColor = parent ? parent.color : '';

    setState(prev => {
      const updatedList = currentNodes.map(n => {
        if (n.id === id) {
          // Calculate non-overlapping coordinates if re-parented to a non-container task node
          let targetX = n.x;
          let targetY = n.y;
          
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

          const isInitiallyRoot = n.parentId === null && !n.isFloating;
          const updatedIsFloating = isInitiallyRoot ? false : (newParentId === null);

          return {
            ...n,
            x: Math.round(targetX),
            y: Math.round(targetY),
            parentId: newParentId,
            color: parentColor || n.color,
            isFloating: updatedIsFloating
          };
        }
        return n;
      });

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [pid]: syncCompletion(updatedList)
        }
      };
    });
  };

  // Add child branching node beautifully
  const handleAddChildNode = (parentId: string) => {
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
      color: parent.color || ''
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newChild]
      }
    }));

    // Smoothly pan/recenter the viewport around the new node so it is fully visible on screen
    setPanX(-Math.round(newX) * zoom);
    setPanY(-Math.round(newY) * zoom);

    // Auto select new node so user can rename instantly! 🚀
    setSelectedNodeId(newChild.id);
    setLastCreatedNodeId(newChild.id);
  };

  // Add a fully independent task inside the temporary off-canvas INBOX container
  const handleAddInboxTask = (text: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const newInboxNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: text.trim(),
      x: 0,
      y: 0,
      parentId: 'inbox',
      isFloating: true,
      priority: 'none',
      tags: [],
      notes: 'Эта задача была записана в INBOX. Нажмите "На холст", чтобы разместить её на интеллект-карте.',
      completed: false,
      files: []
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newInboxNode]
      }
    }));
  };

  // Add a fully independent floating node anywhere on the canvas
  const handleAddFloatingNode = (x: number, y: number, parentId: string | null = null, customText?: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const isInsideContainer = parentId !== null;

    const newFloatingNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: customText?.trim() || (isInsideContainer ? 'Новая подзадача' : 'Плавающая задача'),
      x: Math.round(x),
      y: Math.round(y),
      parentId: parentId, // can be a container or branch root
      isFloating: !isInsideContainer,
      priority: 'low',
      tags: [],
      notes: customText?.trim()
        ? `Задача была продиктована голосом: "${customText.trim()}"`
        : (isInsideContainer 
          ? 'Вы создали эту задачу непосредственно в сфокусированном контейнере.'
          : 'Это полностью независимая задача, свободная от основной ветви. Вы можете свободно перемещать её по холсту, а также добавлять к ней дочерние подзадачи через кнопку "+".'),
      completed: false,
      files: [],
      color: isInsideContainer ? '#3b82f6' : '#10b981' // Blue inside container, green otherwise
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newFloatingNode]
      }
    }));

    // Auto select the new floating node so user can rename instantly!
    setSelectedNodeId(newFloatingNode.id);
    setLastCreatedNodeId(newFloatingNode.id);
  };

  // Add a fully independent styled container box anywhere on the canvas
  const handleAddContainerNode = (x: number, y: number) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const newContainerNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: 'Новый Контейнер',
      x: Math.round(x),
      y: Math.round(y),
      parentId: null, // independent root
      isFloating: true,
      isContainer: true,
      priority: 'low',
      tags: [],
      notes: 'Это визуальный контейнер. Поместите в него другие задачи (перетащите их внутрь контейнера и удерживайте полсекунды для авто-привязки). Перемещая контейнер, вы будете двигать и все находящиеся в нём задачи, а при сворачивании контейнера они скроются.',
      completed: false,
      files: [],
      color: '#f59e0b' // Amber/orange default for container
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
    setLastCreatedNodeId(newContainerNode.id);
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

  // Create a new task originating from the Kanban Board view
  const handleCreateKanbanTask = (text: string, initialTags: string[], initialPriority: Priority = 'none') => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const newTargetNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text,
      x: 350 + Math.random() * 200,
      y: 350 + Math.random() * 200,
      parentId: null,
      isFloating: true,
      priority: initialPriority,
      tags: initialTags,
      notes: 'Создано на Канбан-доске.',
      completed: false,
      files: [],
      color: '#6366f1'
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newTargetNode]
      }
    }));
    
    setSelectedNodeId(newTargetNode.id);
  };

  // Create a new task originating from the Mobile list view (TickTick style)
  const handleCreateMobileTask = (text: string, tags: string[], priority: Priority, dueDate?: string, parentId?: string | null, dueTime?: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const parentNode = parentId ? currentNodes.find(n => n.id === parentId) : null;
    const parentX = parentNode ? parentNode.x : 350;
    const parentY = parentNode ? parentNode.y : 350;

    const newTargetNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text,
      x: parentX + (Math.random() - 0.5) * 120 + 100,
      y: parentY + (Math.random() - 0.5) * 120 + 80,
      parentId: parentId || null,
      isFloating: parentId ? false : true,
      priority,
      tags,
      notes: '',
      completed: false,
      files: [],
      dueDate,
      dueTime,
      color: parentNode ? parentNode.color : '#6366f1'
    };

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: [...currentNodes, newTargetNode]
      }
    }));
  };

  // Single node attribute editor update
  const handleUpdateNode = (updatedNode: TaskNode) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    // backup before properties update simple helper
    const currentNodes = state.nodes[pid] || [];

    setState(prev => {
      const targetNode = currentNodes.find(n => n.id === updatedNode.id);
      let updatedList = currentNodes.map(n => n.id === updatedNode.id ? updatedNode : n);
      
      // If completed state was toggled from details panel, sync all descendants
      if (targetNode && targetNode.completed !== updatedNode.completed) {
        updatedList = toggleNodeAndDescendants(updatedNode.id, updatedNode.completed, updatedList);
      }

      // If archived state was toggled, sync all descendants
      if (targetNode && targetNode.archived !== updatedNode.archived) {
        updatedList = toggleNodeArchive(updatedNode.id, !!updatedNode.archived, updatedList);
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

  // ----- SEARCH & HIGHLIGHT -----
  const isNodeMatched = (node: TaskNode): boolean => {
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
      if (node.archived) return false;
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
    setSearchQuery("");
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

  const selectedNode = activeNodes.find(n => n.id === selectedNodeId) || null;

  const hasSyncOrAuthError = !!authError || syncStatus.firebase === 'error' || syncStatus.local === 'error';

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden text-slate-900 bg-white dark:bg-slate-950 dark:text-slate-100 font-sans transition-colors duration-150">
      
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
      />

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Workspace Top Action Bar Header */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                sidebarOpen ? 'lg:hidden' : 'flex'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                {state.projects.find(p => p.id === state.activeProjectId)?.name || 'Карта задач'}
              </h2>
              {viewMode !== 'mobile-list' && (
                <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 font-serif">
                  <span>Задач в карте: {activeNodes.length}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span>Выполнено: {activeNodes.filter(n => n.completed).length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Center search bar & operations */}
          <div className="flex items-center gap-3">
            
            {/* Global running Pomodoro indicator widget */}
            {globalPomo && globalPomo.isRunning && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNodeId(globalPomo.nodeId);
                  setIsDrawerOpen(true);
                }}
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 border rounded-xl text-xs font-bold cursor-pointer transition-all duration-250 hover:scale-[1.03] select-none shadow-xs ${
                  globalPomo.isBreak 
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-400' 
                    : 'border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/25 text-rose-700 dark:text-rose-400'
                }`}
                title={`Активная сессия Pomodoro для задачи "${globalPomo.nodeText}". Нажмите для подробностей.`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${globalPomo.isBreak ? 'bg-emerald-400' : 'bg-rose-450'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${globalPomo.isBreak ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                <span className="text-[11px] font-medium max-w-[130px] truncate">
                  {globalPomo.isBreak ? '☕ Фокус окончен (Перерыв)' : `🎯 ${globalPomo.nodeText}`}
                </span>
                <span className="font-mono text-xs font-black tracking-wider leading-none">
                  {formatGlobalPomoTime(globalPomo.timeLeft)}
                </span>
              </button>
            )}
            
            {/* Elegant micro search input */}
            <div className="relative hidden md:flex items-center gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск по задачам и тегам..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-56 leading-none py-1.5 pl-8 pr-12 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-xs rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100 placeholder-slate-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                
                {/* Micro Counter Indicator */}
                {searchQuery.trim().length > 0 && (
                  <span className="absolute right-2 top-2 text-[10px] text-slate-400/80 font-mono font-medium select-none pointer-events-none">
                    {searchedIds.length > 0 ? `${currentSearchIndex + 1}/${searchedIds.length}` : '0/0'}
                  </span>
                )}
              </div>

              {/* Next Match button */}
              {searchedIds.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextSearchMatch}
                  title="Перейти к следующей найденной задаче"
                  className="flex items-center gap-1 py-1 px-2 border border-indigo-200 dark:border-indigo-900 bg-indigo-50 hover:bg-indigo-150 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer shadow-xs"
                >
                  <span>Следующая</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
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
              <span className="hidden sm:inline">Фильтры</span>
              {isAnyFilterActive && (
                <span className="bg-indigo-600 text-white dark:bg-indigo-500 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Micro search results list box if search query is set */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-15 right-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-2 w-72 max-h-56 overflow-y-auto z-50">
                <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-widest">
                  Найдено результатов ({searchedIds.length})
                </p>
                {searchedIds.length > 0 ? (
                  <div className="space-y-0.5 mt-1">
                    {activeNodes
                      .filter(n => searchedIds.includes(n.id))
                      .map(n => (
                        <button
                          key={n.id}
                          onClick={() => handleSelectSearchedNode(n.id)}
                          className="w-full text-left py-1 px-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/45 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between"
                        >
                          <span className="truncate pr-1">{n.text}</span>
                          <span className="text-[9px] text-indigo-500 font-mono">#{n.priority}</span>
                        </button>
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
                title="Отменить последнее ветвление или удаление"
                className="p-1.5 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1 text-xs cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Отмена</span>
              </button>
            )}

            {/* View Mode Switching Tabs */}
            {state.activeProjectId && (
              <div id="view-mode-toggle-group" className="bg-slate-100 dark:bg-slate-850 p-1 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center shrink-0">
                <button
                  id="view-mode-canvas-btn"
                  type="button"
                  onClick={() => setViewMode('canvas')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'canvas'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Режим интеллект-карты"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Холст</span>
                </button>
                <button
                  id="view-mode-kanban-btn"
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'kanban'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Режим Канбан-доски"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Канбан</span>
                </button>
                <button
                  id="view-mode-mobile-btn"
                  type="button"
                  onClick={() => setViewMode('mobile-list')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'mobile-list'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Мобильный список (TickTick)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Мобильный</span>
                </button>
                <button
                  id="view-mode-calendar-btn"
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'calendar'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Календарный вид"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Календарь</span>
                </button>
                <button
                  id="view-mode-gantt-btn"
                  type="button"
                  onClick={() => setViewMode('gantt')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'gantt'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Линейный график Ганнта"
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ганнт</span>
                </button>
                <button
                  id="view-mode-table-btn"
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 cursor-pointer transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                  title="Табличный вид"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Таблица</span>
                </button>
              </div>
            )}

            {/* Symmetrical Sync and Backup Status Pill (Notion style) */}
            {!currentUser ? (
              <button
                id="milli-google-auth-btn"
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
                className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-650 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-550 active:scale-[0.98] text-white text-xs font-extrabold rounded-lg cursor-pointer transition-all shrink-0 select-none border border-indigo-700/40 shadow-xs"
                title="Войти через Google для автоматической автосинхронизации, как в Notion"
              >
                <svg className="w-3.5 h-3.5 fill-current text-white shrink-0" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.414 0-6.19-2.77-6.19-6.19 0-3.418 2.776-6.19 6.19-6.19 1.483 0 2.844.52 3.917 1.391l3.056-3.056C19.11 2.8 15.86 1.332 12.24 1.332 6.136 1.332 1.2 6.268 1.2 12.37s4.936 11.04 11.04 11.04c6.264 0 10.8-4.4 10.8-10.74 0-.74-.065-1.3-.18-1.85H12.24z"/>
                </svg>
                <span className="hidden xs:inline">Войти через Google</span>
                <span className="inline xs:hidden">Войти</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Connection & Sync Status Indicator pill */}
                {!isOnline ? (
                  <div className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-500/10 dark:bg-amber-500/5 text-amber-600 dark:text-amber-400 border border-amber-300/30 dark:border-amber-900/30 rounded-lg text-xs font-bold font-sans">
                    <CloudOff className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">Вне сети (сохранено на устройстве)</span>
                    <span className="inline md:hidden">Вне сети</span>
                  </div>
                ) : syncStatus.firebase === 'syncing' ? (
                  <div className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/50 rounded-lg text-xs font-bold font-sans animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-indigo-500" />
                    <span>Сохранение...</span>
                  </div>
                ) : syncStatus.firebase === 'error' || authError ? (
                  <div className="flex items-center gap-1.5 py-1.5 px-3 bg-rose-500/10 dark:bg-rose-500/5 text-rose-600 dark:text-rose-400 border border-rose-300/30 dark:border-rose-900/30 rounded-lg text-xs font-bold font-sans">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">Ошибка синхронизации</span>
                    <span className="inline md:hidden">Ошибка</span>
                  </div>
                ) : (
                  <div className="group relative flex items-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-300/20 dark:border-emerald-900/20 rounded-lg text-xs font-bold font-sans cursor-default select-none transition-all hover:bg-emerald-500/15 dark:hover:bg-emerald-500/10">
                    <Check className="w-3.5 h-3.5 text-emerald-500 font-bold shrink-0" />
                    <span className="hidden md:inline">Синхронизировано</span>
                    <span className="inline md:hidden">В облаке</span>
                    
                    {/* Hover explanation tooltip */}
                    <div className="absolute top-10 right-0 sm:left-1/2 sm:-translate-x-1/2 w-max max-w-xs scale-0 group-hover:scale-100 transition-all origin-top duration-150 p-2 bg-slate-900 text-white text-[10px] sm:text-xs rounded-lg shadow-lg pointer-events-none z-50">
                      Все данные успешно сохранены в Google Firebase (Firestore) в реальном времени
                    </div>
                  </div>
                )}

                {/* Avatar with dropdown sign out */}
                <div id="milli-avatar-dropdown-container" className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="w-8 h-8 rounded-full border border-slate-250 dark:border-slate-800 hover:ring-2 hover:ring-indigo-500/80 transition-all overflow-hidden flex items-center justify-center shrink-0 cursor-pointer bg-white dark:bg-slate-900 shadow-xs"
                    title={currentUser.displayName || currentUser.email || 'Профиль пользователя'}
                  >
                    {currentUser.photoURL ? (
                      <img referrerPolicy="no-referrer" src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center text-xs">
                        {currentUser.email?.[0].toUpperCase() || 'U'}
                      </div>
                    )}
                  </button>

                  {isProfileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileDropdownOpen(false)} />
                      <div className="absolute right-0 mt-2.5 w-64 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 text-xs text-slate-850 dark:text-slate-100 animate-in fade-in slide-in-from-top-1.5 duration-200">
                        <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/60 pb-3 mb-2.5">
                          {currentUser.photoURL ? (
                            <img referrerPolicy="no-referrer" src={currentUser.photoURL} alt="Avatar" className="w-9 h-9 rounded-full border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950 font-bold flex items-center justify-center text-sm text-indigo-700 dark:text-indigo-400 shrink-0">
                              {currentUser.email?.[0].toUpperCase() || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold truncate leading-none text-slate-800 dark:text-slate-100 text-[12px]">{currentUser.displayName || 'Пользователь'}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-none mt-1" title={currentUser.email || ''}>{currentUser.email}</p>
                          </div>
                        </div>

                        <div className="py-1 space-y-2 select-none font-sans border-b border-slate-100 dark:border-slate-800/60 pb-2.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Канал связи:</span>
                            <span className={isOnline ? 'text-emerald-500 font-extrabold' : 'text-amber-500 font-extrabold'}>
                              {isOnline ? 'ОНЛАЙН' : 'ОФФЛАЙН'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Синхронизация:</span>
                            <span className="text-slate-700 dark:text-slate-300 font-bold uppercase text-[9px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded leading-none">
                              {syncStatus.firebase === 'syncing' ? 'Сохранение...' : 'Синхронно'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await logout();
                            } catch (e) {
                              console.error(e);
                            }
                            setIsProfileDropdownOpen(false);
                          }}
                          className="w-full mt-2.5 flex items-center justify-center gap-2 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-rose-600 text-slate-600 dark:text-slate-300 font-extrabold rounded-lg transition-colors cursor-pointer text-[11px]"
                        >
                          <LogOut className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          Выйти из аккаунта
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Dark light theme toggler */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-slate-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title={darkMode ? "Включить светлую тему" : "Включить темную тему"}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>
        </header>

        {/* Real-time Cloud conflict warning banner */}
        {hasCloudUpdates && currentUser && (
          <div className="bg-amber-500/10 dark:bg-amber-500/5 border-b border-amber-500/25 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-10 animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-semibold leading-tight text-left">
                Обнаружены новые изменения на другом устройстве! {unsyncedEditsCount > 0 ? `(Автоматическая загрузка приостановлена, чтобы не перезаписать ваши ${unsyncedEditsCount} несинхронизированных изменений).` : `Рекомендуется обновиться.`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleApplyCloudState}
                className="py-1 px-3 bg-amber-650 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-550 rounded-md text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Принять изменения из облака
              </button>
              <button
                type="button"
                onClick={() => setHasCloudUpdates(false)}
                className="p-1 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors cursor-pointer shrink-0"
                title="Скрыть предупреждение"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

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
                {state.tagCategories?.map(cat => {
                  const catTagsInUse = (cat.tags || []).filter(t => allAvailableTags.includes(t));
                  if (catTagsInUse.length === 0) return null;
                  return (
                    <optgroup key={cat.id} label={cat.name}>
                      {catTagsInUse.map(tag => (
                        <option key={tag} value={tag}>#{tag}</option>
                      ))}
                    </optgroup>
                  );
                })}
                {/* Uncategorized tags */}
                {(() => {
                  const categorizedSet = new Set(state.tagCategories?.flatMap(cat => cat.tags || []) || []);
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

            {isAnyFilterActive && (
              <button
                onClick={handleClearAllFilters}
                className="ml-auto text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer hover:underline py-1 px-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors border border-transparent hover:border-rose-200"
              >
                <X className="w-3.5 h-3.5" />
                Сбросить
              </button>
            )}
          </div>
        )}

        {/* The Mind Map Interactive Canvas Frame. Occupies 100% space! */}
        <div className="flex-1 w-full h-full relative bg-[#FAFBFD] dark:bg-slate-950/20">
          
          {state.activeProjectId ? (
            viewMode === 'mobile-list' ? (
              <MobileListView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateMobileTask}
                onCreateTagCategory={handleCreateTagCategory}
                onUpdateTagCategory={handleUpdateTagCategory}
                onDeleteTagCategory={handleDeleteTagCategory}
              />
            ) : viewMode === 'kanban' ? (
              <KanbanView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={handleCreateKanbanTask}
                onCreateTagCategory={handleCreateTagCategory}
              />
            ) : viewMode === 'calendar' ? (
              <CalendarView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags, dueDate, dueTime) => {
                  handleCreateMobileTask(text, initialTags || [], 'none', dueDate, null, dueTime);
                }}
              />
            ) : viewMode === 'gantt' ? (
              <GanttView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags, dueDate) => {
                  handleCreateMobileTask(text, initialTags || [], 'none', dueDate);
                }}
              />
            ) : viewMode === 'table' ? (
              <TableView
                nodes={displayedNodesForViews}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onCreateTask={(text, initialTags) => {
                  handleCreateMobileTask(text, initialTags || [], 'none');
                }}
              />
            ) : (
              <MindMapCanvas
                nodes={displayedNodesForViews}
                darkMode={darkMode}
                activeProjectId={state.activeProjectId}
                selectedNodeId={selectedNodeId}
                activePomodoroNodeId={globalPomo && globalPomo.isRunning ? globalPomo.nodeId : null}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) {
                    setIsDrawerOpen(true);
                  } else {
                    setIsDrawerOpen(false);
                  }
                }}
                onUpdateNodeCoordinates={handleUpdateNodeCoordinates}
                onUpdateNodeParent={handleUpdateNodeParent}
                onAddChildNode={handleAddChildNode}
                onAddFloatingNode={handleAddFloatingNode}
                onAddContainerNode={handleAddContainerNode}
                onAddInboxTask={handleAddInboxTask}
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
                onOpenDrawer={() => setIsDrawerOpen(true)}
                filterStatus={filterStatus}
                filterPriority={filterPriority}
                filterTag={filterTag}
                filterDueDate={filterDueDate}
                filterAttachments={filterAttachments}
                filterNotes={filterNotes}
                searchQuery={searchQuery}
                tagCategories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
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

        {/* Task Properties slide-out drawer displays only on explicit open clicking Eye button */}
        {isDrawerOpen && selectedNode && (
          <TaskDetailsPanel
            node={selectedNode}
            allNodes={activeNodes}
            onClose={() => setIsDrawerOpen(false)}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onAddChildNode={handleAddChildNode}
            onSelectNode={setSelectedNodeId}
            categories={state.projects.find(p => p.id === state.activeProjectId)?.tagCategories || []}
            onCreateTagCategory={handleCreateTagCategory}
            onUpdateTagCategory={handleUpdateTagCategory}
            onDeleteTagCategory={handleDeleteTagCategory}
            googleToken={googleToken}
          />
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
              {globalPomo.isBreak ? '☕ Фокус окончен / Перерыв' : '🎯 Идет фокус'}
            </span>
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate max-w-[155px] leading-tight flex items-center">
              {globalPomo.nodeText || 'Фокусировка'}
            </span>
          </div>
          <div className={`px-2 py-1.5 rounded-xl text-xs font-black font-mono tracking-wider leading-none transition-colors ${globalPomo.isBreak ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'}`}>
            {formatGlobalPomoTime(globalPomo.timeLeft)}
          </div>
        </div>
      )}

      {/* Symmetrical Sync & Backup Dashboard Full Modal Backdrop Overlay */}
      {false && (() => {
        const isSyncMenuOpen = false;
        const setIsSyncMenuOpen = (v: any) => {};
        const isSyncingSheets = false;
        const forceCloudSyncLoading: any = null;
        const setForceCloudSyncLoading = (v: any) => {};
        const forceCloudSyncFeedback = "";
        const setForceCloudSyncFeedback = (v: any) => {};
        const sheetsError = "";
        const setSheetsError = (v: any) => {};
        const runSheetsSymmetricalSync = (...args: any[]) => {};
        const getQueuedDeletionsCount = () => 0;
        const totalItemsCount = 0;
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

      {/* Floating Application Update Notification Banner Pop */}
      {showVersionUpdateAlert && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950/80 p-5 rounded-2xl shadow-[0_12px_40px_-10px_rgba(99,102,241,0.25)] z-[1000] animate-in slide-in-from-bottom duration-300 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 bg-indigo-50 dark:bg-indigo-950/50 p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <h4 className="font-extrabold text-sm tracking-tight text-slate-800 dark:text-slate-100">Программа обновлена!</h4>
            </div>
            <button 
              onClick={() => setShowVersionUpdateAlert(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-350 leading-snug">
              Успешный переход на версию <span className="font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono text-[10.5px]">v{APP_VERSION}</span>!
            </p>
            
            <div className="text-[11px] text-slate-500 dark:text-slate-450 space-y-1 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850/50">
              <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">Что изменилось:</p>
              <ul className="space-y-1.5 pl-1.5 list-disc list-inside">
                <li><span className="font-semibold text-slate-700 dark:text-slate-300">Подзадачи:</span> Добавлена новая Кнопка редактирования прямо в список подзадач.</li>
                <li><span className="font-semibold text-slate-700 dark:text-slate-300">Контейнеры:</span> Восстановлено быстрое удаление без лишних всплывающих окон.</li>
                <li><span className="font-semibold text-slate-700 dark:text-slate-300">Версионирование:</span> Номер версии ПО выведен на боковую панель.</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setShowVersionUpdateAlert(false)}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-98 cursor-pointer"
          >
            Понятно, спасибо
          </button>
        </div>
      )}

      {/* ================= ACTIVE REMINDERS FLOATING NOTIFICATIONS OVERLAY ================= */}
      {triggeredReminders.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full space-y-3 animate-fade-in pointer-events-auto">
          {triggeredReminders.map((reminder) => (
            <div 
              key={reminder.nodeId}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 relative overflow-hidden transition-all duration-300 md:max-w-[360px] select-none"
            >
              {/* Highlight left accent entry indicator */}
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-rose-550 dark:bg-rose-500 animate-pulse" />

              <div className="flex items-start justify-between pl-2">
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded-xl text-rose-555 dark:text-rose-400">
                    <BellRing className="w-4.5 h-4.5 animate-bounce" />
                  </span>
                  <div>
                    <h4 className="font-extrabold text-xs tracking-tight text-slate-400 dark:text-slate-500 uppercase">Напоминание!</h4>
                    <p className="text-[9.5px] text-slate-400 dark:text-slate-505 font-mono font-bold">{reminder.targetTime}</p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    // Update task node to be reminderDismissed: true
                    const targetList = state.nodes[reminder.projectId] || [];
                    const targetNode = targetList.find(n => n.id === reminder.nodeId);
                    if (targetNode) {
                      handleUpdateNode({
                        ...targetNode,
                        reminderDismissed: true
                      });
                    }
                    setTriggeredReminders(prev => prev.filter(r => r.nodeId !== reminder.nodeId));
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Закрыть напоминание"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="pl-2">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-3">
                  {reminder.text}
                </p>
              </div>

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
                    // Update task node to be reminderDismissed: true
                    const targetList = state.nodes[reminder.projectId] || [];
                    const targetNode = targetList.find(n => n.id === reminder.nodeId);
                    if (targetNode) {
                      handleUpdateNode({
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
          ))}
        </div>
      )}
    </div>
  );
}
