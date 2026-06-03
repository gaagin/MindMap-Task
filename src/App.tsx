import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { WorkspaceState, TaskNode, Folder, Project, Priority } from './types';
import { loadWorkspace, saveWorkspace, generateId } from './utils';
import Sidebar from './components/Sidebar';
import MindMapCanvas from './components/MindMapCanvas';
import TaskDetailsPanel from './components/TaskDetailsPanel';

export default function App() {
  // Load initial state
  const [state, setState] = useState<WorkspaceState>(() => loadWorkspace());
  
  // Sidebar closed by default as per user preference
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Selected task node for detail panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync isDrawerOpen when selectedNodeId becomes null
  useEffect(() => {
    if (selectedNodeId === null) {
      setIsDrawerOpen(false);
    }
  }, [selectedNodeId]);

  // Search keyword for filtering
  const [searchQuery, setSearchQuery] = useState('');

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

  // Dark Mode
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('task_mindmap_dark');
    if (saved !== null) return saved === 'true';
    return false; // Initialize in light mode as standard default!
  });

  // Simple Undo/Redo stack for nodes (for active safety)
  const [undoStack, setUndoStack] = useState<Record<string, TaskNode[][]>>({});

  // Sync state changes with localStorage auto-saving
  useEffect(() => {
    saveWorkspace(state);
  }, [state]);

  // Handle media/dark mode class on body element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('task_mindmap_dark', String(darkMode));
  }, [darkMode]);

  // Adjust sidebar on startup based on screen width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    handleResize(); // run once on boot
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
      priority: 'none',
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


  // ----- TASK NODE CANVAS OPERATIONS -----
  const activeNodes = state.activeProjectId ? (state.nodes[state.activeProjectId] || []) : [];

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

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: currentNodes.map(n => {
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
              const W = parent.width || 520;
              const H = parent.height || 400;
              const siblings = currentNodes.filter(sib => sib.parentId === parent.id && sib.id !== id);
              const k = siblings.length;
              const columns = 2;
              const col = k % columns;
              const row = Math.floor(k / columns);
              
              targetX = parent.x + (col === 0 ? -115 : 115);
              targetY = parent.y - (H / 2) + 75 + row * 95;
            }

            return {
              ...n,
              x: Math.round(targetX),
              y: Math.round(targetY),
              parentId: newParentId,
              color: parentColor || n.color
            };
          }
          return n;
        })
      }
    }));
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
      priority: 'none',
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
  };

  // Add a fully independent floating node anywhere on the canvas
  const handleAddFloatingNode = (x: number, y: number, parentId: string | null = null) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    const isInsideContainer = parentId !== null;

    const newFloatingNode: TaskNode = {
      id: 'node-' + generateId(),
      projectId: pid,
      text: isInsideContainer ? 'Новая подзадача' : 'Плавающая задача',
      x: Math.round(x),
      y: Math.round(y),
      parentId: parentId, // can be a container or branch root
      isFloating: !isInsideContainer,
      priority: 'none',
      tags: isInsideContainer ? ['Контейнер'] : ['Плавающая'],
      notes: isInsideContainer 
        ? 'Вы создали эту задачу непосредственно в сфокусированном контейнере.'
        : 'Это полностью независимая задача, свободная от основной ветви. Вы можете свободно перемещать её по холсту, а также добавлять к ней дочерние подзадачи через кнопку "+".',
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
      priority: 'none',
      tags: ['Контейнер'],
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
  };

  // Recursive deletion of subnodes to avoid orphan paths in mapping svg
  const handleDeleteNode = (id: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    const currentNodes = state.nodes[pid] || [];
    pushToUndo(pid, currentNodes);

    // Collect list of ids to delete (target + children recursively)
    const collectIdsToDelete = (targetId: string, list: string[] = []): string[] => {
      list.push(targetId);
      const children = currentNodes.filter(n => n.parentId === targetId);
      children.forEach(child => collectIdsToDelete(child.id, list));
      return list;
    };

    const idsToDelete = collectIdsToDelete(id);

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: currentNodes.filter(n => !idsToDelete.includes(n.id))
      }
    }));

    if (selectedNodeId && idsToDelete.includes(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  };

  // Toggle node checked completed state
  const handleToggleNodeCompleted = (id: string) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: prev.nodes[pid].map(n => n.id === id ? { ...n, completed: !n.completed } : n)
      }
    }));
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

  // Single node attribute editor update
  const handleUpdateNode = (updatedNode: TaskNode) => {
    const pid = state.activeProjectId;
    if (!pid) return;

    // backup before properties update simple helper
    const currentNodes = state.nodes[pid] || [];

    setState(prev => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [pid]: currentNodes.map(n => n.id === updatedNode.id ? updatedNode : n)
      }
    }));
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
    if (filterStatus === "completed" && !node.completed) return false;
    if (filterStatus === "active" && node.completed) return false;

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
    }
  };


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

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 bg-white dark:bg-slate-950 dark:text-slate-100 font-sans transition-colors duration-150">
      
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
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-serif">
                <span>Задач в карте: {activeNodes.length}</span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span>Выполнено: {activeNodes.filter(n => n.completed).length}</span>
              </div>
            </div>
          </div>

          {/* Center search bar & operations */}
          <div className="flex items-center gap-3">
            
            {/* Elegant micro search input */}
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Поиск по задачам и тегам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 leading-none py-1.5 pl-8 pr-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-xs rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
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
                <option value="all">Все</option>
                <option value="active">Активные</option>
                <option value="completed">Выполненные</option>
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
                {allAvailableTags.map(tag => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
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
            <MindMapCanvas
              nodes={activeNodes}
              darkMode={darkMode}
              activeProjectId={state.activeProjectId}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onUpdateNodeCoordinates={handleUpdateNodeCoordinates}
              onUpdateNodeParent={handleUpdateNodeParent}
              onAddChildNode={handleAddChildNode}
              onAddFloatingNode={handleAddFloatingNode}
              onAddContainerNode={handleAddContainerNode}
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
            />
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
          />
        )}
      </main>
    </div>
  );
}
