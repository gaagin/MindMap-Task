import React, { useRef, useState, useEffect } from 'react';
import { 
  Plus, 
  PlusCircle,
  Trash2, 
  Edit, 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Paperclip, 
  FileText, 
  Maximize2, 
  Minimize2,
  ZoomIn, 
  ZoomOut, 
  Move,
  Type,
  ChevronDown,
  ChevronUp,
  FolderMinus,
  FolderPlus,
  Menu,
  Zap,
  Calendar,
  Network,
  Kanban,
  Smartphone,
  GanttChart,
  Table,
  AlertTriangle,
  X,
  Download,
  Eye,
  Link2Off,
  Mic,
  MicOff,
  Link as LinkIcon,
  Clock
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';
import { getBezierPath, calculateProgress, getDescendants, generateId, formatFileSize, getPomoStatsForNode, formatTotalPomoTime, isNodeOverdue, isContainerOverdue } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface MindMapCanvasProps {
  nodes: TaskNode[];
  darkMode: boolean;
  activeProjectId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds?: string[];
  isMultiSelectMode?: boolean;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNodeCoordinates: (id: string, x: number, y: number) => void;
  onUpdateNodeParent: (id: string, newParentId: string | null, newX?: number, newY?: number) => void;
  onAddChildNode: (parentId: string) => void;
  onAddFloatingNode: (x: number, y: number, parentId?: string | null, customText?: string, extraFields?: Partial<TaskNode>) => void;
  onAddContainerNode: (x: number, y: number) => void;
  onAddInboxTask?: (text: string) => void;
  onDeleteNode: (id: string) => void;
  onToggleNodeCompleted: (id: string) => void;
  onToggleNodeCollapse: (id: string) => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  panX: number;
  panY: number;
  zoom: number;
  setPanX: (x: number | ((prev: number) => number)) => void;
  setPanY: (y: number | ((prev: number) => number)) => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  onOpenSidebar: () => void;
  onOpenDrawer: () => void;
  filterStatus?: string;
  filterPriority?: string;
  filterTag?: string;
  filterDueDate?: string;
  filterAttachments?: string;
  filterNotes?: string;
  searchQuery?: string;
  tagCategories?: TagCategory[];
  lastCreatedNodeId?: string | null;
  onClearLastCreatedNodeId?: () => void;
}

// Tree helper: verify if candidate parent contains child, avoiding cyclical mapping bugs
function isDescendantOrSelf(candidateParentId: string, nodeId: string, allNodes: TaskNode[]): boolean {
  if (candidateParentId === nodeId) return true;
  let currentId: string | null = candidateParentId;
  while (currentId !== null) {
    const current = allNodes.find(n => n.id === currentId);
    if (!current) break;
    if (current.parentId === nodeId) return true;
    currentId = current.parentId;
  }
  return false;
}

function getFlowchartPath(
  x1: number, y1: number, side1: string,
  x2: number, y2: number, side2: string
): string {
  const mid = getOrthogonalMidpoint(x1, y1, side1, x2, y2, side2);
  return getCustomWorkflowPath(x1, y1, side1, mid.x, mid.y, x2, y2, side2);
}

function getCustomWorkflowPath(
  x1: number, y1: number, side1: string,
  bx: number, by: number,
  x2: number, y2: number, side2: string
): string {
  const isHoriz1 = side1 === 'left' || side1 === 'right';
  const isHoriz2 = side2 === 'left' || side2 === 'right';

  const points: { x: number; y: number }[] = [];
  points.push({ x: x1, y: y1 });

  if (isHoriz1 && !isHoriz2) {
    // Perpendicular: Horiz start, vert end
    points.push({ x: bx, y: y1 });
    points.push({ x: bx, y: by });
    points.push({ x: x2, y: by });
  } else if (!isHoriz1 && isHoriz2) {
    // Perpendicular: Vert start, horiz end
    points.push({ x: x1, y: by });
    points.push({ x: bx, y: by });
    points.push({ x: bx, y: y2 });
  } else if (isHoriz1 && isHoriz2) {
    // Parallel Horizontal
    points.push({ x: bx, y: y1 });
    points.push({ x: bx, y: y2 });
  } else {
    // Parallel Vertical
    points.push({ x: x1, y: by });
    points.push({ x: x2, y: by });
  }

  points.push({ x: x2, y: y2 });

  // Streamline and build SVG Path
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.x !== prev.x || curr.y !== prev.y) {
      path += ` L ${curr.x} ${curr.y}`;
    }
  }
  return path;
}

function getOrthogonalMidpoint(
  x1: number, y1: number, side1: string,
  x2: number, y2: number, side2: string
) {
  const isHoriz1 = side1 === 'left' || side1 === 'right';
  const isHoriz2 = side2 === 'left' || side2 === 'right';

  if (isHoriz1 && !isHoriz2) {
    // Perpendicular: Horiz start, vert end: corner is at (x2, y1)
    return { x: x2, y: y1 };
  } else if (!isHoriz1 && isHoriz2) {
    // Perpendicular: Vert start, horiz end: corner is at (x1, y2)
    return { x: x1, y: y2 };
  } else {
    // Parallel/Same axis: standard center midpoint
    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2
    };
  }
}

function getBezierMidpoint(
  x1: number, y1: number, side1: string,
  x2: number, y2: number, side2: string
) {
  const getOffset = (side: string) => {
    switch (side) {
      case 'top': return { x: 0, y: -24 };
      case 'bottom': return { x: 0, y: 24 };
      case 'left': return { x: -24, y: 0 };
      case 'right': return { x: 24, y: 0 };
      default: return { x: 0, y: 0 };
    }
  };

  const off1 = getOffset(side1);
  const off2 = getOffset(side2);

  const start_stub_x = x1 + off1.x;
  const start_stub_y = y1 + off1.y;
  const end_stub_x = x2 + off2.x;
  const end_stub_y = y2 + off2.y;

  return {
    x: (start_stub_x + end_stub_x) / 2,
    y: (start_stub_y + end_stub_y) / 2
  };
}

function getOppositeSide(side: 'top' | 'right' | 'bottom' | 'left'): 'top' | 'right' | 'bottom' | 'left' {
  switch (side) {
    case 'top': return 'bottom';
    case 'right': return 'left';
    case 'bottom': return 'top';
    case 'left': return 'right';
  }
}

export default function MindMapCanvas({
  nodes: incomingNodes,
  darkMode,
  activeProjectId,
  selectedNodeId,
  selectedNodeIds = [],
  isMultiSelectMode = false,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNodeCoordinates,
  onUpdateNodeParent,
  onAddChildNode,
  onAddFloatingNode,
  onAddContainerNode,
  onAddInboxTask,
  onDeleteNode,
  onToggleNodeCompleted,
  onToggleNodeCollapse,
  onUpdateNode,
  panX,
  panY,
  zoom,
  setPanX,
  setPanY,
  setZoom,
  onOpenSidebar,
  onOpenDrawer,
  filterStatus = 'all',
  filterPriority = 'all',
  filterTag = 'all',
  filterDueDate = 'all',
  filterAttachments = 'all',
  filterNotes = 'all',
  searchQuery = '',
  tagCategories = [],
  lastCreatedNodeId,
  onClearLastCreatedNodeId
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [expandedCardSubtasks, setExpandedCardSubtasks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (lastCreatedNodeId) {
      setEditingNodeId(lastCreatedNodeId);
    }
  }, [lastCreatedNodeId]);
  
  // States for Notes and file upload handling
  const [notesModalNodeId, setNotesModalNodeId] = useState<string | null>(null);
  const [nestedDragNodeId, setNestedDragNodeId] = useState<string | null>(null);
  // States for trailing tags drag and drop onto nodes on canvas
  const [draggedOverTagNodeId, setDraggedOverTagNodeId] = useState<string | null>(null);

  // States for Flowchart Workflow connectors dragging
  const [activeConnector, setActiveConnector] = useState<{
    nodeId: string;
    side: 'top' | 'right' | 'bottom' | 'left';
    startX: number;
    startY: number;
  } | null>(null);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredSide, setHoveredSide] = useState<'top' | 'right' | 'bottom' | 'left' | null>(null);

  const handleContainerChildDrop = (draggedId: string, targetId: string) => {
    const draggedNode = nodes.find(n => n.id === draggedId);
    const targetNode = nodes.find(n => n.id === targetId);
    if (!draggedNode || !targetNode) return;
    
    // Swap coordinates
    const tempX = draggedNode.x;
    const tempY = draggedNode.y;
    onUpdateNode({
      ...draggedNode,
      x: targetNode.x,
      y: targetNode.y
    });
    onUpdateNode({
      ...targetNode,
      x: tempX,
      y: tempY
    });
  };

  const handleNestedKanbanDrop = (draggedId: string, colId: string, containerId: string) => {
    const node = nodes.find(n => n.id === draggedId);
    if (!node) return;

    const currentGroupBy = containerKanbanGroupBy[containerId] || 'status';

    if (currentGroupBy === 'status') {
      if (colId === 'todo') {
        onUpdateNode({ ...node, completed: false, progress: 0 });
      } else if (colId === 'progress') {
        onUpdateNode({ ...node, completed: false, progress: 50 });
      } else if (colId === 'done') {
        onUpdateNode({ ...node, completed: true });
      }
    } else if (currentGroupBy === 'priority') {
      const priority = colId === 'none' ? 'none' : colId as Priority;
      onUpdateNode({ ...node, priority });
    } else if (currentGroupBy === 'category') {
      const currentActiveCategoryId = containerKanbanActiveCategory[containerId] || (tagCategories.length > 0 ? tagCategories[0].id : null);
      const activeCategory = tagCategories.find(c => c.id === currentActiveCategoryId) || tagCategories[0];
      const activeTags = activeCategory?.tags || [];

      let updatedTags = node.tags ? [...node.tags] : [];
      updatedTags = updatedTags.filter(t => !activeTags.includes(t));

      if (colId !== 'uncategorized') {
        updatedTags.push(colId);
      }

      onUpdateNode({ ...node, tags: updatedTags });
    }
  };

  const handleNestedCalendarDrop = (draggedId: string, groupId: string) => {
    const node = nodes.find(n => n.id === draggedId);
    if (!node) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 4);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    if (groupId === 'today') {
      onUpdateNode({ ...node, dueDate: todayStr });
    } else if (groupId === 'tomorrow') {
      onUpdateNode({ ...node, dueDate: tomorrowStr });
    } else if (groupId === 'week') {
      onUpdateNode({ ...node, dueDate: nextWeekStr });
    } else if (groupId === 'later') {
      const later = new Date(today);
      later.setDate(today.getDate() + 8);
      onUpdateNode({ ...node, dueDate: later.toISOString().split('T')[0] });
    } else if (groupId === 'nodate') {
      onUpdateNode({ ...node, dueDate: '' });
    }
  };

  const handleNestedGanttDrop = (draggedId: string, dateStr: string) => {
    const node = nodes.find(n => n.id === draggedId);
    if (!node) return;
    onUpdateNode({ ...node, dueDate: dateStr, startDate: dateStr });
  };
  const [originalText, setOriginalText] = useState('');
  const [originalNotes, setOriginalNotes] = useState('');

  // Sync original state when mind map canvas quick edit modal opens/updates
  useEffect(() => {
    if (notesModalNodeId) {
      const activeNode = nodes.find(n => n.id === notesModalNodeId);
      if (activeNode) {
        setOriginalText(activeNode.text || '');
        setOriginalNotes(activeNode.notes || '');
      }
    }
  }, [notesModalNodeId]);

  const recordCanvasHistoryVersion = (targetNode: TaskNode, prevText: string, prevNotes: string, label: string) => {
    const currentHistory = targetNode.history || [];
    const lastVersion = currentHistory[0];
    if (lastVersion && lastVersion.text === prevText && lastVersion.notes === prevNotes) {
      return;
    }

    const newVersion = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      text: prevText,
      notes: prevNotes,
      description: label
    };

    onUpdateNode({
      ...targetNode,
      history: [newVersion, ...currentHistory].slice(0, 30)
    });
  };

  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadNodeId, setFileUploadNodeId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleCardFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    const targetNodeId = fileUploadNodeId;
    if (!filesList || filesList.length === 0 || !targetNodeId) return;
    
    setFileError(null);
    const file = filesList[0];
    const MAX_BYTES = 1.5 * 1024 * 1024;
    
    if (file.size > MAX_BYTES) {
      setFileError('Размер файла превышает 1.5 МБ. Выберите файл меньшего размера.');
      setTimeout(() => setFileError(null), 4000);
      return;
    }

    const node = nodes.find(n => n.id === targetNodeId);
    if (!node) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const newAttachment = {
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: base64Data,
      };

      const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
      onUpdateNode({
        ...node,
        files: updatedFiles
      });
    };
    reader.readAsDataURL(file);
    
    // Reset file input value
    e.target.value = '';
  };

  // Drag states for panning the background
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Wheel zoom smoothness state and ref
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef<any>(null);

  // Drag states for dragging a specific card
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingConn, setDraggingConn] = useState<{
    nodeId: string;
    connId: string;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [localNodes, setLocalNodes] = useState<TaskNode[]>(incomingNodes);

  useEffect(() => {
    setLocalNodes(incomingNodes);
  }, [incomingNodes]);

  const nodes = (draggingNodeId || draggingConn) ? localNodes : incomingNodes;

  const handleLocalUpdateCoordinates = (id: string, x: number, y: number) => {
    setLocalNodes(prev => {
      const targetNode = prev.find(n => n.id === id);
      if (!targetNode) return prev;
      const dx = x - targetNode.x;
      const dy = y - targetNode.y;
      if (dx === 0 && dy === 0) return prev;

      const isDescendant = (candidateId: string): boolean => {
        if (candidateId === id) return true;
        let currentId: string | null = candidateId;
        let iterations = 0;
        while (currentId !== null && iterations < 100) {
          iterations++;
          const current = prev.find(n => n.id === currentId);
          if (!current) break;
          if (current.parentId === id) return true;
          currentId = current.parentId;
        }
        return false;
      };

      return prev.map(n => {
        if (isDescendant(n.id)) {
          return {
            ...n,
            x: n.id === id ? x : n.x + dx,
            y: n.id === id ? y : n.y + dy
          };
        }
        return n;
      });
    });
  };

  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodeOffsetStart, setNodeOffsetStart] = useState({ x: 0, y: 0 });
  const [hasDraggedNode, setHasDraggedNode] = useState(false);
  const didDragRef = useRef(false);
  const [priorityViewActive, setPriorityViewActive] = useState<boolean>(false);

  // States of container view modes (e.g., list, kanban, calendar, gantt, table, canvas)
  const [containerViewModes, setContainerViewModes] = useState<Record<string, 'list' | 'kanban' | 'calendar' | 'gantt' | 'table' | 'canvas'>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_container_views');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // States for nested kanban grouping and categories within container nodes
  const [containerKanbanGroupBy, setContainerKanbanGroupBy] = useState<Record<string, 'status' | 'category' | 'priority'>>({});
  const [containerKanbanActiveCategory, setContainerKanbanActiveCategory] = useState<Record<string, string>>({});
  const [containerCalendarSubModes, setContainerCalendarSubModes] = useState<Record<string, 'month' | 'week' | 'day'>>({});
  const [containerCalendarDates, setContainerCalendarDates] = useState<Record<string, string>>({});

  const setContainerViewMode = (containerId: string, mode: 'list' | 'kanban' | 'calendar' | 'gantt' | 'table' | 'canvas') => {
    setContainerViewModes(prev => {
      const updated = { ...prev, [containerId]: mode };
      try {
        localStorage.setItem('task_mindmap_container_views', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist container view:', e);
      }
      return updated;
    });
  };

  const [inlineAddTexts, setInlineAddTexts] = useState<Record<string, string>>({});

  const getCalendarGroups = (tasks: TaskNode[]) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const endOfWeek = new Date(today);
    const dayOfWeek = endOfWeek.getDay();
    const distanceToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    endOfWeek.setDate(endOfWeek.getDate() + distanceToSunday);
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const todayTasks: TaskNode[] = [];
    const tomorrowTasks: TaskNode[] = [];
    const weekTasks: TaskNode[] = [];
    const laterTasks: TaskNode[] = [];
    const noDateTasks: TaskNode[] = [];
    const overdueTasks: TaskNode[] = [];

    tasks.forEach(t => {
      if (!t.dueDate) {
        noDateTasks.push(t);
        return;
      }
      if (t.dueDate === todayStr) {
        todayTasks.push(t);
      } else if (t.dueDate === tomorrowStr) {
        tomorrowTasks.push(t);
      } else if (t.dueDate < todayStr && !t.completed) {
        overdueTasks.push(t);
      } else if (t.dueDate > tomorrowStr && t.dueDate <= endOfWeekStr) {
        weekTasks.push(t);
      } else {
        laterTasks.push(t);
      }
    });

    return [
      { id: 'overdue', title: 'Просрочено', tasks: overdueTasks, color: 'text-rose-500 bg-rose-500/10' },
      { id: 'today', title: 'Сегодня', tasks: todayTasks, color: 'text-amber-500 bg-amber-500/10' },
      { id: 'tomorrow', title: 'Завтра', tasks: tomorrowTasks, color: 'text-blue-500 bg-blue-500/10' },
      { id: 'week', title: 'На неделе', tasks: weekTasks, color: 'text-indigo-500 bg-indigo-500/10' },
      { id: 'later', title: 'Позже', tasks: laterTasks, color: 'text-slate-500 bg-slate-500/10' },
      { id: 'nodate', title: 'Без даты', tasks: noDateTasks, color: 'text-slate-450 bg-slate-200/40 dark:bg-slate-800' }
    ].filter(g => g.tasks.length > 0);
  };

  const getGanttData = (tasks: TaskNode[]) => {
    const days: { dateStr: string; label: string; dayNum: number }[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let i = 0; i < 7; i++) {
       const d = new Date(today);
       d.setDate(today.getDate() + i);
       const dateStr = d.toISOString().split('T')[0];
       const weekdayLabel = d.toLocaleDateString('ru-RU', { weekday: 'short' });
       const dayNum = d.getDate();
       days.push({ dateStr, label: weekdayLabel, dayNum });
    }

    const ganttTasks = tasks.filter(t => t.dueDate || t.startDate);
    return { days, ganttTasks };
  };

  const renderContainerBody = (node: TaskNode, containerChildren: TaskNode[], isFullScreen = false) => {
    const viewMode = containerViewModes[node.id] || 'canvas';

    if (viewMode === 'canvas') {
      if (containerChildren.length === 0) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-xl select-none min-h-[140px] text-center my-auto transition-all">
            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest mb-1">Свободный холст</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 max-w-[200px] mb-3">
              Дочерние подзадачи свободно перемещаются по этому прямоугольнику.
            </span>
            <div className="flex gap-2 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFloatingNode(node.x, node.y, node.id, 'Workflow Шаг', { isWorkflowRectangle: true });
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase bg-indigo-500 hover:bg-indigo-600 text-white shadow-xs transition-transform hover:scale-105 cursor-pointer"
              >
                <Network className="w-3 h-3 text-white" />
                🟦 Прямоугольник Workflow
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFloatingNode(node.x, node.y, node.id, 'Новая задача');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase bg-slate-150 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-250 dark:border-slate-700 shadow-xs transition-transform hover:scale-105 cursor-pointer"
              >
                <Plus className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                Обычная задача
              </button>
            </div>
          </div>
        );
      }
      return null;
    }

    if (viewMode === 'list') {
      const getPriorityClass = (currPriority: Priority) => {
        switch (currPriority) {
          case 'urgent': return 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/40';
          case 'high': return 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/40';
          case 'medium': return 'bg-blue-50 dark:bg-blue-950/25 text-blue-600 dark:text-blue-400 border-indigo-200/50 dark:border-indigo-900/40';
          case 'low': return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/40';
          default: return 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800';
        }
      };

      const getPriorityText = (currPriority: Priority) => {
        switch (currPriority) {
          case 'urgent': return 'Крит.';
          case 'high': return 'Выс.';
          case 'medium': return 'Ср.';
          case 'low': return 'Низ.';
          default: return '⚪';
        }
      };

      return (
        <div 
          onClick={(e) => {
            onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача');
          }}
          className="flex-1 flex flex-col min-h-0 cursor-pointer"
        >
          <div className={`flex-grow overflow-y-auto space-y-1.5 pr-1 scrollbar-thin ${isFullScreen ? 'max-h-[66vh] text-xs' : 'max-h-[220px]'}`}>
            {containerChildren.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-slate-200/40 dark:border-slate-800/40 rounded-xl select-none min-h-[120px] text-center my-auto bg-slate-50/20 dark:bg-slate-950/10">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Задач в списке нет</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5">Кликните «+» внизу или дважды на фон, чтобы добавить подзадачу</span>
              </div>
            ) : (
              [...containerChildren].sort((a, b) => a.y - b.y).map(child => (
                <div key={child.id} className="flex flex-col gap-1 w-full shrink-0">
                  <div 
                    draggable={true}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('text/plain', child.id);
                      setNestedDragNodeId(child.id);
                    }}
                    onDragEnd={() => setNestedDragNodeId(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                      if (draggedId && draggedId !== child.id) {
                        handleContainerChildDrop(draggedId, child.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectNode(child.id);
                    }}
                    className={`flex items-center justify-between gap-2 p-1.5 sm:p-2 rounded-xl border ${
                      selectedNodeId === child.id 
                        ? 'border-indigo-500 shadow-md ring-2 ring-indigo-500/15 bg-white dark:bg-slate-900' 
                        : 'border-slate-105 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/60'
                    } group/item cursor-pointer text-slate-800 dark:text-slate-250 select-none transition-all hover:bg-white dark:hover:bg-slate-900 duration-155`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onSelectNode(child.id);
                          onToggleNodeCompleted(child.id); 
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className="text-slate-400 hover:text-indigo-650 dark:hover:text-amber-500 transition-colors cursor-pointer shrink-0"
                      >
                        {child.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : activePomodoroNodeId === child.id ? (
                          <span className="relative flex items-center justify-center w-4 h-4 shrink-0 inline-block">
                            <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-rose-450 opacity-75"></span>
                            <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                          </span>
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300 dark:text-slate-650 hover:text-indigo-500" />
                        )}
                      </button>
                      <input 
                        type="text"
                        className={`flex-1 bg-transparent border-0 focus:ring-0 p-1 py-0 rounded hover:bg-slate-100/30 dark:hover:bg-slate-800/35 text-slate-800 dark:text-slate-100 font-extrabold focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-850 truncate min-w-[60px] shrink ${isFullScreen ? 'text-xs' : 'text-[10px]'} ${
                          child.completed ? 'line-through text-slate-420 dark:text-slate-500 font-normal' : ''
                        }`}
                        value={child.text}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                        }}
                        onChange={(e) => {
                          onUpdateNode({ ...child, text: e.target.value });
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      {child.externalLink && (
                        <a
                          href={child.externalLink.startsWith('http') ? child.externalLink : `https://${child.externalLink}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center p-1 hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                          title={`Открыть внешнюю ссылку: ${child.externalLink}`}
                        >
                          <LinkIcon className="w-3.5 h-3.5 text-indigo-505" />
                        </a>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0 opacity-75 group-hover/item:opacity-100 transition-opacity">
                      {/* Pomodoro Timer Badge */}
                      {child.pomodoroTotalTime ? (
                        <span className="text-[8.5px] font-bold text-rose-600 dark:text-rose-400 font-mono shrink-0 flex items-center gap-0.5 bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10" title="Фокусировка Pomodoro">
                          🍅 {Math.round(child.pomodoroTotalTime / 60)}м
                        </span>
                      ) : null}

                      {/* Progressive cyclic button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                          const curr = child.progress || 0;
                          const nextProg = curr >= 100 ? 0 : curr + 25;
                          onUpdateNode({ ...child, progress: nextProg, completed: nextProg === 100 ? true : child.completed });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="text-[8.5px] font-mono font-black border border-slate-250 dark:border-slate-800 px-1.5 py-0.5 rounded-lg bg-white dark:bg-slate-950 text-slate-500 hover:text-indigo-650 dark:hover:text-indigo-400 cursor-pointer min-w-[34px] text-center transition-colors"
                        title="Прогресс (клик для циклической смены)"
                      >
                        {child.progress || 0}%
                      </button>

                      {/* Cyclic Priority Badging */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                          const cycle: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];
                          const nextP = cycle[(cycle.indexOf(child.priority) + 1) % cycle.length];
                          onUpdateNode({ ...child, priority: nextP as Priority });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`px-1.5 py-0.5 rounded-lg text-[8.5px] font-extrabold h-5.5 cursor-pointer flex items-center transition-all border ${getPriorityClass(child.priority)}`}
                        title="Приоритет (клик для циклической смены)"
                      >
                        {getPriorityText(child.priority)}
                      </button>

                      {/* Interactive Due Date Calendar Picker */}
                      <div className="flex items-center gap-0.5 bg-white dark:bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-655" onClick={(e) => e.stopPropagation()}>
                        <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <input 
                          type="date"
                          value={child.dueDate || ''}
                          onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            onUpdateNode({ ...child, dueDate: e.target.value });
                          }}
                          className="text-[8.5px] p-0 bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-600 dark:text-slate-300 max-w-[76px] font-mono leading-none cursor-pointer"
                        />
                      </div>

                      {/* Tag badge items list */}
                      {child.tags && child.tags.length > 0 && (
                        <div className="flex gap-0.5 shrink-0 max-w-[80px] overflow-hidden truncate">
                          {child.tags.slice(0, 1).map(t => {
                            const matchedCategory = tagCategories.find(cat => cat.tags && cat.tags.includes(t));
                            const color = matchedCategory?.color || '#a1a1aa';
                            return (
                              <span 
                                key={t} 
                                className="text-[7.5px] px-1 py-0.2 font-bold rounded"
                                style={{ backgroundColor: color + '15', color: color, border: `1px solid ${color}20` }}
                              >
                                #{t}
                              </span>
                            );
                          })}
                          {child.tags.length > 1 && (
                            <span className="text-[7.5px] text-slate-400 font-bold" title={child.tags.join(', ')}>+{child.tags.length - 1}</span>
                          )}
                        </div>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); setNotesModalNodeId(child.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className="p-1 rounded text-slate-400 hover:text-indigo-650 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Описание / Заметки"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteNode(child.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Action buttons for selected list task inside container */}
                  {selectedNodeId === child.id && (
                    <div 
                      data-drag-ignore
                      onClick={(e) => e.stopPropagation()}
                      className="self-center flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-45 mb-1 animate-fade-in text-[10px]"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddChildNode(child.id);
                        }}
                        title="Добавить подзадачу"
                        className="flex items-center justify-center w-8 h-8 rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotesModalNodeId(child.id);
                        }}
                        title="Открыть заметки"
                        className="flex items-center justify-center w-8 h-8 rounded-full text-emerald-600 dark:text-emerald-450 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDrawer();
                        }}
                        title="Свойства (во весь экран)"
                        className="flex items-center justify-center w-8 h-8 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileUploadNodeId(child.id);
                          setTimeout(() => {
                            if (cardFileInputRef.current) {
                              cardFileInputRef.current.click();
                            }
                          }, 50);
                        }}
                        title="Прикрепить файл"
                        className="flex items-center justify-center w-8 h-8 rounded-full text-purple-650 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(child.id);
                        }}
                        title="Удалить"
                        className="flex items-center justify-center w-8 h-8 rounded-full text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const txt = inlineAddTexts[node.id] || '';
              if (txt.trim()) {
                onAddFloatingNode(node.x, node.y, node.id, txt.trim());
                setInlineAddTexts(prev => ({ ...prev, [node.id]: '' }));
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="mt-2.5 flex items-center gap-1.5 shrink-0 z-20"
          >
            <input 
              type="text"
              placeholder="Добавить новую задачу..."
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              value={inlineAddTexts[node.id] || ''}
              onChange={(e) => setInlineAddTexts(prev => ({ ...prev, [node.id]: e.target.value }))}
              data-drag-ignore
              className="flex-1 text-[10px] py-1.5 px-3 bg-white/70 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder-slate-400 transition-all font-semibold"
            />
            <button 
              type="submit" 
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              data-drag-ignore
              className="p-1.5 px-3 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white transition-all cursor-pointer text-[10px] font-black flex items-center justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      );
    }

    if (viewMode === 'kanban') {
      const currentGroupBy = containerKanbanGroupBy[node.id] || 'status';
      const currentActiveCategoryId = containerKanbanActiveCategory[node.id] || (tagCategories.length > 0 ? tagCategories[0].id : '');
      const activeCategory = tagCategories.find(c => c.id === currentActiveCategoryId) || tagCategories[0];
      const activeTags = activeCategory?.tags || [];

      let columnsList: { id: string; title: string; tasks: TaskNode[]; bg?: string; border?: string; style?: React.CSSProperties; titleColor?: string }[] = [];

      if (currentGroupBy === 'status') {
        const todoTasks = containerChildren.filter(c => !c.completed && (!c.progress || c.progress === 0));
        const progressTasks = containerChildren.filter(c => !c.completed && (c.progress && c.progress > 0));
        const doneTasks = containerChildren.filter(c => c.completed);

        columnsList = [
          { id: 'todo', title: 'План', tasks: todoTasks, bg: 'bg-slate-500/5 dark:bg-slate-900/40', border: 'border-slate-150 dark:border-slate-800/60', titleColor: 'text-slate-500 dark:text-slate-400' },
          { id: 'progress', title: 'В работе', tasks: progressTasks, bg: 'bg-amber-500/5 dark:bg-amber-950/10', border: 'border-amber-200/20 dark:border-amber-900/30', titleColor: 'text-amber-600 dark:text-amber-400' },
          { id: 'done', title: 'Готово', tasks: doneTasks, bg: 'bg-emerald-500/5 dark:bg-emerald-950/10', border: 'border-emerald-200/20 dark:border-emerald-900/30', titleColor: 'text-emerald-500 dark:text-emerald-400' }
        ];
      } else if (currentGroupBy === 'priority') {
        columnsList = [
          { id: 'urgent', title: 'Критический', tasks: containerChildren.filter(c => c.priority === 'urgent'), bg: 'bg-rose-500/5 dark:bg-rose-950/10', border: 'border-rose-200/20 dark:border-rose-900/30', titleColor: 'text-rose-500 dark:text-rose-400' },
          { id: 'high', title: 'Высокий', tasks: containerChildren.filter(c => c.priority === 'high'), bg: 'bg-amber-500/5 dark:bg-amber-950/10', border: 'border-amber-200/20 dark:border-amber-900/30', titleColor: 'text-amber-500 dark:text-amber-450' },
          { id: 'medium', title: 'Средний', tasks: containerChildren.filter(c => c.priority === 'medium'), bg: 'bg-blue-500/5 dark:bg-blue-950/10', border: 'border-blue-200/20 dark:border-blue-900/30', titleColor: 'text-blue-500 dark:text-blue-400' },
          { id: 'low', title: 'Низкий', tasks: containerChildren.filter(c => c.priority === 'low'), bg: 'bg-emerald-500/5 dark:bg-emerald-950/10', border: 'border-emerald-205/20 dark:border-emerald-900/30', titleColor: 'text-emerald-500' },
          { id: 'none', title: 'Без приоритета', tasks: containerChildren.filter(c => !c.priority || c.priority === 'none'), bg: 'bg-slate-500/5 dark:bg-slate-900/40', border: 'border-slate-150', titleColor: 'text-slate-400 dark:text-slate-500' }
        ];
      } else { // category
        const getNodeCategoryTag = (task: TaskNode): string | null => {
          if (!task.tags) return null;
          const found = task.tags.find(t => activeTags.includes(t));
          return found || null;
        };

        const uncategorizedTasks = containerChildren.filter(c => getNodeCategoryTag(c) === null);
        columnsList.push({
          id: 'uncategorized',
          title: 'Без тега',
          tasks: uncategorizedTasks,
          bg: 'bg-slate-500/5 dark:bg-slate-900/40',
          border: 'border-slate-150',
          titleColor: 'text-slate-400 dark:text-slate-500'
        });

        activeTags.forEach(tag => {
          const tasks = containerChildren.filter(c => getNodeCategoryTag(c) === tag);
          const bgOpacityColor = activeCategory?.color ? `${activeCategory.color}0a` : undefined;
          const borderOpacityColor = activeCategory?.color ? `${activeCategory.color}25` : undefined;
          columnsList.push({
            id: tag,
            title: '#' + tag,
            tasks,
            border: 'border-slate-150',
            style: {
              backgroundColor: bgOpacityColor,
              borderColor: borderOpacityColor
            },
            titleColor: activeCategory?.color || 'text-indigo-600 dark:text-indigo-400'
          });
        });
      }

      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Compact Grouping selector row */}
          <div className="flex flex-col gap-1.5 p-1.5 mb-1.5 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-100/60 dark:border-slate-800/30 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 shrink-0 select-none">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">ГРУППИРОВКА:</span>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'status', label: 'По статусам' },
                    { id: 'category', label: 'По категориям' },
                    { id: 'priority', label: 'По приоритетам' }
                  ].map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setContainerKanbanGroupBy(prev => ({ ...prev, [node.id]: b.id as any }))}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                        currentGroupBy === b.id
                          ? 'bg-indigo-600/10 dark:bg-indigo-500/10 border-indigo-600/30 text-indigo-600 dark:text-indigo-400 font-extrabold'
                          : 'bg-white dark:bg-slate-950 border-slate-205 dark:border-slate-800 text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag Categories selector if 'category' grouped */}
              {currentGroupBy === 'category' && tagCategories.length > 0 && (
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none max-w-[50%]">
                  <span className="text-[8px] font-bold text-slate-450 uppercase tracking-widest shrink-0">КАТЕГОРИЯ:</span>
                  <div className="flex items-center gap-1.5">
                    {tagCategories.map(cat => {
                      const isSelected = cat.id === currentActiveCategoryId;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setContainerKanbanActiveCategory(prev => ({ ...prev, [node.id]: cat.id }))}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/20 dark:bg-indigo-950/20 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                              : 'bg-white/80 dark:bg-slate-900/80 border-slate-150 dark:border-slate-850 text-slate-505 hover:bg-slate-100/50'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex gap-1.5 overflow-x-auto min-h-0 pb-1 scrollbar-none">
            {columnsList.map(col => (
              <div 
                key={col.id} 
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                  if (draggedId) {
                    handleNestedKanbanDrop(draggedId, col.id, node.id);
                  }
                }}
                onClick={(e) => {
                  let extraFields: Partial<TaskNode> = {};
                  if (currentGroupBy === 'status') {
                    if (col.id === 'todo') extraFields = { completed: false, progress: 0 };
                    if (col.id === 'progress') extraFields = { completed: false, progress: 50 };
                    if (col.id === 'done') extraFields = { completed: true, progress: 100 };
                  } else if (currentGroupBy === 'priority') {
                    extraFields = { priority: col.id as any };
                  } else if (currentGroupBy === 'category') {
                    if (col.id !== 'uncategorized') {
                      extraFields = { tags: [col.id] };
                    }
                  }
                  onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача', extraFields);
                }}
                className={`flex-1 rounded-xl border ${col.border || ''} ${col.bg || ''} p-1.5 flex flex-col min-h-0 cursor-pointer hover:border-slate-250 dark:hover:border-slate-800 transition-colors ${isFullScreen ? 'min-w-[200px]' : 'min-w-[130px] max-w-[170px]'}`}
                style={col.style}
              >
                <div className="flex items-center justify-between mb-1.5 px-0.5 select-none shrink-0 border-b border-slate-100/50 dark:border-slate-800/10 pb-1">
                  <span 
                    className={`text-[9.5px] font-extrabold uppercase tracking-widest leading-none truncate ${col.titleColor || 'text-slate-500'}`}
                    style={col.id !== 'uncategorized' && currentGroupBy === 'category' ? { color: activeCategory?.color } : undefined}
                  >
                    {col.title}
                  </span>
                  <span className="text-[8.5px] font-black bg-slate-200/55 dark:bg-slate-800 text-slate-650 dark:text-slate-350 px-1.5 py-0.5 rounded-lg font-mono leading-none">{col.tasks.length}</span>
                </div>
                
                <div className={`flex-1 overflow-y-auto space-y-1.5 custom-scrollbar min-h-0 pr-0.5 ${isFullScreen ? 'max-h-[66vh]' : 'max-h-[175px]'}`}>
                  {col.tasks.map(child => {
                    const getPriorityColorStyle = (p: Priority) => {
                      switch (p) {
                        case 'urgent': return 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/40';
                        case 'high': return 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/40';
                        case 'medium': return 'bg-blue-50 dark:bg-blue-950/25 text-blue-600 dark:text-blue-400 border-indigo-200/50 dark:border-indigo-900/40';
                        case 'low': return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/40';
                        default: return 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800';
                      }
                    };

                    const getPriorityLabelRu = (p: Priority) => {
                      switch (p) {
                        case 'urgent': return 'Крит.';
                        case 'high': return 'Выс.';
                        case 'medium': return 'Ср.';
                        case 'low': return 'Низ.';
                        default: return '';
                      }
                    };

                    return (
                      <div 
                        key={child.id} 
                        draggable={true}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData('text/plain', child.id);
                          setNestedDragNodeId(child.id);
                        }}
                        onDragEnd={() => setNestedDragNodeId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                          onOpenDrawer();
                        }}
                        className="p-2 rounded-xl border border-slate-105 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs flex flex-col gap-1.5 group/item cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-900 select-none transition-all hover:bg-slate-50/40 dark:hover:bg-slate-850/40"
                      >
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(child.id);
                            onOpenDrawer();
                          }}
                          className={`font-semibold leading-relaxed cursor-pointer select-text truncate ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${child.completed ? 'line-through text-slate-420 dark:text-slate-500 font-normal' : 'text-slate-755 dark:text-slate-200 font-extrabold'}`}
                        >
                          {child.text}
                        </span>

                        {/* Render tags, progress, pomodoros, or priority badges on the cards if present */}
                        {((child.priority && child.priority !== 'none') || (child.tags && child.tags.length > 0) || child.dueDate || child.pomodoroTotalTime || (child.progress && child.progress > 0)) && (
                          <div className="flex flex-wrap gap-1 items-center leading-none">
                            {child.priority && child.priority !== 'none' && (
                              <span className={`text-[7.5px] font-extrabold uppercase px-1 py-0.5 border rounded flex items-center shrink-0 ${getPriorityColorStyle(child.priority)}`}>
                                {getPriorityLabelRu(child.priority)}
                              </span>
                            )}

                            {child.progress && child.progress > 0 && (
                              <span className="text-[7.5px] font-mono font-black px-1.5 py-0.5 rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
                                {child.progress}%
                              </span>
                            )}

                            {child.pomodoroTotalTime ? (
                              <span className="text-[7.5px] font-bold text-rose-500 dark:text-rose-455 shrink-0 flex items-center gap-0.5 bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10" title="Фокусировка Pomodoro">
                                🍅 {Math.round(child.pomodoroTotalTime / 60)}м
                              </span>
                            ) : null}

                            {child.dueDate && (
                              <span className="text-[7.5px] shrink-0 font-mono flex items-center gap-0.5 bg-indigo-50/30 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 border border-indigo-100/50 rounded animate-in fade-in" title="Срок">
                                📅 {child.dueDate}
                              </span>
                            )}

                            {child.tags?.slice(0, 2).map(tag => {
                              const matchedCategory = tagCategories.find(cat => cat.tags && cat.tags.includes(tag));
                              const color = matchedCategory?.color || '#a1a1aa';
                              return (
                                <span 
                                  key={tag}
                                  className="text-[7px] px-1 rounded font-bold whitespace-nowrap h-3.5 flex items-center shrink-0"
                                  style={{ backgroundColor: color + '12', color: color, border: `1px solid ${color}18` }}
                                >
                                  #{tag}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-100/70 dark:border-slate-800/40 shrink-0 font-sans">
                          <div className="flex gap-0.5">
                            {currentGroupBy === 'status' && col.id === 'todo' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateNode({ ...child, progress: 50 });
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                data-drag-ignore
                                className="p-1 px-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[8px] font-bold cursor-pointer transition-colors"
                                title="Начать работу (In Progress)"
                              >
                                ▶ В раб.
                              </button>
                            )}
                            {currentGroupBy === 'status' && col.id === 'progress' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateNode({ ...child, progress: 0 });
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                data-drag-ignore
                                className="p-1 px-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[8px] font-bold cursor-pointer transition-colors"
                                title="Вернуть в бэклог"
                              >
                                ◀ План
                              </button>
                            )}
                            {currentGroupBy !== 'status' && (
                              <div className="text-[7.5px] font-extrabold text-slate-455 h-3.5 flex items-center">
                                {child.completed ? 'Выполнена' : (child.progress && child.progress > 0 ? 'В работе' : 'Бэклог')}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleNodeCompleted(child.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            data-drag-ignore
                            className={`p-1 px-1.5 rounded-lg text-[8px] font-black cursor-pointer transition-all ${
                              child.completed 
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-455' 
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {child.completed ? '↩ Отмена' : '✓ Вып.'}
                          </button>
                        </div>

                        {/* Quick action buttons for selected task card inside container Kanban board */}
                        {selectedNodeId === child.id && (
                          <div 
                            data-drag-ignore
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 p-1.5 mt-2 bg-slate-50 dark:bg-slate-850 border border-slate-200/50 dark:border-slate-800 rounded-xl transition-all w-full select-none"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddChildNode(child.id);
                              }}
                              title="Добавить подзадачу"
                              className="flex items-center justify-center w-8 h-8 rounded-full text-indigo-650 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotesModalNodeId(child.id);
                              }}
                              title="Изучить заметки"
                              className="flex items-center justify-center w-8 h-8 rounded-full text-emerald-600 dark:text-emerald-450 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFileUploadNodeId(child.id);
                                setTimeout(() => {
                                  if (cardFileInputRef.current) {
                                    cardFileInputRef.current.click();
                                  }
                                }, 50);
                              }}
                              title="Прикрепить файл"
                              className="flex items-center justify-center w-8 h-8 rounded-full text-purple-600 dark:text-purple-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteNode(child.id);
                              }}
                              title="Стереть"
                              className="flex items-center justify-center w-8 h-8 rounded-full text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {col.tasks.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center p-3 border border-dashed border-slate-200/50 dark:border-slate-800/40 rounded-xl select-none min-h-[60px]">
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-555 uppercase tracking-widest text-center mt-1">Перетащите сюда</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (viewMode === 'calendar') {
      const currentSubMode = containerCalendarSubModes[node.id] || 'month';
      const currentDateStr = containerCalendarDates[node.id] || new Date().toISOString().split('T')[0];

      // Safe Gregorian parser avoiding timezone distortion
      const parseLocalDate = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
        return new Date();
      };

      const formatLocalDate = (dateObj: Date) => {
        const year = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${m}-${d}`;
      };

      const activeDateObj = parseLocalDate(currentDateStr);

      const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        const d = new Date(activeDateObj);
        if (currentSubMode === 'month') {
          d.setMonth(d.getMonth() - 1);
        } else if (currentSubMode === 'week') {
          d.setDate(d.getDate() - 7);
        } else {
          d.setDate(d.getDate() - 1);
        }
        setContainerCalendarDates(prev => ({ ...prev, [node.id]: formatLocalDate(d) }));
      };

      const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        const d = new Date(activeDateObj);
        if (currentSubMode === 'month') {
          d.setMonth(d.getMonth() + 1);
        } else if (currentSubMode === 'week') {
          d.setDate(d.getDate() + 7);
        } else {
          d.setDate(d.getDate() + 1);
        }
        setContainerCalendarDates(prev => ({ ...prev, [node.id]: formatLocalDate(d) }));
      };

      const handleToday = (e: React.MouseEvent) => {
        e.stopPropagation();
        setContainerCalendarDates(prev => ({ ...prev, [node.id]: formatLocalDate(new Date()) }));
      };

      const RussianMonths = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
      const RussianMonthsGenitive = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
      ];

      const getHeaderTitle = () => {
        if (currentSubMode === 'month') {
          return `${RussianMonths[activeDateObj.getMonth()]} ${activeDateObj.getFullYear()}`;
        } else if (currentSubMode === 'week') {
          const dayIndex = activeDateObj.getDay();
          const daysToSubtract = dayIndex === 0 ? 6 : dayIndex - 1;
          const mon = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), activeDateObj.getDate() - daysToSubtract);
          const sun = new Date(mon);
          sun.setDate(mon.getDate() + 6);
          return `${mon.getDate()} - ${sun.getDate()} ${RussianMonthsGenitive[sun.getMonth()]} ${sun.getFullYear()}`;
        } else {
          return `${activeDateObj.getDate()} ${RussianMonthsGenitive[activeDateObj.getMonth()]} ${activeDateObj.getFullYear()}`;
        }
      };

      // 1. Generate Month View Matrix details (Monday to Sunday)
      const getMonthGridCells = () => {
        const firstDayOfMonth = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), 1);
        const startDayOfWeek = firstDayOfMonth.getDay();
        const startDayOfWeekRu = startDayOfWeek === 0 ? 7 : startDayOfWeek;
        const paddingDaysCount = startDayOfWeekRu - 1;
        
        const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
        
        const prevMonthEnd = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), 0);
        const prevMonthEndDayNum = prevMonthEnd.getDate();
        for (let i = paddingDaysCount - 1; i >= 0; i--) {
          const d = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth() - 1, prevMonthEndDayNum - i);
          cells.push({
            dateStr: formatLocalDate(d),
            dayNum: d.getDate(),
            isCurrentMonth: false,
            isToday: formatLocalDate(d) === formatLocalDate(new Date())
          });
        }
        
        const totalDaysInMonth = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= totalDaysInMonth; i++) {
          const d = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), i);
          cells.push({
            dateStr: formatLocalDate(d),
            dayNum: i,
            isCurrentMonth: true,
            isToday: formatLocalDate(d) === formatLocalDate(new Date())
          });
        }
        
        const totalCells = cells.length;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remainingCells; i++) {
          const d = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth() + 1, i);
          cells.push({
            dateStr: formatLocalDate(d),
            dayNum: i,
            isCurrentMonth: false,
            isToday: formatLocalDate(d) === formatLocalDate(new Date())
          });
        }
        return cells;
      };

      // 2. Generate Week View Matrix details (Monday to Sunday)
      const getWeekDays = () => {
        const dayIndex = activeDateObj.getDay();
        const daysToSubtract = dayIndex === 0 ? 6 : dayIndex - 1;
        const monday = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), activeDateObj.getDate() - daysToSubtract);
        
        const days: { dateStr: string; label: string; dayNum: number; isToday: boolean }[] = [];
        const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
          days.push({
            dateStr: formatLocalDate(d),
            label: weekdayLabels[i],
            dayNum: d.getDate(),
            isToday: formatLocalDate(d) === formatLocalDate(new Date())
          });
        }
        return days;
      };

      // 3. Helper to format hour integer info into standard task match filters
      const getTaskHour = (dueTimeStr?: string): number | null => {
        if (!dueTimeStr) return null;
        const parts = dueTimeStr.split(':');
        if (parts.length >= 1) {
          const h = parseInt(parts[0], 10);
          if (!isNaN(h) && h >= 0 && h < 24) return h;
        }
        return null;
      };

      const hours = Array.from({ length: 24 }, (_, i) => i);

      return (
        <div className="flex-1 flex flex-col min-h-0 text-slate-800 dark:text-slate-100 font-sans">
          {/* Calendar Control Panel Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150 dark:border-slate-800/80 pb-2 mb-2 select-none shrink-0">
            <div className="flex items-center gap-1 bg-slate-100/60 dark:bg-slate-900/60 p-1 rounded-lg">
              {[
                { id: 'month', label: 'Месяц' },
                { id: 'week', label: 'Неделя' },
                { id: 'day', label: 'День' }
              ].map(sub => {
                const active = currentSubMode === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContainerCalendarSubModes(prev => ({ ...prev, [node.id]: sub.id as 'month' | 'week' | 'day' }));
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`text-[8.5px] font-bold px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      active 
                        ? 'bg-amber-500 text-white shadow-2xs font-extrabold' 
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <button 
                onClick={handlePrev}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 px-1.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition"
                title="Назад"
              >
                ◀
              </button>
              <button 
                onClick={handleToday}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 px-2 text-[8.5px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition whitespace-nowrap"
                title="Перейти на сегодня"
              >
                Сегодня
              </button>
              <button 
                onClick={handleNext}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1 px-1.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition"
                title="Вперед"
              >
                ▶
              </button>
            </div>

            <span className="text-[10px] font-black tracking-wide text-slate-700 dark:text-slate-200 uppercase bg-slate-100/50 dark:bg-slate-900/40 px-2 py-0.5 rounded-md self-center font-semibold">
              {getHeaderTitle()}
            </span>
          </div>

          {/* Core Scrollable Container Body */}
          <div className={`flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar ${isFullScreen ? 'h-full flex-1 flex flex-col' : 'max-h-[220px]'}`}>
            
            {/* MONTH VIEW CALENDAR GRID */}
            {currentSubMode === 'month' && (
              <div className="overflow-x-auto custom-scrollbar pb-1.5 w-full">
                <div className={`space-y-1 select-none min-w-[850px] md:min-w-0 ${isFullScreen ? 'flex-grow h-full flex flex-col min-h-0' : ''}`}>
                  <div className="grid grid-cols-7 gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest text-center border-b border-slate-100 dark:border-slate-850 pb-1 shrink-0">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                  </div>
                  <div className={`grid grid-cols-7 gap-1 ${isFullScreen ? 'flex-grow h-full flex-1 min-h-[350px] md:grid-rows-5 lg:grid-rows-6' : ''}`}>
                    {getMonthGridCells().map(cell => {
                      const cellTasks = containerChildren.filter(child => child.dueDate === cell.dateStr);

                      return (
                        <div
                          key={cell.dateStr}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                            if (draggedId) {
                              const t = nodes.find(n => n.id === draggedId);
                              if (t) {
                                onUpdateNode({ ...t, dueDate: cell.dateStr });
                              }
                            }
                          }}
                          onClick={(e) => {
                            // Ensure click was purely on empty cell background
                            onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача', { dueDate: cell.dateStr });
                          }}
                          className={`p-1 min-h-[50px] ${isFullScreen ? 'h-full min-h-[100px] lg:min-h-[12.5vh]' : ''} flex flex-col items-stretch text-left rounded-lg transition-colors border select-none cursor-pointer ${
                            cell.isToday
                              ? 'bg-amber-500/10 border-amber-500/50 text-amber-900 dark:text-amber-200'
                              : cell.isCurrentMonth
                                ? 'bg-white/80 dark:bg-slate-900/80 border-slate-150/40 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-850/50'
                                : 'bg-slate-50/15 dark:bg-slate-900/5 border-slate-100/20 dark:border-slate-850/25 opacity-30 pointer-events-none'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1 select-none">
                            <span className={`text-[8px] font-extrabold ${cell.isToday ? 'text-amber-500 font-black' : 'text-slate-500 dark:text-slate-400'}`}>
                              {cell.dayNum}
                            </span>
                            {cellTasks.length > 0 && (
                              <span className="text-[7.5px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-800/50 rounded-full w-3.5 h-3.5 flex items-center justify-center font-mono">
                                {cellTasks.length}
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-0.5 overflow-hidden flex-1 flex flex-col justify-start">
                            {cellTasks.map(child => (
                              <div
                                key={child.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('text/plain', child.id);
                                  setNestedDragNodeId(child.id);
                                }}
                                onDragEnd={() => setNestedDragNodeId(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(child.id);
                                }}
                                className="px-1 py-0.2 rounded border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[7.5px] font-bold tracking-tight truncate text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-755 select-none cursor-grab active:cursor-grabbing flex items-center justify-between"
                                title={child.text}
                              >
                                <span className={`truncate ${child.completed ? 'line-through text-slate-400' : ''}`}>{child.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* WEEK VIEW CALENDAR COLUMNS */}
            {currentSubMode === 'week' && (
              <div className="overflow-x-auto custom-scrollbar pb-1.5 w-full">
                <div className="grid grid-cols-7 gap-1.5 h-full min-w-[850px] md:min-w-0">
                  {getWeekDays().map(day => {
                    const dayTasks = containerChildren.filter(child => child.dueDate === day.dateStr);

                    return (
                      <div
                        key={day.dateStr}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                          if (draggedId) {
                            const t = nodes.find(n => n.id === draggedId);
                            if (t) {
                              onUpdateNode({ ...t, dueDate: day.dateStr });
                            }
                          }
                        }}
                        onClick={(e) => {
                          onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача', { dueDate: day.dateStr });
                        }}
                        className={`p-1.5 rounded-lg flex flex-col text-left border select-none min-h-[140px] flex-1 cursor-pointer transition-colors ${
                          day.isToday
                            ? 'bg-amber-500/5 border-amber-500/40 text-amber-900 dark:text-amber-200'
                            : 'bg-white dark:bg-slate-900 border-slate-150/40 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-850/50'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-100/50 dark:border-slate-800/50 pb-1 mb-1.5 select-none shrink-0 font-sans">
                          <span className="text-[8px] font-black text-slate-405 dark:text-slate-500 uppercase">{day.label}</span>
                          <span className={`text-[9px] font-extrabold rounded-md w-4 h-4 flex items-center justify-center font-mono ${day.isToday ? 'bg-amber-500 text-white font-black' : 'text-slate-650 dark:text-slate-300'}`}>
                            {day.dayNum}
                          </span>
                        </div>
                        
                        <div className="space-y-1 flex-1 overflow-y-auto scrollbar-none">
                          {dayTasks.map(child => (
                            <div
                              key={child.id}
                              draggable={true}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData('text/plain', child.id);
                                setNestedDragNodeId(child.id);
                              }}
                              onDragEnd={() => setNestedDragNodeId(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(child.id);
                              }}
                              className="p-1 rounded bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 text-[8.5px] font-bold leading-normal truncate text-slate-700 dark:text-slate-300 hover:border-slate-300 select-none cursor-grab active:cursor-grabbing flex items-center justify-between"
                              title={child.text}
                            >
                              <span className={`truncate ${child.completed ? 'line-through text-slate-400' : ''}`}>{child.text}</span>
                              {child.dueTime && (
                                <span className="text-[7px] text-slate-400 dark:text-slate-500 font-mono shrink-0 ml-1 font-bold">
                                  {child.dueTime}
                                </span>
                              )}
                            </div>
                          ))}
                          {dayTasks.length === 0 && (
                            <div className="text-center py-4 text-[7px] text-slate-300 dark:text-slate-700 uppercase tracking-widest border border-dashed border-slate-200/50 dark:border-slate-800/40 rounded-md">
                              пусто
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAY VIEW CALENDAR WITH SCHEDULE */}
            {currentSubMode === 'day' && (
              <div className="flex flex-col min-h-[140px]">
                {/* All Day / Untimed tasks row */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                    if (draggedId) {
                      const t = nodes.find(n => n.id === draggedId);
                      if (t) {
                        const updated = { ...t, dueDate: currentDateStr };
                        delete updated.dueTime;
                        onUpdateNode(updated);
                      }
                    }
                  }}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-indigo-50/20 dark:bg-indigo-950/20 border border-dashed border-indigo-200/45 dark:border-indigo-900/45 mb-2 shrink-0"
                >
                  <span className="text-[7.5px] font-black text-indigo-500/80 dark:text-indigo-400 uppercase tracking-wider shrink-0 ml-1">
                    Весь день:
                  </span>
                  <div className="flex flex-wrap gap-1 items-center flex-1">
                    {containerChildren
                      .filter(child => child.dueDate === currentDateStr && !child.dueTime)
                      .map(child => (
                        <div
                          key={child.id}
                          draggable={true}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', child.id);
                            setNestedDragNodeId(child.id);
                          }}
                          onDragEnd={() => setNestedDragNodeId(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(child.id);
                          }}
                          className="p-1 px-1.5 rounded bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 text-[8.5px] font-bold leading-normal truncate text-slate-700 dark:text-slate-350 hover:border-slate-300 dark:hover:border-slate-700 select-none cursor-grab active:cursor-grabbing flex items-center shrink-0 shadow-2xs"
                        >
                          <span className={child.completed ? 'line-through text-slate-400' : ''}>{child.text}</span>
                        </div>
                      ))}
                    {containerChildren.filter(child => child.dueDate === currentDateStr && !child.dueTime).length === 0 && (
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 select-none italic font-medium ml-1">Нет задач без времени</span>
                    )}
                  </div>
                </div>

                {/* 24-Hourly Rows List */}
                <div className="space-y-0.5 border border-slate-100/40 dark:border-slate-850 p-2 rounded-xl bg-slate-50/10 dark:bg-slate-900/5">
                  {hours.map(h => {
                    const slotTimeStr = `${String(h).padStart(2, '0')}:00`;
                    const tasksInSlot = containerChildren.filter(child => child.dueDate === currentDateStr && getTaskHour(child.dueTime) === h);
                    
                    return (
                      <div
                        key={h}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                          if (draggedId) {
                            const t = nodes.find(n => n.id === draggedId);
                            if (t) {
                              onUpdateNode({
                                ...t,
                                dueDate: currentDateStr,
                                dueTime: slotTimeStr
                              });
                            }
                          }
                        }}
                        onClick={(e) => {
                          onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача', { dueDate: currentDateStr, dueTime: slotTimeStr });
                        }}
                        className="flex items-center gap-2 border-b border-slate-100/15 dark:border-slate-900/30 py-1 group/hour hover:bg-slate-100/25 dark:hover:bg-slate-850/20 min-h-[30px] cursor-pointer transition-colors"
                      >
                        <span className="w-10 text-[8px] font-black text-slate-400 dark:text-slate-500 font-mono select-none text-right pr-1">
                          {slotTimeStr}
                        </span>
                        
                        <div className="flex-1 flex flex-wrap gap-1 items-center min-h-[22px]">
                          {tasksInSlot.map(child => (
                            <div
                              key={child.id}
                              draggable={true}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData('text/plain', child.id);
                                setNestedDragNodeId(child.id);
                              }}
                              onDragEnd={() => setNestedDragNodeId(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(child.id);
                              }}
                              className="p-0.5 px-1.5 rounded border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 text-[8.5px] font-bold leading-normal truncate text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 select-none cursor-grab active:cursor-grabbing flex items-center shadow-2xs"
                              title={child.text}
                            >
                              <span className={child.completed ? 'line-through text-slate-400' : ''}>{child.text}</span>
                              {child.dueTime && child.dueTime !== slotTimeStr && (
                                <span className="text-[7.5px] text-slate-400 font-mono font-bold shrink-0 ml-1">({child.dueTime})</span>
                              )}
                            </div>
                          ))}
                          {tasksInSlot.length === 0 && (
                            <span className="text-[8px] text-slate-300 dark:text-slate-705 opacity-0 group-hover/hour:opacity-100 select-none italic pointer-events-none transition-all duration-100">
                              + Перетащить сюда
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      );
    }

    if (viewMode === 'gantt') {
      const { days, ganttTasks } = getGanttData(containerChildren);
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {ganttTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-3 border border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-xl select-none min-h-[140px] text-center my-auto">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-555 uppercase tracking-wide mb-1">Нет временных меток</span>
              <span className="text-[8px] text-slate-400 dark:text-slate-500 max-w-[200px]">Установите сроки (DueDate) для задач этого контейнера, чтобы построить диаграмму Ганта.</span>
            </div>
          ) : (
            <div className="space-y-1.5 min-h-0 flex-1 flex flex-col">
              <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 pb-1 select-none shrink-0">
                <div className="w-1/3 text-[8.5px] font-black text-slate-400 uppercase tracking-widest">Задача</div>
                <div className="flex-1 flex gap-0.5">
                  {days.map(d => (
                    <div key={d.dateStr} className="flex-1 flex flex-col items-center justify-center text-center">
                      <span className="text-[7.5px] font-bold text-slate-400/80 uppercase">{d.label}</span>
                      <span className="text-[8.5px] font-extrabold text-slate-500">{d.dayNum}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className={`flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 ${isFullScreen ? 'max-h-[66vh]' : 'max-h-[170px]'}`}>
                {ganttTasks.map(child => {
                  const startDate = child.startDate || child.dueDate;
                  const endDate = child.dueDate || child.startDate;
                  return (
                    <div 
                      key={child.id} 
                      draggable={true}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData('text/plain', child.id);
                        setNestedDragNodeId(child.id);
                      }}
                      onDragEnd={() => setNestedDragNodeId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(child.id);
                      }}
                      className="flex items-center gap-1 text-[9.5px] cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/40 p-0.5 rounded transition-all select-none"
                    >
                      <div className="w-1/3 min-w-0 pr-1 shrink-0">
                        <span 
                          onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                          className={`font-semibold truncate block cursor-pointer ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${child.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-205'}`}
                        >
                          {child.text}
                        </span>
                      </div>
                      <div className="flex-1 flex gap-0.5 h-3 relative select-none">
                        {days.map(d => {
                          const isDayOfTask = startDate && endDate && (d.dateStr >= startDate && d.dateStr <= endDate);
                          return (
                            <div 
                              key={d.dateStr} 
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                                if (draggedId) {
                                  handleNestedGanttDrop(draggedId, d.dateStr);
                                }
                              }}
                              className={`flex-1 rounded-xs border transition-all ${
                                isDayOfTask 
                                  ? child.completed 
                                    ? 'bg-emerald-500/20 border-emerald-400/30' 
                                    : 'bg-amber-500/70 border-amber-400 shadow-3xs hover:bg-amber-400/90' 
                                  : 'bg-slate-100/10 border-slate-100/50 dark:bg-slate-900/10 dark:border-slate-800/30 hover:bg-slate-200/20 dark:hover:bg-slate-800/40'
                              }`}
                              title={`${child.text} (${startDate ?? ''} — ${endDate ?? ''}). Перетяните задачу на клетку для планирования.`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (viewMode === 'table') {
      return (
        <div 
          onClick={(e) => {
            onAddFloatingNode(node.x, node.y, node.id, 'Новая подзадача');
          }}
          className="flex-1 flex flex-col min-h-0 cursor-pointer"
        >
          <div className="w-full flex items-center border-b border-slate-150 dark:border-slate-800 pb-1 text-[8px] font-black text-slate-400 dark:text-slate-555 uppercase tracking-widest select-none shrink-0 mb-1 px-1">
            <div className="w-[35%] md:w-[40%]">Задача</div>
            <div className="w-[15%] text-center font-bold">Приор</div>
            <div className="w-[15%] text-center font-bold">Прогр</div>
            <div className="w-[20%] text-center font-bold">Срок</div>
            <div className="w-[15%] text-right font-bold">Опции</div>
          </div>
          
          <div className={`flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-0 ${isFullScreen ? 'max-h-[66vh]' : 'max-h-[200px]'}`}>
            {containerChildren.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-6 border border-dashed border-slate-200/40 dark:border-slate-850 rounded-lg select-none">
                <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-555 uppercase tracking-widest">Нет данных</span>
              </div>
            ) : (
              [...containerChildren].sort((a, b) => a.y - b.y).map(child => {
                return (
                  <div 
                    key={child.id} 
                    draggable={true}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('text/plain', child.id);
                      setNestedDragNodeId(child.id);
                    }}
                    onDragEnd={() => setNestedDragNodeId(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const draggedId = e.dataTransfer.getData('text/plain') || nestedDragNodeId;
                      if (draggedId && draggedId !== child.id) {
                        handleContainerChildDrop(draggedId, child.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectNode(child.id);
                    }}
                    className="w-full flex items-center py-1.5 border-b border-slate-100/50 dark:border-slate-850/60 hover:bg-slate-50/45 dark:hover:bg-slate-900/20 group/row cursor-pointer text-slate-850 dark:text-slate-200 select-none transition-all"
                  >
                    <div className="w-[35%] md:w-[40%] min-w-0 pr-1 flex items-center gap-1">
                       <button 
                         onClick={(e) => { e.stopPropagation(); onToggleNodeCompleted(child.id); }}
                         onMouseDown={(e) => e.stopPropagation()}
                         data-drag-ignore
                         className="text-slate-400 hover:text-indigo-600 transition-all cursor-pointer shrink-0"
                       >
                         {child.completed ? (
                           <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-in fade-in zoom-in-50 duration-205" />
                         ) : (
                           <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 hover:scale-110 transition-transform" />
                         )}
                       </button>
                       <input 
                         type="text"
                         value={child.text}
                         onClick={(e) => {
                           e.stopPropagation();
                           onSelectNode(child.id);
                         }}
                         onChange={(e) => {
                           onUpdateNode({ ...child, text: e.target.value });
                         }}
                         onKeyDown={(e) => e.stopPropagation()}
                         onMouseDown={(e) => e.stopPropagation()}
                         className={`flex-1 bg-transparent border-0 focus:ring-0 p-0.5 rounded hover:bg-slate-100/50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-855 truncate min-w-[50px] shrink ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${
                           child.completed ? 'line-through text-slate-400 font-normal font-normal' : 'text-slate-700 dark:text-slate-205 font-semibold'
                         }`}
                       />
                    </div>
                    <div className="w-[15%] text-center text-[9px] font-bold flex justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                          const cycle = ['none', 'low', 'medium', 'high', 'urgent'];
                          const nextP = cycle[(cycle.indexOf(child.priority) + 1) % cycle.length];
                          onUpdateNode({ ...child, priority: nextP as Priority });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-0.5 px-1 rounded-md text-[7.5px] font-extrabold cursor-pointer transition-colors leading-none ${
                          child.priority === 'urgent' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-455' :
                          child.priority === 'high' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                          child.priority === 'medium' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-405' :
                          child.priority === 'low' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                          'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}
                        title="Приоритет (клик для изменения)"
                      >
                        {child.priority === 'urgent' ? 'Крит' :
                         child.priority === 'high' ? 'Выс' :
                         child.priority === 'medium' ? 'Ср' :
                         child.priority === 'low' ? 'Низ' : '⚪'}
                      </button>
                    </div>
                    <div className="w-[15%] text-center text-[9px] font-bold flex justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(child.id);
                          const currentProg = child.progress || 0;
                          const nextProg = currentProg >= 100 ? 0 : currentProg + 25;
                          onUpdateNode({ ...child, progress: nextProg, completed: nextProg === 100 ? true : child.completed });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-0.5 px-1 rounded-md text-[7.5px] font-black cursor-pointer transition-colors leading-none ${
                          child.completed || child.progress === 100 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                          (child.progress || 0) > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-405' : 'bg-slate-100 dark:bg-slate-800 text-slate-450'
                        }`}
                        title="Прогресс (клик для изменения)"
                      >
                        {child.completed ? '100%' : `${child.progress || 0}%`}
                      </button>
                    </div>
                    <div className="w-[20%] text-center flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5 bg-slate-50 dark:bg-slate-950 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-800 text-slate-650 shrink-0">
                        <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <input 
                          type="date"
                          value={child.dueDate || ''}
                          onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            onUpdateNode({ ...child, dueDate: e.target.value });
                          }}
                          className="text-[8px] p-0.5 bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-600 dark:text-slate-350 max-w-[70px] font-mono leading-none cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="w-[15%] flex items-center justify-end gap-1 px-1 shrink-0 font-sans">
                      <button
                        onClick={(e) => { e.stopPropagation(); setNotesModalNodeId(child.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-805 transition-colors cursor-pointer"
                        title="Описание / Заметки"
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteNode(child.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-855 transition-colors cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const txt = inlineAddTexts[node.id] || '';
              if (txt.trim()) {
                onAddFloatingNode(node.x, node.y, node.id, txt.trim());
                setInlineAddTexts(prev => ({ ...prev, [node.id]: '' }));
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="mt-2 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800/60 pt-2 shrink-0 select-none font-sans"
          >
            <input 
              type="text"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              value={inlineAddTexts[node.id] || ''}
              onChange={(value) => {
                setInlineAddTexts(prev => ({ ...prev, [node.id]: value.target.value }));
              }}
              placeholder="Новая подзадача..."
              className="flex-1 text-[9px] p-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-md focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />
            <button
              type="submit"
              className="p-1 px-2 text-[9px] font-black bg-indigo-650 hover:bg-indigo-700 text-white rounded-md cursor-pointer transition flex items-center gap-0.5"
            >
              <Plus className="w-2.5 h-2.5" /> Добавить
            </button>
          </form>
        </div>
      );
    }

    return null;
  };

// INBOX Container off-canvas persistent states
  const [isInboxCollapsed, setIsInboxCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_inbox_collapsed');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [inboxInputText, setInboxInputText] = useState<string>('');

  useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_inbox_collapsed', JSON.stringify(isInboxCollapsed));
    } catch (e) {
      console.error('Failed to persist inbox state:', e);
    }
  }, [isInboxCollapsed]);

  // --- WEB SPEECH API INTEGRATION ---
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const [speechLanguage, setSpeechLanguage] = useState<'ru-RU' | 'az-AZ' | 'en-US'>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_speech_lang');
      return (saved === 'az-AZ' || saved === 'en-US' || saved === 'ru-RU') ? saved : 'ru-RU';
    } catch {
      return 'ru-RU';
    }
  });
  const [isInboxListening, setIsInboxListening] = useState<boolean>(false);
  const [isCanvasListening, setIsCanvasListening] = useState<boolean>(false);
  const [canvasSpeechText, setCanvasSpeechText] = useState<string>('');
  
  const inboxRecRef = useRef<any>(null);
  const canvasRecRef = useRef<any>(null);

  useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_speech_lang', speechLanguage);
    } catch (e) {
      console.error('Failed to persist speech lang:', e);
    }
  }, [speechLanguage]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);

    return () => {
      // Clean up on unmount
      if (inboxRecRef.current) {
        try { inboxRecRef.current.stop(); } catch (e) {}
      }
      if (canvasRecRef.current) {
        try { canvasRecRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const toggleInboxListening = () => {
    if (!speechSupported) {
      alert('Голосовой ввод не поддерживается вашим браузером. Попробуйте Google Chrome.');
      return;
    }

    if (isInboxListening) {
      if (inboxRecRef.current) {
        try { inboxRecRef.current.stop(); } catch (e) {}
      }
      setIsInboxListening(false);
      return;
    }

    if (isCanvasListening) {
      stopCanvasListening();
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = speechLanguage;

      rec.onstart = () => {
        setIsInboxListening(true);
      };

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const text = finalTranscript || interimTranscript;
        if (text) {
          setInboxInputText(text);
        }
      };

      rec.onerror = (e: any) => {
        console.error('Inbox Speech Error:', e);
        setIsInboxListening(false);
      };

      rec.onend = () => {
        setIsInboxListening(false);
      };

      inboxRecRef.current = rec;
      rec.start();
    } catch (err) {
      console.error('Error starting inbox speech:', err);
      setIsInboxListening(false);
    }
  };

  const startCanvasDictation = () => {
    if (!speechSupported) {
      alert('Голосовой ввод не поддерживается вашим браузером. Попробуйте Google Chrome.');
      return;
    }

    if (isInboxListening) {
      if (inboxRecRef.current) {
        try { inboxRecRef.current.stop(); } catch (e) {}
      }
      setIsInboxListening(false);
    }

    setCanvasSpeechText('');
    setIsCanvasListening(true);
  };

  const stopCanvasListening = () => {
    setIsCanvasListening(false);
  };

  // Robustly manage the canvas Speech Recognition service in the background
  useEffect(() => {
    if (!isCanvasListening) return;

    let rec: any = null;
    let isActive = true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const startListening = () => {
      try {
        rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = speechLanguage;

        rec.onstart = () => {
          console.log(`Speech started for language: ${speechLanguage}`);
        };

        rec.onresult = (event: any) => {
          if (!isActive) return;
          let finalTranscript = '';
          let interimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          const currentText = finalTranscript || interimTranscript;
          if (currentText.trim()) {
            setCanvasSpeechText(currentText);
          }
        };

        rec.onerror = (e: any) => {
          console.error('Canvas Speech Error inside effect:', e);
          // Ignore general aborted we caused or no-speech timeouts
        };

        rec.onend = () => {
          // If deactivated or modal closed, do not restart
          if (!isActive || !isCanvasListening) return;
          // Auto-restart to stay responsive and avoid silent timeout closures
          try {
            if (isActive) {
              rec.start();
            }
          } catch (err) {
            console.error('Failed to auto-restart speech:', err);
          }
        };

        canvasRecRef.current = rec;
        rec.start();
      } catch (err) {
        console.error('Error starting canvas SpeechRecognition:', err);
      }
    };

    // Delay start slightly to allow previous recognition to completely stop
    const startTimer = setTimeout(() => {
      if (isActive) startListening();
    }, 150);

    return () => {
      isActive = false;
      if (rec) {
        try {
          rec.onend = null;
          rec.onerror = null;
          rec.stop();
        } catch (e) {}
      }
      if (canvasRecRef.current === rec) {
        canvasRecRef.current = null;
      }
      clearTimeout(startTimer);
    };
  }, [isCanvasListening, speechLanguage]);

  const parseVoiceCommand = (transcript: string) => {
    const cleanText = transcript.trim().replace(/[.?!,;]+$/, "").trim();
    const lowerText = cleanText.toLowerCase();

    const englishPrefixes = [
      "add a task",
      "create a task",
      "add task",
      "create task",
      "new task",
      "add",
      "create",
      "task"
    ];

    const russianPrefixes = [
      "добавить в инбокс",
      "добавь в инбокс",
      "добавить задачу",
      "добавь задачу",
      "создать задачу",
      "создай задачу",
      "новая задача",
      "добавить",
      "добавь",
      "создать",
      "создай",
      "задача"
    ];

    const azPrefixes = [
      "tapşırıq əlavə et",
      "yeni tapşırıq",
      "tapşırıq yaz",
      "əlavə et",
      "tapşırıq"
    ];

    // Try to find the longest matching prefix
    const allPrefixes = [...englishPrefixes, ...russianPrefixes, ...azPrefixes].sort((a, b) => b.length - a.length);

    let matchedPrefix: string | null = null;
    let remainingText = cleanText;

    for (const prefix of allPrefixes) {
      if (lowerText.startsWith(prefix + " ")) {
        matchedPrefix = prefix;
        remainingText = cleanText.substring(prefix.length).trim();
        break;
      }
    }

    if (remainingText) {
      remainingText = remainingText.charAt(0).toUpperCase() + remainingText.slice(1);
    } else {
      remainingText = cleanText;
    }

    return {
      commandMatched: matchedPrefix,
      taskText: remainingText
    };
  };

  const handleCreateCanvasTaskFromSpeech = (text: string) => {
    if (!text.trim()) return;
    const { taskText } = parseVoiceCommand(text);
    const x = Math.round(-panX / zoom);
    const y = Math.round(-panY / zoom);
    onAddFloatingNode(x, y, focusedContainerId, taskText);
  };
  // --- END OF WEB SPEECH API INTEGRATION ---

  // Focus mode states for container fullscreen focus
  const [focusedContainerId, setFocusedContainerId] = useState<string | null>(null);
  const [isFocusStatsMobileExpanded, setIsFocusStatsMobileExpanded] = useState<boolean>(false);
  const [isMobileViewsListExpanded, setIsMobileViewsListExpanded] = useState<boolean>(false);

  // Reset focus mode if the focused container is deleted or project is switched
  useEffect(() => {
    if (focusedContainerId && !nodes.some(n => n.id === focusedContainerId)) {
      setFocusedContainerId(null);
    }
  }, [nodes, focusedContainerId]);

  // Keep track of the last active container ID to layer it higher than other containers even after focus is removed
  const [lastActiveContainerId, setLastActiveContainerId] = useState<string | null>(null);

  // Helper to find the top container parent of a node
  const findContainerParentId = (nodeId: string | null): string | null => {
    if (!nodeId) return null;
    let current = nodes.find(n => n.id === nodeId);
    while (current) {
      if (current.isContainer) {
        return current.id;
      }
      const parentId = current.parentId;
      current = parentId ? nodes.find(n => n.id === parentId) : undefined;
    }
    return null;
  };

  useEffect(() => {
    if (focusedContainerId) {
      setLastActiveContainerId(focusedContainerId);
    } else if (selectedNodeId) {
      const containerId = findContainerParentId(selectedNodeId);
      if (containerId) {
        setLastActiveContainerId(containerId);
      }
    }
  }, [focusedContainerId, selectedNodeId, nodes]);

  // Reset lastActiveContainerId if that container is deleted or project is switched
  useEffect(() => {
    if (lastActiveContainerId && !nodes.some(n => n.id === lastActiveContainerId)) {
      setLastActiveContainerId(null);
    }
  }, [nodes, lastActiveContainerId]);

  // Resize states for containers
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 520, height: 400 });
  const [resizeStartCenter, setResizeStartCenter] = useState({ x: 0, y: 0 });

  // Pinch-to-zoom tracking refs
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Target node being hovered during a drag operation
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const hoverTimerRef = useRef<any>(null);

  // Long press refs & state for touch devices
  const [isLongPressDragging, setIsLongPressDragging] = useState<boolean>(false);
  const longPressTimeoutRef = useRef<any>(null);
  const potentialDragNodeIdRef = useRef<string | null>(null);
  const potentialDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const potentialNodeOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Prevent parent canvas mouse down actions when clicking cards or buttons
  const isButtonOrCardInput = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    return (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('[data-drag-ignore]')
    );
  };

  // Convert screen coordinates to canvas space coordinates
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = clientX - rect.left - cx;
    const ry = clientY - rect.top - cy;
    const x = (rx - panX) / zoom;
    const y = (ry - panY) / zoom;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isButtonOrCardInput(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]')) return; // ignore nodes double clicks

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    onAddFloatingNode(coords.x, coords.y, focusedContainerId);
  };

  // Zoom limits
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 2.5;

  // Check if a node matches the active filter settings
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
          if (!isNodeOverdue(node, nodes)) return false;
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

  // Dynamic ref to allow native listeners to access current coordinates safely
  const latestStateRef = useRef({
    zoom,
    panX,
    panY,
  });

  useEffect(() => {
    latestStateRef.current = {
      zoom,
      panX,
      panY,
    };
  }); // updates every render to always have the latest coordinates

  // Native wheel and touch event registration to bypass passive listener limits and prevent browser page zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('select') ||
        target.closest('.overflow-y-auto')
      ) {
        return;
      }

      // Block standard browser-level page scaling (pinch zoom / ctrl+scroll)
      e.preventDefault();

      const { zoom: curZoom, panX: curPanX, panY: curPanY } = latestStateRef.current;
      const rect = container.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const canvasMouseX = (cursorX - centerX - curPanX) / curZoom;
      const canvasMouseY = (cursorY - centerY - curPanY) / curZoom;

      const zoomIntensity = 0.055;
      const factor = Math.exp(-e.deltaY * zoomIntensity * 0.01);
      
      let newZoom = curZoom * factor;
      newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);

      const newPanX = cursorX - centerX - canvasMouseX * newZoom;
      const newPanY = cursorY - centerY - canvasMouseY * newZoom;

      setIsWheeling(true);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        setIsWheeling(false);
      }, 150);

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      // Prevent browser level pinch-to-zoom scaling the whole app layout
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [MIN_ZOOM, MAX_ZOOM]);

  const isTransitioningTransform = !isPanning && !draggingNodeId && pinchStartDistRef.current === null && !isLongPressDragging && !isWheeling;

  const getOverlapParent = (draggingId: string, newX: number, newY: number): TaskNode | undefined => {
    const draggingNode = nodes.find(n => n.id === draggingId);
    if (!draggingNode) return undefined;
    if (draggingNode.isContainer) return undefined; // Containers can NEVER be parented or nested under other nodes

    // First attempt: Check for hover/overlap with regular non-container task nodes (containers can also overlap and snap here)
    const normalNodeOverlap = visibleNodes.find(otherNode => {
      if (otherNode.id === draggingId) return false;
      if (isDescendantOrSelf(otherNode.id, draggingId, nodes)) return false;
      if (otherNode.isContainer) return false;

      const dx = Math.abs(newX - otherNode.x);
      const dy = Math.abs(newY - otherNode.y);
      return dx < 120 && dy < 75;
    });

    if (normalNodeOverlap) return normalNodeOverlap;

    // Second attempt: Check for containment inside container nodes
    const containerOverlap = visibleNodes.find(otherNode => {
      if (otherNode.id === draggingId) return false;
      if (isDescendantOrSelf(otherNode.id, draggingId, nodes)) return false;
      if (!otherNode.isContainer || otherNode.collapsed) return false;

      if (draggingNode.isContainer) return false; // Containers cannot go inside other containers
      if (focusedContainerId === otherNode.id) return false; // Do not overlap with the focused container itself in focus mode

      // Do not instantly snap to container during active drag if currently nested under a standard task parent
      if (draggingNode.parentId) {
        const currentParent = nodes.find(p => p.id === draggingNode.parentId);
        if (currentParent && !currentParent.isContainer) {
          return false;
        }
      }

      const dx = Math.abs(newX - otherNode.x);
      const dy = Math.abs(newY - otherNode.y);
      const halfW = (otherNode.width || 520) / 2;
      const halfH = (otherNode.height || 400) / 2;
      return dx < halfW && dy < halfH;
    });

    return containerOverlap;
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.15, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.15, MIN_ZOOM));
  };

  const handleRecenter = () => {
    setPanX(0);
    setPanY(0);
    setZoom(1);
  };

  // Background Canvas Drag/Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isButtonOrCardInput(e)) return;
    
    // Deselect selected node when clicking on an empty space
    onSelectNode(null);

    setIsPanning(true);
    setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingConn) {
      const deltaX = (e.clientX - dragStart.x) / zoom;
      const deltaY = (e.clientY - dragStart.y) / zoom;
      const newOffsetX = Math.round(draggingConn.startOffsetX + deltaX);
      const newOffsetY = Math.round(draggingConn.startOffsetY + deltaY);

      setLocalNodes(prev => {
        return prev.map(n => {
          if (n.id === draggingConn.nodeId) {
            const updatedConns = n.workflowConnections?.map(c => {
              if (c.id === draggingConn.connId) {
                return {
                  ...c,
                  bendOffsetX: newOffsetX,
                  bendOffsetY: newOffsetY
                };
              }
              return c;
            }) || [];
            return {
              ...n,
              workflowConnections: updatedConns
            };
          }
          return n;
        });
      });
      return;
    }

    if (activeConnector) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        const canvasX = (cursorX - centerX - panX) / zoom;
        const canvasY = (cursorY - centerY - panY) / zoom;
        setMousePos({ x: canvasX, y: canvasY });

        // Robust coordinate-based node and side detection for connecting arrows
        let foundNodeId: string | null = null;
        let foundSide: 'top' | 'right' | 'bottom' | 'left' | null = null;

        for (const n of nodes) {
          if (n.id === activeConnector.nodeId) continue;

          let w = 210;
          let h = 110;
          if (n.isWorkflowRectangle) {
            w = n.width || 170;
            h = n.height || 70;
          } else if (n.isContainer) {
            w = n.width || 520;
            h = n.height || 400;
          } else {
            w = n.width || 210;
            h = n.height || 110;
          }

          // 30px boundary snap margin for cozy magnetic connections
          const snapMargin = 30;
          const left = n.x - w / 2 - snapMargin;
          const right = n.x + w / 2 + snapMargin;
          const top = n.y - h / 2 - snapMargin;
          const bottom = n.y + h / 2 + snapMargin;

          if (canvasX >= left && canvasX <= right && canvasY >= top && canvasY <= bottom) {
            foundNodeId = n.id;
            const dx = canvasX - n.x;
            const dy = canvasY - n.y;
            if (Math.abs(dx / w) > Math.abs(dy / h)) {
              foundSide = dx > 0 ? 'right' : 'left';
            } else {
              foundSide = dy > 0 ? 'bottom' : 'top';
            }
            break;
          }
        }

        setHoveredNodeId(foundNodeId);
        setHoveredSide(foundSide);
      }
      return;
    }

    // 0. Resize container operation
    if (resizingNodeId) {
      const node = nodes.find(n => n.id === resizingNodeId);
      if (!node) return;

      const deltaX = (e.clientX - resizeStartPos.x) / zoom;
      const deltaY = (e.clientY - resizeStartPos.y) / zoom;

      if (node.isWorkflowRectangle) {
        const w = 170;
        const h = 70;
        const startWidth = resizeStartSize.width;
        const startHeight = resizeStartSize.height;
        const startOffsetX = resizeStartCenter.x;
        const startOffsetY = resizeStartCenter.y;

        const startLeft = startOffsetX - startWidth / 2;
        const startRight = startOffsetX + startWidth / 2;
        const startTop = startOffsetY - startHeight / 2;
        const startBottom = startOffsetY + startHeight / 2;

        let newLeft = startLeft;
        let newRight = startRight;
        let newTop = startTop;
        let newBottom = startBottom;

        const dir = resizeDirection || 'se';

        if (dir.includes('e')) {
          newRight = Math.max(w / 2 + 10, startRight + deltaX);
        } else if (dir.includes('w')) {
          newLeft = Math.min(-w / 2 - 10, startLeft + deltaX);
        }

        if (dir.includes('s')) {
          newBottom = Math.max(h / 2 + 10, startBottom + deltaY);
        } else if (dir.includes('n')) {
          newTop = Math.min(-h / 2 - 10, startTop + deltaY);
        }

        const newWidth = Math.max(w + 20, newRight - newLeft);
        const newHeight = Math.max(h + 20, newBottom - newTop);

        if (dir.includes('w')) {
          newLeft = newRight - newWidth;
        } else if (dir.includes('e')) {
          newRight = newLeft + newWidth;
        }

        if (dir.includes('n')) {
          newTop = newBottom - newHeight;
        } else if (dir.includes('s')) {
          newBottom = newTop + newHeight;
        }

        const newOffsetX = parseFloat((newLeft + newWidth / 2).toFixed(1));
        const newOffsetY = parseFloat((newTop + newHeight / 2).toFixed(1));

        onUpdateNode({
          ...node,
          zoneWidth: Math.round(newWidth),
          zoneHeight: Math.round(newHeight),
          zoneOffsetX: Math.round(newOffsetX),
          zoneOffsetY: Math.round(newOffsetY)
        });
        return;
      }

      const startLeft = resizeStartCenter.x - resizeStartSize.width / 2;
      const startRight = resizeStartCenter.x + resizeStartSize.width / 2;
      const startTop = resizeStartCenter.y - resizeStartSize.height / 2;
      const startBottom = resizeStartCenter.y + resizeStartSize.height / 2;

      let newLeft = startLeft;
      let newRight = startRight;
      let newTop = startTop;
      let newBottom = startBottom;

      const dir = resizeDirection || 'se';

      // Horizontal updates
      if (dir.includes('e')) {
        newRight = startRight + deltaX;
      } else if (dir.includes('w')) {
        newLeft = startLeft + deltaX;
      }

      // Vertical updates
      if (dir.includes('s')) {
        newBottom = startBottom + deltaY;
      } else if (dir.includes('n')) {
        newTop = startTop + deltaY;
      }

      // Constraints
      const minW = node.isContainer ? 300 : 150;
      const minH = node.isContainer ? 200 : 40;
      const newWidth = Math.max(minW, newRight - newLeft);
      const newHeight = Math.max(minH, newBottom - newTop);

      if (dir.includes('w')) {
        newLeft = newRight - newWidth;
      } else if (dir.includes('e')) {
        newRight = newLeft + newWidth;
      }

      if (dir.includes('n')) {
        newTop = newBottom - newHeight;
      } else if (dir.includes('s')) {
        newBottom = newTop + newHeight;
      }

      const newCenterX = newLeft + newWidth / 2;
      const newCenterY = newTop + newHeight / 2;

      onUpdateNode({
        ...node,
        x: newCenterX,
        y: newCenterY,
        width: newWidth,
        height: newHeight
      });
      return;
    }

    // 1. Pan the board
    if (isPanning && !draggingNodeId) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
      return;
    }

    // 2. Drag a specific node
    if (draggingNodeId) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (!node) return;

      const deltaX = (e.clientX - dragStart.x) / zoom;
      const deltaY = (e.clientY - dragStart.y) / zoom;
      
      const newX = Math.round(nodeOffsetStart.x + deltaX);
      const newY = Math.round(nodeOffsetStart.y + deltaY);

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        setHasDraggedNode(true);
        didDragRef.current = true;
      }

      handleLocalUpdateCoordinates(draggingNodeId, newX, newY);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = newX - cardW / 2;
        const nodeRight = newX + cardW / 2;
        const nodeTop = newY - cardH / 2;
        const nodeBottom = newY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;
        let nextLeft = currentLeft;
        let nextRight = currentRight;
        let nextTop = currentTop;
        let nextBottom = currentBottom;

        if (nodeLeft - padding < currentLeft) {
          nextLeft = nodeLeft - padding;
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          nextRight = nodeRight + padding;
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          nextTop = nodeTop - padding;
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          nextBottom = nodeBottom + padding;
          needsResize = true;
        }

        if (needsResize) {
          const newW = Math.round(nextRight - nextLeft);
          const newH = Math.round(nextBottom - nextTop);
          const newCX = Math.round(nextLeft + newW / 2);
          const newCY = Math.round(nextTop + newH / 2);

          onUpdateNode({
            ...parentContainer,
            width: newW,
            height: newH,
            x: newCX,
            y: newCY
          });
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, newX, newY);

      if (overlapNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node && node.parentId !== overlapNode.id) {
          if (hoverTargetId !== overlapNode.id) {
            setHoverTargetId(overlapNode.id);
          }
        } else {
          if (hoverTargetId !== null) {
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          setHoverTargetId(null);
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setResizingNodeId(null);
    setResizeDirection(null);

    if (draggingConn) {
      const targetNode = nodes.find(n => n.id === draggingConn.nodeId);
      if (targetNode) {
        onUpdateNode({
          ...targetNode,
          workflowConnections: targetNode.workflowConnections
        });
      }
      setDraggingConn(null);
      return;
    }

    if (activeConnector) {
      if (hoveredNodeId && hoveredSide) {
        const sourceNode = nodes.find(n => n.id === activeConnector.nodeId);
        if (sourceNode) {
          const newConn = {
            id: generateId(),
            fromSide: activeConnector.side,
            toNodeId: hoveredNodeId,
            toSide: hoveredSide,
            text: ''
          };
          const existingConnections = sourceNode.workflowConnections || [];
          const isDuplicate = existingConnections.some(
            c => c.toNodeId === hoveredNodeId && c.fromSide === activeConnector.side && c.toSide === hoveredSide
          );
          if (!isDuplicate) {
            onUpdateNode({
              ...sourceNode,
              workflowConnections: [...existingConnections, newConn]
            });
          }
        }
      }
      setActiveConnector(null);
      setMousePos(null);
      setHoveredNodeId(null);
      setHoveredSide(null);
      return;
    }

    if (draggingNodeId && hasDraggedNode) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (node) {
        const updatedTags = checkWorkflowTriggerCollisions(node, node.x, node.y);
        if (updatedTags) {
          onUpdateNode({
            ...node,
            x: node.x,
            y: node.y,
            tags: updatedTags
          });
        } else {
          onUpdateNodeCoordinates(draggingNodeId, node.x, node.y);
        }
        const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
        const currentParent = nodes.find(p => p.id === node.parentId);
        
        if (overlap) {
          if (overlap.id !== node.parentId) {
            // Snap inside container or parent directly on drop and pass coordinates
            onUpdateNodeParent(node.id, overlap.id, node.x, node.y);
          }
        } else if (currentParent) {
          if (currentParent.isContainer) {
            const dx = Math.abs(node.x - currentParent.x);
            const dy = Math.abs(node.y - currentParent.y);
            let shouldDetach = false;

            if (focusedContainerId) {
              const maxW = (currentParent.width || 520) / 2 + 400;
              const maxH = (currentParent.height || 400) / 2 + 400;
              shouldDetach = dx > maxW || dy > maxH;
            } else {
              const maxW = (currentParent.width || 520) / 2;
              const maxH = (currentParent.height || 400) / 2;
              shouldDetach = dx > maxW || dy > maxH;
            }

            if (shouldDetach) {
              if (focusedContainerId) {
                if (node.parentId !== focusedContainerId) {
                  onUpdateNodeParent(node.id, focusedContainerId, node.x, node.y);
                }
              } else {
                onUpdateNodeParent(node.id, null, node.x, node.y);
              }
            }
          } else {
            // Dragged away from standard parent by more than 330px on empty space -> auto detach!
            const dx = node.x - currentParent.x;
            const dy = node.y - currentParent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 330) {
              if (focusedContainerId) {
                onUpdateNodeParent(node.id, focusedContainerId, node.x, node.y);
              } else {
                // Check if release position is inside any container
                const container = visibleNodes.find(otherNode => {
                  if (otherNode.id === node.id) return false;
                  if (!otherNode.isContainer || otherNode.collapsed) return false;
                  const cdx = Math.abs(node.x - otherNode.x);
                  const cdy = Math.abs(node.y - otherNode.y);
                  const halfW = (otherNode.width || 520) / 2;
                  const halfH = (otherNode.height || 400) / 2;
                  return cdx < halfW && cdy < halfH;
                });
                if (container) {
                  onUpdateNodeParent(node.id, container.id, node.x, node.y);
                } else {
                  onUpdateNodeParent(node.id, null, node.x, node.y);
                }
              }
            }
          }
        }
      }
    }

    setDraggingNodeId(null);
    if (hasDraggedNode) {
      onSelectNode(null);
    }
    setHasDraggedNode(false);
    
    // Defer resetting didDragRef to let onClick handlers process the value first
    setTimeout(() => {
      didDragRef.current = false;
    }, 50);
    
    // Clear hover timing
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverTargetId(null);
  };

  // Touch Handlers for Mobile Devices
  const handleTouchStart = (e: React.TouchEvent) => {
    // Check if we have two touches for pinching
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      pinchStartDistRef.current = distance;
      pinchStartZoomRef.current = zoom;
      pinchStartPanRef.current = { x: panX, y: panY };
      pinchStartCenterRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      
      setIsPanning(false);
      setDraggingNodeId(null);
      setHasDraggedNode(false);
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      setIsLongPressDragging(false);
      return;
    }

    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    
    // Ignore canvas pan if interacting with buttons
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('[data-drag-ignore]')
    ) return;

    // Is touch on a task card?
    const cardElement = target.closest('[data-node-id]');
    if (cardElement) {
      const nodeId = cardElement.getAttribute('data-node-id');
      if (nodeId && nodeId !== focusedContainerId) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

          potentialDragNodeIdRef.current = nodeId;
          potentialDragStartRef.current = { x: touch.clientX, y: touch.clientY };
          potentialNodeOffsetRef.current = { x: node.x, y: node.y };
          setIsLongPressDragging(false);

          // Start the 500ms long press timer to activate drag
          longPressTimeoutRef.current = setTimeout(() => {
            setIsLongPressDragging(true);
            setDraggingNodeId(nodeId);
            setDragStart(potentialDragStartRef.current);
            setNodeOffsetStart(potentialNodeOffsetRef.current);
            setHasDraggedNode(false); // Do not mark as dragged unless they actually move their finger
            didDragRef.current = false;
            onSelectNode(nodeId);

            if (navigator.vibrate) {
              try { navigator.vibrate(60); } catch (err) {}
            }
          }, 500);

          e.stopPropagation();
          return;
        }
      }
    }

    // Otherwise pan canvas
    onSelectNode(null);
    setIsPanning(true);
    setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggingConn && e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = (touch.clientX - dragStart.x) / zoom;
      const deltaY = (touch.clientY - dragStart.y) / zoom;
      const newOffsetX = Math.round(draggingConn.startOffsetX + deltaX);
      const newOffsetY = Math.round(draggingConn.startOffsetY + deltaY);

      setLocalNodes(prev => {
        return prev.map(n => {
          if (n.id === draggingConn.nodeId) {
            const updatedConns = n.workflowConnections?.map(c => {
              if (c.id === draggingConn.connId) {
                return {
                  ...c,
                  bendOffsetX: newOffsetX,
                  bendOffsetY: newOffsetY
                };
              }
              return c;
            }) || [];
            return {
              ...n,
              workflowConnections: updatedConns
            };
          }
          return n;
        });
      });
      e.preventDefault();
      return;
    }

    if (activeConnector && e.touches.length === 1) {
      const touch = e.touches[0];
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const cursorX = touch.clientX - rect.left;
        const cursorY = touch.clientY - rect.top;
        
        const canvasX = (cursorX - centerX - panX) / zoom;
        const canvasY = (cursorY - centerY - panY) / zoom;
        setMousePos({ x: canvasX, y: canvasY });

        // Robust coordinate-based node and side detection for connecting arrows
        let foundNodeId: string | null = null;
        let foundSide: 'top' | 'right' | 'bottom' | 'left' | null = null;

        for (const n of nodes) {
          if (n.id === activeConnector.nodeId) continue;

          let w = 210;
          let h = 110;
          if (n.isWorkflowRectangle) {
            w = n.width || 170;
            h = n.height || 70;
          } else if (n.isContainer) {
            w = n.width || 520;
            h = n.height || 400;
          } else {
            w = n.width || 210;
            h = n.height || 110;
          }

          // 30px boundary snap margin for cozy magnetic connections
          const snapMargin = 30;
          const left = n.x - w / 2 - snapMargin;
          const right = n.x + w / 2 + snapMargin;
          const top = n.y - h / 2 - snapMargin;
          const bottom = n.y + h / 2 + snapMargin;

          if (canvasX >= left && canvasX <= right && canvasY >= top && canvasY <= bottom) {
            foundNodeId = n.id;
            const dx = canvasX - n.x;
            const dy = canvasY - n.y;
            if (Math.abs(dx / w) > Math.abs(dy / h)) {
              foundSide = dx > 0 ? 'right' : 'left';
            } else {
              foundSide = dy > 0 ? 'bottom' : 'top';
            }
            break;
          }
        }

        setHoveredNodeId(foundNodeId);
        setHoveredSide(foundSide);
      }
      e.preventDefault();
      return;
    }

    if (e.touches.length === 2) {
      if (pinchStartDistRef.current !== null) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        
        const factor = currentDistance / pinchStartDistRef.current;
        let newZoom = pinchStartZoomRef.current * factor;
        newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
        
        // Midpoint of current fingers
        const currentCenterX = (t1.clientX + t2.clientX) / 2;
        const currentCenterY = (t1.clientY + t2.clientY) / 2;
        
        // Focus client coordinates
        const rect = containerRef.current?.getBoundingClientRect();
        const containerCenterX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const containerCenterY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        
        // Pinned zoom focal point pan adjustment based on original center of fingers
        const focalX = pinchStartCenterRef.current.x - containerCenterX;
        const focalY = pinchStartCenterRef.current.y - containerCenterY;
        
        const ratio = newZoom / pinchStartZoomRef.current;
        
        // Calculate new pan base so anchor point remains visually in the same place
        let newPanX = focalX - (focalX - pinchStartPanRef.current.x) * ratio;
        let newPanY = focalY - (focalY - pinchStartPanRef.current.y) * ratio;
        
        // Also support moving/shifting while pinching (2-finger panning)
        const panDeltaX = currentCenterX - pinchStartCenterRef.current.x;
        const panDeltaY = currentCenterY - pinchStartCenterRef.current.y;
        newPanX += panDeltaX;
        newPanY += panDeltaY;
        
        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
        
        e.preventDefault(); // prevent zoom and native scroll
      }
      return;
    }

    if (e.touches.length === 0) return;
    const touch = e.touches[0];

    // 0. Resize container operation for touch devices
    if (resizingNodeId && pinchStartDistRef.current === null && e.touches.length === 1) {
      const node = nodes.find(n => n.id === resizingNodeId);
      if (!node) return;

      const deltaX = (touch.clientX - resizeStartPos.x) / zoom;
      const deltaY = (touch.clientY - resizeStartPos.y) / zoom;

      if (node.isWorkflowRectangle) {
        const w = 170;
        const h = 70;
        const startWidth = resizeStartSize.width;
        const startHeight = resizeStartSize.height;
        const startOffsetX = resizeStartCenter.x;
        const startOffsetY = resizeStartCenter.y;

        const startLeft = startOffsetX - startWidth / 2;
        const startRight = startOffsetX + startWidth / 2;
        const startTop = startOffsetY - startHeight / 2;
        const startBottom = startOffsetY + startHeight / 2;

        let newLeft = startLeft;
        let newRight = startRight;
        let newTop = startTop;
        let newBottom = startBottom;

        const dir = resizeDirection || 'se';

        if (dir.includes('e')) {
          newRight = Math.max(w / 2 + 10, startRight + deltaX);
        } else if (dir.includes('w')) {
          newLeft = Math.min(-w / 2 - 10, startLeft + deltaX);
        }

        if (dir.includes('s')) {
          newBottom = Math.max(h / 2 + 10, startBottom + deltaY);
        } else if (dir.includes('n')) {
          newTop = Math.min(-h / 2 - 10, startTop + deltaY);
        }

        const newWidth = Math.max(w + 20, newRight - newLeft);
        const newHeight = Math.max(h + 20, newBottom - newTop);

        if (dir.includes('w')) {
          newLeft = newRight - newWidth;
        } else if (dir.includes('e')) {
          newRight = newLeft + newWidth;
        }

        if (dir.includes('n')) {
          newTop = newBottom - newHeight;
        } else if (dir.includes('s')) {
          newBottom = newTop + newHeight;
        }

        const newOffsetX = parseFloat((newLeft + newWidth / 2).toFixed(1));
        const newOffsetY = parseFloat((newTop + newHeight / 2).toFixed(1));

        onUpdateNode({
          ...node,
          zoneWidth: Math.round(newWidth),
          zoneHeight: Math.round(newHeight),
          zoneOffsetX: Math.round(newOffsetX),
          zoneOffsetY: Math.round(newOffsetY)
        });
        e.preventDefault();
        return;
      }

      const startLeft = resizeStartCenter.x - resizeStartSize.width / 2;
      const startRight = resizeStartCenter.x + resizeStartSize.width / 2;
      const startTop = resizeStartCenter.y - resizeStartSize.height / 2;
      const startBottom = resizeStartCenter.y + resizeStartSize.height / 2;

      let newLeft = startLeft;
      let newRight = startRight;
      let newTop = startTop;
      let newBottom = startBottom;

      const dir = resizeDirection || 'se';

      // Horizontal updates
      if (dir.includes('e')) {
        newRight = startRight + deltaX;
      } else if (dir.includes('w')) {
        newLeft = startLeft + deltaX;
      }

      // Vertical updates
      if (dir.includes('s')) {
        newBottom = startBottom + deltaY;
      } else if (dir.includes('n')) {
        newTop = startTop + deltaY;
      }

      // Constraints
      const minW = node.isContainer ? 300 : 150;
      const minH = node.isContainer ? 200 : 40;
      const newWidth = Math.max(minW, newRight - newLeft);
      const newHeight = Math.max(minH, newBottom - newTop);

      if (dir.includes('w')) {
        newLeft = newRight - newWidth;
      } else if (dir.includes('e')) {
        newRight = newLeft + newWidth;
      }

      if (dir.includes('n')) {
        newTop = newBottom - newHeight;
      } else if (dir.includes('s')) {
        newBottom = newTop + newHeight;
      }

      const newCenterX = newLeft + newWidth / 2;
      const newCenterY = newTop + newHeight / 2;

      onUpdateNode({
        ...node,
        x: newCenterX,
        y: newCenterY,
        width: newWidth,
        height: newHeight
      });
      e.preventDefault();
      return;
    }

    // If we have a pending long press but they moved their finger significantly, cancel long press
    if (!isLongPressDragging && potentialDragNodeIdRef.current && longPressTimeoutRef.current) {
      const dx = touch.clientX - potentialDragStartRef.current.x;
      const dy = touch.clientY - potentialDragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
        potentialDragNodeIdRef.current = null;
        
        // Treat as normal background panning!
        setIsPanning(true);
        setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
      }
    }

    // Only pan if we aren't currently pinching
    if (isPanning && !draggingNodeId && pinchStartDistRef.current === null) {
      setPanX(touch.clientX - panStart.x);
      setPanY(touch.clientY - panStart.y);
      e.preventDefault(); // prevent native rubber banding
      return;
    }

    if (draggingNodeId && pinchStartDistRef.current === null) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (!node) return;

      const deltaX = (touch.clientX - dragStart.x) / zoom;
      const deltaY = (touch.clientY - dragStart.y) / zoom;
      
      const newX = Math.round(nodeOffsetStart.x + deltaX);
      const newY = Math.round(nodeOffsetStart.y + deltaY);

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        setHasDraggedNode(true);
        didDragRef.current = true;
      }

      handleLocalUpdateCoordinates(draggingNodeId, newX, newY);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = newX - cardW / 2;
        const nodeRight = newX + cardW / 2;
        const nodeTop = newY - cardH / 2;
        const nodeBottom = newY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;
        let nextLeft = currentLeft;
        let nextRight = currentRight;
        let nextTop = currentTop;
        let nextBottom = currentBottom;

        if (nodeLeft - padding < currentLeft) {
          nextLeft = nodeLeft - padding;
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          nextRight = nodeRight + padding;
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          nextTop = nodeTop - padding;
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          nextBottom = nodeBottom + padding;
          needsResize = true;
        }

        if (needsResize) {
          const newW = Math.round(nextRight - nextLeft);
          const newH = Math.round(nextBottom - nextTop);
          const newCX = Math.round(nextLeft + newW / 2);
          const newCY = Math.round(nextTop + newH / 2);

          onUpdateNode({
            ...parentContainer,
            width: newW,
            height: newH,
            x: newCX,
            y: newCY
          });
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, newX, newY);

      if (overlapNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node && node.parentId !== overlapNode.id) {
          if (hoverTargetId !== overlapNode.id) {
            setHoverTargetId(overlapNode.id);
          }
        } else {
          if (hoverTargetId !== null) {
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          setHoverTargetId(null);
        }
      }

      e.preventDefault(); // prevent scroll
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setResizingNodeId(null);
    setResizeDirection(null);

    if (activeConnector) {
      if (hoveredNodeId && hoveredSide) {
        const sourceNode = nodes.find(n => n.id === activeConnector.nodeId);
        if (sourceNode) {
          const newConn = {
            id: generateId(),
            fromSide: activeConnector.side,
            toNodeId: hoveredNodeId,
            toSide: hoveredSide,
            text: ''
          };
          const existingConnections = sourceNode.workflowConnections || [];
          const isDuplicate = existingConnections.some(
            c => c.toNodeId === hoveredNodeId && c.fromSide === activeConnector.side && c.toSide === hoveredSide
          );
          if (!isDuplicate) {
            onUpdateNode({
              ...sourceNode,
              workflowConnections: [...existingConnections, newConn]
            });
          }
        }
      }
      setActiveConnector(null);
      setMousePos(null);
      setHoveredNodeId(null);
      setHoveredSide(null);
      
      pinchStartDistRef.current = null;
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      return;
    }

    if (draggingConn) {
      const targetNode = nodes.find(n => n.id === draggingConn.nodeId);
      if (targetNode) {
        onUpdateNode({
          ...targetNode,
          workflowConnections: targetNode.workflowConnections
        });
      }
      setDraggingConn(null);
      return;
    }

    // If fewer than 2 touches, clean up the pinch distance tracker
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }

    // If panning and one finger remains active, reset panning starting reference point to avoid jumps
    if (e.touches.length === 1 && isPanning) {
      const touch = e.touches[0];
      setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
    }

    // Clear long press if active
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    // Clear hover timing
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverTargetId(null);

    if (e.touches.length === 0) {
      if (draggingNodeId && hasDraggedNode) {
        const node = nodes.find(n => n.id === draggingNodeId);
        if (node) {
          const updatedTags = checkWorkflowTriggerCollisions(node, node.x, node.y);
          if (updatedTags) {
            onUpdateNode({
              ...node,
              x: node.x,
              y: node.y,
              tags: updatedTags
            });
          } else {
            onUpdateNodeCoordinates(draggingNodeId, node.x, node.y);
          }
          const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
          const currentParent = nodes.find(p => p.id === node.parentId);
          
          if (overlap) {
            if (overlap.id !== node.parentId) {
              // Snap inside container or parent directly on drop and pass coordinates
              onUpdateNodeParent(node.id, overlap.id, node.x, node.y);
            }
          } else if (currentParent) {
            if (currentParent.isContainer) {
              const dx = Math.abs(node.x - currentParent.x);
              const dy = Math.abs(node.y - currentParent.y);
              let shouldDetach = false;

              if (focusedContainerId) {
                const maxW = (currentParent.width || 520) / 2 + 400;
                const maxH = (currentParent.height || 400) / 2 + 400;
                shouldDetach = dx > maxW || dy > maxH;
              } else {
                const maxW = (currentParent.width || 520) / 2;
                const maxH = (currentParent.height || 400) / 2;
                shouldDetach = dx > maxW || dy > maxH;
              }

              if (shouldDetach) {
                if (focusedContainerId) {
                  if (node.parentId !== focusedContainerId) {
                    onUpdateNodeParent(node.id, focusedContainerId, node.x, node.y);
                  }
                } else {
                  onUpdateNodeParent(node.id, null, node.x, node.y);
                }
              }
            } else {
              // Dragged away from standard parent by more than 330px on empty space -> auto detach!
              const dx = node.x - currentParent.x;
              const dy = node.y - currentParent.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 330) {
                if (focusedContainerId) {
                  onUpdateNodeParent(node.id, focusedContainerId, node.x, node.y);
                } else {
                  // Check if release position is inside any container
                  const container = visibleNodes.find(otherNode => {
                    if (otherNode.id === node.id) return false;
                    if (!otherNode.isContainer || otherNode.collapsed) return false;
                    const cdx = Math.abs(node.x - otherNode.x);
                    const cdy = Math.abs(node.y - otherNode.y);
                    const halfW = (otherNode.width || 520) / 2;
                    const halfH = (otherNode.height || 400) / 2;
                    return cdx < halfW && cdy < halfH;
                  });
                  if (container) {
                    onUpdateNodeParent(node.id, container.id, node.x, node.y);
                  } else {
                    onUpdateNodeParent(node.id, null, node.x, node.y);
                  }
                }
              }
            }
          }
        }
      }

      if (!isLongPressDragging && potentialDragNodeIdRef.current) {
        onSelectNode(potentialDragNodeIdRef.current);
      } else if (isLongPressDragging && !hasDraggedNode && potentialDragNodeIdRef.current) {
        // Long press registered but released without dragging: Activate multi-select mode on this card
        onSelectNode(potentialDragNodeIdRef.current, true);
        if (navigator.vibrate) {
          try { navigator.vibrate([40, 40]); } catch (err) {}
        }
      } else if (hasDraggedNode) {
        // Only deselect if they actually moved and dragged the node
        onSelectNode(null);
      }
      setIsPanning(false);
      setDraggingNodeId(null);
      setHasDraggedNode(false);
      setIsLongPressDragging(false);
      potentialDragNodeIdRef.current = null;
      
      // Defer resetting didDragRef to let onClick handlers process the value first
      setTimeout(() => {
        didDragRef.current = false;
      }, 50);
    }
  };

  // Check if a card is touching any workflow outer dashed trigger zone
  const checkWorkflowTriggerCollisions = (movedNode: TaskNode, currentX: number, currentY: number): string[] | null => {
    if (movedNode.isWorkflowRectangle || movedNode.isContainer) return null;

    const cardW = movedNode.width || 210;
    const cardH = movedNode.height || 110;
    const movedLeft = currentX - cardW / 2;
    const movedRight = currentX + cardW / 2;
    const movedTop = currentY - cardH / 2;
    const movedBottom = currentY + cardH / 2;

    let updatedTags: string[] | null = null;

    nodes.forEach(flow => {
      if (!flow.isWorkflowRectangle) return;

      const w = 170;
      const h = 70;
      const zoneW = flow.zoneWidth !== undefined ? flow.zoneWidth : (w + 100);
      const zoneH = flow.zoneHeight !== undefined ? flow.zoneHeight : (h + 80);
      const zoneOX = flow.zoneOffsetX || 0;
      const zoneOY = flow.zoneOffsetY || 0;

      const zoneLeft = flow.x + zoneOX - zoneW / 2;
      const zoneRight = flow.x + zoneOX + zoneW / 2;
      const zoneTop = flow.y + zoneOY - zoneH / 2;
      const zoneBottom = flow.y + zoneOY + zoneH / 2;

      const overlaps = (
        movedLeft <= zoneRight &&
        movedRight >= zoneLeft &&
        movedTop <= zoneBottom &&
        movedBottom >= zoneTop
      );

      if (overlaps && flow.text?.trim()) {
        const flowName = flow.text.trim();
        const currentTags = updatedTags || movedNode.tags || [];

        // Check if flowName belongs to any tag category
        const cats = movedNode.tagCategories || tagCategories || [];
        const matchedCategory = cats.find(cat => cat.tags && cat.tags.includes(flowName));

        if (matchedCategory) {
          // Filter out existing tags that belong to this category
          const filtered = currentTags.filter(t => !matchedCategory.tags.includes(t));
          if (!filtered.includes(flowName)) {
            updatedTags = [...filtered, flowName];
          } else {
            updatedTags = filtered;
          }
        } else {
          // If it doesn't belong to any category, append if not present
          if (!currentTags.includes(flowName)) {
            updatedTags = [...currentTags, flowName];
          } else {
            updatedTags = currentTags;
          }
        }
      }
    });

    if (updatedTags) {
      const orig = movedNode.tags || [];
      const same = orig.length === updatedTags.length && orig.every((t, i) => t === updatedTags![i]);
      if (same) return null;
    }

    return updatedTags;
  };

  // Start drawing a connector from one of the side anchor dots
  const startConnectorDrag = (e: React.MouseEvent | React.TouchEvent, nodeId: string, side: 'top' | 'right' | 'bottom' | 'left') => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const w = node.width || (node.isWorkflowRectangle ? 170 : 210);
    const h = node.height || (node.isWorkflowRectangle ? 70 : 110);
    
    let startX = node.x;
    let startY = node.y;
    if (side === 'top') startY -= h / 2;
    else if (side === 'right') startX += w / 2;
    else if (side === 'bottom') startY += h / 2;
    else if (side === 'left') startX -= w / 2;
    
    setActiveConnector({
      nodeId,
      side,
      startX,
      startY
    });
    setMousePos({ x: startX, y: startY });
  };

  // Start dragging a node from Mouse Down
  const startDragNode = (e: React.MouseEvent, node: TaskNode) => {
    if (isButtonOrCardInput(e)) return;
    if (node.id === focusedContainerId) return; // Disable dragging the container if it's currently focused in fullscreen
    
    e.stopPropagation();
    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setNodeOffsetStart({ x: node.x, y: node.y });
    setHasDraggedNode(false);
    didDragRef.current = false;
  };

  // Start container/card resizing from Mouse Down
  const startResize = (e: React.MouseEvent, node: TaskNode, direction: string = 'se') => {
    e.stopPropagation();
    e.preventDefault();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    setResizeStartSize({
      width: node.width || (node.isContainer ? 520 : 210),
      height: node.height || (node.isContainer ? 400 : 125)
    });
    setResizeStartCenter({ x: node.x, y: node.y });
  };

  // Start container/card resizing from Touch Start
  const startResizeTouch = (e: React.TouchEvent, node: TaskNode, direction: string = 'se') => {
    if (e.touches.length === 0) return;
    e.stopPropagation();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    const touch = e.touches[0];
    setResizeStartPos({ x: touch.clientX, y: touch.clientY });
    setResizeStartSize({
      width: node.width || (node.isContainer ? 520 : 210),
      height: node.height || (node.isContainer ? 400 : 125)
    });
    setResizeStartCenter({ x: node.x, y: node.y });
  };

  // Start workflow step trigger zone resizing (dashed box)
  const startZoneResize = (
    e: React.MouseEvent,
    node: TaskNode,
    direction: string,
    zoneW: number,
    zoneH: number,
    zoneOX: number,
    zoneOY: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    setResizeStartSize({ width: zoneW, height: zoneH });
    setResizeStartCenter({ x: zoneOX, y: zoneOY });
  };

  const startZoneResizeTouch = (
    e: React.TouchEvent,
    node: TaskNode,
    direction: string,
    zoneW: number,
    zoneH: number,
    zoneOX: number,
    zoneOY: number
  ) => {
    if (e.touches.length === 0) return;
    e.stopPropagation();
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    const touch = e.touches[0];
    setResizeStartPos({ x: touch.clientX, y: touch.clientY });
    setResizeStartSize({ width: zoneW, height: zoneH });
    setResizeStartCenter({ x: zoneOX, y: zoneOY });
  };

  // Auto-fit container around its child nodes
  const autoFitContainer = (containerId: string) => {
    const containerNode = nodes.find(n => n.id === containerId);
    if (!containerNode) return;

    const directChildren = nodes.filter(n => n.parentId === containerId);
    if (directChildren.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    directChildren.forEach(child => {
      // Child card size is approx 210x120. Half-bounds: 105px X, 60px Y
      const left = child.x - 105;
      const right = child.x + 105;
      const top = child.y - 60;
      const bottom = child.y + 110;

      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
      if (top < minY) minY = top;
      if (bottom > maxY) maxY = bottom;
    });

    // Padding wrapper
    const padX = 65;
    const padY = 85;

    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padX;

    const newWidth = Math.round(Math.max(520, maxX - minX));
    const newHeight = Math.round(Math.max(400, maxY - minY));
    const newCenterX = Math.round(minX + newWidth / 2);
    const newCenterY = Math.round(minY + newHeight / 2);

    onUpdateNode({
      ...containerNode,
      x: newCenterX,
      y: newCenterY,
      width: newWidth,
      height: newHeight
    });
  };

  // Node styles
  const getPriorityInfo = (p: Priority) => {
    switch (p) {
      case 'urgent':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/45 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60',
          dot: 'bg-rose-600 animate-pulse',
          label: '⚡ URGENT',
          color: '#f43f5e'
        };
      case 'high':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60',
          dot: 'bg-amber-500',
          label: 'HIGH',
          color: '#f59e0b'
        };
      case 'medium':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60',
          dot: 'bg-blue-500',
          label: 'MEDIUM',
          color: '#3b82f6'
        };
      case 'low':
        return {
          bg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900',
          dot: 'bg-teal-500',
          label: 'LOW',
          color: '#14b8a6'
        };
      default:
        return {
          bg: 'bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800',
          dot: 'bg-slate-300',
          label: 'NONE',
          color: '#94a3b8'
        };
    }
  };

  const getPriorityCardStyles = (priority: Priority, isSelected: boolean) => {
    switch (priority) {
      case 'urgent':
        return isSelected 
          ? 'border-rose-500 dark:border-rose-400 ring-4 ring-rose-200 dark:ring-rose-950 shadow-[0_0_20px_rgba(244,63,94,0.65)] font-bold'
          : 'border-rose-500 dark:border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.45)]';
      case 'high':
        return isSelected
          ? 'border-amber-500 dark:border-amber-400 ring-4 ring-amber-200 dark:ring-amber-950 shadow-[0_0_16px_rgba(245,158,11,0.55)]'
          : 'border-amber-500 dark:border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.35)]';
      case 'medium':
        return isSelected
          ? 'border-blue-500 dark:border-blue-400 ring-4 ring-blue-200 dark:ring-blue-950 shadow-[0_0_12px_rgba(59,130,246,0.4)]'
          : 'border-blue-400 dark:border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]';
      case 'low':
        return isSelected
          ? 'border-teal-500 dark:border-teal-400 ring-4 ring-teal-100 dark:ring-teal-950 shadow-[0_0_10px_rgba(20,184,166,0.3)]'
          : 'border-teal-400 dark:border-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.15)]';
      default:
        // Softly fade non-prioritized cards to make prioritized ones pop
        return isSelected 
          ? 'border-slate-400 dark:border-slate-500 ring-4 ring-slate-100 dark:ring-slate-900 opacity-60' 
          : 'border-slate-200 dark:border-slate-800 opacity-50 saturate-50 hover:opacity-85';
    }
  };

  const isOverdue = (dueDateStr?: string) => {
    if (!dueDateStr) return false;
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    return dueDateStr < todayStr;
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      if (!year || !month || !day) return dateStr;
      return `${day}.${month}.${year.slice(-2)}`;
    } catch {
      return dateStr;
    }
  };

  // Find the closest ancestor container for a given node (if any)
  const getAncestorContainer = (nodeId: string | null): TaskNode | null => {
    if (!nodeId) return null;
    const parent = nodes.find(n => n.id === nodeId);
    if (!parent) return null;
    if (parent.isContainer) return parent;
    return getAncestorContainer(parent.parentId);
  };

  // Trace parent nodes back to root to determine if any ancestor is collapsed, or filtered by focus mode
  const visibleNodes = nodes.filter(node => {
    if (node.parentId === 'inbox') return false;

    // Hide child nodes from main canvas view if parent is a container in list/kanban/calendar/gantt/table view (unless focused)
    if (node.parentId) {
      const parentNode = nodes.find(n => n.id === node.parentId);
      if (parentNode && parentNode.isContainer) {
        const parentMode = containerViewModes[parentNode.id] || 'canvas';
        if (parentMode !== 'canvas' && focusedContainerId !== parentNode.id) {
          return false;
        }
      }
    }

    if (focusedContainerId) {
      // In focus mode, we only show the container itself or its descendants
      if (node.id === focusedContainerId) return true;
      
      // Check if it's a descendant of focused container
      let isDescendantOfFocused = false;
      let currentParentId = node.parentId;
      while (currentParentId !== null) {
        if (currentParentId === focusedContainerId) {
          isDescendantOfFocused = true;
          break;
        }
        const findParent = nodes.find(n => n.id === currentParentId);
        if (!findParent) break;
        currentParentId = findParent.parentId;
      }
      
      if (!isDescendantOfFocused) return false;
      
      // Since it is a descendant, it must not have collapsed ancestors *between* itself and the focused container
      currentParentId = node.parentId;
      while (currentParentId !== null && currentParentId !== focusedContainerId) {
        const parent = nodes.find(n => n.id === currentParentId);
        if (!parent) break;
        if (parent.collapsed) {
          return false; // Hidden because some ancestor inside the container is collapsed
        }
        currentParentId = parent.parentId;
      }
      return true;
    }

    // Normal mode: trace all the way to the root
    let currentParentId = node.parentId;
    while (currentParentId !== null) {
      const parent = nodes.find(n => n.id === currentParentId);
      if (!parent) break;
      if (parent.collapsed) {
        return false; // Hidden because parent or higher ancestor is collapsed
      }
      currentParentId = parent.parentId;
    }
    return true; // Visible because no ancestor is collapsed
  });

  // Calculate total descendants recursively for collapsed indicator
  const countDescendants = (parentId: string, allNodes: TaskNode[]): number => {
    let count = 0;
    const children = allNodes.filter(n => n.parentId === parentId);
    count += children.length;
    children.forEach(child => {
      count += countDescendants(child.id, allNodes);
    });
    return count;
  };

  // Return connections: map of nodeId to parent connection, only for visible nodes
  const connections = visibleNodes
    .filter(node => node.parentId !== null)
    .map(node => {
      const parent = visibleNodes.find(p => p.id === node.parentId);
      return { child: node, parent };
    })
    .filter(conn => conn.parent !== undefined && !conn.parent.isContainer) as { child: TaskNode; parent: TaskNode }[];

  return (
    <div 
      ref={containerRef}
      className={`relative flex-1 h-full select-none overflow-hidden bg-white dark:bg-slate-950 outline-none transition-all duration-300 ${focusedContainerId ? 'ring-4 ring-amber-500/15 ring-inset shadow-[inset_0_0_80px_rgba(245,158,11,0.05)]' : ''}`}
      style={{
        backgroundImage: `radial-gradient(${darkMode ? '#334155' : '#cbd5e1'} 1.2px, transparent 1.2px)`,
        backgroundSize: '24px 24px',
        backgroundPosition: `${panX}px ${panY}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      {/* Immersive Focused Container Top Stats Bar */}
      {focusedContainerId && (() => {
        const focusedContainer = nodes.find(n => n.id === focusedContainerId);
        if (!focusedContainer) return null;
        
        const containerChildren = nodes.filter(n => n.parentId === focusedContainerId);
        const totalChildren = containerChildren.length;
        const completedChildren = containerChildren.filter(n => n.completed).length;
        const progress = calculateProgress(focusedContainerId, nodes) || 0;
        
        return (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-amber-300 dark:border-amber-900/60 rounded-2xl shadow-xl transition-all duration-350 animate-in fade-in slide-in-from-top-4 w-[98vw] md:max-w-[96vw] overflow-hidden flex flex-col">
            
            {/* Desktop Only Layout */}
            <div className="hidden md:flex flex-row items-center gap-4 px-5 py-3">
              <div className="flex items-center gap-2.5 min-w-0 w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90 select-none" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className="text-slate-100 dark:text-slate-800"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="transparent"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className="text-amber-500 dark:text-amber-400 transition-all duration-300"
                        strokeWidth="3"
                        strokeDasharray={2 * Math.PI * 15}
                        strokeDashoffset={2 * Math.PI * 15 * (1 - progress / 100)}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                      />
                    </svg>
                    <span className="absolute text-[9.5px] font-black text-slate-800 dark:text-slate-200 font-mono">
                      {progress}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold tracking-wider uppercase font-sans">Режим фокусировки</div>
                    <input
                      type="text"
                      value={focusedContainer.text}
                      onChange={(e) => {
                        onUpdateNode({
                          ...focusedContainer,
                          text: e.target.value
                        });
                      }}
                      className="text-sm font-sans font-extrabold text-slate-800 dark:text-slate-100 bg-transparent border-b border-dashed border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:outline-none focus:ring-0 px-0.5 py-0 min-w-0 max-w-[130px] sm:max-w-[200px]"
                      placeholder="Имя контейнера"
                    />
                  </div>
                </div>
              </div>
              
              <div className="hidden md:block w-[1px] h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />

              {/* View Selector for Focused Mode */}
              <div className="flex items-center gap-1 bg-[#f1f5f9] dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-850 overflow-x-auto scrollbar-none select-none shrink-0 max-w-full shadow-inner">
                {[
                  { id: 'canvas', label: 'Холст', icon: Network },
                  { id: 'kanban', label: 'Канбан', icon: Kanban },
                  { id: 'list', label: 'Мобильный', icon: Smartphone },
                  { id: 'calendar', label: 'Календарь', icon: Calendar },
                  { id: 'gantt', label: 'Гант', icon: GanttChart },
                  { id: 'table', label: 'Таблица', icon: Table }
                ].map(v => {
                  const active = (containerViewModes[focusedContainer.id] || 'canvas') === v.id;
                  const IconComponent = v.icon;
                  return (
                    <button
                      key={v.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContainerViewMode(focusedContainer.id, v.id as any);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-tight transition-all duration-200 cursor-pointer whitespace-nowrap ${
                        active 
                          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-450 border border-slate-100 dark:border-slate-755 shadow-[0_2px_8px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.02)]' 
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-850 border border-transparent'
                      }`}
                    >
                      <IconComponent className={`w-3.5 h-3.5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span>{v.label}</span>
                    </button>
                  );
                })}
              </div>
              
              <div className="hidden md:block w-[1px] h-8 bg-slate-200 dark:bg-slate-800 shrink-0" />
              
              <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-between md:justify-start">
                <div className="flex flex-col items-end gap-0.5 select-none text-right">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {completedChildren}/{totalChildren} Выполнено
                  </span>
                  <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const x = Math.round(-panX / zoom);
                      const y = Math.round(-panY / zoom);
                      onAddFloatingNode(x, y, focusedContainerId, 'Workflow Шаг', { isWorkflowRectangle: true });
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide font-extrabold bg-indigo-500 hover:bg-indigo-600 text-white shadow-md hover:scale-[1.02] transition-all cursor-pointer border border-transparent"
                    title="Добавить шаг workflow в сфокусированный контейнер"
                  >
                    <Network className="w-3.5 h-3.5 text-white" />
                    <span>+ Шаг Workflow</span>
                  </button>
                  <button
                    onClick={() => {
                      const x = Math.round(-panX / zoom);
                      const y = Math.round(-panY / zoom);
                      onAddFloatingNode(x, y, focusedContainerId);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:scale-[1.02] transition-all cursor-pointer border border-transparent"
                    title="Добавить простую задачу в сфокусированный контейнер"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-white" />
                    <span>+ Задача</span>
                  </button>
                </div>
                
                <button
                  onClick={() => {
                    autoFitContainer(focusedContainerId);
                    const targetZoom = 0.85;
                    setZoom(targetZoom);
                    setPanX(-focusedContainer.x * targetZoom);
                    setPanY(-focusedContainer.y * targetZoom);
                    onSelectNode(focusedContainer.id);
                    setFocusedContainerId(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-[11px] font-extrabold transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
                >
                  <Minimize2 className="w-3.5 h-3.5 text-rose-500" />
                  Вернуться
                </button>
              </div>
            </div>

            {/* Mobile Only Collapsible Compact Layout */}
            <div className="flex md:hidden flex-col select-none">
              <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200/40 bg-amber-50/5 dark:bg-slate-900/30">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Miniature progress bar indicator */}
                  <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90 select-none" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className="text-slate-100 dark:text-slate-800"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="transparent"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className="text-amber-500 transition-all duration-300"
                        strokeWidth="3.5"
                        strokeDasharray={2 * Math.PI * 15}
                        strokeDashoffset={2 * Math.PI * 15 * (1 - progress / 100)}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                      />
                    </svg>
                    <span className="absolute text-[8px] font-mono font-black text-slate-700 dark:text-slate-300">{progress}%</span>
                  </div>
                  
                  {/* Container name view */}
                  <div className="truncate flex flex-col min-w-0">
                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-amber-600 dark:text-amber-400 leading-none">Фокусировка</span>
                    <input
                      type="text"
                      value={focusedContainer.text}
                      onChange={(e) => {
                        onUpdateNode({
                          ...focusedContainer,
                          text: e.target.value
                        });
                      }}
                      className="text-xs font-sans font-black text-slate-800 dark:text-slate-100 bg-transparent border-none focus:outline-none focus:ring-0 p-0 leading-tight min-w-0 max-w-[110px]"
                      placeholder="Имя"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-450 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                    {completedChildren}/{totalChildren}
                  </span>

                  {/* Menu switch trigger button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFocusStatsMobileExpanded(!isFocusStatsMobileExpanded);
                    }}
                    className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                      isFocusStatsMobileExpanded 
                        ? 'border-indigo-400 bg-indigo-50/40 text-indigo-600 dark:bg-indigo-950/30' 
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-305'
                    }`}
                  >
                    <Menu className="w-3.5 h-3.5" />
                  </button>

                  {/* Quick Exit back button */}
                  <button
                    onClick={() => {
                      autoFitContainer(focusedContainerId);
                      const targetZoom = 0.85;
                      setZoom(targetZoom);
                      setPanX(-focusedContainer.x * targetZoom);
                      setPanY(-focusedContainer.y * targetZoom);
                      onSelectNode(focusedContainer.id);
                      setFocusedContainerId(null);
                    }}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-rose-505 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Вернуться назад"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Smoothly expanding accordion of views & actions */}
              {isFocusStatsMobileExpanded && (() => {
                const currentViewModeId = containerViewModes[focusedContainer.id] || 'canvas';
                const viewOptions = [
                  { id: 'canvas', label: 'Холст', icon: Network },
                  { id: 'kanban', label: 'Канбан', icon: Kanban },
                  { id: 'list', label: 'Мобильный', icon: Smartphone },
                  { id: 'calendar', label: 'Календарь', icon: Calendar },
                  { id: 'gantt', label: 'Гант', icon: GanttChart },
                  { id: 'table', label: 'Таблица', icon: Table }
                ];
                const currentViewOption = viewOptions.find(o => o.id === currentViewModeId) || viewOptions[0];
                const CurrentIcon = currentViewOption.icon;

                return (
                  <div className="px-3 pb-2.5 pt-1.5 flex flex-col gap-2 bg-white dark:bg-slate-900 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center gap-2 w-full">
                      {/* Collapsible View Selector Header */}
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMobileViewsListExpanded(!isMobileViewsListExpanded);
                        }}
                        className="flex-1 flex items-center justify-between h-[38px] bg-slate-50 dark:bg-slate-850 border border-slate-200/60 dark:border-slate-755 px-3 rounded-xl shadow-xs cursor-pointer select-none min-w-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CurrentIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-extrabold text-slate-755 dark:text-slate-200 truncate leading-none">{currentViewOption.label}</span>
                        </div>
                        {isMobileViewsListExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                      </button>

                      <button
                        onClick={() => {
                          const x = Math.round(-panX / zoom);
                          const y = Math.round(-panY / zoom);
                          onAddFloatingNode(x, y, focusedContainerId, 'Workflow Шаг', { isWorkflowRectangle: true });
                          setIsFocusStatsMobileExpanded(false);
                        }}
                        className="flex items-center justify-center gap-1 px-2.5 h-[38px] rounded-xl text-[10px] uppercase tracking-wider font-extrabold bg-indigo-500 hover:bg-indigo-600 text-white shadow-xs cursor-pointer shrink-0"
                        title="Добавить шаг workflow"
                      >
                        <Network className="w-3.5 h-3.5 text-white" />
                        <span>+ Шаг</span>
                      </button>

                      <button
                        onClick={() => {
                          const x = Math.round(-panX / zoom);
                          const y = Math.round(-panY / zoom);
                          onAddFloatingNode(x, y, focusedContainerId);
                          setIsFocusStatsMobileExpanded(false);
                        }}
                        className="flex items-center justify-center gap-1 px-2.5 h-[38px] rounded-xl text-[10px] uppercase tracking-wider font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs cursor-pointer shrink-0"
                        title="Добавить задачу"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-white" />
                        <span>+ Задача</span>
                      </button>
                    </div>

                    {/* Expanding list of available views */}
                    {isMobileViewsListExpanded && (
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 select-none animate-in slide-in-from-top-1 duration-150 border-t border-slate-150/50 dark:border-slate-800/80 pt-2">
                        {viewOptions.map(v => {
                          const active = currentViewModeId === v.id;
                          const IconComponent = v.icon;
                          return (
                            <button
                              key={v.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setContainerViewMode(focusedContainer.id, v.id as any);
                                setIsMobileViewsListExpanded(false);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              data-drag-ignore
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold tracking-tight transition-all duration-150 cursor-pointer whitespace-nowrap border ${
                                active 
                                  ? 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent shadow-xs' 
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border-slate-150 dark:border-slate-700/80'
                              }`}
                            >
                              <IconComponent className={`w-3 h-3 ${active ? 'text-white' : 'text-slate-450 dark:text-slate-400'}`} />
                              <span>{v.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

          </div>
        );
      })()}

      {/* Immersive Fullscreen View Content for Focused Container */}
      {focusedContainerId && (() => {
        const focusedContainer = nodes.find(n => n.id === focusedContainerId);
        if (!focusedContainer) return null;
        const viewMode = containerViewModes[focusedContainer.id] || 'canvas';
        if (viewMode === 'canvas') return null;

        const containerChildren = nodes.filter(n => n.parentId === focusedContainerId);
        
        return (
          <div className="absolute inset-0 bg-slate-550/10 dark:bg-slate-950/40 backdrop-blur-xs z-30 flex items-center justify-center p-2 pt-32 pb-4 sm:p-4 sm:pt-24 md:p-6 md:pt-24 lg:pt-24">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-amber-200 dark:border-amber-900/50 rounded-3xl shadow-2xl w-full max-w-[98vw] md:max-w-[96vw] h-full flex flex-col p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-30 animate-duration-200">
              <div className="flex-1 flex flex-col min-h-0 select-text overflow-hidden z-30">
                {renderContainerBody(focusedContainer, containerChildren, true)}
              </div>
            </div>
          </div>
        );
      })()}
      {/* Floating Canvas UI Controls */}
      <div className={`absolute ${focusedContainerId ? 'top-20 sm:top-4' : 'top-4'} left-4 z-10 flex gap-2`}>
        <button
          onClick={onOpenSidebar}
          title="Открыть боковую панель"
          className="lg:hidden p-2.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden lg:flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
          <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
            Перемещение: ЛКМ / Жест. Масштаб:
          </span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-1 bg-indigo-50 dark:bg-indigo-950/40 rounded">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {!focusedContainerId && (
        <div className="absolute bottom-4 left-2 right-2 sm:right-auto sm:left-4 z-10 flex flex-wrap items-center justify-center sm:justify-start gap-1 sm:gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 sm:p-2 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md max-w-[calc(100vw-16px)] sm:max-w-none">
          <button
            onClick={handleZoomIn}
            title="Приблизить"
            className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Отдалить"
            className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
          <button
            onClick={handleRecenter}
            title="По центру"
            className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer shrink-0"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Сбросить</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
          <button
            onClick={() => {
              let cx = 0;
              let cy = 0;
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                cx = rect.width / 2;
                cy = rect.height / 2;
              }
              const x = Math.round(-panX / zoom);
              const y = Math.round(-panY / zoom);
              onAddFloatingNode(x, y, null);
            }}
            title="Создать независимую плавующую задачу по центру холста (или дважды кликните на пустом месте)"
            className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-350 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40 shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Плавающая задача</span>
            <span className="sm:hidden">Плавающая</span>
          </button>

          <button
            onClick={() => {
              const x = Math.round(-panX / zoom);
              const y = Math.round(-panY / zoom);
              onAddFloatingNode(x, y, null, 'Workflow Шаг', { isWorkflowRectangle: true });
            }}
            title="Создать прямоугольник workflow по центру холста"
            className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-350 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border-transparent hover:border-indigo-200 dark:hover:border-indigo-900/40 shrink-0"
          >
            <Network className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Прямоугольник Workflow</span>
            <span className="sm:hidden">Workflow</span>
          </button>

          <button
            onClick={startCanvasDictation}
            title="Записать новую задачу на холст голосом"
            className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-indigo-600 dark:text-indigo-400 hover:text-indigo-705 dark:hover:text-indigo-350 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border-transparent hover:border-indigo-200 dark:hover:border-indigo-900/40 shrink-0"
          >
            <Mic className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Продиктовать задачу</span>
            <span className="sm:hidden">Голос</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />
          <button
            onClick={() => {
              const x = Math.round(-panX / zoom);
              const y = Math.round(-panY / zoom);
              onAddContainerNode(x, y);
            }}
            title="Создать контейнер. В него можно вкладывать другие задачи для совместного перемещения и свертывания"
            className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-350 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-transparent hover:border-amber-200 dark:hover:border-amber-900/40 shrink-0"
          >
            <span>📦</span>
            <span className="hidden sm:inline">Создать контейнер</span>
            <span className="sm:hidden">Контейнер</span>
          </button>
        </div>
      )}

      {/* Origin coordinates center dot (0, 0) */}
      <div 
        className="absolute left-1/2 top-1/2 transform pointer-events-none select-none"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        <div className="w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-slate-300 dark:bg-slate-800 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-white dark:bg-slate-950" />
        </div>
      </div>

      {/* Infinite Canvas transform container */}
      <div 
        className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible origin-center"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        {/* SVG connection lines render */}
        <svg className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1">
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Render Flowchart Workflow connections */}
          {visibleNodes.map(node => {
            if (!node.workflowConnections) return null;
            return node.workflowConnections.map(conn => {
              const target = nodes.find(t => t.id === conn.toNodeId);
              if (!target) return null; // Target node deleted or missing
              
              // Calculate start coordinate on origin node
              const w1 = node.width || (node.isWorkflowRectangle ? 170 : 210);
              const h1 = node.height || (node.isWorkflowRectangle ? 70 : 110);
              let x1 = node.x;
              let y1 = node.y;
              if (conn.fromSide === 'top') y1 -= h1 / 2;
              else if (conn.fromSide === 'right') x1 += w1 / 2;
              else if (conn.fromSide === 'bottom') y1 += h1 / 2;
              else if (conn.fromSide === 'left') x1 -= w1 / 2;

              // Calculate end coordinate on target node
              const w2 = target.width || (target.isWorkflowRectangle ? 170 : 210);
              const h2 = target.height || (target.isWorkflowRectangle ? 70 : 110);
              let x2 = target.x;
              let y2 = target.y;
              if (conn.toSide === 'top') y2 -= h2 / 2;
              else if (conn.toSide === 'right') x2 += w2 / 2;
              else if (conn.toSide === 'bottom') y2 += h2 / 2;
              else if (conn.toSide === 'left') x2 -= w2 / 2;

              const pathColor = node.color || '#6366f1'; // Indigo flowchart color
              const isSelected = selectedNodeId === node.id || selectedNodeId === target.id;
              
              // Compute dynamic bend midpoint
              const defaultMid = getOrthogonalMidpoint(x1, y1, conn.fromSide, x2, y2, conn.toSide);
              const mid = {
                x: defaultMid.x + (conn.bendOffsetX !== undefined ? conn.bendOffsetX : 0),
                y: defaultMid.y + (conn.bendOffsetY !== undefined ? conn.bendOffsetY : 0),
              };

              const pathD = getCustomWorkflowPath(x1, y1, conn.fromSide, mid.x, mid.y, x2, y2, conn.toSide);

              return (
                <g key={`flow-${node.id}-${conn.id}`} className="group/line" style={{ color: pathColor }}>
                  {/* Thick glow under selected path */}
                  {isSelected && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={pathColor}
                      strokeWidth={8}
                      className="opacity-25 blur-[1px]"
                    />
                  )}

                  {/* Visual path line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={pathColor}
                    strokeWidth={isSelected ? 3.5 : 2.5}
                    markerEnd="url(#flow-arrow)"
                    className="transition-all duration-150"
                  />

                  {/* Pull-to-bend drag handle */}
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={6}
                    fill={pathColor}
                    stroke="white"
                    strokeWidth={1.5}
                    className="cursor-move shadow pointer-events-auto hover:scale-130 transition-transform hover:fill-indigo-500 hover:stroke-white z-50"
                    style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.3))' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setLocalNodes(incomingNodes); // Pre-sync state to prevent jump
                      setDraggingConn({
                        nodeId: node.id,
                        connId: conn.id,
                        startOffsetX: conn.bendOffsetX || 0,
                        startOffsetY: conn.bendOffsetY || 0
                      });
                      setDragStart({ x: e.clientX, y: e.clientY });
                    }}
                    onTouchStart={(e) => {
                      if (e.touches.length !== 1) return;
                      const touch = e.touches[0];
                      e.stopPropagation();
                      e.preventDefault();
                      setLocalNodes(incomingNodes); // Pre-sync state to prevent jump
                      setDraggingConn({
                        nodeId: node.id,
                        connId: conn.id,
                        startOffsetX: conn.bendOffsetX || 0,
                        startOffsetY: conn.bendOffsetY || 0
                      });
                      setDragStart({ x: touch.clientX, y: touch.clientY });
                    }}
                    title="Перетащите, чтобы изменить изгиб линии"
                  />

                  {/* Midpoint overlay controls (Label input & Delete button) */}
                  <foreignObject
                    x={mid.x - 55}
                    y={mid.y - 34}
                    width={110}
                    height={28}
                    className="pointer-events-auto overflow-visible"
                  >
                    <div className="flex items-center justify-center gap-1.5 h-full select-none">
                      {/* Label Input with Double click or single hover */}
                      <input
                        type="text"
                        value={conn.text || ''}
                        placeholder="..."
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedConns = node.workflowConnections?.map(c => 
                            c.id === conn.id ? { ...c, text: val } : c
                          ) || [];
                          onUpdateNode({
                            ...node,
                            workflowConnections: updatedConns
                          });
                        }}
                        className="text-[9px] font-black tracking-wide text-center bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 w-16 px-1 py-0.5 rounded shadow-xs text-slate-800 dark:text-slate-100 hover:border-indigo-400 focus:outline-none focus:border-indigo-500 font-sans leading-tight truncate"
                        title="Кликните, чтобы подписать связь..."
                      />
                      
                      {/* Delete connection button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updatedConns = node.workflowConnections?.filter(c => c.id !== conn.id) || [];
                          onUpdateNode({
                            ...node,
                            workflowConnections: updatedConns
                          });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-4 h-4 flex items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-xs hover:scale-110 transition-transform cursor-pointer shrink-0"
                        title="Удалить соединение"
                      >
                        <X className="w-2.5 h-2.5 stroke-[3]" />
                      </button>
                    </div>
                  </foreignObject>
                </g>
              );
            });
          })}

          {/* Flowchart Connector Connection Preview Path */}
          {activeConnector && mousePos && (
            <path
              d={getFlowchartPath(
                activeConnector.startX,
                activeConnector.startY,
                activeConnector.side,
                mousePos.x,
                mousePos.y,
                hoveredSide || getOppositeSide(activeConnector.side)
              )}
              fill="none"
              stroke="#6366f1"
              strokeWidth={3}
              strokeDasharray="5,5"
              markerEnd="url(#flow-arrow)"
              className="opacity-95"
            />
          )}

          {connections.map(({ child, parent }) => {
            const pathColor = child.color || parent.color || '#818cf8';
            const isSelected = selectedNodeId === child.id || selectedNodeId === parent.id;
            const isConnectionDimmed = isAnyFilterActive && (!isNodeMatched(child) || !isNodeMatched(parent));
            return (
              <g 
                key={`conn-${child.id}`}
                style={{ opacity: isConnectionDimmed ? 0.15 : 1 }}
                className="transition-opacity duration-300"
              >
                {/* Thick glow under the connection when selected */}
                {isSelected && (
                  <path
                    d={getBezierPath(parent.x, parent.y, child.x, child.y)}
                    fill="none"
                    stroke={pathColor}
                    strokeWidth={6}
                    strokeLinecap="round"
                    className="opacity-20 blur-[1px] transition-all duration-200"
                  />
                )}
                
                {/* Regular connection path */}
                <path
                  d={getBezierPath(parent.x, parent.y, child.x, child.y)}
                  fill="none"
                  stroke={pathColor}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeLinecap="round"
                  className="transition-all duration-200"
                />
                
                {/* Fancy connector indicator arrow / circle */}
                <circle
                  cx={child.x}
                  cy={child.y}
                  r={4}
                  fill={pathColor}
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>

        {/* Task Nodes Render */}
        {visibleNodes.map((node) => {
          const isSelected = selectedNodeId === node.id;

          if (node.isContainer) {
            const isSelfFocused = focusedContainerId === node.id;
            if (isSelfFocused) return null; // Hide the container visual boundaries entirely to let it replace the canvas!

            const containerChildren = nodes.filter(n => n.parentId === node.id);
            const totalChildren = containerChildren.length;
            const completedChildren = containerChildren.filter(n => n.completed).length;
            const containerProgress = calculateProgress(node.id, nodes) || 0;
            const isContainerSelected = isSelected;
            const isContainerCollapsed = !!node.collapsed;
            const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;
            const isOverdueCont = isContainerOverdue(node, nodes);

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isContainerSelected ? 50 : (lastActiveContainerId === node.id ? 30 : 10), 
                  width: isContainerCollapsed ? '220px' : `${node.width || 520}px`,
                  height: isContainerCollapsed ? '100px' : `${node.height || 400}px`,
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/task-tag')) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDragEnter={(e) => {
                  if (e.dataTransfer.types.includes('application/task-tag')) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggedOverTagNodeId(node.id);
                  }
                }}
                onDragLeave={() => {
                  if (draggedOverTagNodeId === node.id) {
                    setDraggedOverTagNodeId(null);
                  }
                }}
                onDrop={(e) => {
                  const tag = e.dataTransfer.getData('application/task-tag');
                  if (tag) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggedOverTagNodeId(null);
                    const existingTags = node.tags || [];
                    if (!existingTags.includes(tag)) {
                      onUpdateNode({
                        ...node,
                        tags: [...existingTags, tag]
                      });
                    }
                  }
                }}
                className={`absolute rounded-2xl border-2 ${(isDraggingThisNode || resizingNodeId === node.id) ? '' : 'transition-[background-color,border-color,opacity,box-shadow,transform] duration-150'} ${
                  isDimmed ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 duration-300' : ''
                } ${
                  draggedOverTagNodeId === node.id
                    ? 'bg-emerald-50/10 dark:bg-emerald-950/10 border-emerald-500 ring-4 ring-emerald-500/30 scale-[1.015]'
                    : hoverTargetId === node.id
                      ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 ring-4 ring-amber-500/30 scale-[1.015]'
                      : isOverdueCont
                        ? 'bg-white dark:bg-slate-900 border-rose-500 dark:border-rose-600/80 shadow-[0_0_15px_rgba(239,68,68,0.25)] ring-4 ring-rose-500/20'
                        : isContainerSelected
                          ? 'bg-white dark:bg-slate-900 border-amber-500 shadow-lg ring-4 ring-amber-500/20'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 shadow-sm hover:border-slate-400 dark:hover:border-slate-700'
                } flex flex-col`}
                onMouseDown={(e) => startDragNode(e, node)}
                onClick={(e) => {
                  if (hasDraggedNode || didDragRef.current) return;
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                {/* Floating Figma-like Container Title: Always visible, zoom-independent scale */}
                <div
                  className="absolute select-none pointer-events-auto"
                  style={{
                    top: '-4px',
                    left: '4px',
                    transform: `translateY(-100%) scale(${1 / zoom})`,
                    transformOrigin: 'bottom left',
                    zIndex: 40,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(node.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                  }}
                  onMouseDown={(e) => {
                    startDragNode(e, node);
                  }}
                >
                  <div className={`flex items-center gap-1.5 px-3 py-1 font-sans font-extrabold text-[11px] uppercase tracking-wider whitespace-nowrap rounded-[5px] border cursor-grab active:cursor-grabbing select-none shadow-sm transition-all duration-150 ${
                    isOverdueCont
                      ? 'bg-rose-500 text-white border-rose-600 shadow-md animate-pulse'
                      : isContainerSelected
                        ? 'bg-amber-500 text-white border-amber-600 shadow-md'
                        : 'bg-slate-100 dark:bg-slate-805 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-750'
                  }`}>
                    {editingNodeId === node.id ? (
                      <input
                        type="text"
                        value={node.text}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          setEditingNodeId(null);
                          if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' || e.key === 'Esc') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                            if (!node.text.trim() || node.id === lastCreatedNodeId) {
                              onDeleteNode(node.id);
                            } else {
                              e.currentTarget.blur();
                            }
                            return;
                          }
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                          }
                        }}
                        onChange={(e) => {
                          onUpdateNode({
                            ...node,
                            text: e.target.value
                          });
                        }}
                        className={`text-[11px] font-sans font-extrabold uppercase tracking-wider bg-transparent focus:outline-none focus:ring-0 border-b p-0 max-w-[150px] ${
                          isContainerSelected ? 'text-white border-white' : 'text-slate-700 dark:text-slate-200 border-slate-400'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span>{node.text || 'КОНТЕЙНЕР'}</span>
                    )}
                    {node.collapsed && (
                      <span className={`text-[9px] font-mono rounded px-1 ${isContainerSelected ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                        {totalChildren}
                      </span>
                    )}
                  </div>
                </div>

                {/* Header of Container Canvas */}
                <div className={`p-3 flex items-center justify-between border-b ${isContainerSelected ? 'border-amber-200 dark:border-amber-900/50' : 'border-slate-200/80 dark:border-slate-800'} rounded-t-2xl bg-white dark:bg-slate-950 select-none pb-2.5`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="relative w-8 h-8 flex items-center justify-center shrink-0 mr-1.5">
                      <svg className="w-full h-full transform -rotate-90 select-none" viewBox="0 0 32 32">
                        <circle
                          cx="16"
                          cy="16"
                          r="13"
                          className="text-slate-100 dark:text-slate-800"
                          strokeWidth="2.5"
                          stroke="currentColor"
                          fill="transparent"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="13"
                          className={`${isOverdueCont ? 'text-rose-500' : 'text-amber-500 dark:text-amber-400'} transition-all duration-300`}
                          strokeWidth="2.5"
                          strokeDasharray={2 * Math.PI * 13}
                          strokeDashoffset={2 * Math.PI * 13 * (1 - containerProgress / 100)}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                        />
                      </svg>
                      <span className="absolute text-[8px] font-black text-slate-700 dark:text-slate-300 font-mono">
                        {containerProgress}%
                      </span>
                    </div>
                    {/* Compact layout placeholder instead of duplicated text */}
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 truncate font-sans tracking-wide">
                      Контейнер
                    </span>
                  </div>
                  
                  {/* Container Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Add child task/branch inside container */}
                    {!node.collapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddChildNode(node.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        title="Добавить задачу внутрь контейнера"
                        className="p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-350 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Add workflow rectangle inside container */}
                    {!node.collapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddFloatingNode(node.x, node.y, node.id, 'Workflow Шаг', { isWorkflowRectangle: true });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        title="Добавить прямоугольник workflow в контейнер"
                        className="p-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-350 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Network className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Focus Mode toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (focusedContainerId === node.id) {
                          setFocusedContainerId(null);
                        } else {
                          setFocusedContainerId(node.id);
                          // pan and zoom to center it nicely
                          const centerZoom = 0.85;
                          setZoom(centerZoom);
                          setPanX(-node.x * centerZoom);
                          setPanY(-node.y * centerZoom);
                          onSelectNode(node.id);
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      title={focusedContainerId === node.id ? "Выйти из режима фокусировки" : "Раскрыть на весь экран (режим фокусировки)"}
                      className={`p-1 rounded-md transition-all cursor-pointer ${
                        focusedContainerId === node.id
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/60 ring-2 ring-amber-500/20'
                          : 'text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {focusedContainerId === node.id ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                    {/* Expand/Collapse Container */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleNodeCollapse(node.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      title={node.collapsed ? "Развернуть контейнер" : "Свернуть контейнер"}
                      className="p-1 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${node.collapsed ? '-rotate-90' : 'rotate-0'}`} />
                    </button>
                    {/* Delete Container */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(node.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      title="Удалить контейнер"
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Secondary toolbar for View Selection within Container */}
                {!isContainerCollapsed && (
                  <div className="px-3 py-2 flex items-center justify-center bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800/60 select-none z-10 shrink-0">
                    <div className="flex items-center gap-0.5 bg-[#f1f5f9] dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/50 dark:border-slate-850 overflow-x-auto scrollbar-none max-w-full shadow-inner">
                      {[
                        { id: 'canvas', label: 'Холст', icon: Network },
                        { id: 'kanban', label: 'Канбан', icon: Kanban },
                        { id: 'list', label: 'Мобильный', icon: Smartphone },
                        { id: 'calendar', label: 'Календарь', icon: Calendar },
                        { id: 'gantt', label: 'Гант', icon: GanttChart },
                        { id: 'table', label: 'Таблица', icon: Table }
                      ].map(v => {
                        const active = (containerViewModes[node.id] || 'canvas') === v.id;
                        const IconComponent = v.icon;
                        return (
                          <button
                            key={v.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setContainerViewMode(node.id, v.id as any);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            data-drag-ignore
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all duration-200 cursor-pointer whitespace-nowrap ${
                              active 
                                ? 'bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 border border-slate-100/80 dark:border-slate-750 shadow-[0_1.5px_4px_rgba(0,0,0,0.04)]' 
                                : 'text-slate-650 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 border border-transparent'
                            }`}
                          >
                            <IconComponent className={`w-3 h-3 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-550 dark:text-slate-400'}`} />
                            <span>{v.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Body / Workspace Area */}
                <div className="relative flex-1 p-3 flex flex-col justify-between min-h-0 bg-transparent rounded-b-2xl">
                  {isContainerCollapsed ? (
                    <div className="flex-1 flex flex-col items-center justify-center select-none">
                      <span className="text-[10px] bg-amber-100/85 dark:bg-amber-950 text-amber-800 dark:text-amber-400 px-2.5 py-1 rounded-full font-bold">
                        📦 Свернуто: {totalChildren} задач ({containerProgress}%) • ⏱️ {formatTotalPomoTime(getPomoStatsForNode(node, nodes).pomodoroTotalTime)}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Inner interactive view */}
                      <div className="flex-1 flex flex-col min-h-0 z-10 select-text overflow-hidden mb-2">
                        {renderContainerBody(node, containerChildren)}
                      </div>

                      {/* Small dynamic status overview bar at the bottom */}
                      <div className="mt-auto pt-2 border-t border-slate-100/40 dark:border-slate-800/40 flex items-center justify-between select-none bg-white dark:bg-slate-950 px-2 py-1.5 rounded-lg z-10 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotesModalNodeId(node.id);
                            }}
                            className="text-[9px] text-slate-500 dark:text-slate-400 hover:text-amber-600 shadow-sm flex items-center gap-1 py-0.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-all font-semibold cursor-pointer border border-slate-205 dark:border-slate-755 bg-white/50 dark:bg-slate-900/50"
                          >
                            <FileText className="w-3 h-3 text-amber-500" /> Описание
                          </button>

                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-sans">
                            {totalChildren} задач ({completedChildren} вып.) • ⏱️ {formatTotalPomoTime(getPomoStatsForNode(node, nodes).pomodoroTotalTime)}
                          </span>
                        </div>
                        
                        <div className="w-24 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${containerProgress}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Resize Handles for container from all sides */}
                {!isContainerCollapsed && (
                  <>
                    {/* Top border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'n')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'n')}
                      className="absolute -top-1 left-2 right-2 h-2 cursor-ns-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить высоту (вверх)"
                    />
                    {/* Bottom border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 's')}
                      onTouchStart={(e) => startResizeTouch(e, node, 's')}
                      className="absolute -bottom-1 left-2 right-2 h-2 cursor-ns-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить высоту (вниз)"
                    />
                    {/* Left border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'w')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'w')}
                      className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить ширину (влево)"
                    />
                    {/* Right border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'e')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'e')}
                      className="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize z-30 select-none hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-colors duration-150"
                      title="Изменить ширину (вправо)"
                    />

                    {/* Top-Left corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'nw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'nw')}
                      className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (сверху-слева)"
                    />
                    {/* Top-Right corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'ne')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'ne')}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (сверху-справа)"
                    />
                    {/* Bottom-Left corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'sw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'sw')}
                      className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150"
                      title="Изменить размер (снизу-слева)"
                    />
                    {/* Bottom-Right corner resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'se')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'se')}
                      className="absolute -bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize z-40 select-none hover:bg-amber-500/40 active:bg-amber-500/60 rounded-full border border-amber-500/20 transition-colors duration-150 flex items-center justify-center p-0.5"
                      title="Изменить размер (снизу-справа)"
                    >
                      <svg width="6" height="6" viewBox="0 0 6 6" className="text-amber-600 dark:text-amber-450 opacity-60">
                        <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </div>
                  </>
                )}

                {/* Hover reparent highlight notification */}
                {hoverTargetId === node.id && (
                  <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-amber-600 text-white px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50">
                    Поместить на холст-контейнер
                  </div>
                )}

                {/* Container selection quick actions */}
                {isContainerSelected && draggingNodeId === null && potentialDragNodeIdRef.current === null && (
                  <div 
                    data-drag-ignore
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -bottom-11 left-1/2 flex items-center gap-1.5 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-50 pointer-events-auto whitespace-nowrap animate-fade-in"
                    style={{
                      transform: `translateX(-50%) scale(${1 / zoom})`,
                      transformOrigin: 'top center'
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddFloatingNode(node.x, node.y, node.id, 'Новая задача');
                      }}
                      title="Добавить задачу внутрь"
                      className="flex items-center justify-center w-8 h-8 text-amber-600 dark:text-amber-450 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode({
                          ...node,
                          collapsed: !node.collapsed
                        });
                      }}
                      title={node.collapsed ? "Развернуть контейнер" : "Свернуть контейнер"}
                      className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      {node.collapsed ? (
                        <FolderPlus className="w-4 h-4 text-amber-505" />
                      ) : (
                        <FolderMinus className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedContainerId(node.id);
                      }}
                      title="Войти внутрь (Фокусировка)"
                      className="flex items-center justify-center w-8 h-8 text-indigo-650 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotesModalNodeId(node.id);
                      }}
                      title="Настройки / Описание контейнера"
                      className="flex items-center justify-center w-8 h-8 text-emerald-600 dark:text-emerald-450 hover:bg-emerald-55 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDrawer();
                      }}
                      title="Свойства в Дровере"
                      className="flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(node.id);
                      }}
                      title="Удалить контейнер"
                      className="flex items-center justify-center w-8 h-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (node.isWorkflowRectangle) {
            const ancestorContainer = getAncestorContainer(node.parentId);
            let containerZ = 10;
            if (ancestorContainer) {
              const isAncestorSelected = selectedNodeId === ancestorContainer.id;
              const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
              containerZ = isAncestorSelected ? 50 : (isAncestorLastActive ? 30 : 10);
            }
            const cardZIndex = ancestorContainer
              ? containerZ + (isSelected ? 12 : 8)
              : (isSelected ? 70 : 8);

            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;

            const w = node.width || 170;
            const h = node.height || 70;

            const isOpponentHovered = hoveredNodeId === node.id;

            return (
              <React.Fragment key={node.id}>
                {/* Sibling dashed trigger zone for workflow rectangle */}
                {(() => {
                  const zoneW = node.zoneWidth !== undefined ? node.zoneWidth : (w + 100);
                  const zoneH = node.zoneHeight !== undefined ? node.zoneHeight : (h + 80);
                  const zoneOX = node.zoneOffsetX || 0;
                  const zoneOY = node.zoneOffsetY || 0;

                  const zoneLeft = node.x + zoneOX - zoneW / 2;
                  const zoneRight = node.x + zoneOX + zoneW / 2;
                  const zoneTop = node.y + zoneOY - zoneH / 2;
                  const zoneBottom = node.y + zoneOY + zoneH / 2;

                  // Check if any dragging node is currently overlapping this zone
                  let isAnyDraggingNodeOverlapping = false;
                  if (draggingNodeId) {
                    const draggingNode = nodes.find(n => n.id === draggingNodeId);
                    if (draggingNode && !draggingNode.isWorkflowRectangle && !draggingNode.isContainer) {
                      const cardW = draggingNode.width || 210;
                      const cardH = draggingNode.height || 110;
                      const dragLeft = draggingNode.x - cardW / 2;
                      const dragRight = draggingNode.x + cardW / 2;
                      const dragTop = draggingNode.y - cardH / 2;
                      const dragBottom = draggingNode.y + cardH / 2;

                      isAnyDraggingNodeOverlapping = (
                        dragLeft <= zoneRight &&
                        dragRight >= zoneLeft &&
                        dragTop <= zoneBottom &&
                        dragBottom >= zoneTop
                      );
                    }
                  }

                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: node.x + zoneOX,
                        top: node.y + zoneOY,
                        transform: 'translate(-50%, -50%)',
                        zIndex: cardZIndex - 1,
                        width: `${zoneW}px`,
                        height: `${zoneH}px`
                      }}
                      className={`rounded-2xl border-2 border-dashed transition-all pointer-events-none ${
                        isAnyDraggingNodeOverlapping
                          ? 'border-emerald-500 bg-emerald-50/10 dark:bg-emerald-950/15 scale-[1.01] shadow-lg ring-4 ring-emerald-500/25'
                          : isSelected
                            ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10 shadow-md'
                            : 'border-slate-350 dark:border-slate-700 bg-slate-50/5 dark:bg-slate-900/5'
                      }`}
                    >
                      {/* Title label at the top center of the zone */}
                      <div className={`absolute -top-5 left-1/2 transform -translate-x-1/2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-xs pointer-events-none border select-none transition-all duration-150 whitespace-nowrap ${
                        isAnyDraggingNodeOverlapping
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        {isAnyDraggingNodeOverlapping ? `🔗 Авто-тег: ${node.text || 'Шаг_Workflow'}` : 'Зона Триггера'}
                      </div>

                      {/* Resize Handles of trigger zone - visible only when active workflow step is selected */}
                      {isSelected && (
                        <>
                          {/* Top border resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'n', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'n', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -top-1 left-2 right-2 h-2 cursor-ns-resize pointer-events-auto z-40 hover:bg-indigo-500/30 rounded transition-colors"
                            title="Изменить высоту зоны (вверх)"
                          />
                          {/* Bottom border resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 's', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 's', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -bottom-1 left-2 right-2 h-2 cursor-ns-resize pointer-events-auto z-40 hover:bg-indigo-500/30 rounded transition-colors"
                            title="Изменить высоту зоны (вниз)"
                          />
                          {/* Left border resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'w', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'w', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize pointer-events-auto z-40 hover:bg-indigo-500/30 rounded transition-colors"
                            title="Изменить ширину зоны (влево)"
                          />
                          {/* Right border resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'e', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'e', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize pointer-events-auto z-40 hover:bg-indigo-500/30 rounded transition-colors"
                            title="Изменить ширину зоны (вправо)"
                          />

                          {/* Top-Left corner resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'nw', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'nw', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 cursor-nwse-resize pointer-events-auto z-50 rounded-full bg-white dark:bg-slate-900 border border-indigo-505 shadow-sm transition-all hover:scale-125"
                          />
                          {/* Top-Right corner resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'ne', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'ne', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 cursor-nesw-resize pointer-events-auto z-50 rounded-full bg-white dark:bg-slate-900 border border-indigo-505 shadow-sm transition-all hover:scale-125"
                          />
                          {/* Bottom-Left corner resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'sw', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'sw', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 cursor-nesw-resize pointer-events-auto z-50 rounded-full bg-white dark:bg-slate-900 border border-indigo-505 shadow-sm transition-all hover:scale-125"
                          />
                          {/* Bottom-Right corner resizer */}
                          <div
                            onMouseDown={(e) => startZoneResize(e, node, 'se', zoneW, zoneH, zoneOX, zoneOY)}
                            onTouchStart={(e) => startZoneResizeTouch(e, node, 'se', zoneW, zoneH, zoneOX, zoneOY)}
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 cursor-nwse-resize pointer-events-auto z-50 rounded-full bg-white dark:bg-slate-900 border border-indigo-505 shadow-sm transition-all hover:scale-125"
                          />
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Main solid inner workflow node */}
                <div
                  data-node-id={node.id}
                  style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: cardZIndex,
                    width: `${w}px`,
                    height: `${h}px`
                  }}
                  onMouseEnter={() => {
                    if (activeConnector && activeConnector.nodeId !== node.id) {
                      setHoveredNodeId(node.id);
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoveredNodeId === node.id) {
                      setHoveredNodeId(null);
                      setHoveredSide(null);
                    }
                  }}
                  onMouseMove={(e) => {
                    if (activeConnector && activeConnector.nodeId !== node.id) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const centerX = rect.left + rect.width / 2;
                      const centerY = rect.top + rect.height / 2;
                      const localMouseX = e.clientX - centerX;
                      const localMouseY = e.clientY - centerY;
                      let side: 'top' | 'right' | 'bottom' | 'left' = 'left';
                      if (Math.abs(localMouseX / rect.width) > Math.abs(localMouseY / rect.height)) {
                        side = localMouseX > 0 ? 'right' : 'left';
                      } else {
                        side = localMouseY > 0 ? 'bottom' : 'top';
                      }
                      setHoveredSide(side);
                    }
                  }}
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'INPUT' || target.closest('button')) return;
                    startDragNode(e, node);
                  }}
                  onClick={(e) => {
                    if (hasDraggedNode || didDragRef.current) return;
                    e.stopPropagation();
                    onSelectNode(node.id, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                  }}
                  className={`absolute group cursor-grab active:cursor-grabbing rounded-xl border-2 shadow-md transition-[background-color,border-color,box-shadow,transform] duration-150 ${
                    isDimmed ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 duration-300' : ''
                  } ${
                    isOpponentHovered
                      ? 'bg-indigo-50/15 dark:bg-indigo-950/20 border-indigo-500 ring-4 ring-indigo-500/25 scale-[1.025] shadow-lg'
                      : isSelected
                        ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-400 ring-4 ring-indigo-120 dark:ring-indigo-950/40 shadow-lg'
                        : node.completed
                          ? 'bg-emerald-50/10 dark:bg-emerald-950/10 border-emerald-500 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Title and Completed State inside workflow step */}
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center select-text">
                    {editingNodeId === node.id ? (
                      <input
                        type="text"
                        value={node.text}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          setEditingNodeId(null);
                          if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                          } else if (e.key === 'Escape') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                          }
                        }}
                        onChange={(e) => {
                          onUpdateNode({
                            ...node,
                            text: e.target.value
                          });
                        }}
                        className="w-full text-xs font-black bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 py-1 px-1.5 rounded border border-indigo-400 focus:outline-none text-center"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 min-w-0">
                        <span className={`text-[11px] font-sans font-bold tracking-wide leading-snug break-words max-w-[145px] ${node.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : 'text-slate-800 dark:text-slate-150'}`}>
                          {node.text || 'Шаг Workflow'}
                        </span>
                        {node.completed && (
                          <span className="text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/5 px-1.5 py-0.5 rounded">
                            ✔️ Готово
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Micro Actions Overlay */}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-30">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode({
                          ...node,
                          completed: !node.completed
                        });
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`p-0.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-450 hover:text-emerald-500 shadow-xs cursor-pointer ${node.completed ? 'text-emerald-500 border-emerald-500/35' : ''}`}
                      title="Выполнено/В работе"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(node.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="p-0.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-450 hover:text-rose-500 shadow-xs cursor-pointer"
                      title="Удалить шаг"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Anchor connection handles on active select/hover */}
                  {(isSelected || isOpponentHovered || hoveredNodeId === node.id || activeConnector) && (
                    <>
                      {/* Top Anchor Dot */}
                      <div
                        onMouseDown={(e) => startConnectorDrag(e, node.id, 'top')}
                        onTouchStart={(e) => startConnectorDrag(e, node.id, 'top')}
                        className={`absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-indigo-500 bg-white dark:bg-slate-900 cursor-crosshair z-40 flex items-center justify-center transition-all hover:scale-125 shadow-xs ${
                          isOpponentHovered && hoveredSide === 'top' ? 'bg-indigo-600 text-white scale-125 ring-2 ring-indigo-500/30' : ''
                        }`}
                        title="Тянуть связь вверх"
                      >
                        <div className={`w-1 h-1 rounded-full ${isOpponentHovered && hoveredSide === 'top' ? 'bg-white' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
                      </div>
                      {/* Right Anchor Dot */}
                      <div
                        onMouseDown={(e) => startConnectorDrag(e, node.id, 'right')}
                        onTouchStart={(e) => startConnectorDrag(e, node.id, 'right')}
                        className={`absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-indigo-500 bg-white dark:bg-slate-900 cursor-crosshair z-40 flex items-center justify-center transition-all hover:scale-125 shadow-xs ${
                          isOpponentHovered && hoveredSide === 'right' ? 'bg-indigo-600 text-white scale-125 ring-2 ring-indigo-500/30' : ''
                        }`}
                        title="Тянуть связь вправо"
                      >
                        <div className={`w-1 h-1 rounded-full ${isOpponentHovered && hoveredSide === 'right' ? 'bg-white' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
                      </div>
                      {/* Bottom Anchor Dot */}
                      <div
                        onMouseDown={(e) => startConnectorDrag(e, node.id, 'bottom')}
                        onTouchStart={(e) => startConnectorDrag(e, node.id, 'bottom')}
                        className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-3 h-3 rounded-full border border-indigo-500 bg-white dark:bg-slate-900 cursor-crosshair z-40 flex items-center justify-center transition-all hover:scale-125 shadow-xs ${
                          isOpponentHovered && hoveredSide === 'bottom' ? 'bg-indigo-600 text-white scale-125 ring-2 ring-indigo-500/30' : ''
                        }`}
                        title="Тянуть связь вниз"
                      >
                        <div className={`w-1 h-1 rounded-full ${isOpponentHovered && hoveredSide === 'bottom' ? 'bg-white' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
                      </div>
                      {/* Left Anchor Dot */}
                      <div
                        onMouseDown={(e) => startConnectorDrag(e, node.id, 'left')}
                        onTouchStart={(e) => startConnectorDrag(e, node.id, 'left')}
                        className={`absolute left-0 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-indigo-500 bg-white dark:bg-slate-900 cursor-crosshair z-40 flex items-center justify-center transition-all hover:scale-125 shadow-xs ${
                          isOpponentHovered && hoveredSide === 'left' ? 'bg-indigo-600 text-white scale-125 ring-2 ring-indigo-500/30' : ''
                        }`}
                        title="Тянуть связь влево"
                      >
                        <div className={`w-1 h-1 rounded-full ${isOpponentHovered && hoveredSide === 'left' ? 'bg-white' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
                      </div>
                    </>
                  )}
                </div>
              </React.Fragment>
            );
          }

          const pInfo = getPriorityInfo(node.priority);
          const hasNotes = node.notes && node.notes.trim().length > 0;
          const hasFiles = node.files && node.files.length > 0;
          const linkPattern = /(\[([^\]]+)\]\(task:([a-zA-Z0-9\-]+)\)|\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]|task:\/\/([a-zA-Z0-9\-]+))/;
          const hasTaskLinks = node.notes && linkPattern.test(node.notes);
          const isRoot = node.parentId === null && !node.isFloating;
          const hasChildren = nodes.some(n => n.parentId === node.id);
          const isLeftBranch = !isRoot && node.x < 0;
          const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
          const matches = isNodeMatched(node);
          const isDimmed = isAnyFilterActive && !matches;

          const currentParentForNode = node.parentId ? nodes.find(p => p.id === node.parentId) : null;
          const showDetachHint = isDraggingThisNode && currentParentForNode && (() => {
            const dx = Math.abs(node.x - currentParentForNode.x);
            const dy = Math.abs(node.y - currentParentForNode.y);
            
            if (currentParentForNode.isContainer) {
              if (focusedContainerId) {
                const maxW = (currentParentForNode.width || 520) / 2 + 400;
                const maxH = (currentParentForNode.height || 400) / 2 + 400;
                return dx > maxW || dy > maxH;
              } else {
                const maxW = (currentParentForNode.width || 520) / 2;
                const maxH = (currentParentForNode.height || 400) / 2;
                return dx > maxW || dy > maxH;
              }
            } else {
              const dist = Math.sqrt(dx * dx + dy * dy);
              return dist > 330;
            }
          })();

          const ancestorContainer = getAncestorContainer(node.parentId);
          let containerZ = 10;
          if (ancestorContainer) {
            const isAncestorSelected = selectedNodeId === ancestorContainer.id;
            const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
            containerZ = isAncestorSelected ? 50 : (isAncestorLastActive ? 30 : 10);
          }
          const cardZIndex = ancestorContainer
            ? containerZ + (isSelected ? 5 : 2)
            : (isSelected ? 60 : 5);
            
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={{
                left: node.x,
                top: node.y,
                transform: 'translate(-50%, -50%)',
                zIndex: cardZIndex,
                width: node.width ? `${node.width}px` : '210px',
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/task-tag')) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDragEnter={(e) => {
                if (e.dataTransfer.types.includes('application/task-tag')) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraggedOverTagNodeId(node.id);
                }
              }}
              onDragLeave={() => {
                if (draggedOverTagNodeId === node.id) {
                  setDraggedOverTagNodeId(null);
                }
              }}
              onDrop={(e) => {
                const tag = e.dataTransfer.getData('application/task-tag');
                if (tag) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraggedOverTagNodeId(null);
                  const existingTags = node.tags || [];
                  if (!existingTags.includes(tag)) {
                    onUpdateNode({
                      ...node,
                      tags: [...existingTags, tag]
                    });
                  }
                }
              }}
              className={`absolute group cursor-grab active:cursor-grabbing rounded-xl border ${isDraggingThisNode ? '' : 'transition-[background-color,border-color,opacity,box-shadow,transform] duration-150'} ${
                isDimmed 
                  ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 hover:opacity-90 hover:grayscale-0 hover:scale-100 duration-300' 
                  : ''
              } ${
                draggedOverTagNodeId === node.id
                  ? 'bg-emerald-50/10 dark:bg-emerald-950/15 border-emerald-500 ring-4 ring-emerald-500 scale-[1.03] shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse'
                  : hoverTargetId === node.id
                    ? 'bg-indigo-50/10 dark:bg-indigo-950/20 border-indigo-500 ring-4 ring-indigo-500 scale-[1.03] shadow-[0_0_15px_rgba(99,102,241,0.4)] animate-pulse'
                    : isRoot
                      ? isSelected
                        ? 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent ring-4 ring-indigo-250 dark:ring-indigo-900 shadow-xl'
                        : 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent shadow-md hover:shadow-lg hover:scale-[1.02]'
                      : priorityViewActive
                        ? `bg-white dark:bg-slate-900 ${getPriorityCardStyles(node.priority, isSelected)}`
                        : isSelected
                          ? 'bg-white dark:bg-slate-900 border-indigo-650 dark:border-indigo-400 ring-4 ring-indigo-100 dark:ring-indigo-950/40 shadow-lg' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:hover:border-slate-655 shadow-sm'
              } ${node.completed ? 'opacity-85' : isNodeOverdue(node, nodes) ? 'border-red-400 dark:border-red-900/60 shadow-[0_0_10px_rgba(239,68,68,0.25)] bg-red-50/10 dark:bg-red-950/5 animate-pulse' : ''}`}
              onMouseDown={(e) => startDragNode(e, node)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingNodeId(node.id);
              }}
              onClick={(e) => {
                if (hasDraggedNode || didDragRef.current) return; // ignore click if dragged
                e.stopPropagation();
                onSelectNode(node.id, e);
              }}
            >
              {showDetachHint && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-rose-600 text-white px-3 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50 flex items-center gap-1">
                  <span>Отпустите для отсоединения</span>
                  <span>✂️</span>
                </div>
              )}
              {hoverTargetId === node.id && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider uppercase animate-bounce shadow-md whitespace-nowrap z-50">
                  Сделать родительской
                </div>
              )}

              {/* Optional colored status line - only on child nodes */}
              {!isRoot && node.color && (
                <div 
                  className="h-1 rounded-t-[10px] w-full"
                  style={{ backgroundColor: node.color }}
                />
              )}

              {/* Card Title & Checkbox */}
              <div className="p-3">
                {isRoot && (
                  <p className="text-[8px] font-bold text-indigo-200 uppercase tracking-widest mb-1">
                    Главная цель / Идея
                  </p>
                )}
                <div className="flex items-start gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleNodeCompleted(node.id);
                    }}
                    title={node.completed ? "Отметить невыполненной" : "Отметить выполненной"}
                    className={`mt-0.5 cursor-pointer transition-colors ${
                      isRoot 
                        ? 'text-indigo-300 hover:text-white' 
                        : 'text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400'
                    }`}
                  >
                    {node.completed ? (
                      isRoot ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 fill-indigo-800/50" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-50 dark:fill-emerald-950/30" />
                      )
                    ) : activePomodoroNodeId === node.id ? (
                      <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
                        <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-rose-400 opacity-75"></span>
                        <Loader2 className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-spin" />
                      </span>
                    ) : (
                      isRoot ? (
                        <Circle className="w-4 h-4 text-indigo-400 grayscale contrast-125" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-705" />
                      )
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    {editingNodeId === node.id ? (
                      <input
                        type="text"
                        value={node.text}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          setEditingNodeId(null);
                          if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' || e.key === 'Esc') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                            if (!node.text.trim() || node.id === lastCreatedNodeId) {
                              onDeleteNode(node.id);
                            } else {
                              e.currentTarget.blur();
                            }
                            return;
                          }
                          e.stopPropagation(); // Avoid triggering global keyboard shortcuts like Delete!
                          if (e.key === 'Enter') {
                            setEditingNodeId(null);
                            if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                          }
                        }}
                        onChange={(e) => {
                          onUpdateNode({
                            ...node,
                            text: e.target.value
                          });
                        }}
                        className={`w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-1 py-0.5 rounded border border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          isRoot ? 'text-slate-900 bg-white' : ''
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className={`text-xs font-semibold leading-snug font-sans break-words ${
                        isRoot 
                          ? 'text-white' 
                          : 'text-slate-800 dark:text-slate-100 font-medium'
                      } ${node.completed ? 'line-through opacity-60 italic' : ''} flex items-center flex-wrap gap-1`}>
                        <span>{node.text || 'Без названия'}</span>
                        {node.externalLink && (
                          <a
                            href={node.externalLink.startsWith('http') ? node.externalLink : `https://${node.externalLink}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`inline-flex items-center justify-center p-0.5 rounded transition-colors shrink-0 ${
                              isRoot 
                                ? 'hover:bg-indigo-600 text-indigo-200' 
                                : 'hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-550 dark:text-indigo-400'
                            }`}
                            title={`Открыть внешнюю ссылку: ${node.externalLink}`}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {activePomodoroNodeId === node.id && (
                          <span className="inline-flex items-center gap-1 bg-red-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded-md text-[10px] font-sans font-extrabold animate-pulse ml-1 shrink-0 border border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" title="Запущена фокусировка Pomodoro">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                            </span>
                            <span>🍅</span>
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {!node.isCardCollapsed ? (
                  <>
                    {/* Priority & Badge Stats Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      {!isRoot && (
                        <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${pInfo.bg}`}>
                          <span className={`w-1 h-1 rounded-full ${pInfo.dot}`} />
                          {pInfo.label}
                        </span>
                      )}

                      {node.dueDate && (
                        <span 
                          className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            node.completed
                              ? isRoot
                                ? 'bg-indigo-700/50 text-indigo-200 border-indigo-500/30'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-505 border-slate-200 dark:border-slate-800'
                              : isNodeOverdue(node, nodes)
                                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900/60 animate-pulse font-extrabold shadow-[0_0_6px_rgba(244,63,94,0.3)]'
                                : isRoot
                                  ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900'
                          }`}
                          title={
                            node.completed 
                              ? `Срок выполнения: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Выполнено)`
                              : isNodeOverdue(node, nodes)
                                ? `Внимание! Срок выполнения истек: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''}`
                                : `Срок выполнения: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''}`
                          }
                        >
                          {isNodeOverdue(node, nodes) && !node.completed ? (
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-bounce" />
                          ) : (
                            <Calendar className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
                          )}
                          <span>{formatDisplayDate(node.dueDate)}{node.dueTime ? `, ${node.dueTime}` : ''}</span>
                        </span>
                      )}

                      {hasNotes && (
                        <span 
                          className={`inline-flex items-center text-[9px] px-1 py-0.5 ${
                            isRoot ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'
                          }`} 
                          title="Есть описание"
                        >
                          <FileText className="w-3 h-3 opacity-80" />
                        </span>
                      )}

                      {hasTaskLinks && (
                        <span 
                          className={`inline-flex items-center text-[9px] px-1 py-0.5 ${
                            isRoot ? 'text-indigo-200' : 'text-indigo-500 dark:text-indigo-400'
                          }`} 
                          title="Содержит ссылки на другие задачи"
                        >
                          <LinkIcon className="w-3 h-3 opacity-95" />
                        </span>
                      )}

                      {hasFiles && (
                        <span 
                          className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            isRoot 
                              ? 'bg-indigo-700/60 text-indigo-100 border-indigo-500/30' 
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-405 border-slate-200 dark:border-slate-755'
                          }`}
                          title={`${node.files.length} прикрепленных файла(ов)`}
                        >
                          <Paperclip className="w-2.5 h-2.5" />
                          {node.files.length}
                        </span>
                      )}
                    </div>

                    {/* Subtask Progress Bar for nodes with children */}
                    {hasChildren && (() => {
                      const progressPercent = calculateProgress(node.id, nodes) || 0;
                      return (
                        <div className="mt-2.5 mb-1 space-y-1" title={`Прогресс подзадач: ${progressPercent}%`}>
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                            <span>Прогресс</span>
                            <span className="font-mono">{progressPercent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${isRoot ? 'bg-indigo-300' : 'bg-indigo-600 dark:bg-indigo-500'}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tags block */}
                    {node.tags && node.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {node.tags.map((tag) => {
                          const matchedCategory = (node.tagCategories || tagCategories || []).find(cat => cat.tags && cat.tags.includes(tag));
                          const color = matchedCategory?.color;
                          
                          // Style based on whether a category is found with this tag
                          const style = color && !isRoot ? {
                            backgroundColor: `${color}18`,
                            color: color,
                            border: `1px solid ${color}35`
                          } : undefined;

                          return (
                            <span 
                              key={tag}
                              style={style}
                              className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-md select-none transition-all ${
                                isRoot 
                                  ? 'bg-indigo-700 text-indigo-100 opacity-90' 
                                  : color 
                                    ? '' 
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent'
                              }`}
                            >
                              #{tag}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Subtasks inline list */}
                    {(() => {
                      const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.archived);
                      if (subtasks.length === 0) return null;
                      const isExpanded = expandedCardSubtasks[node.id] || false;
                      const completedCount = subtasks.filter(s => s.completed).length;

                      return (
                        <div 
                          className="border-t border-slate-100 dark:border-slate-805/60 pt-2.5 mt-2 bg-transparent select-none" 
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCardSubtasks(prev => ({
                                ...prev,
                                [node.id]: !isExpanded
                              }));
                            }}
                            className="flex items-center justify-between w-full text-[9px] font-black text-slate-500 hover:text-[#4f46e5] dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 pl-0.5 pb-0.5">
                              <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                              </span>
                              <span>ПОДЗАДАЧИ:</span>
                              <span className="px-1.5 py-0.2 rounded-full text-[8.5px] bg-slate-100 dark:bg-slate-800/80 font-extrabold text-slate-600 dark:text-slate-400">
                                {completedCount}/{subtasks.length}
                              </span>
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-[8.5px] font-medium text-slate-400">{isExpanded ? 'Свернуть' : 'Развернуть'}</span>
                              <ChevronDown className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 pl-1.5 border-l-2 border-indigo-100 dark:border-indigo-950/60 space-y-1.5 overflow-hidden text-left"
                              >
                                {subtasks.map(subtask => (
                                  <div
                                    key={subtask.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectNode(subtask.id, e);
                                      onOpenDrawer();
                                    }}
                                    className="group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850/40 flex items-center justify-between gap-2 transition-all text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateNode({
                                            ...subtask,
                                            completed: !subtask.completed
                                          });
                                        }}
                                        className="text-slate-500 hover:text-[#4f46e5] dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                                      >
                                        {subtask.completed ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 fill-emerald-100/30 dark:fill-emerald-900/10" />
                                        ) : (
                                          <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                                        )}
                                      </button>
                                      <span className={`truncate leading-normal font-semibold text-[10px] ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-500' : isNodeOverdue(subtask, nodes) ? 'text-rose-555 dark:text-rose-450' : ''}`}>
                                        {subtask.text}
                                      </span>
                                    </div>
                                    {subtask.dueDate && (
                                      <span className={`shrink-0 flex items-center gap-1 text-[8.5px] px-1.5 py-0.5 rounded-md border font-extrabold shadow-sm leading-none ${
                                        isNodeOverdue(subtask, nodes) && !subtask.completed
                                          ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 border-rose-100 dark:border-rose-950/30'
                                          : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/50 dark:border-slate-750'
                                      }`}>
                                        <Clock className="w-2.5 h-2.5 text-slate-450 dark:text-slate-550" />
                                        <span>{formatDisplayDate(subtask.dueDate)}{subtask.dueTime ? ` ${subtask.dueTime}` : ''}</span>
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2 text-[9px] text-slate-400 dark:text-slate-500 font-medium select-none">
                    <span className="px-1 text-[8px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-555 rounded border border-slate-250 dark:border-slate-750">
                      Свернуто
                    </span>
                    {hasChildren && (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        • {countDescendants(node.id, nodes)} подзадач
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons appearing on task selection/click - "Добавить дочернюю задачу", "Заметки", "добавить файл", "Удалить" */}
              {isSelected && draggingNodeId === null && potentialDragNodeIdRef.current === null && (
                <div 
                  data-drag-ignore
                  className="absolute -bottom-11 left-1/2 flex items-center gap-1.5 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-50 pointer-events-auto whitespace-nowrap animate-fade-in"
                  style={{
                    transform: `translateX(-50%) scale(${1 / zoom})`,
                    transformOrigin: 'top center'
                  }}
                >
                  {/* Button 1: Добавить дочернюю задачу */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChildNode(node.id);
                    }}
                    title="Добавить дочернюю задачу"
                    className="flex items-center justify-center w-8 h-8 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 1.2: Свернуть / Развернуть детали карточки */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateNode({
                        ...node,
                        isCardCollapsed: !node.isCardCollapsed
                      });
                    }}
                    title={node.isCardCollapsed ? "Развернуть детали карточки" : "Свернуть детали карточки"}
                    className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    {node.isCardCollapsed ? (
                      <FolderPlus className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <FolderMinus className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {node.parentId !== null && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                      {/* Button 1.5: Отсоединить задачу */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNodeParent(node.id, null);
                        }}
                        title="Отсоединить задачу от родительской (сделать свободной)"
                        className="flex items-center justify-center w-8 h-8 text-amber-600 dark:text-amber-450 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Link2Off className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2: Заметки */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesModalNodeId(node.id);
                    }}
                    title="Открыть заметки"
                    className="flex items-center justify-center w-8 h-8 text-emerald-600 dark:text-emerald-450 hover:bg-emerald-55 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2.5: Открыть всю задачу (Eye) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrawer();
                    }}
                    title="Открыть всю задачу"
                    className="flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 3: Добавить файл */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileUploadNodeId(node.id);
                      setTimeout(() => {
                        if (cardFileInputRef.current) {
                          cardFileInputRef.current.click();
                        }
                      }, 50);
                    }}
                    title="Прикрепить файл"
                    className="flex items-center justify-center w-8 h-8 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {!isRoot && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 4: Удалить */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(node.id);
                        }}
                        title="Удалить ветвь"
                        className="flex items-center justify-center w-8 h-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Collapse/Expand sub-branch trigger overlay */}
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleNodeCollapse(node.id);
                  }}
                  title={node.collapsed ? "Развернуть ветвь подзадач" : "Свернуть ветвь подзадач"}
                  className={`absolute top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full border shadow-md transition-all duration-300 hover:scale-115 cursor-pointer ${
                    node.collapsed
                      ? 'px-1.5 h-6 text-[10px] font-bold bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-400'
                      : 'w-5 h-5 bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-350 hover:text-indigo-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  } ${
                    isLeftBranch ? '-left-2.5' : '-right-2.5'
                  }`}
                >
                  {node.collapsed ? (
                    <span className="flex items-center gap-0.5 pointer-events-none">
                      <Plus className="w-2.5 h-2.5 stroke-[3px]" />
                      <span>{countDescendants(node.id, nodes)}</span>
                    </span>
                  ) : (
                    <ChevronDown className={`w-3.5 h-3.5 pointer-events-none transition-transform ${isLeftBranch ? 'rotate-90' : '-rotate-90'}`} />
                  )}
                </button>
              )}

              {/* Resize Handles (widen left/right) for standard task cards */}
              <div
                onMouseDown={(e) => startResize(e, node, 'w')}
                onTouchStart={(e) => startResizeTouch(e, node, 'w')}
                className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize z-30 select-none opacity-0 group-hover:opacity-100 active:opacity-100 hover:bg-indigo-500/25 active:bg-indigo-500/50 rounded transition-all duration-150"
                title="Изменить ширину (влево)"
              />
              <div
                onMouseDown={(e) => startResize(e, node, 'e')}
                onTouchStart={(e) => startResizeTouch(e, node, 'e')}
                className="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize z-30 select-none opacity-0 group-hover:opacity-100 active:opacity-100 hover:bg-indigo-500/25 active:bg-indigo-500/50 rounded transition-all duration-150"
                title="Изменить ширину (вправо)"
              />
            </div>
          );
        })}
      </div>

      {priorityViewActive && (
        <div className="absolute bottom-4 right-4 z-10 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg select-none pointer-events-auto">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Цвета приоритетов
          </p>
          <div className="space-y-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              <span>Критический (Urgent)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span>Высокий (High)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
              <span>Средний (Medium)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.3)]" />
              <span>Низкий (Low)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="text-slate-400 dark:text-slate-500">Без приоритета</span>
            </div>
          </div>
        </div>
      )}

      {/* Off-canvas Sticky INBOX Container Widget */}
      <div 
        className={`absolute ${focusedContainerId ? 'bottom-20 sm:bottom-auto sm:top-4' : 'top-4'} right-4 z-40 pointer-events-auto select-none`}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {isInboxCollapsed ? (
          <button
            onClick={() => setIsInboxCollapsed(false)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-[0_8px_30px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.5)] border border-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer font-sans text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <span className="text-sm shrink-0">📥</span>
            <span>INBOX</span>
            <span className="bg-indigo-700 dark:bg-indigo-750 text-indigo-100 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold">
              {nodes.filter(n => n.parentId === 'inbox').length}
            </span>
          </button>
        ) : (
          <div className="w-[calc(100vw-32px)] sm:w-80 max-h-[320px] sm:max-h-[460px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* INBOX Header */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-850/60 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📥</span>
                <span className="font-extrabold text-[11px] tracking-wider uppercase text-slate-800 dark:text-slate-100 font-sans">
                  INBOX (Входящие)
                </span>
                <span className="bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                  {nodes.filter(n => n.parentId === 'inbox').length}
                </span>
              </div>
              <button
                onClick={() => setIsInboxCollapsed(true)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                title="Свернуть Inbox"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

             {/* Quick-add Input */}
             <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
               <div className="relative flex items-center">
                 <input
                   type="text"
                   placeholder="Запишите быструю мысль... (Enter)"
                   value={inboxInputText}
                   onChange={(e) => setInboxInputText(e.target.value)}
                   onKeyDown={(e) => {
                     e.stopPropagation();
                     if (e.key === 'Enter' && inboxInputText.trim() && onAddInboxTask) {
                       onAddInboxTask(inboxInputText);
                       setInboxInputText('');
                     }
                   }}
                   className="w-full text-xs py-2 pl-3 pr-16 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-slate-800 dark:text-slate-100 rounded-xl border border-slate-205 dark:border-slate-755 focus:border-indigo-500 focus:outline-none transition-all placeholder-slate-450"
                 />
                 <button
                   onClick={toggleInboxListening}
                   title={isInboxListening ? 'Остановить запись голоса' : 'Надиктуйте задачу голосом'}
                   className={`absolute right-8 p-1 rounded-lg transition-all cursor-pointer ${
                     isInboxListening 
                       ? 'bg-rose-100 dark:bg-rose-950/45 text-rose-600 dark:text-rose-450 animate-pulse' 
                       : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-805 hover:text-slate-700 dark:hover:text-slate-300'
                   }`}
                 >
                   {isInboxListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                 </button>
                 <button
                   onClick={() => {
                     if (inboxInputText.trim() && onAddInboxTask) {
                       onAddInboxTask(inboxInputText);
                       setInboxInputText('');
                     }
                   }}
                   disabled={!inboxInputText.trim()}
                   className="absolute right-1.5 p-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-650 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
                 >
                   <Plus className="w-3.5 h-3.5" />
                 </button>
               </div>
               
               {/* Speech Language Switcher for Inbox */}
               <div className="flex items-center justify-between text-[10px]">
                 <span className="font-semibold text-slate-400 dark:text-slate-500">Язык диктовки:</span>
                 <div className="flex gap-1 bg-slate-100/55 dark:bg-slate-950/40 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800/40">
                   <button
                     onClick={() => setSpeechLanguage('ru-RU')}
                     title="Русский язык"
                     className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] transition-all cursor-pointer ${
                       speechLanguage === 'ru-RU' 
                         ? 'bg-white dark:bg-slate-850 shadow-sm text-indigo-600 dark:text-indigo-400' 
                         : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350'
                     }`}
                   >
                     🇷🇺 RU
                   </button>
                   <button
                     onClick={() => setSpeechLanguage('az-AZ')}
                     title="Azərbaycan dili"
                     className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] transition-all cursor-pointer ${
                       speechLanguage === 'az-AZ' 
                         ? 'bg-white dark:bg-slate-850 shadow-sm text-indigo-600 dark:text-indigo-400' 
                         : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350'
                     }`}
                   >
                     🇦🇿 AZ
                   </button>
                   <button
                     onClick={() => setSpeechLanguage('en-US')}
                     title="English Language"
                     className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] transition-all cursor-pointer ${
                       speechLanguage === 'en-US' 
                         ? 'bg-white dark:bg-slate-850 shadow-sm text-indigo-600 dark:text-indigo-400' 
                         : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350'
                     }`}
                   >
                     🇺🇸 EN
                   </button>
                 </div>
               </div>
             </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[280px] custom-scrollbar bg-slate-50/40 dark:bg-slate-950/20">
              {nodes.filter(n => n.parentId === 'inbox').length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-1 select-none">
                  <span className="text-xl">💭</span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[180px] leading-relaxed">
                    Здесь будут ваши свежие идеи. Запишите все мысли в Inbox, чтобы потом разобрать их по холсту!
                  </p>
                </div>
              ) : (
                nodes
                  .filter(n => n.parentId === 'inbox')
                  .map(task => {
                    return (
                      <div 
                        key={task.id}
                        className="p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center gap-2 shadow-sm group hover:border-indigo-150 dark:hover:border-indigo-950 transition-all duration-200"
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {/* Task completing checkbox */}
                        <button
                          onClick={() => onToggleNodeCompleted(task.id)}
                          className={`p-0.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer ${
                            task.completed ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'
                          }`}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : activePomodoroNodeId === task.id ? (
                            <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 opacity-75"></span>
                              <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                            </span>
                          ) : (
                            <Circle className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Editable task title inside Inbox */}
                        <input
                          type="text"
                          value={task.text}
                          onChange={(e) => {
                            onUpdateNode({
                              ...task,
                              text: e.target.value
                            });
                          }}
                          className={`flex-1 text-xs bg-transparent border-0 focus:ring-0 p-0.5 text-slate-800 dark:text-slate-100 focus:outline-none max-w-[140px] truncate-none hover:bg-slate-50/50 dark:hover:bg-slate-800/50 focus:bg-slate-50 dark:focus:bg-slate-850 px-1 rounded transition-colors ${
                            task.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                          }`}
                          placeholder="Имя задачи..."
                        />

                        {/* Release / Deploy Button */}
                        <button
                          onClick={() => {
                            // Calculate screen center coordinates relative to canvas bounding box
                            let cx = window.innerWidth / 2;
                            let cy = window.innerHeight / 2;
                            if (containerRef.current) {
                              const rect = containerRef.current.getBoundingClientRect();
                              cx = rect.left + rect.width / 2;
                              cy = rect.top + rect.height / 2;
                            }
                            const canvasCoords = getCanvasCoordinates(cx, cy);
                            onUpdateNode({
                              ...task,
                              parentId: null,
                              x: canvasCoords.x,
                              y: canvasCoords.y,
                            });
                            onSelectNode(task.id);
                          }}
                          title="Разместить на холсте по центру экрана"
                          className="p-1 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer shrink-0 opacity-80 group-hover:opacity-100"
                        >
                          <Move className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => onDeleteNode(task.id)}
                          title="Удалить безвозвратно"
                          className="p-1 text-slate-450 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer shrink-0 opacity-80 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
            
            {/* Help Info Footer */}
            <div className="bg-slate-50 dark:bg-slate-850 p-2 text-[10px] text-slate-400 dark:text-slate-500 text-center border-t border-slate-150 dark:border-slate-800 select-none leading-relaxed">
              Нажмите кнопку <span className="font-extrabold text-indigo-600 dark:text-indigo-450">переноса</span>, чтобы отправить задачу в центр карты.
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for file uploading in nodes */}
      <input 
        type="file"
        ref={cardFileInputRef}
        onChange={handleCardFileUpload}
        className="hidden pointer-events-none"
      />

      {/* Edit Notes & Properties Modal */}
      {notesModalNodeId && (() => {
        const node = nodes.find(n => n.id === notesModalNodeId);
        if (!node) return null;

        const isRootNode = node.parentId === null && !node.isFloating;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in pointer-events-auto">
            <div 
              data-drag-ignore
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest font-sans flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" /> Заметки и файлы задачи
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans mt-0.5">
                    {isRootNode ? 'Основная ветвь проекта' : node.isFloating ? 'Независимая плавающая задача' : 'Второстепенная цель'}
                  </p>
                </div>
                <button 
                  onClick={() => setNotesModalNodeId(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-705 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Title renaming field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Название ветви / задачи
                  </label>
                  <input
                    type="text"
                    value={node.text}
                    onChange={(e) => onUpdateNode({ ...node, text: e.target.value })}
                    onFocus={() => {
                      setOriginalText(node.text);
                      setOriginalNotes(node.notes || '');
                    }}
                    onBlur={() => {
                      if (node.text !== originalText) {
                        recordCanvasHistoryVersion(node, originalText, originalNotes, 'Правка названия');
                      }
                    }}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                    placeholder="Введите текст..."
                  />
                </div>

                {/* Priority Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Приоритет задачи
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => {
                      const isActive = node.priority === p;
                      const label = p === 'urgent' ? 'Крит.' : p === 'high' ? 'Высок.' : p === 'medium' ? 'Средн.' : 'Низк.';
                      const colorClass = p === 'urgent' ? 'border-rose-350 text-rose-600 bg-rose-50 dark:bg-rose-950/20' : 
                                         p === 'high' ? 'border-amber-350 text-amber-600 bg-amber-50 dark:bg-amber-950/20' :
                                         p === 'medium' ? 'border-blue-350 text-blue-600 bg-blue-50 dark:bg-blue-950/20' :
                                         'border-teal-350 text-teal-600 bg-teal-50 dark:bg-teal-950/20';
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onUpdateNode({ ...node, priority: p })}
                          className={`px-2 py-1.5 border rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                            isActive ? `${colorClass} ring-2 ring-indigo-500` : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes textarea */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                    Заметки и описание
                  </label>
                  <textarea
                    value={node.notes || ''}
                    onChange={(e) => onUpdateNode({ ...node, notes: e.target.value })}
                    onFocus={() => {
                      setOriginalText(node.text);
                      setOriginalNotes(node.notes || '');
                    }}
                    onBlur={() => {
                      if ((node.notes || '') !== originalNotes) {
                        recordCanvasHistoryVersion(node, originalText, originalNotes, 'Правка заметок');
                      }
                    }}
                    rows={5}
                    className="w-full text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-sans leading-relaxed"
                    placeholder="Здесь можно записать любые идеи, подзадачи, шаги, ссылки или текстовую справку к этой задаче..."
                  />
                </div>

                {/* Attachments & Upload list */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans">
                      Прикрепленные файлы
                    </label>
                    
                    {/* Add file button in modal */}
                    <button
                      onClick={() => {
                        setFileUploadNodeId(node.id);
                        setTimeout(() => {
                          if (cardFileInputRef.current) {
                            cardFileInputRef.current.click();
                          }
                        }, 50);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Прикрепить файл</span>
                    </button>
                  </div>

                  {fileError && (
                    <div className="text-xs text-rose-500 border border-rose-250 bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg animate-pulse">
                      {fileError}
                    </div>
                  )}

                  {node.files && node.files.length > 0 ? (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto font-sans">
                      {node.files.map((file) => {
                        const isImg = file.type && file.type.startsWith('image/');
                        const imgUrl = file.googleDriveId ? `https://drive.google.com/thumbnail?id=${file.googleDriveId}&sz=w150` : file.dataUrl;
                        return (
                          <div 
                            key={file.id} 
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-750 text-xs text-slate-700 dark:text-slate-300 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                              {isImg ? (
                                <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200/60 dark:border-slate-700 shadow-3xs">
                                  <img 
                                    src={imgUrl} 
                                    alt="" 
                                    className="w-full h-full object-cover" 
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              ) : (
                                <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              )}
                              <span className="truncate font-medium">{file.name}</span>
                              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                                ({formatFileSize(file.size)})
                              </span>
                            </div>

                          <div className="flex items-center gap-1">
                            {/* Download */}
                            <a
                              href={file.dataUrl}
                              download={file.name}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                              title="Скачать файл"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>

                            {/* Remove */}
                            <button
                              onClick={() => {
                                const updatedFiles = node.files.filter(f => f.id !== file.id);
                                onUpdateNode({ ...node, files: updatedFiles });
                              }}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-rose-500 hover:text-rose-600"
                              title="Удалить файл"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="p-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs text-slate-400 dark:text-slate-500 italic font-sans animate-fade-in">
                      Нет прикрепленных файлов.
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-150 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setNotesModalNodeId(null)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Voice Dictation overlay panel */}
      {isCanvasListening && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-250">
            <div className="relative">
              <div className="absolute inset-0 w-12 h-12 bg-rose-500/20 rounded-full animate-ping animate-duration-1000" />
              <div className="relative w-12 h-12 bg-rose-600 dark:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg">
                <Mic className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-sans font-extrabold text-slate-800 dark:text-slate-100">
                Голосовое управление
              </h3>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-450">
                Создавайте задачи голосом! Вы можете сказать:
                <br />
                <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded mt-1 inline-block">
                  "Add task buy groceries"
                </span>
                <br />
                или <span className="font-semibold text-slate-700 dark:text-slate-300">"Добавь задачу купить молоко"</span>, либо просто диктуйте её имя.
              </p>
            </div>

            {/* Language Selector in Overlay */}
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl gap-1 border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSpeechLanguage('ru-RU')}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  speechLanguage === 'ru-RU' 
                    ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span>🇷🇺</span> RU
              </button>
              <button
                onClick={() => setSpeechLanguage('az-AZ')}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  speechLanguage === 'az-AZ' 
                    ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span>🇦🇿</span> AZ
              </button>
              <button
                onClick={() => setSpeechLanguage('en-US')}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  speechLanguage === 'en-US' 
                    ? 'bg-white dark:bg-slate-800 shadow text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <span>🇺🇸</span> EN
              </button>
            </div>

            <div className="w-full min-h-[75px] bg-slate-50 dark:bg-slate-950 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3 flex flex-col items-center justify-center gap-1.5">
              {canvasSpeechText ? (
                <>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 italic tracking-wide">
                    « {canvasSpeechText} »
                  </p>
                  {(() => {
                    const parsed = parseVoiceCommand(canvasSpeechText);
                    if (parsed.commandMatched) {
                      return (
                        <div className="flex flex-col items-center gap-0.5 text-[10px] bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
                          <span className="font-bold flex items-center gap-1">✨ Команда: "{parsed.commandMatched}"</span>
                          <span className="text-slate-600 dark:text-slate-400">Задача: <strong className="font-bold">"{parsed.taskText}"</strong></span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Будет создана задача: <strong className="font-semibold text-slate-700 dark:text-slate-300">"{parsed.taskText}"</strong>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-600 italic">
                  Слушаем вашу речь...
                </p>
              )}
            </div>

            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={stopCanvasListening}
                className="flex-1 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-705 dark:text-slate-400 dark:hover:bg-slate-800 bg-transparent rounded-xl cursor-pointer transition-all border border-slate-200 dark:border-slate-800"
              >
                Отмена
              </button>
              <button
                disabled={!canvasSpeechText.trim()}
                onClick={() => {
                  handleCreateCanvasTaskFromSpeech(canvasSpeechText);
                  stopCanvasListening();
                }}
                className="flex-1 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
