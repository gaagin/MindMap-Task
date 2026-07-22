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
  Copy, 
  FileText, 
  Maximize2, 
  Minimize2,
  ZoomIn, 
  ZoomOut, 
  Move,
  Lock,
  Type,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
  Clock,
  Tag,
  Timer,
  ToggleLeft,
  ToggleRight,
  Square,
  Hexagon,
  Bell,
  Target,
  GripVertical,
  Layers,
  CornerUpLeft
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';
import { getBezierPath, calculateProgress, getDescendants, generateId, formatFileSize, getPomoStatsForNode, formatTotalPomoTime, isNodeOverdue, isContainerOverdue, pruneTaskNodeHistory, suggestEstimatedTime, getTaskExternalLinks } from '../utils';
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
  onSelectNodes?: (ids: string[]) => void;
  onCopyNodes?: (ids: string[]) => void;
  onBulkDelete?: () => void;
  onBulkToggleCompleted?: (completed: boolean) => void;
  onUpdateNodeCoordinates: (id: string, x: number, y: number) => void;
  onUpdateNodeParent: (id: string, newParentId: string | null, newX?: number, newY?: number) => void;
  onAddChildNode: (parentId: string) => void;
  onAddFloatingNode: (x: number, y: number, parentId?: string | null, customText?: string, extraFields?: Partial<TaskNode>) => void;
  onAddContainerNode: (x: number, y: number, parentId?: string | null) => void;
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
  onOpenDrawer: (initialFullscreen?: boolean) => void;
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
  onContainerFocusChange?: (isFocused: boolean) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  focusedTaskId?: string | null;
  onFocusedTaskIdChange?: (id: string | null) => void;
  focusedContainerId?: string | null;
  onFocusedContainerIdChange?: (id: string | null) => void;
  googleToken?: string | null;
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

function getDraggingPreviewPath(
  x1: number, y1: number, side1: string,
  x2: number, y2: number
): string {
  let cp1x = x1;
  let cp1y = y1;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const flex = Math.min(dist * 0.4, 150);

  if (side1 === 'top') cp1y -= flex;
  else if (side1 === 'bottom') cp1y += flex;
  else if (side1 === 'left') cp1x -= flex;
  else if (side1 === 'right') cp1x += flex;

  const cp2x = x2 - (side1 === 'left' || side1 === 'right' ? (x2 - x1) * 0.2 : 0);
  const cp2y = y2 - (side1 === 'top' || side1 === 'bottom' ? (y2 - y1) * 0.2 : 0);

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
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

function getNodeWidth(n: TaskNode): number {
  if (n.isWorkflowRectangle) {
    return n.width || (n.workflowShape === 'rhomb' ? 120 : 170);
  }
  if (n.isContainer) {
    return n.collapsed ? 220 : (n.width || 520);
  }
  return n.width || 210;
}

function getNodeHeight(n: TaskNode): number {
  if (n.isWorkflowRectangle) {
    return n.height || (n.workflowShape === 'rhomb' ? 120 : 70);
  }
  if (n.isContainer) {
    return n.collapsed ? 100 : (n.height || 400);
  }
  return n.height || 110;
}

function getClosestConnectionPoints(node1: TaskNode, node2: TaskNode) {
  const w1 = getNodeWidth(node1);
  const h1 = getNodeHeight(node1);
  const w2 = getNodeWidth(node2);
  const h2 = getNodeHeight(node2);

  const c1 = { x: node1.x, y: node1.y };
  const c2 = { x: node2.x, y: node2.y };

  const p1_candidates = [
    { x: c1.x, y: c1.y - h1 / 2, side: 'top' },
    { x: c1.x, y: c1.y + h1 / 2, side: 'bottom' },
    { x: c1.x - w1 / 2, y: c1.y, side: 'left' },
    { x: c1.x + w1 / 2, y: c1.y, side: 'right' }
  ];

  const p2_candidates = [
    { x: c2.x, y: c2.y - h2 / 2, side: 'top' },
    { x: c2.x, y: c2.y + h2 / 2, side: 'bottom' },
    { x: c2.x - w2 / 2, y: c2.y, side: 'left' },
    { x: c2.x + w2 / 2, y: c2.y, side: 'right' }
  ];

  let minDistance = Infinity;
  let bestP1 = p1_candidates[0];
  let bestP2 = p2_candidates[0];

  for (const p1 of p1_candidates) {
    for (const p2 of p2_candidates) {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestP1 = p1;
        bestP2 = p2;
      }
    }
  }

  return { p1: bestP1, p2: bestP2 };
}

function getDependencyBezierPath(x1: number, y1: number, side1: string, x2: number, y2: number, side2: string): string {
  let cp1x = x1;
  let cp1y = y1;
  let cp2x = x2;
  let cp2y = y2;
  
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const flex = Math.min(dist * 0.35, 120);

  if (side1 === 'top') cp1y -= flex;
  else if (side1 === 'bottom') cp1y += flex;
  else if (side1 === 'left') cp1x -= flex;
  else if (side1 === 'right') cp1x += flex;

  if (side2 === 'top') cp2y -= flex;
  else if (side2 === 'bottom') cp2y += flex;
  else if (side2 === 'left') cp2x -= flex;
  else if (side2 === 'right') cp2x += flex;

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
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
  onSelectNodes,
  onCopyNodes,
  onBulkDelete,
  onBulkToggleCompleted,
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
  onClearLastCreatedNodeId,
  onContainerFocusChange,
  onFullScreenChange,
  focusedTaskId = null,
  onFocusedTaskIdChange,
  focusedContainerId: propFocusedContainerId,
  onFocusedContainerIdChange,
  googleToken
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Mobile touch multi-selection states
  const [touchSelectionStart, setTouchSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [touchSelectionEnd, setTouchSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isTouchSelecting, setIsTouchSelecting] = useState(false);
  const touchSelectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchSelectingRef = useRef(false);

  // Click and tap tracking references for background node creation
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseDownTargetRef = useRef<HTMLElement | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartTargetRef = useRef<HTMLElement | null>(null);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoArranging, setIsAutoArranging] = useState(false);

  useEffect(() => {
    if (onFullScreenChange) {
      onFullScreenChange(isFullScreen);
    }
  }, [isFullScreen, onFullScreenChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable')) {
          return;
        }
      }

      if (!selectedNodeId) return;
      const targetNode = incomingNodes.find(n => n.id === selectedNodeId);
      if (!targetNode) return;

      let dx = 0;
      let dy = 0;
      const step = e.shiftKey ? 10 : 2;

      if (e.key === 'ArrowUp') {
        dy = -step;
      } else if (e.key === 'ArrowDown') {
        dy = step;
      } else if (e.key === 'ArrowLeft') {
        dx = -step;
      } else if (e.key === 'ArrowRight') {
        dx = step;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        onUpdateNodeCoordinates(
          selectedNodeId,
          targetNode.x + dx,
          targetNode.y + dy
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeId, incomingNodes, onUpdateNodeCoordinates]);
  
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [expandedCardSubtasks, setExpandedCardSubtasks] = useState<Record<string, boolean>>({});
  
  // Drag and touch sorting states for subtasks in mind map canvas
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeTouchIndex, setActiveTouchIndex] = useState<number | null>(null);
  const lastSwapTimeRef = useRef<number>(0);

  const [activeInlineMenu, setActiveInlineMenu] = useState<{
    cardId: string;
    type: 'priority' | 'date' | 'tag' | 'pomodoro' | 'estimatedTime';
  } | null>(null);
  const [openInlineMenuUpwards, setOpenInlineMenuUpwards] = useState<boolean>(false);

  const handleToggleInlineMenu = (e: React.MouseEvent, cardId: string, type: 'priority' | 'date' | 'tag' | 'pomodoro' | 'estimatedTime') => {
    e.stopPropagation();
    const isSame = activeInlineMenu?.cardId === cardId && activeInlineMenu?.type === type;
    if (isSame) {
      setActiveInlineMenu(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const estHeight = type === 'date' ? 260 : type === 'tag' ? 220 : type === 'pomodoro' ? 180 : type === 'estimatedTime' ? 200 : 150;
      const shouldOpenUp = rect.bottom + estHeight > windowHeight;
      setOpenInlineMenuUpwards(shouldOpenUp);
      setActiveInlineMenu({ cardId, type });
    }
  };

  const [isElementDropdownOpen, setIsElementDropdownOpen] = useState(false);
  const [isContainersDropdownOpen, setIsContainersDropdownOpen] = useState(false);

  useEffect(() => {
    if (lastCreatedNodeId) {
      setEditingNodeId(lastCreatedNodeId);
      const newNode = incomingNodes.find(n => n.id === lastCreatedNodeId);
      if (newNode && newNode.parentId) {
        setExpandedCardSubtasks(prev => ({
          ...prev,
          [newNode.parentId!]: true
        }));
      }
    }
  }, [lastCreatedNodeId, incomingNodes]);

  // Automatically expand card subtasks checklist when task is focused
  useEffect(() => {
    if (focusedTaskId) {
      setExpandedCardSubtasks(prev => ({
        ...prev,
        [focusedTaskId]: true
      }));
    }
  }, [focusedTaskId]);
  
  // States for Notes and file upload handling
  const [notesModalNodeId, setNotesModalNodeId] = useState<string | null>(null);
  const [nestedDragNodeId, setNestedDragNodeId] = useState<string | null>(null);
  // States for trailing tags drag and drop onto nodes on canvas
  const [draggedOverTagNodeId, setDraggedOverTagNodeId] = useState<string | null>(null);
  
  // Fullscreen card modal state on mobile
  const [fullscreenCardId, setFullscreenCardId] = useState<string | null>(null);
  const [fullscreenHistory, setFullscreenHistory] = useState<string[]>([]);
  const [fullscreenSubtaskText, setFullscreenSubtaskText] = useState('');

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
        onUpdateNode({ ...node, completed: false, progress: 0, status: 'todo' });
      } else if (colId === 'progress') {
        onUpdateNode({ ...node, completed: false, progress: 50, status: 'progress' });
      } else if (colId === 'waiting') {
        onUpdateNode({ ...node, completed: false, status: 'waiting' });
      } else if (colId === 'done') {
        onUpdateNode({ ...node, completed: true, progress: 100, status: 'done' });
      }
    } else if (currentGroupBy === 'priority') {
      const priority = colId === 'none' ? 'none' : colId as Priority;
      onUpdateNode({ ...node, priority });
    } else if (currentGroupBy === 'category') {
      const containerNode = nodes.find(n => n.id === containerId);
      const containerSavedCatId = containerNode?.savedFilters?.filterCategoryId;
      const currentActiveCategoryId = containerKanbanActiveCategory[containerId] || containerSavedCatId || (tagCategories.length > 0 ? tagCategories[0].id : null);
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
      history: pruneTaskNodeHistory([newVersion, ...currentHistory])
    });
  };

  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadNodeId, setFileUploadNodeId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Helper to get or create a folder on Google Drive
  const getOrCreateGoogleDriveFolder = async (token: string): Promise<string | null> => {
    try {
      const q = encodeURIComponent("name='MindMap_Attachments' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
        }
      }

      // Create folder if not found
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'MindMap_Attachments',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      if (createRes.ok) {
        const createData = await createRes.json();
        return createData.id;
      }
    } catch (e) {
      console.error('Error getting/creating Drive folder:', e);
    }
    return null;
  };

  const uploadFileWithToken = async (file: File): Promise<any> => {
    let finalFile = file;
    if (file.name === 'image.png' || !file.name) {
      const extension = file.type ? file.type.split('/')[1] || 'png' : 'png';
      const formattedDate = new Date().toISOString().split('T')[0] + '_' + new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      finalFile = new File([file], `Pasted_File_${formattedDate}.${extension}`, { type: file.type });
    }

    if (googleToken) {
      setIsUploadingFile(true);
      try {
        const folderId = await getOrCreateGoogleDriveFolder(googleToken);

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: finalFile.name,
            mimeType: finalFile.type || 'application/octet-stream',
            parents: folderId ? [folderId] : undefined
          })
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Failed to create metadata on Drive: ${errText}`);
        }

        const createData = await createRes.json();
        const driveFileId = createData.id;

        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': finalFile.type || 'application/octet-stream'
          },
          body: finalFile
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Failed to upload file body: ${errText}`);
        }

        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            })
          });
        } catch (permissionErr) {
          console.warn('[Google Drive Auth] Failed to share file:', permissionErr);
        }

        const finalRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,webViewLink,webContentLink,size`, {
          headers: {
            'Authorization': `Bearer ${googleToken}`
          }
        });

        if (!finalRes.ok) {
          throw new Error('Failed to retrieve web links');
        }

        const finalData = await finalRes.json();

        return {
          id: generateId(),
          name: finalFile.name,
          type: finalFile.type,
          size: finalFile.size,
          dataUrl: finalData.webViewLink || finalData.webContentLink || '',
          googleDriveId: driveFileId,
          webViewLink: finalData.webViewLink,
          webContentLink: finalData.webContentLink,
        };
      } catch (err: any) {
        console.error(err);
        setFileError(`Failed to save to Google Drive: ${err.message || err}`);
        return null;
      } finally {
        setIsUploadingFile(false);
      }
    } else {
      const MAX_BYTES = 1.5 * 1024 * 1024;
      if (finalFile.size > MAX_BYTES) {
        setFileError('Размер файла превышает 1.5 МБ. Войдите через Google, чтобы разблокировать вложения на Google Диск без ограничений!');
        setTimeout(() => setFileError(null), 4000);
        return null;
      }

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result as string;
          resolve({
            id: generateId(),
            name: finalFile.name,
            type: finalFile.type,
            size: finalFile.size,
            dataUrl: base64Data,
          });
        };
        reader.onerror = () => {
          setFileError('Ошибка считывания файла.');
          setTimeout(() => setFileError(null), 4000);
          resolve(null);
        };
        reader.readAsDataURL(finalFile);
      });
    }
  };

  const handleCardFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    const targetNodeId = fileUploadNodeId;
    if (!filesList || filesList.length === 0 || !targetNodeId) return;
    
    setFileError(null);
    const file = filesList[0];
    const node = nodes.find(n => n.id === targetNodeId);
    if (!node) return;

    const newAttachment = await uploadFileWithToken(file);
    if (!newAttachment) return;

    const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
    onUpdateNode({
      ...node,
      files: updatedFiles
    });
    
    // Reset file input value
    e.target.value = '';
  };

  // Drag states for panning the background
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Wheel zoom smoothness state and ref
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef<any>(null);
  const fullscreenSubtaskInputRef = useRef<HTMLInputElement>(null);

  // Resize states for containers/cards
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 520, height: 400 });
  const [resizeStartCenter, setResizeStartCenter] = useState({ x: 0, y: 0 });

  // Drag states for dragging a specific card
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [alignmentLines, setAlignmentLines] = useState<{
    type: 'v' | 'h';
    coord: number;
    minVal: number;
    maxVal: number;
  }[]>([]);
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

  const nodes = (draggingNodeId || draggingConn || resizingNodeId) ? localNodes : incomingNodes;

  const checkHasActiveBlockers = (nodeId: string) => {
    const target = nodes.find(n => n.id === nodeId);
    if (!target || target.completed || !target.blockedBy) return false;
    return nodes.some(n => target.blockedBy?.includes(n.id) && !n.completed);
  };

  const handleLocalUpdateCoordinates = (id: string, x: number, y: number) => {
    setLocalNodes(prev => {
      const targetNode = prev.find(n => n.id === id);
      if (!targetNode) return prev;
      const dx = x - targetNode.x;
      const dy = y - targetNode.y;
      if (dx === 0 && dy === 0) return prev;

      const isMultiDrag = selectedNodeIds && selectedNodeIds.includes(id);

      const isDescendant = (candidateId: string): boolean => {
        if (isMultiDrag) {
          if (selectedNodeIds.includes(candidateId)) return true;
          let currentId: string | null = candidateId;
          let iterations = 0;
          while (currentId !== null && iterations < 100) {
            iterations++;
            const current = prev.find(n => n.id === currentId);
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
            const current = prev.find(n => n.id === currentId);
            if (!current) break;
            if (current.parentId === id) return true;
            currentId = current.parentId;
          }
          return false;
        }
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

  const getSnapAndLines = (
    draggedId: string,
    proposedX: number,
    proposedY: number,
    allNodes: TaskNode[]
  ) => {
    const draggedNode = allNodes.find(n => n.id === draggedId);
    if (!draggedNode) return { snappedX: proposedX, snappedY: proposedY, lines: [] };

    const draggedW = getNodeWidth(draggedNode);
    const draggedH = getNodeHeight(draggedNode);

    // Identify which nodes are moving (so we don't snap to them)
    const isMultiDrag = selectedNodeIds && selectedNodeIds.includes(draggedId);
    const isMoving = (candidateId: string): boolean => {
      if (isMultiDrag) {
        if (selectedNodeIds.includes(candidateId)) return true;
        let currentId: string | null = candidateId;
        let iterations = 0;
        while (currentId !== null && iterations < 100) {
          iterations++;
          const current = allNodes.find(n => n.id === currentId);
          if (!current) break;
          if (selectedNodeIds.includes(current.parentId || '')) return true;
          currentId = current.parentId;
        }
        return false;
      } else {
        if (candidateId === draggedId) return true;
        let currentId: string | null = candidateId;
        let iterations = 0;
        while (currentId !== null && iterations < 100) {
          iterations++;
          const current = allNodes.find(n => n.id === currentId);
          if (!current) break;
          if (current.parentId === draggedId) return true;
          currentId = current.parentId;
        }
        return false;
      }
    };

    const staticNodes = allNodes.filter(n => !isMoving(n.id));

    let snappedX = proposedX;
    let bestDiffX = Infinity;

    const myLeft = proposedX - draggedW / 2;
    const myCenter = proposedX;
    const myRight = proposedX + draggedW / 2;

    const myEdgesX = [
      { val: myLeft, name: 'left', offset: -draggedW / 2 },
      { val: myCenter, name: 'center', offset: 0 },
      { val: myRight, name: 'right', offset: draggedW / 2 }
    ];

    staticNodes.forEach(other => {
      const otherW = getNodeWidth(other);
      const otherEdgesX = [
        { val: other.x - otherW / 2, name: 'left' },
        { val: other.x, name: 'center' },
        { val: other.x + otherW / 2, name: 'right' }
      ];

      myEdgesX.forEach(myEdge => {
        otherEdgesX.forEach(otherEdge => {
          const diff = Math.abs(myEdge.val - otherEdge.val);
          if (diff < 8 && diff < bestDiffX) {
            bestDiffX = diff;
            snappedX = otherEdge.val - myEdge.offset;
          }
        });
      });
    });

    let snappedY = proposedY;
    let bestDiffY = Infinity;

    const myTop = proposedY - draggedH / 2;
    const myCenterY = proposedY;
    const myBottom = proposedY + draggedH / 2;

    const myEdgesY = [
      { val: myTop, name: 'top', offset: -draggedH / 2 },
      { val: myCenterY, name: 'center', offset: 0 },
      { val: myBottom, name: 'bottom', offset: draggedH / 2 }
    ];

    staticNodes.forEach(other => {
      const otherH = getNodeHeight(other);
      const otherEdgesY = [
        { val: other.y - otherH / 2, name: 'top' },
        { val: other.y, name: 'center' },
        { val: other.y + otherH / 2, name: 'bottom' }
      ];

      myEdgesY.forEach(myEdge => {
        otherEdgesY.forEach(otherEdge => {
          const diff = Math.abs(myEdge.val - otherEdge.val);
          if (diff < 8 && diff < bestDiffY) {
            bestDiffY = diff;
            snappedY = otherEdge.val - myEdge.offset;
          }
        });
      });
    });

    const lines: { type: 'v' | 'h'; coord: number; minVal: number; maxVal: number }[] = [];

    if (bestDiffX < 8) {
      const snappedLeft = snappedX - draggedW / 2;
      const snappedCenter = snappedX;
      const snappedRight = snappedX + draggedW / 2;

      const finalEdgesX = [
        { val: snappedLeft, name: 'left' },
        { val: snappedCenter, name: 'center' },
        { val: snappedRight, name: 'right' }
      ];

      let minY = snappedY - draggedH / 2;
      let maxY = snappedY + draggedH / 2;
      const alignedCoordsX = new Set<number>();

      staticNodes.forEach(other => {
        const otherW = getNodeWidth(other);
        const otherH = getNodeHeight(other);
        const otherEdges = [
          { val: other.x - otherW / 2, name: 'left' },
          { val: other.x, name: 'center' },
          { val: other.x + otherW / 2, name: 'right' }
        ];

        finalEdgesX.forEach(myEdge => {
          otherEdges.forEach(otherEdge => {
            if (Math.abs(myEdge.val - otherEdge.val) < 0.2) {
              alignedCoordsX.add(otherEdge.val);
              minY = Math.min(minY, other.y - otherH / 2);
              maxY = Math.max(maxY, other.y + otherH / 2);
            }
          });
        });
      });

      alignedCoordsX.forEach(coord => {
        lines.push({
          type: 'v',
          coord: parseFloat(coord.toFixed(1)),
          minVal: minY - 15,
          maxVal: maxY + 15
        });
      });
    }

    if (bestDiffY < 8) {
      const snappedTop = snappedY - draggedH / 2;
      const snappedCenterY = snappedY;
      const snappedBottom = snappedY + draggedH / 2;

      const finalEdgesY = [
        { val: snappedTop, name: 'top' },
        { val: snappedCenterY, name: 'center' },
        { val: snappedBottom, name: 'bottom' }
      ];

      let minX = snappedX - draggedW / 2;
      let maxX = snappedX + draggedW / 2;
      const alignedCoordsY = new Set<number>();

      staticNodes.forEach(other => {
        const otherW = getNodeWidth(other);
        const otherH = getNodeHeight(other);
        const otherEdgesY = [
          { val: other.y - otherH / 2, name: 'top' },
          { val: other.y, name: 'center' },
          { val: other.y + otherH / 2, name: 'bottom' }
        ];

        finalEdgesY.forEach(myEdge => {
          otherEdgesY.forEach(otherEdge => {
            if (Math.abs(myEdge.val - otherEdge.val) < 0.2) {
              alignedCoordsY.add(otherEdge.val);
              minX = Math.min(minX, other.x - otherW / 2);
              maxX = Math.max(maxX, other.x + otherW / 2);
            }
          });
        });
      });

      alignedCoordsY.forEach(coord => {
        lines.push({
          type: 'h',
          coord: parseFloat(coord.toFixed(1)),
          minVal: minX - 15,
          maxVal: maxX + 15
        });
      });
    }

    return { snappedX, snappedY, lines };
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

  const renderContainerBody = (node: TaskNode, rawChildren: TaskNode[], isFullScreen = false) => {
    const containerChildren = rawChildren;

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
                onAddContainerNode(node.x, node.y, node.id);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-transform hover:scale-105 cursor-pointer"
            >
              <span className="text-xs">📦</span>
              Группа задач
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
  };

  const originalRenderContainerBody_OLD_UNUSED = (node: TaskNode, rawChildren: TaskNode[], isFullScreen = false) => {
    const viewMode = containerViewModes[node.id] || 'canvas';
    const containerChildren = viewMode === 'canvas' ? rawChildren : rawChildren.filter(n => !n.isWorkflowRectangle);

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
                          if (checkHasActiveBlockers(child.id)) return;
                          onToggleNodeCompleted(child.id); 
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-drag-ignore
                        className={`transition-colors cursor-pointer shrink-0 ${
                          checkHasActiveBlockers(child.id)
                            ? 'text-rose-500 hover:text-rose-600 dark:text-rose-455'
                            : 'text-slate-400 hover:text-indigo-650 dark:hover:text-amber-500'
                        }`}
                        title={
                          child.completed 
                            ? "Отметить невыполненной" 
                            : checkHasActiveBlockers(child.id)
                              ? "Задача заблокирована блокирующими связями"
                              : "Отметить выполненной"
                        }
                      >
                        {child.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : checkHasActiveBlockers(child.id) ? (
                          <Lock className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-in zoom-in-50" />
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
                      {(() => {
                        const childLinks = getTaskExternalLinks(child);
                        if (childLinks.length === 0) return null;
                        return childLinks.map((linkUrl, lIdx) => (
                          <a
                            key={lIdx}
                            href={linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center p-1 hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                            title={`Открыть внешнюю ссылку (${lIdx + 1}/${childLinks.length}): ${linkUrl}`}
                          >
                            <LinkIcon className="w-3.5 h-3.5 text-indigo-505" />
                          </a>
                        ));
                      })()}
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0 opacity-75 group-hover/item:opacity-100 transition-opacity">
                      {/* Pomodoro Timer Badge */}
                      {(() => {
                        const stats = getPomoStatsForNode(child, nodes);
                        return stats.pomodoroTotalTime > 0 ? (
                          <span className="text-[8.5px] font-bold text-rose-600 dark:text-rose-400 font-mono shrink-0 flex items-center gap-0.5 bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10" title={stats.isSummed ? "Включая подзадачи" : "Фокусировка Pomodoro"}>
                            🍅 {Math.round(stats.pomodoroTotalTime / 60)}м
                            {stats.isSummed && <span className="text-[7px] font-normal opacity-75">(сумма)</span>}
                          </span>
                        ) : null;
                      })()}

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
                  {selectedNodeId === child.id && (!selectedNodeIds || selectedNodeIds.length <= 1) && (
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
      const containerSavedCatId = node.savedFilters?.filterCategoryId;
      const currentActiveCategoryId = containerKanbanActiveCategory[node.id] || containerSavedCatId || (tagCategories.length > 0 ? tagCategories[0].id : '');
      const activeCategory = tagCategories.find(c => c.id === currentActiveCategoryId) || tagCategories[0];
      const activeTags = activeCategory?.tags || [];

      let columnsList: { id: string; title: string; tasks: TaskNode[]; bg?: string; border?: string; style?: React.CSSProperties; titleColor?: string }[] = [];

      if (currentGroupBy === 'status') {
        const todoTasks = containerChildren.filter(c => !c.completed && (!c.progress || c.progress === 0) && c.status !== 'waiting');
        const progressTasks = containerChildren.filter(c => !c.completed && (c.progress && c.progress > 0) && c.status !== 'waiting');
        const waitingTasks = containerChildren.filter(c => !c.completed && c.status === 'waiting');
        const doneTasks = containerChildren.filter(c => c.completed);

        columnsList = [
          { id: 'todo', title: 'План', tasks: todoTasks, bg: 'bg-slate-500/5 dark:bg-slate-900/40', border: 'border-slate-150 dark:border-slate-800/60', titleColor: 'text-slate-500 dark:text-slate-400' },
          { id: 'progress', title: 'В работе', tasks: progressTasks, bg: 'bg-amber-500/5 dark:bg-amber-950/10', border: 'border-amber-200/20 dark:border-amber-900/30', titleColor: 'text-amber-600 dark:text-amber-400' },
          { id: 'waiting', title: 'В ожидании', tasks: waitingTasks, bg: 'bg-indigo-500/5 dark:bg-indigo-950/10', border: 'border-indigo-200/20 dark:border-indigo-900/30', titleColor: 'text-indigo-600 dark:text-indigo-400' },
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
                          onClick={() => {
                            setContainerKanbanActiveCategory(prev => ({ ...prev, [node.id]: cat.id }));
                            onUpdateNode({
                              ...node,
                              savedFilters: {
                                ...(node.savedFilters || {}),
                                filterCategoryId: cat.id
                              },
                              updatedAt: new Date().toISOString()
                            });
                          }}
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
                className={`flex-1 rounded-xl border ${col.border || ''} ${col.bg || ''} p-1.5 flex flex-col min-h-0 cursor-default hover:border-slate-250 dark:hover:border-slate-800 transition-colors ${isFullScreen ? 'min-w-[200px]' : 'min-w-[130px] max-w-[170px]'}`}
                style={col.style}
              >
                <div className="flex items-center justify-between mb-1.5 px-0.5 select-none shrink-0 border-b border-slate-100/50 dark:border-slate-800/10 pb-1">
                  <span 
                    className={`text-[9.5px] font-extrabold uppercase tracking-widest leading-none truncate ${col.titleColor || 'text-slate-500'}`}
                    style={col.id !== 'uncategorized' && currentGroupBy === 'category' ? { color: activeCategory?.color } : undefined}
                  >
                    {col.title}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
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
                      title="Добавить подзадачу"
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-655 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 flex items-center justify-center pointer-events-auto"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-[8.5px] font-black bg-slate-200/55 dark:bg-slate-800 text-slate-650 dark:text-slate-350 px-1.5 py-0.5 rounded-lg font-mono leading-none">{col.tasks.length}</span>
                  </div>
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
                          if (window.innerWidth >= 1024) {
                            onOpenDrawer();
                          }
                        }}
                        className="p-2 rounded-xl border border-slate-105 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs flex flex-col gap-1.5 group/item cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-900 select-none transition-all hover:bg-slate-50/40 dark:hover:bg-slate-850/40"
                      >
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(child.id);
                            if (window.innerWidth >= 1024) {
                              onOpenDrawer();
                            }
                          }}
                          className={`font-semibold leading-relaxed cursor-pointer select-text truncate ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${child.completed ? 'line-through text-slate-420 dark:text-slate-500 font-normal' : 'text-slate-755 dark:text-slate-200 font-extrabold'}`}
                        >
                          {child.text}
                        </span>

                        {/* Render tags, progress, pomodoros, or priority badges on the cards if present */}
                        {((child.priority && child.priority !== 'none') || (child.tags && child.tags.length > 0) || child.dueDate || getPomoStatsForNode(child, nodes).pomodoroTotalTime > 0 || (child.progress && child.progress > 0)) && (
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

                            {(() => {
                              const stats = getPomoStatsForNode(child, nodes);
                              return stats.pomodoroTotalTime > 0 ? (
                                <span className="text-[7.5px] font-bold text-rose-500 dark:text-rose-455 shrink-0 flex items-center gap-0.5 bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10" title={stats.isSummed ? "Включая подзадачи" : "Фокусировка Pomodoro"}>
                                  🍅 {Math.round(stats.pomodoroTotalTime / 60)}м
                                  {stats.isSummed && <span className="text-[6.5px] font-normal opacity-75">(сумма)</span>}
                                </span>
                              ) : null;
                            })()}

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
                              if (checkHasActiveBlockers(child.id)) return;
                              onToggleNodeCompleted(child.id);
                            }}
                            disabled={checkHasActiveBlockers(child.id) && !child.completed}
                            onMouseDown={(e) => e.stopPropagation()}
                            data-drag-ignore
                            className={`p-1 px-1.5 rounded-lg text-[8px] font-black cursor-pointer transition-all ${
                              child.completed 
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-455' 
                                : checkHasActiveBlockers(child.id)
                                  ? 'bg-slate-100 text-slate-400 dark:bg-slate-850 dark:text-slate-500 cursor-not-allowed'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            }`}
                            title={
                              child.completed 
                                ? "Отметить невыполненной" 
                                : checkHasActiveBlockers(child.id)
                                  ? "Задача заблокирована блокирующими связями"
                                  : "Отметить выполненной"
                            }
                          >
                            {child.completed ? '↩ Отмена' : checkHasActiveBlockers(child.id) ? '🔒 Блок' : '✓ Вып.'}
                          </button>
                        </div>

                        {/* Quick action buttons for selected task card inside container Kanban board */}
                        {selectedNodeId === child.id && (!selectedNodeIds || selectedNodeIds.length <= 1) && (
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
                         onClick={(e) => {
                           e.stopPropagation();
                           if (checkHasActiveBlockers(child.id)) return;
                           onToggleNodeCompleted(child.id);
                         }}
                         onMouseDown={(e) => e.stopPropagation()}
                         data-drag-ignore
                         className={`transition-all cursor-pointer shrink-0 ${
                           checkHasActiveBlockers(child.id)
                             ? 'text-rose-500 hover:text-rose-600'
                             : 'text-slate-400 hover:text-indigo-600'
                         }`}
                         title={
                           child.completed 
                             ? "Отметить невыполненной" 
                             : checkHasActiveBlockers(child.id)
                               ? "Задача заблокирована блокирующими связями"
                               : "Отметить выполненной"
                         }
                       >
                         {child.completed ? (
                           <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-in fade-in zoom-in-50 duration-205" />
                         ) : checkHasActiveBlockers(child.id) ? (
                           <Lock className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 animate-in zoom-in-50" />
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
  const [isCanvasListening, setIsCanvasListening] = useState<boolean>(false);
  const [canvasSpeechText, setCanvasSpeechText] = useState<string>('');
  
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
      if (canvasRecRef.current) {
        try { canvasRecRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const startCanvasDictation = () => {
    if (!speechSupported) {
      alert('Голосовой ввод не поддерживается вашим браузером. Попробуйте Google Chrome.');
      return;
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
    onAddFloatingNode(x, y, focusedTaskId || focusedContainerId || null, taskText);
  };
  // --- END OF WEB SPEECH API INTEGRATION ---

  // Focus mode states for container fullscreen focus
  const [localFocusedContainerId, setLocalFocusedContainerId] = useState<string | null>(null);
  const focusedContainerId = propFocusedContainerId !== undefined ? propFocusedContainerId : localFocusedContainerId;
  const setFocusedContainerId = (id: string | null) => {
    if (onFocusedContainerIdChange) {
      onFocusedContainerIdChange(id);
    } else {
      setLocalFocusedContainerId(id);
    }
  };
  const [isFocusStatsMobileExpanded, setIsFocusStatsMobileExpanded] = useState<boolean>(false);
  const [isMobileViewsListExpanded, setIsMobileViewsListExpanded] = useState<boolean>(false);

  // Image resizing state
  const [imageResizingNodeId, setImageResizingNodeId] = useState<string | null>(null);
  const resizeStartWidthRef = useRef<number>(300);
  const resizeStartMouseXRef = useRef<number>(0);

  const handleImageResizeStart = (e: React.MouseEvent, node: TaskNode) => {
    e.stopPropagation();
    e.preventDefault();
    setImageResizingNodeId(node.id);
    resizeStartWidthRef.current = node.width || 300;
    resizeStartMouseXRef.current = e.clientX;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - resizeStartMouseXRef.current;
      const newWidth = Math.max(100, Math.min(1200, resizeStartWidthRef.current + dx * 2));
      onUpdateNode({
        ...node,
        width: newWidth
      });
    };
    
    const handleMouseUp = () => {
      setImageResizingNodeId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleImageResizeTouchStart = (e: React.TouchEvent, node: TaskNode) => {
    e.stopPropagation();
    if (e.touches.length === 0) return;
    setImageResizingNodeId(node.id);
    resizeStartWidthRef.current = node.width || 300;
    resizeStartMouseXRef.current = e.touches[0].clientX;
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      const dx = moveEvent.touches[0].clientX - resizeStartMouseXRef.current;
      const newWidth = Math.max(100, Math.min(1200, resizeStartWidthRef.current + dx * 2));
      onUpdateNode({
        ...node,
        width: newWidth
      });
    };
    
    const handleTouchEnd = () => {
      setImageResizingNodeId(null);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
    
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  // Reset focus mode if the focused container is deleted or project is switched
  useEffect(() => {
    if (focusedContainerId && !nodes.some(n => n.id === focusedContainerId)) {
      setFocusedContainerId(null);
    }
  }, [nodes, focusedContainerId]);

  // Propagate focus state change up to parent to hide top app header on mobile
  useEffect(() => {
    if (onContainerFocusChange) {
      onContainerFocusChange(!!focusedContainerId);
    }
  }, [focusedContainerId, onContainerFocusChange]);

  const canvasImageFileInputRef = useRef<HTMLInputElement>(null);

  const handleAddImageToCanvas = async (file: File) => {
    setFileError(null);
    const newAttachment = await uploadFileWithToken(file);
    if (!newAttachment) return;

    const x = Math.round(-panX / zoom);
    const y = Math.round(-panY / zoom);

    onAddFloatingNode(
      x,
      y,
      focusedContainerId || focusedTaskId || null,
      file.name.substring(0, file.name.lastIndexOf('.')) || 'Изображение',
      { files: [newAttachment], isNotTask: true, useExactCoordinates: !!focusedContainerId }
    );
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))) {
        return;
      }

      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleAddImageToCanvas(file);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [panX, panY, zoom, focusedContainerId, focusedTaskId, nodes]);

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
    onAddFloatingNode(coords.x, coords.y, focusedContainerId || focusedTaskId, undefined, { useExactCoordinates: true });
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

    // First attempt: Check for hover/overlap with regular non-container task nodes (containers can also overlap and snap here)
    const normalNodeOverlap = visibleNodes.find(otherNode => {
      if (otherNode.id === draggingId) return false;
      if (draggingNode.isContainer) return false; // Containers cannot be parented under normal task nodes
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
      if (!otherNode.isContainer) return false;

      // Relaxed constraint: Containers CAN go inside other containers
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
      
      // All containers are always collapsed on the main canvas (width 220, height 100)
      const targetW = 220;
      const targetH = 100;
      
      // Width and height of the dragging node
      const dragW = draggingNode.isContainer ? 220 : getNodeWidth(draggingNode);
      const dragH = draggingNode.isContainer ? 100 : getNodeHeight(draggingNode);

      // Check if they visually overlap/intersect
      const halfW = (dragW + targetW) / 2;
      const halfH = (dragH + targetH) / 2;
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
    if (e.ctrlKey) return; // Prevent panning when Ctrl is held for multi-selection
    if (isButtonOrCardInput(e)) return;
    
    // Close dropdowns
    setIsElementDropdownOpen(false);

    // Record mouse click start position and target
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    mouseDownTargetRef.current = e.target as HTMLElement;

    // Deselect selected node when clicking on an empty space
    onSelectNode(null);
    setSelectedConnectionId(null);

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

        // Draw.io style matching and snapping logic:
        let bestNodeId: string | null = null;
        let bestSide: 'top' | 'right' | 'bottom' | 'left' | null = null;
        let minDistance = Infinity;

        for (const n of nodes) {
          if (n.id === activeConnector.nodeId) continue;

          const w = getNodeWidth(n);
          const h = getNodeHeight(n);

          // 4 anchor points for each target node
          const anchors = [
            { side: 'top' as const, x: n.x, y: n.y - h / 2 },
            { side: 'right' as const, x: n.x + w / 2, y: n.y },
            { side: 'bottom' as const, x: n.x, y: n.y + h / 2 },
            { side: 'left' as const, x: n.x - w / 2, y: n.y }
          ];

          for (const anchor of anchors) {
            const distance = Math.hypot(canvasX - anchor.x, canvasY - anchor.y);
            if (distance < minDistance) {
              minDistance = distance;
              bestNodeId = n.id;
              bestSide = anchor.side;
            }
          }

          // If inside the node boundary with a tiny margin, find nearest side
          const isInsideNode = (
            canvasX >= n.x - w / 2 - 20 &&
            canvasX <= n.x + w / 2 + 20 &&
            canvasY >= n.y - h / 2 - 20 &&
            canvasY <= n.y + h / 2 + 20
          );

          if (isInsideNode) {
            const distToLeft = Math.abs(canvasX - (n.x - w / 2));
            const distToRight = Math.abs(canvasX - (n.x + w / 2));
            const distToTop = Math.abs(canvasY - (n.y - h / 2));
            const distToBottom = Math.abs(canvasY - (n.y + h / 2));

            const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            let edgeSide: 'top' | 'right' | 'bottom' | 'left' = 'left';
            if (minEdgeDist === distToTop) edgeSide = 'top';
            else if (minEdgeDist === distToRight) edgeSide = 'right';
            else if (minEdgeDist === distToBottom) edgeSide = 'bottom';
            else if (minEdgeDist === distToLeft) edgeSide = 'left';

            if (minEdgeDist < minDistance) {
              minDistance = minEdgeDist;
              bestNodeId = n.id;
              bestSide = edgeSide;
            }
          }
        }

        // Draw.io style snapping threshold (60px)
        let px = canvasX;
        let py = canvasY;
        let finalNodeId: string | null = null;
        let finalSide: 'top' | 'right' | 'bottom' | 'left' | null = null;

        if (bestNodeId && bestSide && minDistance < 60) {
          finalNodeId = bestNodeId;
          finalSide = bestSide;
          const targetNode = nodes.find(n => n.id === bestNodeId);
          if (targetNode) {
            const tw = getNodeWidth(targetNode);
            const th = getNodeHeight(targetNode);
            px = targetNode.x;
            py = targetNode.y;
            
            if (bestSide === 'top') py -= th / 2;
            else if (bestSide === 'right') px += tw / 2;
            else if (bestSide === 'bottom') py += th / 2;
            else if (bestSide === 'left') px -= tw / 2;
          }
        }

        setMousePos({ x: px, y: py });
        setHoveredNodeId(finalNodeId);
        setHoveredSide(finalSide);
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
        const w = getNodeWidth(node);
        const h = getNodeHeight(node);
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

        setLocalNodes(prev =>
          prev.map(n =>
            n.id === resizingNodeId
              ? {
                  ...n,
                  zoneWidth: Math.round(newWidth),
                  zoneHeight: Math.round(newHeight),
                  zoneOffsetX: Math.round(newOffsetX),
                  zoneOffsetY: Math.round(newOffsetY)
                }
              : n
          )
        );
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

      setLocalNodes(prev =>
        prev.map(n =>
          n.id === resizingNodeId
            ? {
                ...n,
                x: newCenterX,
                y: newCenterY,
                width: newWidth,
                height: newHeight
              }
            : n
        )
      );
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

      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        setHasDraggedNode(true);
        didDragRef.current = true;
      }

      const { snappedX, snappedY, lines } = getSnapAndLines(draggingNodeId, newX, newY, nodes);

      handleLocalUpdateCoordinates(draggingNodeId, snappedX, snappedY);
      setAlignmentLines(lines);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = snappedX - cardW / 2;
        const nodeRight = snappedX + cardW / 2;
        const nodeTop = snappedY - cardH / 2;
        const nodeBottom = snappedY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;

        if (nodeLeft - padding < currentLeft) {
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          needsResize = true;
        }

        if (needsResize) {
          // Keep x and y center coordinates strictly unchanged.
          // Grow W and H symmetrically around the center.
          const currentX = parentContainer.x;
          const currentY = parentContainer.y;
          
          const halfW = Math.max(W / 2, Math.abs(currentX - (nodeLeft - padding)), Math.abs((nodeRight + padding) - currentX));
          const halfH = Math.max(H / 2, Math.abs(currentY - (nodeTop - padding)), Math.abs((nodeBottom + padding) - currentY));
          
          const newW = Math.round(halfW * 2);
          const newH = Math.round(halfH * 2);

          setLocalNodes(prev => prev.map(n => {
            if (n.id === parentContainer.id) {
              return {
                ...n,
                width: newW,
                height: newH
              };
            }
            return n;
          }));
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, snappedX, snappedY);

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

  const handleMouseUp = (e?: React.MouseEvent) => {
    setIsPanning(false);
    setAlignmentLines([]);

    if (e && mouseDownPosRef.current && mouseDownTargetRef.current) {
      const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
      const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
      const target = e.target as HTMLElement;



      mouseDownPosRef.current = null;
      mouseDownTargetRef.current = null;
    }

    if (resizingNodeId) {
      const finalResized = localNodes.find(n => n.id === resizingNodeId);
      if (finalResized) {
        onUpdateNode(finalResized);
      }
      setResizingNodeId(null);
      setResizeDirection(null);
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
        if (node.parentId) {
          const localParent = localNodes.find(p => p.id === node.parentId);
          const incomingParent = incomingNodes.find(p => p.id === node.parentId);
          if (localParent && incomingParent && (localParent.width !== incomingParent.width || localParent.height !== incomingParent.height)) {
            onUpdateNode(localParent);
          }
        }
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
              const dragW = node.isContainer ? 220 : getNodeWidth(node);
              const dragH = node.isContainer ? 100 : getNodeHeight(node);
              const maxW = (dragW + 220) / 2;
              const maxH = (dragH + 100) / 2;
              shouldDetach = dx >= maxW || dy >= maxH;
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
            // Dragged away from standard parent -> do not auto-detach on drag (only via detach button)
          }
        }
      }
    }

    setDraggingNodeId(null);
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
    
    // Record touch start position and target for tap detection
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartTargetRef.current = target;

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
            if (!selectedNodeIds || !selectedNodeIds.includes(nodeId)) {
              onSelectNode(nodeId);
            }

            if (navigator.vibrate) {
              try { navigator.vibrate(60); } catch (err) {}
            }
          }, 500);

          e.stopPropagation();
          return;
        }
      }
    }

    // Otherwise pan canvas (or start touch hold timer for multi-selection)
    onSelectNode(null);
    setSelectedConnectionId(null);
    
    if (touchSelectionTimerRef.current) clearTimeout(touchSelectionTimerRef.current);
    setIsTouchSelecting(false);
    isTouchSelectingRef.current = false;
    setTouchSelectionStart(null);
    setTouchSelectionEnd(null);

    const startX = touch.clientX;
    const startY = touch.clientY;
    setTouchSelectionStart({ x: startX, y: startY });

    touchSelectionTimerRef.current = setTimeout(() => {
      setIsTouchSelecting(true);
      isTouchSelectingRef.current = true;
      setTouchSelectionEnd({ x: startX, y: startY });
      setIsPanning(false); // Stop panning when selecting!
      
      if (navigator.vibrate) {
        try { navigator.vibrate(60); } catch (err) {}
      }
    }, 500);

    setIsPanning(true);
    setPanStart({ x: touch.clientX - panX, y: touch.clientY - panY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Check if we are long-pressing to select empty space
    if (touchSelectionStart && touchSelectionTimerRef.current && !isTouchSelectingRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchSelectionStart.x;
      const dy = touch.clientY - touchSelectionStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // If moved more than 15px before the timer fired, cancel selection and allow panning
      if (dist > 15) {
        clearTimeout(touchSelectionTimerRef.current);
        touchSelectionTimerRef.current = null;
      }
    }

    if (isTouchSelectingRef.current) {
      const touch = e.touches[0];
      setTouchSelectionEnd({ x: touch.clientX, y: touch.clientY });
      e.preventDefault(); // prevent native scrolling and panning
      return;
    }

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

        // Draw.io style matching and snapping logic for touch
        let bestNodeId: string | null = null;
        let bestSide: 'top' | 'right' | 'bottom' | 'left' | null = null;
        let minDistance = Infinity;

        for (const n of nodes) {
          if (n.id === activeConnector.nodeId) continue;

          const w = getNodeWidth(n);
          const h = getNodeHeight(n);

          const anchors = [
            { side: 'top' as const, x: n.x, y: n.y - h / 2 },
            { side: 'right' as const, x: n.x + w / 2, y: n.y },
            { side: 'bottom' as const, x: n.x, y: n.y + h / 2 },
            { side: 'left' as const, x: n.x - w / 2, y: n.y }
          ];

          for (const anchor of anchors) {
            const distance = Math.hypot(canvasX - anchor.x, canvasY - anchor.y);
            if (distance < minDistance) {
              minDistance = distance;
              bestNodeId = n.id;
              bestSide = anchor.side;
            }
          }

          const isInsideNode = (
            canvasX >= n.x - w / 2 - 20 &&
            canvasX <= n.x + w / 2 + 20 &&
            canvasY >= n.y - h / 2 - 20 &&
            canvasY <= n.y + h / 2 + 20
          );

          if (isInsideNode) {
            const distToLeft = Math.abs(canvasX - (n.x - w / 2));
            const distToRight = Math.abs(canvasX - (n.x + w / 2));
            const distToTop = Math.abs(canvasY - (n.y - h / 2));
            const distToBottom = Math.abs(canvasY - (n.y + h / 2));

            const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            let edgeSide: 'top' | 'right' | 'bottom' | 'left' = 'left';
            if (minEdgeDist === distToTop) edgeSide = 'top';
            else if (minEdgeDist === distToRight) edgeSide = 'right';
            else if (minEdgeDist === distToBottom) edgeSide = 'bottom';
            else if (minEdgeDist === distToLeft) edgeSide = 'left';

            if (minEdgeDist < minDistance) {
              minDistance = minEdgeDist;
              bestNodeId = n.id;
              bestSide = edgeSide;
            }
          }
        }

        let px = canvasX;
        let py = canvasY;
        let finalNodeId: string | null = null;
        let finalSide: 'top' | 'right' | 'bottom' | 'left' | null = null;

        if (bestNodeId && bestSide && minDistance < 60) {
          finalNodeId = bestNodeId;
          finalSide = bestSide;
          const targetNode = nodes.find(n => n.id === bestNodeId);
          if (targetNode) {
            const tw = getNodeWidth(targetNode);
            const th = getNodeHeight(targetNode);
            px = targetNode.x;
            py = targetNode.y;
            
            if (bestSide === 'top') py -= th / 2;
            else if (bestSide === 'right') px += tw / 2;
            else if (bestSide === 'bottom') py += th / 2;
            else if (bestSide === 'left') px -= tw / 2;
          }
        }

        setMousePos({ x: px, y: py });
        setHoveredNodeId(finalNodeId);
        setHoveredSide(finalSide);
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
        const w = getNodeWidth(node);
        const h = getNodeHeight(node);
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

        setLocalNodes(prev =>
          prev.map(n =>
            n.id === resizingNodeId
              ? {
                  ...n,
                  zoneWidth: Math.round(newWidth),
                  zoneHeight: Math.round(newHeight),
                  zoneOffsetX: Math.round(newOffsetX),
                  zoneOffsetY: Math.round(newOffsetY)
                }
              : n
          )
        );
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

      setLocalNodes(prev =>
        prev.map(n =>
          n.id === resizingNodeId
            ? {
                ...n,
                x: newCenterX,
                y: newCenterY,
                width: newWidth,
                height: newHeight
              }
            : n
        )
      );
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

      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        setHasDraggedNode(true);
        didDragRef.current = true;
      }

      const { snappedX, snappedY, lines } = getSnapAndLines(draggingNodeId, newX, newY, nodes);

      handleLocalUpdateCoordinates(draggingNodeId, snappedX, snappedY);
      setAlignmentLines(lines);

      // Auto-expand container if children are pushed close to or outside the container bounds (only in focus mode)
      const parentContainer = (node.parentId && node.parentId === focusedContainerId) ? nodes.find(p => p.id === node.parentId && p.isContainer) : null;
      if (parentContainer) {
        const W = parentContainer.width || 520;
        const H = parentContainer.height || 400;

        const cardW = 210;
        const cardH = 110;

        const nodeLeft = snappedX - cardW / 2;
        const nodeRight = snappedX + cardW / 2;
        const nodeTop = snappedY - cardH / 2;
        const nodeBottom = snappedY + cardH / 2;

        const currentLeft = parentContainer.x - W / 2;
        const currentRight = parentContainer.x + W / 2;
        const currentTop = parentContainer.y - H / 2;
        const currentBottom = parentContainer.y + H / 2;

        const padding = 35;

        let needsResize = false;

        if (nodeLeft - padding < currentLeft) {
          needsResize = true;
        }
        if (nodeRight + padding > currentRight) {
          needsResize = true;
        }
        if (nodeTop - padding < currentTop) {
          needsResize = true;
        }
        if (nodeBottom + padding > currentBottom) {
          needsResize = true;
        }

        if (needsResize) {
          // Keep x and y center coordinates strictly unchanged.
          // Grow W and H symmetrically around the center.
          const currentX = parentContainer.x;
          const currentY = parentContainer.y;
          
          const halfW = Math.max(W / 2, Math.abs(currentX - (nodeLeft - padding)), Math.abs((nodeRight + padding) - currentX));
          const halfH = Math.max(H / 2, Math.abs(currentY - (nodeTop - padding)), Math.abs((nodeBottom + padding) - currentY));
          
          const newW = Math.round(halfW * 2);
          const newH = Math.round(halfH * 2);

          setLocalNodes(prev => prev.map(n => {
            if (n.id === parentContainer.id) {
              return {
                ...n,
                width: newW,
                height: newH
              };
            }
            return n;
          }));
        }
      }

      // Check support for re-parenting by hovering over another task card or container
      const overlapNode = getOverlapParent(draggingNodeId, snappedX, snappedY);

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
    setAlignmentLines([]);
    // If in focus mode, single tap task creation is disabled.
    if (touchStartPosRef.current && touchStartTargetRef.current) {
      touchStartPosRef.current = null;
      touchStartTargetRef.current = null;
    }

    if (resizingNodeId) {
      const finalResized = localNodes.find(n => n.id === resizingNodeId);
      if (finalResized) {
        onUpdateNode(finalResized);
      }
    }
    setResizingNodeId(null);
    setResizeDirection(null);

    if (touchSelectionTimerRef.current) {
      clearTimeout(touchSelectionTimerRef.current);
      touchSelectionTimerRef.current = null;
    }

    if (isTouchSelecting) {
      // We finished selecting! Let's calculate which nodes are within the rectangle
      if (touchSelectionStart && touchSelectionEnd) {
        const getCanvasCoords = (screenX: number, screenY: number) => {
          if (!containerRef.current) return { x: 0, y: 0 };
          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const cursorX = screenX - rect.left;
          const cursorY = screenY - rect.top;
          return {
            x: (cursorX - centerX - panX) / zoom,
            y: (cursorY - centerY - panY) / zoom
          };
        };

        const startCanvas = getCanvasCoords(touchSelectionStart.x, touchSelectionStart.y);
        const endCanvas = getCanvasCoords(touchSelectionEnd.x, touchSelectionEnd.y);

        const minX = Math.min(startCanvas.x, endCanvas.x);
        const maxX = Math.max(startCanvas.x, endCanvas.x);
        const minY = Math.min(startCanvas.y, endCanvas.y);
        const maxY = Math.max(startCanvas.y, endCanvas.y);

        // Find all visible nodes whose center is inside the rectangle
        const selectedIds = visibleNodes
          .filter(n => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY)
          .map(n => n.id);

        if (selectedIds.length > 0 && onSelectNodes) {
          onSelectNodes(selectedIds);
        }
      }

      setIsTouchSelecting(false);
      isTouchSelectingRef.current = false;
      setTouchSelectionStart(null);
      setTouchSelectionEnd(null);
      return; // prevent other touch-end behaviors
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
          if (node.parentId) {
            const localParent = localNodes.find(p => p.id === node.parentId);
            const incomingParent = incomingNodes.find(p => p.id === node.parentId);
            if (localParent && incomingParent && (localParent.width !== incomingParent.width || localParent.height !== incomingParent.height)) {
              onUpdateNode(localParent);
            }
          }
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
                const dragW = node.isContainer ? 220 : getNodeWidth(node);
                const dragH = node.isContainer ? 100 : getNodeHeight(node);
                const maxW = (dragW + 220) / 2;
                const maxH = (dragH + 100) / 2;
                shouldDetach = dx >= maxW || dy >= maxH;
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
              // Dragged away from standard parent -> do not auto-detach on drag (only via detach button)
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

  // Find the closest ancestor container for a given node (if any)
  const getAncestorContainer = (nodeId: string | null): TaskNode | null => {
    if (!nodeId) return null;
    const parent = nodes.find(n => n.id === nodeId);
    if (!parent) return null;
    if (parent.isContainer) return parent;
    return getAncestorContainer(parent.parentId);
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
      if (!flow.isWorkflowRectangle || flow.isZoneTriggerDisabled) return;

      // Ensure that triggers in containers only affect tasks in the same container,
      // and triggers outside containers only affect tasks outside containers.
      const flowContainer = getAncestorContainer(flow.id);
      const movedContainer = getAncestorContainer(movedNode.id);
      const flowContainerId = flowContainer ? flowContainer.id : null;
      const movedContainerId = movedContainer ? movedContainer.id : null;

      if (flowContainerId !== movedContainerId) return;

      const w = getNodeWidth(flow);
      const h = getNodeHeight(flow);
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
    
    const w = getNodeWidth(node);
    const h = getNodeHeight(node);
    
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
    setHoveredNodeId(null);
    setHoveredSide(null);
  };

  const handleArrangeChildrenRadial = (parentId: string) => {
    setIsAutoArranging(true);
    
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) {
      setIsAutoArranging(false);
      return;
    }

    // Define tree interface internally for strict type safety
    interface MindMapNode {
      id: string;
      width: number;
      height: number;
      node: TaskNode;
      children: MindMapNode[];
      vSpan: number;
    }

    // Recursive helper to build subtrees of descendants
    const buildSubtree = (pId: string): MindMapNode[] => {
      const childTasks = nodes.filter(n => 
        n.parentId === pId && 
        !n.archived && 
        !n.isContainer && 
        !n.isWorkflowRectangle
      );
      
      return childTasks.map(t => {
        const nodeWidth = t.width || 210;
        const nodeHeight = t.height || 70;
        return {
          id: t.id,
          width: nodeWidth,
          height: nodeHeight,
          node: t,
          children: buildSubtree(t.id),
          vSpan: 0
        };
      });
    };

    const rootChildren = buildSubtree(parentId);
    if (rootChildren.length === 0) {
      setIsAutoArranging(false);
      return;
    }

    // Recursive helper to compute vertical spans of each subtree
    const computeVSpan = (mNode: MindMapNode): number => {
      if (mNode.children.length === 0) {
        mNode.vSpan = mNode.height;
      } else {
        mNode.children.forEach(child => computeVSpan(child));
        const childrenSum = mNode.children.reduce((sum, child) => sum + child.vSpan, 0);
        const spacing = 24; // beautiful vertical gap
        const totalSpacing = (mNode.children.length - 1) * spacing;
        mNode.vSpan = Math.max(mNode.height, childrenSum + totalSpacing);
      }
      return mNode.vSpan;
    };

    // Split immediate children into Left and Right groups symmetrically
    const leftGroup: MindMapNode[] = [];
    const rightGroup: MindMapNode[] = [];
    
    rootChildren.forEach((child, index) => {
      if (index % 2 === 0) {
        rightGroup.push(child);
      } else {
        leftGroup.push(child);
      }
    });

    // Compute vertical spans for both groups
    leftGroup.forEach(child => computeVSpan(child));
    rightGroup.forEach(child => computeVSpan(child));

    const horizontalStep = 300; // Spacious horizontal distance between levels
    const spacing = 24; // Sibling separation gap

    const plannedCoords: { [id: string]: { x: number; y: number } } = {};
    const movedNodeIds = new Set<string>();

    const setPosition = (id: string, x: number, y: number) => {
      plannedCoords[id] = { x, y };
      movedNodeIds.add(id);
    };

    // Recursive helper to assign coordinates to descendants
    const layoutSubtree = (parentNode: MindMapNode, parentX: number, parentY: number, direction: 1 | -1) => {
      if (parentNode.children.length === 0) return;
      
      const totalVSpan = parentNode.children.reduce((sum, child) => sum + child.vSpan, 0) + (parentNode.children.length - 1) * spacing;
      let currentY = parentY - totalVSpan / 2;
      const childX = parentX + direction * horizontalStep;

      parentNode.children.forEach(child => {
        const childY = currentY + child.vSpan / 2;
        setPosition(child.id, childX, childY);
        
        // Recursively position sub-children outward in the same direction
        layoutSubtree(child, childX, childY, direction);
        
        currentY += child.vSpan + spacing;
      });
    };

    // Position Right Group
    if (rightGroup.length > 0) {
      const rightTotalVSpan = rightGroup.reduce((sum, n) => sum + n.vSpan, 0) + (rightGroup.length - 1) * spacing;
      let currentY = parent.y - rightTotalVSpan / 2;
      const childX = parent.x + horizontalStep;

      rightGroup.forEach(child => {
        const childY = currentY + child.vSpan / 2;
        setPosition(child.id, childX, childY);
        layoutSubtree(child, childX, childY, 1);
        currentY += child.vSpan + spacing;
      });
    }

    // Position Left Group
    if (leftGroup.length > 0) {
      const leftTotalVSpan = leftGroup.reduce((sum, n) => sum + n.vSpan, 0) + (leftGroup.length - 1) * spacing;
      let currentY = parent.y - leftTotalVSpan / 2;
      const childX = parent.x - horizontalStep;

      leftGroup.forEach(child => {
        const childY = currentY + child.vSpan / 2;
        setPosition(child.id, childX, childY);
        layoutSubtree(child, childX, childY, -1);
        currentY += child.vSpan + spacing;
      });
    }

    // Collision resolution loop to prevent ANY overlaps
    const numIterations = 100;
    const horizontalGap = 45;
    const verticalGap = 35;

    for (let iter = 0; iter < numIterations; iter++) {
      let hasOverlap = false;

      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i];
        if (nodeA.archived) continue;

        const isAMoved = movedNodeIds.has(nodeA.id);
        const posA = isAMoved ? plannedCoords[nodeA.id] : { x: nodeA.x, y: nodeA.y };
        const wA = nodeA.width || (nodeA.isContainer ? 520 : (nodeA.isWorkflowRectangle ? 170 : 210));
        const hA = nodeA.height || (nodeA.isContainer ? 400 : (nodeA.isWorkflowRectangle ? 70 : 70));

        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j];
          if (nodeB.archived) continue;

          const isBMoved = movedNodeIds.has(nodeB.id);
          // If neither node is being moved, their positions are fixed
          if (!isAMoved && !isBMoved) continue;

          const posB = isBMoved ? plannedCoords[nodeB.id] : { x: nodeB.x, y: nodeB.y };
          const wB = nodeB.width || (nodeB.isContainer ? 520 : (nodeB.isWorkflowRectangle ? 170 : 210));
          const hB = nodeB.height || (nodeB.isContainer ? 400 : (nodeB.isWorkflowRectangle ? 70 : 70));

          const dx = posA.x - posB.x;
          const dy = posA.y - posB.y;

          const minX = (wA + wB) / 2 + horizontalGap;
          const minY = (hA + hB) / 2 + verticalGap;

          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            hasOverlap = true;

            const overlapY = minY - Math.abs(dy);
            const dirY = dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy);

            if (isAMoved && isBMoved) {
              plannedCoords[nodeA.id].y += (overlapY / 2) * dirY;
              plannedCoords[nodeB.id].y -= (overlapY / 2) * dirY;
            } else if (isAMoved) {
              plannedCoords[nodeA.id].y += overlapY * dirY;
            } else if (isBMoved) {
              plannedCoords[nodeB.id].y -= overlapY * dirY;
            }
          }
        }
      }

      if (!hasOverlap) break;
    }

    // Apply finalized coordinate changes
    Object.keys(plannedCoords).forEach(id => {
      onUpdateNodeCoordinates(id, Math.round(plannedCoords[id].x), Math.round(plannedCoords[id].y));
    });

    setTimeout(() => {
      setIsAutoArranging(false);
    }, 850);
  };

  // Start dragging a node from Mouse Down
  const startDragNode = (e: React.MouseEvent, node: TaskNode) => {
    if (isButtonOrCardInput(e)) return;
    
    // If Ctrl is held, prevent node drag and let onClick handle selection
    if (e.ctrlKey) {
      e.stopPropagation();
      return;
    }
    
    if (node.id === focusedContainerId) return; // Disable dragging the container if it's currently focused in fullscreen
    
    e.stopPropagation();
    
    // If the node is NOT already in selectedNodeIds, reset selection to just this node
    if (!selectedNodeIds || !selectedNodeIds.includes(node.id)) {
      onSelectNode(node.id, e);
    }
    
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
    setLocalNodes(incomingNodes); // Pre-sync state to prevent jump
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
    setLocalNodes(incomingNodes); // Pre-sync state to prevent jump
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
          color: '#f05c60'
        };
      case 'high':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60',
          dot: 'bg-amber-500',
          label: 'HIGH',
          color: '#f39b3d'
        };
      case 'medium':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60',
          dot: 'bg-blue-500',
          label: 'MEDIUM',
          color: '#7e85eb'
        };
      case 'low':
        return {
          bg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900',
          dot: 'bg-teal-500',
          label: 'LOW',
          color: '#57be6a'
        };
      default:
        return {
          bg: 'bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800',
          dot: 'bg-slate-300',
          label: 'NONE',
          color: '#aeaaca'
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

  // Find the closest ancestor container (moved up to checkWorkflowTriggerCollisions)

  // Trace parent nodes back to root to determine if any ancestor is collapsed, or filtered by focus mode
  const visibleNodes = nodes.filter(node => {
    if (node.parentId === 'inbox') return false;

    // If search is active and this node matches the search, force it to be visible on the canvas!
    if (searchQuery.trim() !== "" && isNodeMatched(node)) {
      return true;
    }

    // Collapse/hide completed child nodes from mindmap canvas view so they collapse and don't obstruct the view (unless under a container list/kanban, or when searching/filtering)
    if (node.completed && node.parentId !== null && filterStatus !== 'completed' && !searchQuery.trim()) {
      const parentNode = nodes.find(n => n.id === node.parentId);
      if (parentNode && !parentNode.isContainer) {
        return false;
      }
    }

    // Filter by task focus mode: if a specific task is focused, show only that task and its descendants/subtasks
    if (focusedTaskId) {
      if (node.id === focusedTaskId) return true;
      
      let isDescendantOfFocused = false;
      let currentParentId = node.parentId;
      while (currentParentId !== null) {
        if (currentParentId === focusedTaskId) {
          isDescendantOfFocused = true;
          break;
        }
        const findParent = nodes.find(n => n.id === currentParentId);
        if (!findParent) break;
        currentParentId = findParent.parentId;
      }
      
      if (!isDescendantOfFocused) return false;
      
      // Since it is a descendant, it must not have collapsed ancestors up to and including the focusedTaskId itself
      currentParentId = node.parentId;
      while (currentParentId !== null) {
        const parent = nodes.find(n => n.id === currentParentId);
        if (!parent) break;
        if (parent.collapsed) {
          return false;
        }
        if (currentParentId === focusedTaskId) {
          break;
        }
        currentParentId = parent.parentId;
      }
      return true;
    }

    // Normal / Focus container modes
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
      
      // Since it is a descendant, it must not have collapsed ancestors OR any nested container ancestors *between* itself and the focused container
      currentParentId = node.parentId;
      while (currentParentId !== null && currentParentId !== focusedContainerId) {
        const parent = nodes.find(n => n.id === currentParentId);
        if (!parent) break;
        if (parent.isContainer) {
          return false; // Hidden because it's inside a nested sub-container which is not focused
        }
        if (parent.collapsed) {
          return false; // Hidden because some ancestor inside the container is collapsed
        }
        currentParentId = parent.parentId;
      }
      return true;
    }

    // Normal mode (not focused on any container): hide all descendants of any container
    let currentParentId = node.parentId;
    while (currentParentId !== null) {
      const parent = nodes.find(n => n.id === currentParentId);
      if (!parent) break;
      if (parent.isContainer) {
        return false; // Hidden from main canvas because it is inside a container
      }
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
      className={`relative select-none overflow-hidden bg-white dark:bg-slate-950 outline-none transition-all duration-300 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'flex-1 h-full'
      } ${focusedContainerId ? 'ring-4 ring-amber-500/15 ring-inset shadow-[inset_0_0_80px_rgba(245,158,11,0.05)]' : ''}`}
      style={{
        backgroundImage: `radial-gradient(${darkMode ? '#3b375b' : '#cccae0'} 1.2px, transparent 1.2px)`,
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
      {/* Immersive Task Focus Banner */}
      {focusedTaskId && (() => {
        const focusedTask = nodes.find(n => n.id === focusedTaskId);
        return (
          <div className="absolute top-4 left-4 z-50 flex items-center gap-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 border border-rose-250 dark:border-rose-900/40 rounded-xl shadow-[0_8px_20px_-6px_rgba(239,68,68,0.25)] select-none animate-in fade-in slide-in-from-top-2">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 font-sans truncate max-w-[200px]">
              Фокус: <strong className="font-extrabold text-rose-600 dark:text-rose-400">{focusedTask?.text || 'Задача'}</strong>
            </span>
            <button
              onClick={() => {
                if (onFocusedTaskIdChange) {
                  onFocusedTaskIdChange(focusedTask?.parentId || null);
                }
              }}
              className="text-[10px] font-black text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 uppercase tracking-wider hover:scale-105 transition-transform px-1.5 py-0.5 bg-rose-50 dark:bg-rose-950/40 rounded-md cursor-pointer border border-rose-100 dark:border-rose-900/30"
              title={focusedTask?.parentId ? "Вернуться к родительской задаче" : "Выйти из режима фокуса"}
            >
              Назад
            </button>
          </div>
        );
      })()}

      {/* Floating Full Screen Control on Top Right */}
      {!focusedContainerId && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={`p-2.5 rounded-lg border shadow-md transition-all cursor-pointer flex items-center justify-center shrink-0 outline-none ${
              isFullScreen 
                ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-805 text-amber-600 dark:text-amber-400' 
                : 'bg-white/95 dark:bg-slate-905/95 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'
            }`}
            title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
          >
            {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Immersive Focused Container Top Stats Bar */}
      {focusedContainerId && (() => {
        const focusedContainer = nodes.find(n => n.id === focusedContainerId);
        if (!focusedContainer) return null;
        
        const containerChildren = nodes.filter(n => n.parentId === focusedContainerId);
        const totalChildren = containerChildren.length;
        const completedChildren = containerChildren.filter(n => n.completed).length;
        const progress = calculateProgress(focusedContainerId, nodes) || 0;
        
        return (
          <div className="absolute top-0 left-0 right-0 md:top-4 md:left-1/2 md:transform md:-translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b md:border border-amber-200 dark:border-amber-900/60 rounded-none md:rounded-2xl shadow-md md:shadow-xl transition-all duration-350 animate-in fade-in slide-in-from-top-4 w-full md:w-[96vw] overflow-hidden flex flex-col">
            
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
                return (
                  <div className="px-3 pb-2.5 pt-1.5 flex flex-col gap-2 bg-white dark:bg-slate-900 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center gap-2 w-full">
                      <button
                        onClick={() => {
                          const x = Math.round(-panX / zoom);
                          const y = Math.round(-panY / zoom);
                          onAddFloatingNode(x, y, focusedContainerId, 'Workflow Шаг', { isWorkflowRectangle: true });
                          setIsFocusStatsMobileExpanded(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 h-[38px] rounded-xl text-[10px] uppercase tracking-wider font-extrabold bg-indigo-500 hover:bg-indigo-600 text-white shadow-xs cursor-pointer"
                        title="Добавить шаг workflow"
                      >
                        <Network className="w-3.5 h-3.5 text-white" />
                        <span>+ Шаг Workflow</span>
                      </button>

                      <button
                        onClick={() => {
                          const x = Math.round(-panX / zoom);
                          const y = Math.round(-panY / zoom);
                          onAddFloatingNode(x, y, focusedContainerId);
                          setIsFocusStatsMobileExpanded(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 h-[38px] rounded-xl text-[10px] uppercase tracking-wider font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs cursor-pointer"
                        title="Добавить задачу"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-white" />
                        <span>+ Задача</span>
                      </button>
                    </div>
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
        <div className="hidden lg:flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
          <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
            Перемещение: ЛКМ / Жест. Масштаб:
          </span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-1 bg-indigo-50 dark:bg-indigo-950/40 rounded">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      <div className="absolute bottom-12 right-4 sm:bottom-4 sm:right-4 z-40 flex flex-col gap-3 items-end">
        {/* Кнопка списка контейнеров */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsContainersDropdownOpen(!isContainersDropdownOpen);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none`}
            title="Контейнеры проекта"
          >
            <Layers className="w-5 h-5" />
          </button>

          {isContainersDropdownOpen && (
            <div
              className="absolute bottom-12 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3.5 w-72 z-50 flex flex-col gap-2 origin-bottom-right animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Контейнеры проекта
                </span>
                <span className="text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                  {nodes.filter(n => n.isContainer && !n.archived).length}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {(() => {
                  const containers = nodes.filter(n => n.isContainer && !n.archived);
                  if (containers.length === 0) {
                    return (
                      <div className="text-center py-6 text-slate-400 dark:text-slate-500 flex flex-col items-center gap-1.5">
                        <Layers className="w-8 h-8 opacity-40 stroke-[1.5]" />
                        <span className="text-xs font-medium">Нет активных контейнеров</span>
                        <p className="text-[10px] opacity-75 max-w-[180px]">
                          Создайте контейнер на холсте через меню кнопки «+»
                        </p>
                      </div>
                    );
                  }
                  return containers.map(container => {
                    const childCount = nodes.filter(n => n.parentId === container.id && !n.archived).length;
                    const progress = calculateProgress(container.id, nodes) || 0;
                    
                    return (
                      <button
                        key={container.id}
                        onClick={() => {
                          const targetZoom = 0.85;
                          setZoom(targetZoom);
                          
                          const viewportWidth = window.innerWidth;
                          const viewportHeight = window.innerHeight;
                          const cWidth = container.width || 520;
                          const cHeight = container.height || 400;
                          
                          // Center container on the viewport
                          const targetPanX = (viewportWidth / 2) - (container.x + cWidth / 2) * targetZoom;
                          const targetPanY = (viewportHeight / 2) - (container.y + cHeight / 2) * targetZoom;
                          
                          setPanX(targetPanX);
                          setPanY(targetPanY);
                          
                          onSelectNode(container.id);
                          setFocusedContainerId(container.id);
                          setIsContainersDropdownOpen(false);
                        }}
                        className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer group animate-in fade-in duration-100"
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/20 group-hover:scale-105 transition-transform">
                          <Layers className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {container.text || 'Без названия'}
                            </span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 font-medium font-mono">
                              Задач: {childCount}
                            </span>
                          </div>
                          {/* Progress bar inside dropdown item */}
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="bg-indigo-500 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsElementDropdownOpen(!isElementDropdownOpen);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-250 cursor-pointer text-white bg-indigo-600 hover:bg-indigo-700 hover:scale-110 active:scale-95 border-none focus:outline-none`}
            title="Добавить элемент"
          >
            <Plus className={`w-7 h-7 transition-transform duration-250 ${isElementDropdownOpen ? 'rotate-45' : ''}`} />
          </button>

          {isElementDropdownOpen && (
            <div
              className="absolute bottom-16 right-0 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 w-64 z-50 flex flex-col gap-1 select-text origin-bottom-right"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
            {/* Floating Node Button */}
            <button
              onClick={() => {
                if (onAddInboxTask) {
                  onAddInboxTask('Новая задача');
                } else {
                  const x = Math.round(-panX / zoom);
                  const y = Math.round(-panY / zoom);
                  onAddFloatingNode(x, y, focusedTaskId || focusedContainerId || null);
                }
                setIsElementDropdownOpen(false);
              }}
              className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/20 group-hover:scale-105 transition-transform">
                <PlusCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Новая задача</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">Создать задачу в INBOX</span>
              </div>
            </button>

            {/* Workflow Rectangle Button */}
            <button
              onClick={() => {
                const x = Math.round(-panX / zoom);
                const y = Math.round(-panY / zoom);
                onAddFloatingNode(x, y, focusedTaskId || focusedContainerId || null, 'Workflow Шаг', { isWorkflowRectangle: true });
                setIsElementDropdownOpen(false);
              }}
              className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/20 group-hover:scale-105 transition-transform">
                <Network className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Workflow шаг</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">Блок-схема с коннекторами</span>
              </div>
            </button>

            {/* Voice Dictation Button */}
            <button
              onClick={() => {
                startCanvasDictation();
                setIsElementDropdownOpen(false);
              }}
              className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/20 group-hover:scale-105 transition-transform">
                <Mic className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Голосовой ввод</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">Продиктовать новую задачу</span>
              </div>
            </button>

            {/* Container Button */}
            <button
              onClick={() => {
                const x = Math.round(-panX / zoom);
                const y = Math.round(-panY / zoom);
                onAddContainerNode(x, y, focusedTaskId || focusedContainerId || null);
                setIsElementDropdownOpen(false);
              }}
              className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/20 group-hover:scale-105 transition-transform text-xs">
                📦
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Группа задач</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">Группировка и свертывание</span>
              </div>
            </button>

            {/* Insert Image Button */}
            <button
              onClick={() => {
                canvasImageFileInputRef.current?.click();
                setIsElementDropdownOpen(false);
              }}
              className="w-full text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 p-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-900/20 group-hover:scale-105 transition-transform text-xs flex items-center justify-center">
                🖼️
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-sans">Вставить изображение</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">Загрузить картинку на холст</span>
              </div>
            </button>
          </div>
        )}
        </div>
      </div>

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
        className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible origin-center infinite-canvas"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        {/* SVG connection lines global defs container */}
        <svg className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1" style={{ zIndex: 0 }}>
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
            </marker>
            <marker
              id="blocked-arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f05c60" />
            </marker>
            <marker
              id="blocked-arrow-resolved"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#aeaaca" />
            </marker>
          </defs>
        </svg>

        {/* Render Flowchart Workflow connections */}
          {visibleNodes.map(node => {
            if (!node.workflowConnections) return null;
            return node.workflowConnections.map(conn => {
              const target = nodes.find(t => t.id === conn.toNodeId);
              if (!target) return null; // Target node deleted or missing
              
              // Calculate start coordinate on origin node
              const w1 = getNodeWidth(node);
              const h1 = getNodeHeight(node);
              let x1 = node.x;
              let y1 = node.y;
              if (conn.fromSide === 'top') y1 -= h1 / 2;
              else if (conn.fromSide === 'right') x1 += w1 / 2;
              else if (conn.fromSide === 'bottom') y1 += h1 / 2;
              else if (conn.fromSide === 'left') x1 -= w1 / 2;

              // Calculate end coordinate on target node
              const w2 = getNodeWidth(target);
              const h2 = getNodeHeight(target);
              let x2_exact = target.x;
              let y2_exact = target.y;
              if (conn.toSide === 'top') y2_exact -= h2 / 2;
              else if (conn.toSide === 'right') x2_exact += w2 / 2;
              else if (conn.toSide === 'bottom') y2_exact += h2 / 2;
              else if (conn.toSide === 'left') x2_exact -= w2 / 2;

              const pathColor = node.color || '#7e85eb'; // Indigo flowchart color
              const isLineClicked = selectedConnectionId === `${node.id}-${conn.id}`;
              const isSelected = selectedNodeId === node.id || selectedNodeId === target.id || isLineClicked;
              
              // Compute dynamic bend midpoint using exact coordinates for precise alignment
              const defaultMid = getOrthogonalMidpoint(x1, y1, conn.fromSide, x2_exact, y2_exact, conn.toSide);
              const mid = {
                x: defaultMid.x + (conn.bendOffsetX !== undefined ? conn.bendOffsetX : 0),
                y: defaultMid.y + (conn.bendOffsetY !== undefined ? conn.bendOffsetY : 0),
              };

              // Apply a tiny offset to prevent the arrowhead from being obscured by the absolute-positioned HTML container card
              let x2 = x2_exact;
              let y2 = y2_exact;
              const arrowOffset = 6; // Stop early so the 6px arrowhead tip rests cleanly against the edge
              if (conn.toSide === 'top') y2 -= arrowOffset;
              else if (conn.toSide === 'right') x2 += arrowOffset;
              else if (conn.toSide === 'bottom') y2 += arrowOffset;
              else if (conn.toSide === 'left') x2 -= arrowOffset;

              const pathD = getCustomWorkflowPath(x1, y1, conn.fromSide, mid.x, mid.y, x2, y2, conn.toSide);

              const ancestorContainer = getAncestorContainer(node.parentId);
              let containerZ = 0;
              let hasContainer = false;
              if (ancestorContainer) {
                hasContainer = true;
                const isAncestorSelected = selectedNodeId === ancestorContainer.id;
                const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
                containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
              }
              const connectionZIndex = hasContainer ? containerZ + 1 : 4;

              return (
                <svg
                  key={`flow-svg-${node.id}-${conn.id}`}
                  className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1"
                  style={{ zIndex: connectionZIndex }}
                >
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

                  {/* Invisible thicker path to make clicking the line easy */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    className="cursor-pointer pointer-events-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnectionId(`${node.id}-${conn.id}`);
                    }}
                  />

                  {/* Visual path line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={pathColor}
                    strokeWidth={isSelected ? 3.5 : 2.5}
                    markerEnd="url(#flow-arrow)"
                    className="transition-all duration-150 cursor-pointer pointer-events-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnectionId(`${node.id}-${conn.id}`);
                    }}
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
                      setSelectedConnectionId(`${node.id}-${conn.id}`);
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
                      setSelectedConnectionId(`${node.id}-${conn.id}`);
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
                      {isLineClicked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedConns = node.workflowConnections?.filter(c => c.id !== conn.id) || [];
                            onUpdateNode({
                              ...node,
                              workflowConnections: updatedConns
                            });
                            setSelectedConnectionId(null);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-4 h-4 flex items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-xs hover:scale-110 transition-transform cursor-pointer shrink-0"
                          title="Удалить соединение"
                        >
                          <X className="w-2.5 h-2.5 stroke-[3]" />
                        </button>
                      )}
                    </div>
                  </foreignObject>
                </g>
              </svg>
              );
            });
          })}

          {/* Flowchart Connector Connection Preview Path */}
          {activeConnector && mousePos && (() => {
            const ancestorContainer = getAncestorContainer(activeConnector.nodeId);
            let containerZ = 0;
            let hasContainer = false;
            if (ancestorContainer) {
              hasContainer = true;
              const isAncestorSelected = selectedNodeId === ancestorContainer.id;
              const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
              containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
            }
            const connectionZIndex = hasContainer ? containerZ + 1 : 4;
            
            return (
              <svg
                className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1"
                style={{ zIndex: connectionZIndex }}
              >
                <path
                  d={
                    hoveredNodeId && hoveredSide
                      ? getFlowchartPath(
                          activeConnector.startX,
                          activeConnector.startY,
                          activeConnector.side,
                          mousePos.x,
                          mousePos.y,
                          hoveredSide
                        )
                      : getDraggingPreviewPath(
                          activeConnector.startX,
                          activeConnector.startY,
                          activeConnector.side,
                          mousePos.x,
                          mousePos.y
                        )
                  }
                  fill="none"
                  stroke="#7e85eb"
                  strokeWidth={3}
                  strokeDasharray="5,5"
                  markerEnd="url(#flow-arrow)"
                  className="opacity-95"
                />
              </svg>
            );
          })()}

          {connections.map(({ child, parent }) => {
            const pathColor = child.color || parent.color || '#9ba1f2';
            const isSelected = selectedNodeId === child.id || selectedNodeId === parent.id;
            const isConnectionDimmed = isAnyFilterActive && (!isNodeMatched(child) || !isNodeMatched(parent));
            
            const ancestorContainer = getAncestorContainer(child.parentId);
            let containerZ = 0;
            let hasContainer = false;
            if (ancestorContainer) {
              hasContainer = true;
              const isAncestorSelected = selectedNodeId === ancestorContainer.id;
              const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
              containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
            }
            const connectionZIndex = hasContainer ? containerZ + 1 : 4;

            return (
              <svg
                key={`conn-svg-${child.id}`}
                className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1"
                style={{ zIndex: connectionZIndex }}
              >
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
              </svg>
            );
          })}

          {/* Render Blocked By Dependencies */}
          {visibleNodes.flatMap(node => {
            if (!node.blockedBy || !Array.isArray(node.blockedBy)) return [];
            return node.blockedBy.map(blockerId => {
              const blocker = visibleNodes.find(n => n.id === blockerId);
              if (!blocker) return null; // blocker is either not visible or deleted
              
              // Find closest connection points
              const { p1, p2 } = getClosestConnectionPoints(blocker, node);

              // Apply arrow offset on the end side so the arrowhead rests nicely on the edge
              let x2 = p2.x;
              let y2 = p2.y;
              const arrowOffset = 8;
              if (p2.side === 'top') y2 -= arrowOffset;
              else if (p2.side === 'bottom') y2 += arrowOffset;
              else if (p2.side === 'left') x2 -= arrowOffset;
              else if (p2.side === 'right') x2 += arrowOffset;

              const isResolved = blocker.completed;
              const isSelected = selectedNodeId === node.id || selectedNodeId === blocker.id;
              const pathColor = isResolved ? '#aeaaca' : '#f05c60'; // slate-400 for resolved, red-500 for active blockers
              const strokeDash = isResolved ? '4,4' : '6,4';
              const strokeWidth = isSelected ? 3 : (isResolved ? 1.5 : 2);
              const pathD = getDependencyBezierPath(p1.x, p1.y, p1.side, x2, y2, p2.side);
              const markerId = isResolved ? 'blocked-arrow-resolved' : 'blocked-arrow-active';

              // Determine z-index
              const ancestorContainer = getAncestorContainer(node.parentId);
              let containerZ = 0;
              let hasContainer = false;
              if (ancestorContainer) {
                hasContainer = true;
                const isAncestorSelected = selectedNodeId === ancestorContainer.id;
                const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
                containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
              }
              const connectionZIndex = hasContainer ? containerZ + 1 : 4;

              return (
                <svg
                  key={`blocked-${blocker.id}-${node.id}`}
                  className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1"
                  style={{ zIndex: connectionZIndex }}
                >
                  <g style={{ opacity: isResolved ? 0.6 : 1 }} className="transition-all duration-300">
                    {/* Shadow/glow for selected dependency */}
                    {isSelected && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke={pathColor}
                        strokeWidth={strokeWidth + 4}
                        className="opacity-15 blur-[1px] transition-all"
                      />
                    )}
                    {/* Blocked by connection path */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={pathColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                      markerEnd={`url(#${markerId})`}
                      className="transition-all duration-200"
                    />
                  </g>
                </svg>
              );
            }).filter(Boolean);
          })}
 
        {/* Render Alignment Snapping lines (draw.io style) */}
        {alignmentLines.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1"
            style={{ zIndex: 1000 }}
          >
            {alignmentLines.map((line, idx) => {
              if (line.type === 'v') {
                return (
                  <line
                    key={`align-line-v-${idx}`}
                    x1={line.coord}
                    y1={line.minVal}
                    x2={line.coord}
                    y2={line.maxVal}
                    stroke="#ec4899"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                    className="opacity-80"
                  />
                );
              } else {
                return (
                  <line
                    key={`align-line-h-${idx}`}
                    x1={line.minVal}
                    y1={line.coord}
                    x2={line.maxVal}
                    y2={line.coord}
                    stroke="#ec4899"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                    className="opacity-80"
                  />
                );
              }
            })}
          </svg>
        )}

        {/* Task Nodes Render */}
        {visibleNodes.map((node) => {
          const isSelected = selectedNodeId === node.id || (selectedNodeIds && selectedNodeIds.includes(node.id));

          if (node.isContainer) {
            const isSelfFocused = focusedContainerId === node.id;
            if (isSelfFocused) return null; // Hide the container visual boundaries entirely to let it replace the canvas!

            const containerChildren = nodes.filter(n => n.parentId === node.id);
            const totalChildren = containerChildren.length;
            const completedChildren = containerChildren.filter(n => n.completed).length;
            const containerProgress = calculateProgress(node.id, nodes) || 0;
            const isContainerSelected = isSelected;
            const isContainerCollapsed = true; // Always collapsed on the main canvas!
            const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;
            const isOverdueCont = isContainerOverdue(node, nodes);
            const isOpponentHovered = hoveredNodeId === node.id;

            // Stats calculations for detailed display on the card
            const todoCount = containerChildren.filter(n => !n.completed && (n.status === 'todo' || !n.status)).length;
            const progressCount = containerChildren.filter(n => !n.completed && n.status === 'progress').length;
            const waitingCount = containerChildren.filter(n => !n.completed && n.status === 'waiting').length;
            const doneCount = containerChildren.filter(n => n.completed || n.status === 'done').length;

            const urgentCount = containerChildren.filter(n => !n.completed && n.priority === 'urgent').length;
            const highCount = containerChildren.filter(n => !n.completed && n.priority === 'high').length;

            const overdueCount = containerChildren.filter(n => !n.completed && isNodeOverdue(n, nodes)).length;

            const totalEstimated = containerChildren.reduce((acc, child) => acc + (child.estimatedTime || 0), 0);
            const totalPomoTime = getPomoStatsForNode(node, nodes).pomodoroTotalTime;

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isContainerSelected ? 1000 : (lastActiveContainerId === node.id ? 30 : 10), 
                  width: isContainerCollapsed ? '220px' : `${node.width || 520}px`,
                  height: isContainerCollapsed ? '100px' : `${node.height || 400}px`,
                  transition: isAutoArranging ? 'left 0.8s cubic-bezier(0.16, 1, 0.3, 1), top 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
                }}
                onDragOver={(e) => {
                  const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                  if (types.includes('application/task-tag')) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDragEnter={(e) => {
                  const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                  if (types.includes('application/task-tag')) {
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
                  const tag = e.dataTransfer ? e.dataTransfer.getData('application/task-tag') : '';
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
                className={`absolute group rounded-2xl border-2 ${(isDraggingThisNode || resizingNodeId === node.id) ? '' : 'transition-[background-color,border-color,opacity,box-shadow,transform] duration-150'} ${
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
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName === 'INPUT' || target.closest('button')) return;
                  if (editingNodeId) {
                    (document.activeElement as HTMLElement)?.blur();
                  }
                  startDragNode(e, node);
                }}
                onClick={(e) => {
                  if (hasDraggedNode || didDragRef.current) return;
                  e.stopPropagation();
                  onSelectNode(node.id, e);
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
                    onSelectNode(node.id, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                  }}
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'INPUT' || target.closest('button')) return;
                    if (editingNodeId) {
                      (document.activeElement as HTMLElement)?.blur();
                    }
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
                      <span>{node.text || 'ОБЛАСТЬ'}</span>
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
                    {/* Display title name instead of duplicated static label 'Контейнер' */}
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350 truncate font-sans tracking-wide">
                      {node.text || 'Область задач'}
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
                        className="p-1 rounded-md text-indigo-600 dark:text-indigo-450 hover:text-indigo-700 dark:hover:text-indigo-350 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Network className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Body / Workspace Area */}
                <div className="relative flex-1 p-3 flex flex-col justify-between min-h-0 bg-transparent rounded-b-2xl">
                  {isContainerCollapsed ? (
                    <div className="flex-1 flex flex-col justify-center p-2.5 select-none space-y-1.5 bg-slate-50/40 dark:bg-slate-900/10 rounded-b-2xl animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                          📦 Свернуто: {totalChildren} задач
                        </span>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {containerProgress}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${containerProgress}%` }}
                        />
                      </div>

                      {/* Quick Status and Time Breakdown */}
                      <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span title="В планах">⚪ {todoCount}</span>
                          <span title="В работе">🔵 {progressCount}</span>
                          <span title="Ожидают">🟡 {waitingCount}</span>
                          <span title="Выполнено">🟢 {doneCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-medium">
                          {overdueCount > 0 && <span className="text-rose-500 font-bold" title="Просрочено">📅 {overdueCount}</span>}
                          {urgentCount > 0 && <span className="text-red-500 font-bold" title="Критических">🚨 {urgentCount}</span>}
                          <span>⏱️ {formatTotalPomoTime(totalPomoTime)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Inner interactive view */}
                      <div className="flex-1 flex flex-col min-h-0 z-10 select-text overflow-hidden mb-2">
                        {renderContainerBody(node, containerChildren)}
                      </div>

                      {/* Detailed task stats breakdown panel */}
                      <div className="mt-1 mb-2 px-2.5 py-1.5 flex flex-wrap items-center justify-between text-[9px] bg-slate-50/55 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 rounded-md select-none gap-2 font-medium z-10 shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 dark:text-slate-500 font-bold">Задачи:</span>
                          <span className="inline-flex items-center gap-0.5 text-slate-600 dark:text-slate-300" title="В планах">
                            ⚪ {todoCount}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400" title="В работе">
                            🔵 {progressCount}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400" title="Ожидают">
                            🟡 {waitingCount}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400" title="Выполнено">
                            🟢 {doneCount}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-1.5">
                          {overdueCount > 0 && (
                            <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-black px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/40 animate-pulse flex items-center gap-0.5" title="Просроченные задачи">
                              📅 {overdueCount}
                            </span>
                          )}
                          {urgentCount > 0 && (
                            <span className="bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 font-black px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/40 flex items-center gap-0.5" title="Критические приоритеты">
                              🚨 {urgentCount}
                            </span>
                          )}
                          {totalEstimated > 0 && (
                            <span className="text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-850 px-1 py-0.5 rounded font-black" title="Общее ориентировочное время работы">
                              ⏱️ {totalEstimated}ч
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Small dynamic status overview bar at the bottom */}
                      <div className="mt-auto pt-2 border-t border-slate-100/40 dark:border-slate-800/40 flex flex-wrap items-center justify-between select-none bg-white dark:bg-slate-950 px-2 py-1.5 rounded-lg z-10 shrink-0 gap-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotesModalNodeId(node.id);
                            }}
                            className="text-[9px] text-slate-500 dark:text-slate-400 hover:text-amber-600 shadow-sm flex items-center gap-1 py-0.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-all font-semibold cursor-pointer border border-slate-205 dark:border-slate-755 bg-white/50 dark:bg-slate-900/50 shrink-0"
                          >
                            <FileText className="w-3 h-3 text-amber-500" /> Описание
                          </button>

                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-sans truncate">
                            {totalChildren} задач ({completedChildren} вып.) • ⏱️ {formatTotalPomoTime(totalPomoTime)}
                          </span>
                        </div>
                        
                        <div className="w-20 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                          <div 
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${containerProgress}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Resize Handles for container from all sides (Large touch-responsive targets) */}
                {!isContainerCollapsed && (
                  <>
                    {/* Top border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'n')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'n')}
                      data-drag-ignore
                      className="absolute -top-1.5 left-4 right-4 h-3 cursor-ns-resize z-30 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-all duration-150"
                      title="Изменить высоту (вверх)"
                    />
                    {/* Bottom border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 's')}
                      onTouchStart={(e) => startResizeTouch(e, node, 's')}
                      data-drag-ignore
                      className="absolute -bottom-1.5 left-4 right-4 h-3 cursor-ns-resize z-30 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-all duration-150"
                      title="Изменить высоту (вниз)"
                    />
                    {/* Left border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'w')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'w')}
                      data-drag-ignore
                      className="absolute top-4 bottom-4 -left-1.5 w-3 cursor-ew-resize z-30 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-all duration-150"
                      title="Изменить ширину (влево)"
                    />
                    {/* Right border resizer */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'e')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'e')}
                      data-drag-ignore
                      className="absolute top-4 bottom-4 -right-1.5 w-3 cursor-ew-resize z-30 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded transition-all duration-150"
                      title="Изменить ширину (вправо)"
                    />

                    {/* Corner resizers */}
                    <div
                      onMouseDown={(e) => startResize(e, node, 'nw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'nw')}
                      data-drag-ignore
                      className="absolute -top-2 -left-2 w-4 h-4 cursor-nwse-resize z-40 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded-full border border-amber-500/30 bg-white dark:bg-slate-900 transition-all duration-150"
                      title="Сверху-слева"
                    />
                    <div
                      onMouseDown={(e) => startResize(e, node, 'ne')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'ne')}
                      data-drag-ignore
                      className="absolute -top-2 -right-2 w-4 h-4 cursor-nesw-resize z-40 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded-full border border-amber-500/30 bg-white dark:bg-slate-900 transition-all duration-150"
                      title="Сверху-справа"
                    />
                    <div
                      onMouseDown={(e) => startResize(e, node, 'sw')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'sw')}
                      data-drag-ignore
                      className="absolute -bottom-2 -left-2 w-4 h-4 cursor-nesw-resize z-40 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded-full border border-amber-500/30 bg-white dark:bg-slate-900 transition-all duration-150"
                      title="Снизу-слева"
                    />
                    <div
                      onMouseDown={(e) => startResize(e, node, 'se')}
                      onTouchStart={(e) => startResizeTouch(e, node, 'se')}
                      data-drag-ignore
                      className="absolute -bottom-2.5 -right-2.5 w-5 h-5 cursor-nwse-resize z-40 select-none opacity-0 group-hover:opacity-100 hover:bg-amber-500/25 active:bg-amber-500/50 rounded-full border border-amber-500/30 bg-white dark:bg-slate-900 transition-all duration-150 flex items-center justify-center"
                      title="Снизу-справа"
                    >
                      <svg width="6" height="6" viewBox="0 0 6 6" className="text-amber-600 dark:text-amber-450 opacity-80">
                        <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </div>
                  </>
                )}

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
              containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
            }
            const cardZIndex = isSelected 
              ? 1000 
              : (ancestorContainer ? containerZ + 8 : 8);

            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;

            const w = getNodeWidth(node);
            const h = getNodeHeight(node);

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
                  if (draggingNodeId && !node.isZoneTriggerDisabled) {
                    const draggingNode = nodes.find(n => n.id === draggingNodeId);
                    if (draggingNode && !draggingNode.isWorkflowRectangle && !draggingNode.isContainer) {
                      const flowContainer = getAncestorContainer(node.id);
                      const dragContainer = getAncestorContainer(draggingNode.id);
                      const flowContainerId = flowContainer ? flowContainer.id : null;
                      const dragContainerId = dragContainer ? dragContainer.id : null;

                      if (flowContainerId === dragContainerId) {
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
                        height: `${zoneH}px`,
                        transition: isAutoArranging ? 'left 0.8s cubic-bezier(0.16, 1, 0.3, 1), top 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
                      }}
                      className={`rounded-2xl border border-dashed transition-all pointer-events-none ${
                        node.isZoneTriggerDisabled
                          ? 'border-gray-300 dark:border-gray-800 bg-gray-50/5 dark:bg-slate-900/5 opacity-40'
                          : isAnyDraggingNodeOverlapping
                            ? 'border-emerald-500 bg-emerald-50/10 dark:bg-emerald-950/15 scale-[1.01] shadow-lg ring-4 ring-emerald-500/25'
                            : isSelected
                              ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10 shadow-md'
                              : 'border-slate-350 dark:border-slate-700 bg-slate-50/5 dark:bg-slate-900/5'
                      }`}
                    >
                      {/* Title label at the top center of the zone */}
                      {(node.isZoneTriggerDisabled || isAnyDraggingNodeOverlapping) && (
                        <div className={`absolute -top-5 left-1/2 transform -translate-x-1/2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-xs pointer-events-none border select-none transition-all duration-150 whitespace-nowrap ${
                          node.isZoneTriggerDisabled
                            ? 'bg-gray-105 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-750 dark:text-gray-500'
                            : 'bg-emerald-500 text-white border-emerald-600'
                        }`}>
                          {node.isZoneTriggerDisabled ? '⛔ Выключен' : `🔗 Авто-тег: ${node.text || 'Шаг_Workflow'}`}
                        </div>
                      )}

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
                    height: `${h}px`,
                    transition: isAutoArranging ? 'left 0.8s cubic-bezier(0.16, 1, 0.3, 1), top 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
                  }}
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'INPUT' || target.closest('button')) return;
                    if (editingNodeId) {
                      (document.activeElement as HTMLElement)?.blur();
                    }
                    startDragNode(e, node);
                  }}
                  onClick={(e) => {
                    if (hasDraggedNode || didDragRef.current) return;
                    e.stopPropagation();
                    onSelectNode(node.id, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (window.innerWidth < 1024) {
                      onSelectNode(null);
                    } else {
                      onSelectNode(node.id, e);
                    }
                    setExpandedCardSubtasks(prev => ({
                      ...prev,
                      [node.id]: true
                    }));
                  }}
                  className={`absolute group cursor-grab active:cursor-grabbing transition-[background-color,border-color,box-shadow,transform] duration-150 ${
                    isDimmed ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 duration-300' : ''
                  } ${
                    node.workflowShape === 'rhomb'
                      ? ''
                      : `rounded-md border-2 shadow-sm ${
                          isOpponentHovered
                            ? 'bg-indigo-50/15 dark:bg-indigo-950/20 border-indigo-500 ring-4 ring-indigo-500/25 scale-[1.025] shadow-md'
                            : isSelected
                              ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-400 ring-4 ring-indigo-120/50 dark:ring-indigo-950/40 shadow-md'
                              : 'bg-white dark:bg-slate-900 border-slate-350 dark:border-slate-650 hover:border-slate-500 dark:hover:border-slate-500'
                        }`
                  }`}
                >
                  {node.workflowShape === 'rhomb' && (
                    <div 
                      className={`absolute inset-0 transition-all ${
                        isOpponentHovered 
                          ? 'bg-indigo-500 scale-[1.025] shadow-lg' 
                          : isSelected 
                            ? 'bg-indigo-600 dark:bg-indigo-400 shadow-lg' 
                            : 'bg-slate-200 dark:bg-slate-800 shadow-md'
                      }`}
                      style={{
                        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                      }}
                    >
                      <div 
                        className="absolute inset-[2.5px] bg-white dark:bg-slate-900 transition-colors"
                        style={{
                          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                        }}
                      />
                    </div>
                  )}

                  {/* Title and Completed State inside workflow step */}
                  <div className={`w-full h-full flex flex-col items-center justify-center p-3 text-center select-none relative z-10 ${node.workflowShape === 'rhomb' ? 'px-5' : ''}`}>
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
                        <span className="text-[11px] font-sans font-bold tracking-wide leading-snug break-words max-w-[145px] text-slate-800 dark:text-slate-150">
                          {node.text || 'Шаг Workflow'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Micro Actions Overlay */}
                  <div className={`absolute top-1 right-1 transition-opacity flex items-center gap-1 z-30 ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
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

                {/* Workflow Rectangle quick selection action overlay */}
                {isSelected && draggingNodeId === null && potentialDragNodeIdRef.current === null && (
                  <div
                    data-drag-ignore
                    onClick={(e) => e.stopPropagation()}
                    className="absolute flex items-center gap-1.5 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-50 pointer-events-auto whitespace-nowrap animate-fade-in"
                    style={{
                      left: node.x,
                      top: node.y + h / 2 + 24,
                      transform: `translateX(-50%) scale(${1 / zoom})`,
                      transformOrigin: 'top center'
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDrawer();
                      }}
                      title="Открыть свойства"
                      className="flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    {/* Shape Toggle button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextShape = node.workflowShape === 'rhomb' ? 'rectangle' : 'rhomb';
                        onUpdateNode({
                          ...node,
                          workflowShape: nextShape
                        });
                      }}
                      title={node.workflowShape === 'rhomb' ? "Сменить форму на Прямоугольник" : "Сменить форму на Ромб"}
                      className="flex items-center justify-center w-8 h-8 text-indigo-650 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      <Square className={`w-3.5 h-3.5 transition-transform duration-300 ${node.workflowShape === 'rhomb' ? 'rotate-45 text-amber-500' : 'text-slate-500'}`} />
                    </button>

                    {/* Trigger active/inactive Toggle button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode({
                          ...node,
                          isZoneTriggerDisabled: !node.isZoneTriggerDisabled
                        });
                      }}
                      title={node.isZoneTriggerDisabled ? "Включить зону авто-тегов" : "Выключить зону авто-тегов"}
                      className="flex items-center justify-center w-8 h-8 text-indigo-650 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                    >
                      {node.isZoneTriggerDisabled ? (
                        <Link2Off className="w-3.5 h-3.5 text-rose-500" />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </button>

                    <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(node.id);
                      }}
                      title="Удалить прямоугольник Workflow"
                      className="flex items-center justify-center w-8 h-8 text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors animate-pulse"
                    >
                      <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        }

        const isImgNode = !!node.isNotTask && node.files && node.files.length > 0 && node.files.some(f => f.type && f.type.startsWith('image/'));
        if (isImgNode) {
          const imgFile = node.files.find(f => f.type && f.type.startsWith('image/'))!;
          const imgUrl = imgFile.googleDriveId ? `https://lh3.googleusercontent.com/d/${imgFile.googleDriveId}` : imgFile.dataUrl;

          // Render a beautiful, minimal frame for the image
          const imageWidth = node.width || 300;
          const cardZIndex = isSelected ? 1000 : 5;

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={{
                left: node.x,
                top: node.y,
                transform: 'translate(-50%, -50%)',
                zIndex: cardZIndex,
                width: `${imageWidth}px`,
                transition: isAutoArranging ? 'left 0.8s cubic-bezier(0.16, 1, 0.3, 1), top 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
              }}
              className={`absolute group cursor-grab active:cursor-grabbing rounded-xl p-1.5 border-2 bg-white dark:bg-slate-900 shadow-md ${
                isSelected 
                  ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-lg' 
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button') || target.closest('.resize-handle')) return;
                if (editingNodeId) {
                  (document.activeElement as HTMLElement)?.blur();
                }
                startDragNode(e, node);
              }}
              onClick={(e) => {
                if (hasDraggedNode || didDragRef.current) return;
                e.stopPropagation();
                onSelectNode(node.id, e);
              }}
            >
              {/* Image element */}
              <div className="relative w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-950">
                <img
                  src={imgUrl}
                  alt={node.text || 'Изображение'}
                  className="w-full h-auto select-none pointer-events-none max-h-[500px] object-contain"
                  referrerPolicy="no-referrer"
                />
                
                {/* Floating caption overlay at bottom */}
                {node.text && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5">
                    <p className="text-[11px] font-semibold text-white truncate text-center">
                      {node.text}
                    </p>
                  </div>
                )}
              </div>

              {/* Floating Image Action Buttons overlay on hover */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-1 rounded-lg border border-slate-200/60 dark:border-slate-800 shadow-sm z-20">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newWidth = Math.max(100, (node.width || 300) - 40);
                    onUpdateNode({ ...node, width: newWidth });
                  }}
                  title="Уменьшить размер изображения"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newWidth = Math.min(1200, (node.width || 300) + 40);
                    onUpdateNode({ ...node, width: newWidth });
                  }}
                  title="Увеличить размер изображения"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNode(node.id);
                  }}
                  title="Удалить изображение"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-800 text-rose-500 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Corner drag resize handle */}
              <div
                onMouseDown={(e) => handleImageResizeStart(e, node)}
                onTouchStart={(e) => handleImageResizeTouchStart(e, node)}
                title="Перетащите край для изменения размера"
                className="resize-handle absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-40 hover:opacity-100 group-hover:opacity-70 transition-opacity z-20"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" className="text-slate-400 dark:text-slate-600">
                  <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="10" y1="4" x2="4" y2="10" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="10" y1="8" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            </div>
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
              // Standard parent nodes do not auto-detach on drag
              return false;
            }
          })();

          const ancestorContainer = getAncestorContainer(node.parentId);
          let containerZ = 10;
          if (ancestorContainer) {
            const isAncestorSelected = selectedNodeId === ancestorContainer.id;
            const isAncestorLastActive = lastActiveContainerId === ancestorContainer.id;
            containerZ = isAncestorSelected ? 1000 : (isAncestorLastActive ? 30 : 10);
          }
          const cardZIndex = isSelected 
            ? 1000 
            : (ancestorContainer ? containerZ + 2 : 5);
            
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
                transition: isAutoArranging ? 'left 0.8s cubic-bezier(0.16, 1, 0.3, 1), top 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
              }}
              onDragOver={(e) => {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                if (types.includes('application/task-tag')) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDragEnter={(e) => {
                const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
                if (types.includes('application/task-tag')) {
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
                const tag = e.dataTransfer ? e.dataTransfer.getData('application/task-tag') : '';
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
              } ${node.completed ? 'opacity-85' : isNodeOverdue(node, nodes) ? 'border-red-400 dark:border-red-900/60 shadow-[0_0_10px_rgba(239,68,68,0.25)] bg-red-50/10 dark:bg-red-950/5' : ''}`}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.closest('button')) return;
                if (editingNodeId) {
                  (document.activeElement as HTMLElement)?.blur();
                }
                startDragNode(e, node);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (window.innerWidth < 1024) {
                  onSelectNode(null);
                } else {
                  onSelectNode(node.id, e);
                }
                setExpandedCardSubtasks(prev => ({
                  ...prev,
                  [node.id]: true
                }));
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
                      if (checkHasActiveBlockers(node.id)) return;
                      onToggleNodeCompleted(node.id);
                    }}
                    title={
                      node.completed 
                        ? "Отметить невыполненной" 
                        : checkHasActiveBlockers(node.id)
                          ? "Задача заблокирована блокирующими связями"
                          : "Отметить выполненной"
                    }
                    className={`mt-0.5 transition-colors ${
                      checkHasActiveBlockers(node.id)
                        ? 'text-rose-500 hover:text-rose-600 dark:text-rose-450 dark:hover:text-rose-400 cursor-not-allowed'
                        : isRoot 
                          ? 'text-indigo-300 hover:text-white cursor-pointer' 
                          : 'text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                    }`}
                  >
                    {node.completed ? (
                      isRoot ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 fill-indigo-800/50" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-50 dark:fill-emerald-950/30" />
                      )
                    ) : checkHasActiveBlockers(node.id) ? (
                      <Lock className="w-4 h-4 text-rose-500 dark:text-rose-400 animate-in zoom-in-50" />
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

                  <div className={`min-w-0 flex-1 ${(() => {
                    const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
                    return parentNode ? 'pr-5' : '';
                  })()}`}>
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
                        {(() => {
                          if (!node.parentId) return null;
                          const parent = nodes.find(p => p.id === node.parentId);
                          if (!parent || parent.isContainer || parent.isWorkflowRectangle) return null;

                          const siblings = nodes.filter(n => n.parentId === node.parentId && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
                          const sortedSiblings = [...siblings].sort((a, b) => {
                            const orderA = a.subtaskOrder !== undefined ? a.subtaskOrder : 1000000;
                            const orderB = b.subtaskOrder !== undefined ? b.subtaskOrder : 1000000;
                            if (orderA !== orderB) return orderA - orderB;
                            return a.id.localeCompare(b.id);
                          });
                          const idx = sortedSiblings.findIndex(n => n.id === node.id);
                          if (idx === -1) return null;
                          return (
                            <span className="inline-flex items-center justify-center bg-indigo-550/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded px-1.5 py-0.2 shrink-0 mr-1 select-none">
                              {idx + 1}
                            </span>
                          );
                        })()}
                        <span>{node.text || 'Без названия'}</span>
                        {(() => {
                          const nodeLinks = getTaskExternalLinks(node);
                          if (nodeLinks.length === 0) return null;
                          return nodeLinks.map((linkUrl, lIdx) => (
                            <a
                              key={lIdx}
                              href={linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className={`inline-flex items-center justify-center p-0.5 rounded transition-colors shrink-0 ${
                                isRoot 
                                  ? 'hover:bg-indigo-600 text-indigo-200' 
                                  : 'hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-550 dark:text-indigo-400'
                              }`}
                              title={`Открыть внешнюю ссылку (${lIdx + 1}/${nodeLinks.length}): ${linkUrl}`}
                            >
                              <LinkIcon className="w-3.5 h-3.5" />
                            </a>
                          ));
                        })()}
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
                    {node.mirrorParentText && (
                      <div 
                        className={`text-[9px] font-bold mt-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded border select-none max-w-max truncate transition-colors cursor-pointer ${
                          isRoot 
                            ? 'bg-indigo-900/40 text-indigo-200 border-indigo-700/50 hover:bg-indigo-900/60' 
                            : 'bg-purple-50/55 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-100/30 dark:border-purple-900/30 hover:bg-purple-100/40 dark:hover:bg-purple-900/25'
                        }`} 
                        title={`Синхронизированная копия задачи. Исходный родитель: ${node.mirrorParentText}. Нажмите, чтобы перейти к нему.`}
                        onClick={(e) => {
                          if (node.mirrorParentId) {
                            const exists = nodes.some(n => n.id === node.mirrorParentId);
                            if (exists) {
                              e.stopPropagation();
                              onSelectNode(node.mirrorParentId);
                            }
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <span className="text-purple-500 text-[10px]">🔗</span>
                        <span className="truncate max-w-[120px]">{node.mirrorParentText}</span>
                      </div>
                    )}
                    {node.mirrorGroupId && (() => {
                      const mirrorCopies = nodes.filter(n => n.mirrorGroupId === node.mirrorGroupId && n.id !== node.id);
                      if (mirrorCopies.length === 0) return null;
                      return (
                        <div 
                          className="text-[9px] font-bold mt-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded border border-purple-100/30 dark:border-purple-900/30 select-none max-w-max truncate transition-colors cursor-pointer bg-purple-50/55 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100/40 dark:hover:bg-purple-900/25"
                          title={`Эта задача имеет зеркальные копии. Нажмите, чтобы открыть свойства и перейти к ним.`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(node.id);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span className="text-purple-500 text-[10px]">🪞</span>
                          <span className="truncate max-w-[120px]">Зеркала ({mirrorCopies.length})</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Quick add subtask plus button */}
                  {!node.isContainer && !node.isWorkflowRectangle && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddChildNode(node.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Быстро добавить подзадачу"
                      className={`mt-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded hover:bg-slate-150/50 dark:hover:bg-slate-800 cursor-pointer shrink-0 ${
                        isRoot 
                          ? 'text-indigo-200 hover:text-white hover:bg-indigo-700/50' 
                          : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Optional transition to parent button */}
                  {(() => {
                    const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
                    if (parentNode) {
                      const parentTitle = parentNode.isContainer 
                        ? `Перейти к родительской группе: ${parentNode.text}` 
                        : `Перейти к родительской задаче: ${parentNode.text}`;
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(parentNode.id);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title={parentTitle}
                          className={`mt-0.5 p-1 rounded hover:bg-slate-150/50 dark:hover:bg-slate-800 cursor-pointer shrink-0 transition-colors ${
                            isRoot 
                              ? 'text-indigo-200 hover:text-white hover:bg-indigo-700/50' 
                              : 'text-indigo-500 hover:text-indigo-650 dark:text-indigo-400 dark:hover:text-indigo-300'
                          }`}
                        >
                          <CornerUpLeft className="w-3.5 h-3.5" />
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {/* Fullscreen card toggle button for mobile/always */}
                  {!node.isContainer && !node.isWorkflowRectangle && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(node.id);
                        onOpenDrawer(true);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Раскрыть на весь экран"
                      className={`mt-0.5 p-1 rounded hover:bg-slate-150/50 dark:hover:bg-slate-800 cursor-pointer shrink-0 ${
                        isRoot 
                          ? 'text-indigo-200 hover:text-white hover:bg-indigo-700/50' 
                          : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {!node.isCardCollapsed ? (
                  <>
                    {/* Priority, Due Date & Tags inline editing triggers */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      {!isRoot && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => handleToggleInlineMenu(e, node.id, 'priority')}
                            className="hover:scale-[1.03] transition-transform cursor-pointer block text-left"
                            title="Изменить приоритет"
                          >
                            <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${pInfo.bg}`}>
                              <span className={`w-1 h-1 rounded-full ${pInfo.dot}`} />
                              {pInfo.label}
                            </span>
                          </button>
                          
                          {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'priority' && (
                            <div 
                              className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 rounded-xl shadow-xl p-1.5 w-44 z-[100] animate-in fade-in zoom-in-95 duration-100 ${
                                openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Приоритет:</p>
                              <div className="space-y-0.5">
                                {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => {
                                  const label = p === 'urgent' ? '🔥 Критический' : p === 'high' ? '🟠 Высокий' : p === 'medium' ? '🔵 Средний' : p === 'low' ? '🟢 Низкий' : '⚪ Без приоритета';
                                  const isSelected = node.priority === p || (p === 'none' && !node.priority);
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => {
                                        onUpdateNode({ ...node, priority: p });
                                        setActiveInlineMenu(null);
                                      }}
                                      className={`w-full text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 px-2 py-1 text-[10.5px] rounded flex items-center justify-between cursor-pointer ${
                                        isSelected ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20' : 'text-slate-650 dark:text-slate-300'
                                      }`}
                                    >
                                      <span>{label}</span>
                                      {isSelected && <CheckCircle2 className="w-3 h-3 text-indigo-650 dark:text-indigo-400" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Due date spot edit popup */}
                      <div className="relative">
                        {node.dueDate ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleInlineMenu(e, node.id, 'date')}
                            className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider hover:scale-[1.03] transition-transform cursor-pointer text-left ${
                              node.completed
                                ? isRoot
                                  ? 'bg-indigo-700/50 text-indigo-200 border-indigo-500/30'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-550 border-slate-200 dark:border-slate-800'
                                : isNodeOverdue(node, nodes)
                                  ? 'bg-rose-50 dark:bg-rose-955/50 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900/60 animate-pulse font-extrabold shadow-[0_0_6px_rgba(244,63,94,0.3)]'
                                  : isRoot
                                    ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30'
                                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900'
                            }`}
                            title={
                              node.completed 
                                ? `Срок выполнения: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Выполнено. Нажмите для изменения)`
                                : isNodeOverdue(node, nodes)
                                  ? `Внимание! Срок выполнения истек: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения)`
                                  : `Срок выполнения: ${formatDisplayDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения)`
                            }
                          >
                            {isNodeOverdue(node, nodes) && !node.completed ? (
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-bounce" />
                            ) : (
                              <Calendar className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
                            )}
                            <span>{formatDisplayDate(node.dueDate)}{node.dueTime ? `, ${node.dueTime}` : ''}</span>
                          </button>
                        ) : (
                          !isRoot && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleInlineMenu(e, node.id, 'date')}
                              className="inline-flex items-center gap-1 text-[8px] text-slate-400 dark:text-slate-550 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-0.5 rounded border border-dashed border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900 hover:scale-[1.03] transition-all cursor-pointer text-left"
                              title="Добавить срок выполнения"
                            >
                              <Calendar className="w-2.5 h-2.5 text-slate-400" />
                              <span>+ Срок</span>
                            </button>
                          )
                        )}

                        {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'date' && (
                          <div 
                            className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3 w-56 z-[100] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100 ${
                              openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Срок выполнения:</p>
                            
                            <div className="space-y-1 text-left whitespace-normal">
                              <label htmlFor={`inline-canvas-date-${node.id}`} className="text-[9px] font-bold text-slate-500">Дата</label>
                              <input 
                                type="date"
                                id={`inline-canvas-date-${node.id}`}
                                defaultValue={node.dueDate || ''}
                                className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            <div className="space-y-1 text-left whitespace-normal">
                              <label htmlFor={`inline-canvas-time-${node.id}`} className="text-[9px] font-bold text-slate-500">Время</label>
                              <input 
                                type="time"
                                id={`inline-canvas-time-${node.id}`}
                                defaultValue={node.dueTime || ''}
                                className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            <div className="space-y-1 text-left whitespace-normal">
                              <div className="flex items-center gap-1">
                                <Bell className="w-2.5 h-2.5 text-slate-400" />
                                <label htmlFor={`inline-canvas-reminder-${node.id}`} className="text-[9px] font-bold text-slate-500">Напоминание</label>
                              </div>
                              <select 
                                id={`inline-canvas-reminder-${node.id}`}
                                defaultValue={
                                  node.reminderMinutesBefore !== undefined
                                    ? String(node.reminderMinutesBefore)
                                    : node.reminderDate
                                    ? 'custom'
                                    : 'none'
                                }
                                className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-750 dark:text-slate-250 font-medium"
                              >
                                <option value="none">Без напоминания</option>
                                <option value="0">В момент срока (в срок)</option>
                                <option value="5">За 5 минут до срока</option>
                                <option value="10">За 10 минут до срока</option>
                                <option value="15">За 15 минут до срока</option>
                                <option value="30">За 30 минут до срока</option>
                                <option value="60">За 1 час до срока</option>
                                <option value="120">За 2 часа до срока</option>
                                <option value="1440">За 1 день до срока</option>
                                {node.reminderDate && node.reminderMinutesBefore === undefined && (
                                  <option value="custom" disabled>Другое (задано вручную)</option>
                                )}
                              </select>
                            </div>

                            <div className="flex gap-1.5 mt-1 border-t border-slate-100 dark:border-slate-800/60 pt-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const dateInput = document.getElementById(`inline-canvas-date-${node.id}`) as HTMLInputElement | null;
                                  const timeInput = document.getElementById(`inline-canvas-time-${node.id}`) as HTMLInputElement | null;
                                  const reminderInput = document.getElementById(`inline-canvas-reminder-${node.id}`) as HTMLSelectElement | null;
                                  const dateVal = dateInput?.value || undefined;
                                  const timeVal = timeInput?.value || undefined;
                                  const reminderVal = reminderInput?.value || 'none';
                                  
                                  let reminderMinutesBefore: number | undefined = undefined;
                                  let reminderDate: string | undefined = undefined;
                                  let reminderTime: string | undefined = undefined;
                                  let reminderDismissed: boolean | undefined = undefined;

                                  if (dateVal && reminderVal !== 'none' && reminderVal !== 'custom') {
                                    reminderMinutesBefore = Number(reminderVal);
                                    reminderDismissed = false;
                                    const dueTimeStr = timeVal || '12:00';
                                    try {
                                      const dueDateTime = new Date(`${dateVal}T${dueTimeStr}`);
                                      if (!isNaN(dueDateTime.getTime())) {
                                        const remDateTime = new Date(dueDateTime.getTime() - reminderMinutesBefore * 60000);
                                        const rYear = remDateTime.getFullYear();
                                        const rMonth = String(remDateTime.getMonth() + 1).padStart(2, '0');
                                        const rDate = String(remDateTime.getDate()).padStart(2, '0');
                                        const rHour = String(remDateTime.getHours()).padStart(2, '0');
                                        const rMin = String(remDateTime.getMinutes()).padStart(2, '0');
                                        reminderDate = `${rYear}-${rMonth}-${rDate}`;
                                        reminderTime = `${rHour}:${rMin}`;
                                      }
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  } else if (reminderVal === 'custom') {
                                    reminderMinutesBefore = undefined;
                                    reminderDate = node.reminderDate;
                                    reminderTime = node.reminderTime;
                                    reminderDismissed = node.reminderDismissed;
                                  }

                                  onUpdateNode({
                                    ...node,
                                    dueDate: dateVal || undefined,
                                    dueTime: dateVal ? (timeVal || undefined) : undefined,
                                    reminderMinutesBefore,
                                    reminderDate,
                                    reminderTime,
                                    reminderDismissed
                                  });
                                  setActiveInlineMenu(null);
                                }}
                                className="flex-grow py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-[10px] transition-all cursor-pointer text-center"
                              >
                                OK
                              </button>
                              {node.dueDate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateNode({
                                      ...node,
                                      dueDate: undefined,
                                      dueTime: undefined,
                                      reminderMinutesBefore: undefined,
                                      reminderDate: undefined,
                                      reminderTime: undefined,
                                      reminderDismissed: undefined
                                    });
                                    setActiveInlineMenu(null);
                                  }}
                                  className="flex-grow py-1 rounded-lg bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-650 dark:text-rose-400 font-bold text-[10px] transition-all cursor-pointer text-center whitespace-nowrap px-1"
                                >
                                  Сбросить
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveInlineMenu(null)}
                                className="px-1.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 font-bold text-[10px] transition-all cursor-pointer text-center"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Tags spot edit popup trigger */}
                      {!isRoot && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => handleToggleInlineMenu(e, node.id, 'tag')}
                            className="inline-flex items-center gap-1 text-[8px] text-slate-455 dark:text-slate-500 hover:text-indigo-605 dark:hover:text-amber-400 px-1.5 py-0.5 rounded border border-dashed border-slate-205 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850 hover:scale-[1.03] transition-all cursor-pointer text-left"
                            title="Добавить или изменить теги на месте"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span>Теги</span>
                          </button>

                          {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'tag' && (
                            <div 
                              className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-755 rounded-2xl shadow-2xl p-3 w-64 z-[100] flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 ${
                                openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Теги задачи:</p>
                                <button 
                                  type="button" 
                                  onClick={() => setActiveInlineMenu(null)}
                                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="max-h-48 overflow-y-auto space-y-2.5 my-1 pr-1 border-b border-slate-100 dark:border-slate-800/60 pb-2 text-left whitespace-normal">
                                {tagCategories.length === 0 ? (
                                  <p className="text-[10px] text-slate-450 font-medium leading-relaxed">Нет созданных категорий или тегов в проекте.</p>
                                ) : (
                                  tagCategories.map(cat => (
                                    <div key={cat.id} className="space-y-1">
                                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold" style={{ color: cat.color }}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                        <span>{cat.name}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {cat.tags.map(tag_val => {
                                          const isAssigned = (node.tags || []).includes(tag_val);
                                          return (
                                            <button
                                              key={tag_val}
                                              type="button"
                                              onClick={() => {
                                                const currentTags = node.tags || [];
                                                const nextTags = isAssigned 
                                                  ? currentTags.filter(t => t !== tag_val)
                                                  : [...currentTags, tag_val];
                                                onUpdateNode({
                                                  ...node,
                                                  tags: nextTags
                                                });
                                              }}
                                              className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                                isAssigned 
                                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900 shadow-2xs'
                                                  : 'bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700'
                                              }`}
                                            >
                                              #{tag_val}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
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

                      {(() => {
                        const stats = getPomoStatsForNode(node, nodes);
                        return stats.pomodoroTotalTime > 0 ? (
                          <span 
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border select-none ${
                              isRoot 
                                ? 'bg-indigo-700/60 text-indigo-100 border-indigo-500/30' 
                                : 'bg-rose-550/10 text-rose-600 border-rose-200/40 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400'
                            }`}
                            title={`Проведено на помидоре: ${formatTotalPomoTime(stats.pomodoroTotalTime)}`}
                          >
                            <span>🍅</span>
                            <span>{formatTotalPomoTime(stats.pomodoroTotalTime)}</span>
                          </span>
                        ) : null;
                      })()}

                      <div className="relative">
                        {node.estimatedTime !== undefined && node.estimatedTime !== null && !isNaN(node.estimatedTime) ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => handleToggleInlineMenu(e, node.id, 'estimatedTime')}
                            className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer hover:scale-[1.03] transition-all shrink-0 ${
                              isRoot 
                                ? 'bg-indigo-700/60 text-indigo-100 border-indigo-500/30 hover:bg-indigo-650/70' 
                                : 'bg-indigo-50 text-indigo-600 border-indigo-150/40 dark:bg-indigo-950/20 dark:border-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40'
                            }`}
                            title={`Ориентировочное время: ${node.estimatedTime} мин (нажмите для изменения)`}
                          >
                            <Timer className="w-2.5 h-2.5 shrink-0" />
                            {node.estimatedTime} мин
                          </button>
                        ) : (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => handleToggleInlineMenu(e, node.id, 'estimatedTime')}
                            className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border border-dashed cursor-pointer hover:scale-[1.03] transition-all shrink-0 ${
                              isRoot 
                                ? 'bg-indigo-800/20 text-indigo-300/60 border-indigo-500/20 hover:bg-indigo-800/30' 
                                : 'bg-slate-50/50 text-slate-400 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400'
                            }`}
                            title="Нажмите, чтобы указать ориентировочное время работы"
                          >
                            <Timer className="w-2.5 h-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
                            0 мин
                          </button>
                        )}

                        {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'estimatedTime' && (() => {
                          const suggested = suggestEstimatedTime(node.text, nodes);
                          return (
                            <div 
                              className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-755 rounded-2xl shadow-2xl p-3 w-48 z-[100] flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 text-left whitespace-normal ${
                                openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ориентировочное время:</p>
                                <button 
                                  type="button" 
                                  onClick={() => setActiveInlineMenu(null)}
                                  className="p-1 rounded-md hover:bg-slate-105 dark:hover:bg-slate-700 text-slate-400 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Мин"
                                  value={node.estimatedTime || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      onUpdateNode({ ...node, estimatedTime: undefined });
                                    } else {
                                      const num = parseFloat(val);
                                      if (!isNaN(num)) {
                                        onUpdateNode({ ...node, estimatedTime: num });
                                      }
                                    }
                                  }}
                                  className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                />
                                <span className="text-xs text-slate-400 dark:text-slate-505 self-center shrink-0">мин</span>
                              </div>

                              {suggested !== undefined && suggested !== node.estimatedTime && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateNode({ ...node, estimatedTime: suggested });
                                    setActiveInlineMenu(null);
                                  }}
                                  className="w-full py-1 px-1.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 border border-dashed border-indigo-200 dark:border-indigo-850 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 rounded transition-all cursor-pointer text-left"
                                >
                                  💡 Рекомендация: {suggested} мин
                                </button>
                              )}

                            <div className="grid grid-cols-2 gap-1 mt-1">
                              {[15, 25, 30, 45, 60, 90, 120, 180].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  onClick={() => {
                                    onUpdateNode({ ...node, estimatedTime: mins });
                                    setActiveInlineMenu(null);
                                  }}
                                  className="py-1 px-1.5 text-[10px] font-bold rounded bg-slate-50 dark:bg-slate-850 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-600 dark:text-slate-300 border border-slate-205 dark:border-slate-750 hover:border-indigo-300 dark:hover:text-indigo-900 cursor-pointer text-center font-mono"
                                >
                                  {mins >= 60 ? `${Math.floor(mins / 60)} ч${mins % 60 > 0 ? ` ${mins % 60}м` : ''}` : `${mins} м`}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onUpdateNode({ ...node, estimatedTime: undefined });
                                setActiveInlineMenu(null);
                              }}
                              className="w-full py-1 text-[10px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-dashed border-rose-200 dark:border-rose-900 rounded transition-all cursor-pointer text-center mt-1"
                            >
                              Очистить
                            </button>
                          </div>
                        );
                      })()}
                      </div>
                    </div>

                    {/* Subtask Progress Bar for nodes with children */}
                    {hasChildren && (() => {
                      const progressPercent = calculateProgress(node.id, nodes) || 0;
                      return (
                        <div className="mt-2.5 mb-1 space-y-1" title={`Прогресс подзадач: ${progressPercent}%`}>
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wide">
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
                      const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
                      if (subtasks.length === 0) return null;
                      const isExpanded = expandedCardSubtasks[node.id] || false;
                      const completedCount = subtasks.filter(s => s.completed).length;

                      const sortedSubtasks = [...subtasks].sort((a, b) => {
                        const orderA = a.subtaskOrder !== undefined ? a.subtaskOrder : 1000000;
                        const orderB = b.subtaskOrder !== undefined ? b.subtaskOrder : 1000000;
                        if (orderA !== orderB) return orderA - orderB;
                        return a.id.localeCompare(b.id);
                      });

                      const handleMoveSubtask = (subtaskId: string, direction: 'up' | 'down') => {
                        const index = sortedSubtasks.findIndex(s => s.id === subtaskId);
                        if (index === -1) return;

                        const targetIndex = direction === 'up' ? index - 1 : index + 1;
                        if (targetIndex < 0 || targetIndex >= sortedSubtasks.length) return;

                        const itemA = sortedSubtasks[index];
                        const itemB = sortedSubtasks[targetIndex];

                        sortedSubtasks.forEach((item, idx) => {
                          if (item.subtaskOrder === undefined) {
                            item.subtaskOrder = idx * 10;
                          }
                        });

                        const tempOrder = itemA.subtaskOrder!;
                        itemA.subtaskOrder = itemB.subtaskOrder!;
                        itemB.subtaskOrder = tempOrder;

                        onUpdateNode({ ...itemA });
                        onUpdateNode({ ...itemB });
                      };

                      const handleDragStart = (e: React.DragEvent, idx: number) => {
                        setDraggedIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      };

                      const handleDragOver = (e: React.DragEvent, idx: number) => {
                        e.preventDefault();
                        if (draggedIndex === null || draggedIndex === idx) return;

                        const now = Date.now();
                        if (now - lastSwapTimeRef.current < 200) return;

                        const rect = e.currentTarget.getBoundingClientRect();
                        const mouseY = e.clientY - rect.top;
                        const threshold = rect.height / 2;

                        if (draggedIndex < idx && mouseY < threshold) return;
                        if (draggedIndex > idx && mouseY > threshold) return;

                        const draggedItem = sortedSubtasks[draggedIndex];
                        const targetItem = sortedSubtasks[idx];

                        sortedSubtasks.forEach((item, id) => {
                          if (item.subtaskOrder === undefined) {
                            item.subtaskOrder = id * 10;
                          }
                        });

                        const tempOrder = draggedItem.subtaskOrder!;
                        draggedItem.subtaskOrder = targetItem.subtaskOrder!;
                        targetItem.subtaskOrder = tempOrder;

                        lastSwapTimeRef.current = now;
                        onUpdateNode({ ...draggedItem });
                        onUpdateNode({ ...targetItem });
                        setDraggedIndex(idx);
                      };

                      const handleDragEnd = () => {
                        setDraggedIndex(null);
                      };

                      const handleTouchStart = (e: React.TouchEvent, idx: number) => {
                        setActiveTouchIndex(idx);
                      };

                      const handleTouchMove = (e: React.TouchEvent) => {
                        if (activeTouchIndex === null) return;
                        
                        const now = Date.now();
                        if (now - lastSwapTimeRef.current < 200) return;

                        const touch = e.touches[0];
                        const element = document.elementFromPoint(touch.clientX, touch.clientY);
                        if (!element) return;

                        const container = element.closest('[data-subtask-index]');
                        if (container) {
                          const targetIndexStr = container.getAttribute('data-subtask-index');
                          if (targetIndexStr !== null) {
                            const targetIndex = parseInt(targetIndexStr, 10);
                            if (targetIndex !== activeTouchIndex && !isNaN(targetIndex)) {
                              const rect = container.getBoundingClientRect();
                              const touchY = touch.clientY - rect.top;
                              const threshold = rect.height / 2;

                              if (activeTouchIndex < targetIndex && touchY < threshold) return;
                              if (activeTouchIndex > targetIndex && touchY > threshold) return;

                              const draggedItem = sortedSubtasks[activeTouchIndex];
                              const targetItem = sortedSubtasks[targetIndex];

                              sortedSubtasks.forEach((item, id) => {
                                if (item.subtaskOrder === undefined) {
                                  item.subtaskOrder = id * 10;
                                }
                              });

                              const tempOrder = draggedItem.subtaskOrder!;
                              draggedItem.subtaskOrder = targetItem.subtaskOrder!;
                              targetItem.subtaskOrder = tempOrder;

                              lastSwapTimeRef.current = now;
                              onUpdateNode({ ...draggedItem });
                              onUpdateNode({ ...targetItem });
                              setActiveTouchIndex(targetIndex);
                            }
                          }
                        }
                      };

                      const handleTouchEnd = () => {
                        setActiveTouchIndex(null);
                      };

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
                              <ChevronDown className={`w-3 h-3 text-slate-400 dark:text-slate-505 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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
                                {sortedSubtasks.map((subtask, index) => (
                                  <motion.div
                                    key={subtask.id}
                                    layout={isTransitioningTransform && !draggingNodeId}
                                    transition={{ type: "spring", stiffness: 500, damping: 45 }}
                                    data-subtask-index={index}
                                    data-subtask-id={subtask.id}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectNode(subtask.id, e);
                                      if (onFocusedTaskIdChange) {
                                        onFocusedTaskIdChange(subtask.id);
                                      }
                                      if (window.innerWidth >= 1024) {
                                        onOpenDrawer();
                                      }
                                    }}
                                    className={`group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850/40 flex items-center justify-between gap-2 transition-colors text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer ${
                                      draggedIndex === index || activeTouchIndex === index 
                                        ? 'opacity-40 border border-indigo-500 bg-indigo-50/10' 
                                        : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      {/* Drag Handle for manual sorting */}
                                      <div
                                        draggable={true}
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragEnd={handleDragEnd}
                                        onTouchStart={(e) => handleTouchStart(e, index)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleTouchEnd}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="p-1 -ml-1 text-slate-300 dark:text-slate-600 hover:text-indigo-650 dark:hover:text-indigo-400 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                        title="Перетащить для сортировки"
                                      >
                                        <GripVertical className="w-3 h-3" />
                                      </div>

                                      {/* Number tag */}
                                      <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 select-none shrink-0 min-w-[14px]">
                                        {index + 1}.
                                      </span>

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
                                      {editingNodeId === subtask.id ? (
                                        <input
                                          type="text"
                                          value={subtask.text}
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
                                              if (!subtask.text.trim() || subtask.id === lastCreatedNodeId) {
                                                onDeleteNode(subtask.id);
                                              } else {
                                                e.currentTarget.blur();
                                              }
                                              return;
                                            }
                                            e.stopPropagation(); // Avoid triggering global keyboard shortcuts
                                            if (e.key === 'Enter') {
                                              setEditingNodeId(null);
                                              if (onClearLastCreatedNodeId) onClearLastCreatedNodeId();
                                            }
                                          }}
                                          onChange={(e) => {
                                            onUpdateNode({
                                              ...subtask,
                                              text: e.target.value
                                            });
                                          }}
                                          className="w-full text-[10px] font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-1 py-0.5 rounded border border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                          onClick={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <div className="flex items-center gap-1 min-w-0 flex-grow">
                                          <span 
                                            onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              setEditingNodeId(subtask.id);
                                            }}
                                            className={`truncate leading-normal font-semibold text-[10px] cursor-text ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-555' : isNodeOverdue(subtask, nodes) ? 'text-rose-555 dark:text-rose-450' : ''}`}
                                          >
                                            {subtask.text}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {subtask.dueDate && (
                                        <span className={`shrink-0 flex items-center gap-1 text-[8.5px] px-1.5 py-0.5 rounded-md border font-extrabold shadow-sm leading-none ${
                                          isNodeOverdue(subtask, nodes) && !subtask.completed
                                            ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 border-rose-100 dark:border-rose-950/30'
                                            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/50 dark:border-slate-750'
                                        }`}>
                                          <Clock className="w-2.5 h-2.5 text-slate-450 dark:text-slate-555" />
                                          <span>{formatDisplayDate(subtask.dueDate)}{subtask.dueTime ? ` ${subtask.dueTime}` : ''}</span>
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteNode(subtask.id);
                                        }}
                                        className="text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-all opacity-100 sm:opacity-0 sm:group-hover/sub:opacity-100 shrink-0 cursor-pointer"
                                        title="Удалить подзадачу"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </motion.div>
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
              {isSelected && (!selectedNodeIds || selectedNodeIds.length <= 1) && draggingNodeId === null && potentialDragNodeIdRef.current === null && (
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

                  {hasChildren && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 1.5: Красиво распределить подзадачи вокруг */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArrangeChildrenRadial(node.id);
                        }}
                        title="Красиво распределить подзадачи вокруг"
                        className="flex items-center justify-center w-8 h-8 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Network className="w-4 h-4" />
                      </button>
                    </>
                  )}

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

                  {/* Button 3.5: Фокусировка */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onFocusedTaskIdChange) {
                        onFocusedTaskIdChange(focusedTaskId === node.id ? null : node.id);
                      }
                    }}
                    title={focusedTaskId === node.id ? "Выйти из режима фокуса" : "Фокусировка на задаче (показать только ее и подзадачи)"}
                    className={`flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors ${
                      focusedTaskId === node.id
                        ? 'text-rose-600 bg-rose-50 dark:bg-rose-955/40 dark:text-rose-400'
                        : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Target className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 3.6: Быстрый Pomodoro */}
                  <div className="relative flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        handleToggleInlineMenu(e, node.id, 'pomodoro');
                      }}
                      title="Запустить Pomodoro таймер быстро"
                      className={`flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors ${
                        activePomodoroNodeId === node.id
                          ? 'bg-rose-50 dark:bg-rose-955/40 text-rose-600 dark:text-rose-400 animate-pulse'
                          : 'text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[15px]">🍅</span>
                    </button>

                    {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'pomodoro' && (
                      <div 
                        className={`absolute left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-2xl shadow-xl p-3 w-48 z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2 ${
                          openInlineMenuUpwards ? 'bottom-full mb-2' : 'top-full mt-2'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Фокус:</p>
                          <button 
                            type="button" 
                            onClick={() => setActiveInlineMenu(null)}
                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {[5, 10, 15, 25, 30, 45, 50, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                const durationSec = mins * 60;
                                const newState = {
                                  nodeId: node.id,
                                  nodeText: node.text,
                                  isRunning: true,
                                  isPaused: false,
                                  isBreak: false,
                                  duration: durationSec,
                                  endTime: Date.now() + durationSec * 1000,
                                  timeLeft: durationSec
                                };
                                localStorage.setItem('task_mindmap_pomodoro', JSON.stringify(newState));
                                localStorage.setItem('task_mindmap_pomo_custom_minutes', String(mins));
                                window.dispatchEvent(new Event('task_mindmap_pomo_update'));
                                setActiveInlineMenu(null);
                              }}
                              className="py-1 px-2 text-[11px] font-bold rounded-lg border border-slate-150 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-650 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 dark:hover:border-rose-900/40 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer text-center"
                            >
                              {mins} мин
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {node.parentId && !currentParentForNode?.isContainer && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 3.7: Отсоединить от родительской задачи */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNodeParent(node.id, null, node.x, node.y);
                        }}
                        title="Отсоединить от родительской задачи"
                        className="flex items-center justify-center w-8 h-8 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Link2Off className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {true && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 3.8: Копировать задачу */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onCopyNodes) {
                            onCopyNodes([node.id]);
                          }
                        }}
                        title="Копировать / дублировать задачу"
                        className="flex items-center justify-center w-8 h-8 text-indigo-650 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {true && (
                    <>
                      <div className="w-[1px] h-4.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 4: Удалить */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(node.id);
                        }}
                        title={isRoot ? "Удалить главную задачу" : "Удалить ветвь"}
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

      {/* Hidden file input for file uploading in nodes */}
      <input 
        type="file"
        ref={cardFileInputRef}
        onChange={handleCardFileUpload}
        className="hidden pointer-events-none"
      />

      {/* Hidden file input for file uploading on canvas background */}
      <input 
        type="file"
        ref={canvasImageFileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleAddImageToCanvas(file);
          }
          e.target.value = '';
        }}
        className="hidden pointer-events-none"
        accept="image/*"
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
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
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
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 transition cursor-pointer"
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
                      const colorClass = p === 'urgent' ? 'border-rose-300 text-rose-600 bg-rose-50 dark:bg-rose-950/20' : 
                                         p === 'high' ? 'border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/20' :
                                         p === 'medium' ? 'border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-950/20' :
                                         'border-teal-300 text-teal-600 bg-teal-50 dark:bg-teal-950/20';
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
                    <div className="text-xs text-rose-500 border border-rose-300 bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg animate-pulse">
                      {fileError}
                    </div>
                  )}

                  {node.files && node.files.length > 0 ? (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto font-sans">
                      {node.files.map((file) => {
                        const isImg = file.type && file.type.startsWith('image/');
                        const imgUrl = file.googleDriveId ? `https://lh3.googleusercontent.com/d/${file.googleDriveId}` : file.dataUrl;
                        return (
                          <div 
                            key={file.id} 
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 gap-2"
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
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
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

      {/* Fullscreen card overlay on mobile */}
      {fullscreenCardId && (() => {
        const node = nodes.find(n => n.id === fullscreenCardId);
        if (!node) return null;

        const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);

        const handleAddSubtask = (e: React.FormEvent) => {
          e.preventDefault();
          if (!fullscreenSubtaskText.trim()) return;
          // Add a child node using our helper
          onAddFloatingNode(node.x + 240, node.y, node.id, fullscreenSubtaskText.trim());
          setFullscreenSubtaskText('');
          // Re-focus the input element after adding the subtask so the user can continuously type without losing focus
          setTimeout(() => {
            fullscreenSubtaskInputRef.current?.focus();
          }, 60);
        };

        const handleGoBack = () => {
          if (fullscreenHistory.length > 0) {
            const previousId = fullscreenHistory[fullscreenHistory.length - 1];
            setFullscreenHistory(prev => prev.slice(0, -1));
            setFullscreenCardId(previousId);
          } else if (node.parentId && nodes.some(n => n.id === node.parentId)) {
            setFullscreenCardId(node.parentId);
          } else {
            setFullscreenCardId(null);
            setFullscreenHistory([]);
          }
        };

        const hasBackOption = fullscreenHistory.length > 0 || (node.parentId && nodes.some(n => n.id === node.parentId));

        const handleSetFullscreenRelativeReminder = (minutesBefore: number | undefined) => {
          if (minutesBefore === undefined) {
            onUpdateNode({
              ...node,
              reminderMinutesBefore: undefined,
              reminderDate: node.reminderDate || node.dueDate || '',
              reminderTime: node.reminderTime || node.dueTime || '',
              reminderDismissed: false
            });
            return;
          }

          const dueDateStr = node.dueDate || new Date().toISOString().split('T')[0];
          const dueTimeStr = node.dueTime || '12:00';

          try {
            const dueDateTime = new Date(`${dueDateStr}T${dueTimeStr}`);
            if (isNaN(dueDateTime.getTime())) return;

            const reminderDateTime = new Date(dueDateTime.getTime() - minutesBefore * 60 * 1000);
            const rDate = reminderDateTime.toISOString().split('T')[0];
            const rTime = reminderDateTime.toTimeString().split(' ')[0].substring(0, 5);

            onUpdateNode({
              ...node,
              reminderMinutesBefore: minutesBefore,
              reminderDate: rDate,
              reminderTime: rTime,
              reminderDismissed: false
            });
          } catch (error) {
            console.error('Failed to calculate reminder time:', error);
          }
        };

        const handleFullscreenDueTimeChange = (val: string) => {
          const updatedNode = {
            ...node,
            dueTime: val || undefined
          };

          if (updatedNode.reminderMinutesBefore !== undefined) {
            const mBefore = updatedNode.reminderMinutesBefore;
            if (updatedNode.dueDate) {
              const dueDateStr = updatedNode.dueDate || new Date().toISOString().split('T')[0];
              const dueTimeStr = updatedNode.dueTime || '12:00';
              try {
                const dueDateTime = new Date(`${dueDateStr}T${dueTimeStr}`);
                if (!isNaN(dueDateTime.getTime())) {
                  const reminderDateTime = new Date(dueDateTime.getTime() - mBefore * 60 * 1000);
                  updatedNode.reminderDate = reminderDateTime.toISOString().split('T')[0];
                  updatedNode.reminderTime = reminderDateTime.toTimeString().split(' ')[0].substring(0, 5);
                  updatedNode.reminderDismissed = false;
                }
              } catch (e) {
                console.error(e);
              }
            }
          }
          onUpdateNode(updatedNode);
        };

        return (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-fade-in" onClick={() => { setFullscreenCardId(null); setFullscreenHistory([]); }}>
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              {/* Header with High Contrast */}
              <div className="px-6 py-4 border-b-2 border-slate-300 dark:border-slate-800 flex items-center justify-between bg-slate-100 dark:bg-slate-950">
                <div className="flex items-center gap-2">
                  {hasBackOption && (
                    <button
                      type="button"
                      onClick={handleGoBack}
                      className="mr-1.5 p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-950 dark:text-slate-100 transition-colors cursor-pointer flex items-center justify-center border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-sm"
                      title="Назад к предыдущей задаче"
                    >
                      <ChevronLeft className="w-5 h-5 stroke-[3]" />
                    </button>
                  )}
                  <span className="text-xs font-black text-indigo-750 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                    <Smartphone className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                    Карточка (Полноэкранный вид)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFullscreenCardId(null);
                    setFullscreenHistory([]);
                  }}
                  className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-900 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                  title="Вернуться к стандартному виду"
                >
                  <Minimize2 className="w-5.5 h-5.5 stroke-[2.5]" />
                </button>
              </div>

              {/* Scrollable Content with Subtasks RAISED ABOVE Description for Immediate Visibility */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Title Section (Highly contrasting input) */}
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => {
                      if (checkHasActiveBlockers(node.id)) return;
                      onToggleNodeCompleted(node.id);
                    }}
                    title={
                      node.completed 
                        ? "Отметить невыполненной" 
                        : checkHasActiveBlockers(node.id)
                          ? "Задача заблокирована блокирующими связями"
                          : "Отметить выполненной"
                    }
                    className={`mt-1 transition-colors cursor-pointer shrink-0 ${
                      checkHasActiveBlockers(node.id)
                        ? 'text-rose-500 hover:text-rose-600 dark:text-rose-455'
                        : 'text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                    }`}
                  >
                    {node.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-650 dark:text-emerald-400 fill-emerald-100 dark:fill-emerald-950/50 stroke-[2.5]" />
                    ) : checkHasActiveBlockers(node.id) ? (
                      <Lock className="w-6 h-6 text-rose-500 dark:text-rose-450 stroke-[2.5]" />
                    ) : (
                      <Circle className="w-6 h-6 text-slate-450 dark:text-slate-550 stroke-[2.5]" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={node.text}
                      onChange={(e) => onUpdateNode({ ...node, text: e.target.value })}
                      placeholder="Имя задачи..."
                      className="w-full text-lg font-black bg-slate-50 dark:bg-slate-950 border-2 border-slate-300 focus:border-indigo-600 dark:border-slate-750 dark:focus:border-indigo-500 focus:ring-0 text-slate-950 dark:text-white rounded-xl px-3 py-2 font-sans shadow-inner"
                    />
                  </div>
                </div>

                {/* Priority, Due Date Info, Time & Reminder */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border-2 border-slate-300 dark:border-slate-800 text-xs shadow-sm">
                  <div>
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block mb-1.5">Приоритет</span>
                    <select
                      value={node.priority || 'none'}
                      onChange={(e) => onUpdateNode({ ...node, priority: e.target.value as Priority })}
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-350 dark:border-slate-700 rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-extrabold"
                    >
                      <option value="urgent">🔥 Критический</option>
                      <option value="high">🟠 Высокий</option>
                      <option value="medium">🔵 Средний</option>
                      <option value="low">🟢 Низкий</option>
                      <option value="none">⚪ Без приоритета</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block mb-1.5">Дедлайн</span>
                    <input
                      type="date"
                      value={node.dueDate || ''}
                      onChange={(e) => {
                        const newDate = e.target.value || undefined;
                        const updatedNode = { ...node, dueDate: newDate };
                        if (!newDate) {
                          updatedNode.dueTime = undefined;
                          updatedNode.reminderMinutesBefore = undefined;
                          updatedNode.reminderDate = undefined;
                          updatedNode.reminderTime = undefined;
                        }
                        onUpdateNode(updatedNode);
                      }}
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-350 dark:border-slate-700 rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-extrabold"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block mb-1.5">Время дедлайна</span>
                    <input
                      type="time"
                      value={node.dueTime || ''}
                      onChange={(e) => handleFullscreenDueTimeChange(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-350 dark:border-slate-700 rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-mono font-extrabold"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                      <Bell className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      Напоминание
                    </span>
                    <select
                      value={
                        node.reminderDate && node.reminderMinutesBefore !== undefined
                          ? String(node.reminderMinutesBefore)
                          : node.reminderDate
                          ? 'custom'
                          : 'none'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'none') {
                          onUpdateNode({
                            ...node,
                            reminderMinutesBefore: undefined,
                            reminderDate: undefined,
                            reminderTime: undefined,
                            reminderDismissed: undefined
                          });
                        } else if (val === 'custom') {
                          onUpdateNode({
                            ...node,
                            reminderMinutesBefore: undefined,
                            reminderDate: node.reminderDate || node.dueDate || new Date().toISOString().split('T')[0],
                            reminderTime: node.reminderTime || node.dueTime || '12:00',
                            reminderDismissed: false
                          });
                        } else {
                          handleSetFullscreenRelativeReminder(Number(val));
                        }
                      }}
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-350 dark:border-slate-700 rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-extrabold"
                    >
                      <option value="none">Без напоминания</option>
                      <option value="0">В момент срока</option>
                      <option value="5">За 5 минут</option>
                      <option value="10">За 10 минут</option>
                      <option value="15">За 15 минут</option>
                      <option value="30">За 30 минут</option>
                      <option value="60">За 1 час</option>
                      <option value="120">За 2 часа</option>
                      <option value="1440">За 1 день</option>
                      <option value="custom">Своё время...</option>
                    </select>
                  </div>
                </div>

                {/* Custom Reminder picker inside fullscreen view */}
                {((node.reminderDate || node.reminderTime) && node.reminderMinutesBefore === undefined) && (
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border-2 border-slate-300 dark:border-slate-850 text-xs shadow-sm space-y-3">
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block">
                      Своё время напоминания
                    </span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Дата напоминания</span>
                        <input
                          type="date"
                          value={node.reminderDate || ''}
                          onChange={(e) => onUpdateNode({ ...node, reminderDate: e.target.value || undefined, reminderDismissed: false })}
                          className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-extrabold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Время напоминания</span>
                        <input
                          type="time"
                          value={node.reminderTime || ''}
                          onChange={(e) => onUpdateNode({ ...node, reminderTime: e.target.value || undefined, reminderDismissed: false })}
                          className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 focus:outline-none focus:border-indigo-500 text-slate-950 dark:text-white font-mono font-extrabold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Raised Subtasks Section: Visually stunning and immediately visible when card property opens */}
                <div className="space-y-3 bg-slate-100/40 dark:bg-slate-950/20 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-150 uppercase tracking-widest block">
                      Список подзадач ({subtasks.length})
                    </span>
                    <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-900">
                      Подзадачи
                    </span>
                  </div>

                  {/* Existing Subtasks with Extra Contrast for Smartphones */}
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {subtasks.length > 0 ? (
                      subtasks.map((sub, idx) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-all shadow-sm"
                        >
                          <div
                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none group/subitem"
                            onClick={() => {
                              // Save current ID to history
                              setFullscreenHistory(prev => [...prev, node.id]);
                              // Navigate to subtask
                              setFullscreenCardId(sub.id);
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (checkHasActiveBlockers(sub.id)) return;
                                onToggleNodeCompleted(sub.id);
                              }}
                              className={`transition-colors shrink-0 cursor-pointer stroke-[2] ${
                                checkHasActiveBlockers(sub.id)
                                  ? 'text-rose-500 hover:text-rose-600 dark:text-rose-455'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                              }`}
                              title={
                                sub.completed 
                                  ? "Отметить невыполненной" 
                                  : checkHasActiveBlockers(sub.id)
                                    ? "Задача заблокирована блокирующими связями"
                                    : "Отметить выполненной"
                              }
                            >
                              {sub.completed ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-650 dark:text-emerald-400" />
                              ) : checkHasActiveBlockers(sub.id) ? (
                                <Lock className="w-5 h-5 text-rose-500 dark:text-rose-400 animate-in zoom-in-50" />
                              ) : (
                                <Circle className="w-5 h-5 text-slate-450 dark:text-slate-550" />
                              )}
                            </button>
                            <span className={`text-xs font-bold truncate flex-1 group-hover/subitem:text-indigo-650 dark:group-hover/subitem:text-indigo-400 transition-colors ${sub.completed ? 'line-through text-slate-400 dark:text-slate-500 italic' : 'text-slate-950 dark:text-slate-50'}`}>
                              {sub.text}
                            </span>
                            <ChevronRight className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover/subitem:translate-x-0.5 group-hover/subitem:text-indigo-500 transition-all opacity-100" />
                          </div>
                          
                          {/* Delete subtask button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNode(sub.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900"
                            title="Удалить подзадачу"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-bold italic p-5 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-center bg-white dark:bg-slate-900/60">
                        Нет подзадач. Создайте первую с помощью формы ниже!
                      </div>
                    )}
                  </div>

                  {/* Quick Add Subtask Form - Keeps focus when adding subtask */}
                  <form onSubmit={handleAddSubtask} className="flex gap-2 pt-1.5">
                    <input
                      ref={fullscreenSubtaskInputRef}
                      type="text"
                      value={fullscreenSubtaskText}
                      onChange={(e) => setFullscreenSubtaskText(e.target.value)}
                      placeholder="Добавить новую подзадачу..."
                      className="flex-1 bg-white dark:bg-slate-950 border-2 border-slate-400 focus:border-indigo-650 dark:border-slate-700 dark:focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-0 font-bold font-sans shadow-inner"
                    />
                    <button
                      type="submit"
                      disabled={!fullscreenSubtaskText.trim()}
                      className="px-4.5 py-2.5 bg-indigo-650 dark:bg-indigo-600 hover:bg-indigo-750 dark:hover:bg-indigo-550 disabled:opacity-40 text-white font-black text-xs rounded-xl cursor-pointer transition-all shrink-0 shadow-md active:scale-95"
                    >
                      Добавить
                    </button>
                  </form>
                </div>

                {/* Description Textarea (Now below subtasks) */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider block">
                    Описание / Заметки
                  </span>
                  <textarea
                    value={node.notes || ''}
                    onChange={(e) => onUpdateNode({ ...node, notes: e.target.value })}
                    placeholder="Добавьте подробное описание задачи..."
                    rows={3}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-950 border-2 border-slate-400 focus:border-indigo-650 dark:border-slate-700 dark:focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-0 text-slate-950 dark:text-white leading-relaxed font-sans shadow-inner"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-100 dark:bg-slate-950 border-t-2 border-slate-300 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setFullscreenCardId(null);
                    setFullscreenHistory([]);
                  }}
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-750 dark:bg-indigo-600 dark:hover:bg-indigo-550 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer active:scale-95"
                >
                  Вернуться на холст
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
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
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
                className="flex-1 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 bg-transparent rounded-xl cursor-pointer transition-all border border-slate-200 dark:border-slate-800"
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

      {/* Mobile Touch Selection Box Overlay */}
      {isTouchSelecting && touchSelectionStart && touchSelectionEnd && (
        <div 
          className="absolute border border-indigo-500 bg-indigo-500/10 rounded pointer-events-none animate-pulse"
          style={{
            left: Math.min(touchSelectionStart.x, touchSelectionEnd.x) - (containerRef.current?.getBoundingClientRect().left || 0),
            top: Math.min(touchSelectionStart.y, touchSelectionEnd.y) - (containerRef.current?.getBoundingClientRect().top || 0),
            width: Math.abs(touchSelectionStart.x - touchSelectionEnd.x),
            height: Math.abs(touchSelectionStart.y - touchSelectionEnd.y),
            zIndex: 100
          }}
        />
      )}

      {/* Floating Bulk Action Panel */}
      <AnimatePresence>
        {selectedNodeIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col md:flex-row items-center gap-3 px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_12px_40px_-6px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_-6px_rgba(0,0,0,0.5)] select-none text-slate-800 dark:text-slate-100 max-w-[90vw] md:max-w-xl"
          >
            <div className="flex items-center gap-2 px-1 shrink-0">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-[10px] font-black text-indigo-600 dark:text-indigo-400 font-mono">
                {selectedNodeIds.length}
              </span>
              <span className="text-xs font-bold tracking-tight">Выделено</span>
            </div>
            
            <div className="h-[1px] w-full md:h-6 md:w-[1px] bg-slate-200 dark:bg-slate-800" />
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onBulkToggleCompleted) {
                    onBulkToggleCompleted(true);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 dark:bg-slate-800 hover:bg-emerald-55/40 dark:hover:bg-emerald-950/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Выполнить</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onBulkToggleCompleted) {
                    onBulkToggleCompleted(false);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 dark:bg-slate-800 hover:bg-slate-250 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <Circle className="w-3.5 h-3.5 text-slate-400" />
                <span>Сбросить статус</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCopyNodes) {
                    onCopyNodes(selectedNodeIds);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-705 hover:text-indigo-650 dark:text-slate-200 dark:hover:text-indigo-400 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500" />
                <span>Копировать ({selectedNodeIds.length})</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onBulkDelete) {
                    onBulkDelete();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight bg-rose-500 hover:bg-rose-600 text-white shadow transition-transform hover:scale-105 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectNodes) {
                    onSelectNodes([]);
                  }
                }}
                className="flex items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-250 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
