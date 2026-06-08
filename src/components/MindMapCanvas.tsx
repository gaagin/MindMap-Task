import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  FileImage, 
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
  AlertTriangle,
  X,
  Download,
  Eye,
  Link2Off,
  Mic,
  MicOff,
  Archive,
  RotateCcw
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';
import { getBezierPath, calculateProgress, getDescendants, generateId, formatFileSize, getPomoStatsForNode, formatTotalPomoTime } from '../utils';

interface MindMapCanvasProps {
  nodes: TaskNode[];
  darkMode: boolean;
  activeProjectId: string | null;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNodeCoordinates: (id: string, x: number, y: number) => void;
  onUpdateNodeParent: (id: string, newParentId: string | null) => void;
  onAddChildNode: (parentId: string) => void;
  onAddFloatingNode: (x: number, y: number, parentId?: string | null, customText?: string, extraProps?: Partial<TaskNode>) => void;
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

export default function MindMapCanvas({
  nodes,
  darkMode,
  activeProjectId,
  selectedNodeId,
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
  tagCategories = []
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // States for Notes and file upload handling
  const [notesModalNodeId, setNotesModalNodeId] = useState<string | null>(null);
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
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodeOffsetStart, setNodeOffsetStart] = useState({ x: 0, y: 0 });
  const [hasDraggedNode, setHasDraggedNode] = useState(false);
  const [priorityViewActive, setPriorityViewActive] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStartImage, setDragStartImage] = useState({ x: 0, y: 0 });

  const openPreviewImage = (url: string, name: string) => {
    setZoomScale(1);
    setDragOffset({ x: 0, y: 0 });
    setPreviewImage({ url, name });
  };

  const closePreviewImage = () => {
    setPreviewImage(null);
    setZoomScale(1);
    setDragOffset({ x: 0, y: 0 });
    setIsDraggingImage(false);
  };

  // Keyboard shortcut listener for escape key to close image lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePreviewImage();
      }
    };
    if (previewImage) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewImage]);

  // States of container view modes (e.g., list, kanban, calendar, gantt, table, canvas)
  const [containerViewModes, setContainerViewModes] = useState<Record<string, 'list' | 'kanban' | 'calendar' | 'gantt' | 'table' | 'canvas'>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_container_views');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

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

  // States of container Kanban grouping modes (e.g. status, priority, category, tag)
  const [containerKanbanGroupings, setContainerKanbanGroupings] = useState<Record<string, 'status' | 'priority' | 'category' | 'tag'>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_container_kanban_group');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setContainerKanbanGrouping = (containerId: string, grouping: 'status' | 'priority' | 'category' | 'tag') => {
    setContainerKanbanGroupings(prev => {
      const updated = { ...prev, [containerId]: grouping };
      try {
        localStorage.setItem('task_mindmap_container_kanban_group', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist container kanban group:', e);
      }
      return updated;
    });
  };

  // State to track which Category is active in each container for Kanbans
  const [containerActiveCategoryIds, setContainerActiveCategoryIds] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_container_active_cat');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setContainerActiveCategoryId = (containerId: string, catId: string) => {
    setContainerActiveCategoryIds(prev => {
      const updated = { ...prev, [containerId]: catId };
      try {
        localStorage.setItem('task_mindmap_container_active_cat', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist container active category ID:', e);
      }
      return updated;
    });
  };

  // State to track quick task add text per column in Kanbans
  const [inlineColAddTexts, setInlineColAddTexts] = useState<Record<string, string>>({});

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
          <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-xl select-none min-h-[140px] text-center my-auto">
            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest mb-1.5">Свободный холст</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 max-w-[200px]">
              Дочерние подзадачи свободно перемещаются по этому прямоугольнику. Добавьте задачу кнопкой <b>+</b> выше.
            </span>
          </div>
        );
      }
      return <div className="flex-1 min-h-[140px]" />;
    }

    if (viewMode === 'list') {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin ${isFullScreen ? 'max-h-[70vh] text-xs' : 'max-h-[220px]'}`}>
            {containerChildren.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-xl select-none min-h-[120px] text-center my-auto">
                <span className="text-[9px] text-slate-455 dark:text-slate-500">Задач в списке нет</span>
              </div>
            ) : (
              containerChildren.map(child => (
                <div key={child.id} className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 shadow-xs hover:border-slate-200 group/item">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onToggleNodeCompleted(child.id); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      {child.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                    <span 
                      onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                      className={`font-medium leading-relaxed truncate cursor-pointer ${isFullScreen ? 'text-xs' : 'text-[10px]'} ${child.completed ? 'line-through text-slate-400 dark:text-slate-550' : 'text-slate-700 dark:text-slate-205'}`}
                    >
                      {child.text}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    {child.dueDate && (
                      <span className="text-[8px] font-bold text-slate-400 px-1 py-0.5 rounded bg-slate-50 dark:bg-slate-950 font-mono border border-slate-200 dark:border-slate-800">
                        {formatDisplayDate(child.dueDate)}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setNotesModalNodeId(child.id); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Описание / Заметки"
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteNode(child.id); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-drag-ignore
                      className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Удалить"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
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
            className="mt-2 flex items-center gap-1 shrink-0 z-20"
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
              className="flex-1 text-[10px] py-1 px-2.5 bg-white/70 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500 placeholder-slate-400"
            />
            <button 
              type="submit" 
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              data-drag-ignore
              className="p-1 px-[10px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer text-[10px] font-bold"
            >
              +
            </button>
          </form>
        </div>
      );
    }

    if (viewMode === 'kanban') {
      const grouping = containerKanbanGroupings[node.id] || 'status';

      let kanbanCols: {
        id: string;
        title: string;
        tasks: TaskNode[];
        bg: string;
        border: string;
        bulletColor?: string;
      }[] = [];

      if (grouping === 'status') {
        const todoTasks = containerChildren.filter(c => !c.completed && (!c.progress || c.progress === 0));
        const progressTasks = containerChildren.filter(c => !c.completed && (c.progress && c.progress > 0));
        const doneTasks = containerChildren.filter(c => c.completed);

        kanbanCols = [
          { id: 'todo', title: 'План', tasks: todoTasks, bg: 'bg-slate-500/5 dark:bg-slate-900/40', border: 'border-slate-150 dark:border-slate-800/60', bulletColor: '#475569' },
          { id: 'progress', title: 'В работе', tasks: progressTasks, bg: 'bg-amber-500/5 dark:bg-amber-950/10', border: 'border-amber-200/20 dark:border-amber-900/30', bulletColor: '#f59e0b' },
          { id: 'done', title: 'Готово', tasks: doneTasks, bg: 'bg-emerald-500/5 dark:bg-emerald-950/10', border: 'border-emerald-200/20 dark:border-emerald-900/30', bulletColor: '#10b981' }
        ];
      } else if (grouping === 'priority') {
        const urgentTasks = containerChildren.filter(c => c.priority === 'urgent');
        const highTasks = containerChildren.filter(c => c.priority === 'high');
        const mediumTasks = containerChildren.filter(c => c.priority === 'medium');
        const lowTasks = containerChildren.filter(c => c.priority === 'low' || c.priority === 'none' || !c.priority);

        kanbanCols = [
          { id: 'urgent', title: 'Срочно', tasks: urgentTasks, bg: 'bg-rose-500/5 dark:bg-rose-950/10', border: 'border-rose-200/20 dark:border-rose-900/30', bulletColor: '#f43f5e' },
          { id: 'high', title: 'Высокий', tasks: highTasks, bg: 'bg-amber-500/5 dark:bg-amber-950/10', border: 'border-amber-200/20 dark:border-amber-900/30', bulletColor: '#f59e0b' },
          { id: 'medium', title: 'Средний', tasks: mediumTasks, bg: 'bg-yellow-500/5 dark:bg-yellow-950/10', border: 'border-yellow-250/20 dark:border-yellow-904/30', bulletColor: '#eab308' },
          { id: 'low', title: 'Низкий', tasks: lowTasks, bg: 'bg-slate-500/5 dark:bg-slate-900/40', border: 'border-slate-150 dark:border-slate-800/60', bulletColor: '#64748b' }
        ];
      } else if (grouping === 'category') {
        const activeCatId = containerActiveCategoryIds[node.id] || (tagCategories[0]?.id || '');
        const activeCat = tagCategories.find(cat => cat.id === activeCatId) || tagCategories[0];
        const activeCatTags = activeCat?.tags || [];

        kanbanCols = activeCatTags.map(tag => {
          const tasks = containerChildren.filter(c => (c.tags || []).includes(tag));
          return {
            id: `tagcol_${tag}`,
            title: `#${tag}`,
            tasks,
            bg: 'bg-indigo-500/5 dark:bg-indigo-950/10',
            border: 'border-indigo-200/20 dark:border-indigo-900/30',
            bulletColor: activeCat?.color || '#6366f1'
          };
        });

        // "Без тега" column
        const uncategorizedTasks = containerChildren.filter(c => {
          return !(c.tags || []).some(t => activeCatTags.includes(t));
        });

        kanbanCols.unshift({
          id: 'tagcol_none',
          title: 'Без тега',
          tasks: uncategorizedTasks,
          bg: 'bg-slate-500/5 dark:bg-slate-900/40',
          border: 'border-slate-150 dark:border-slate-800/60',
          bulletColor: '#94a3b8'
        });
      } else if (grouping === 'tag') {
        const allTagsSet = new Set<string>();
        containerChildren.forEach(c => {
          if (c.tags) {
            c.tags.forEach(t => allTagsSet.add(t));
          }
        });
        const allTags = Array.from(allTagsSet);

        kanbanCols = allTags.map(tag => {
          const tasks = containerChildren.filter(c => (c.tags || []).includes(tag));
          return {
            id: `tag_${tag}`,
            title: `#${tag}`,
            tasks,
            bg: 'bg-teal-500/5 dark:bg-teal-950/10',
            border: 'border-teal-200/20 dark:border-teal-900/30',
            bulletColor: '#14b8a6'
          };
        });

        // "Без тегов" column
        const noTagsTasks = containerChildren.filter(c => !c.tags || c.tags.length === 0);
        kanbanCols.unshift({
          id: 'tag_none',
          title: 'Без тегов',
          tasks: noTagsTasks,
          bg: 'bg-slate-500/5 dark:bg-slate-900/40',
          border: 'border-slate-150 dark:border-slate-800/60',
          bulletColor: '#94a3b8'
        });
      }

      const handleDragTaskStart = (e: React.DragEvent, taskId: string) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', taskId);
      };

      const handleDragOverCol = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };

      const handleDropOnCol = (e: React.DragEvent, targetColId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;
        const child = containerChildren.find(c => c.id === taskId);
        if (!child) return;

        if (grouping === 'status') {
          if (targetColId === 'todo') {
            onUpdateNode({ ...child, completed: false, progress: 0 });
          } else if (targetColId === 'progress') {
            onUpdateNode({ ...child, completed: false, progress: 50 });
          } else if (targetColId === 'done') {
            onUpdateNode({ ...child, completed: true, progress: 100 });
          }
        } else if (grouping === 'priority') {
          onUpdateNode({ ...child, priority: targetColId as Priority });
        } else if (grouping === 'category') {
          const activeCatId = containerActiveCategoryIds[node.id] || (tagCategories[0]?.id || '');
          const activeCat = tagCategories.find(cat => cat.id === activeCatId) || tagCategories[0];
          const activeCatTags = activeCat?.tags || [];

          if (targetColId === 'tagcol_none') {
            const cleanTags = (child.tags || []).filter(t => !activeCatTags.includes(t));
            onUpdateNode({ ...child, tags: cleanTags });
          } else {
            const targetTagName = targetColId.replace('tagcol_', '');
            const cleanTags = (child.tags || []).filter(t => !activeCatTags.includes(t));
            if (!cleanTags.includes(targetTagName)) {
              cleanTags.push(targetTagName);
            }
            onUpdateNode({ ...child, tags: cleanTags });
          }
        } else if (grouping === 'tag') {
          if (targetColId === 'tag_none') {
            onUpdateNode({ ...child, tags: [] });
          } else {
            const targetTagName = targetColId.replace('tag_', '');
            if (!(child.tags || []).includes(targetTagName)) {
              onUpdateNode({ ...child, tags: [targetTagName] });
            }
          }
        }
      };

      return (
        <div className="flex-1 flex flex-col min-h-0 select-text">
          {/* Header switch buttons and category pills */}
          <div className="flex items-center justify-between w-full mb-3 select-none shrink-0 gap-3 flex-wrap animate-fade-in" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-950/50 p-1 rounded-xl overflow-x-auto max-w-full scrollbar-none">
              <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold px-1.5 whitespace-nowrap uppercase tracking-widest">Вид:</span>
              {[
                { id: 'status', label: 'Статусы', icon: '🚦' },
                { id: 'priority', label: 'Приоритеты', icon: '⚡' },
                { id: 'category', label: 'Категории', icon: '📁' }
              ].map(grp => {
                const active = grouping === grp.id;
                return (
                  <button
                    key={grp.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContainerKanbanGrouping(node.id, grp.id as any);
                    }}
                    className={`flex items-center gap-1 py-0.5 px-2 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      active 
                        ? 'bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 shadow-3xs text-indigo-650 dark:text-indigo-400 font-extrabold' 
                        : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span>{grp.icon}</span>
                    <span className="whitespace-nowrap">{grp.label}</span>
                  </button>
                );
              })}
            </div>

            {grouping === 'category' && tagCategories.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/40 p-1 rounded-full overflow-x-auto max-w-full scrollbar-none border border-slate-100 dark:border-slate-900/20">
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold px-2 whitespace-nowrap uppercase tracking-widest">ГРУППИРОВКА:</span>
                {tagCategories.map(cat => {
                  const activeCatId = containerActiveCategoryIds[node.id] || (tagCategories[0]?.id || '');
                  const active = cat.id === activeCatId;
                  const catTags = cat.tags || [];
                  const count = containerChildren.filter(c => (c.tags || []).some(t => catTags.includes(t))).length;

                  return (
                    <button
                      key={cat.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContainerActiveCategoryId(node.id, cat.id);
                      }}
                      className={`flex items-center gap-1.5 py-0.8 px-3 rounded-full text-[10.5px] font-bold transition-all border cursor-pointer ${
                        active
                          ? 'bg-indigo-50/80 border-indigo-200/50 text-indigo-750 dark:bg-indigo-950/50 dark:border-indigo-900/60 dark:text-indigo-350 shadow-2xs font-extrabold'
                          : 'bg-white/80 dark:bg-slate-900/85 border-slate-200/50 text-slate-500 hover:text-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="whitespace-nowrap">{cat.name}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-bold font-mono ${
                        active 
                          ? 'bg-indigo-200/50 text-indigo-850 dark:bg-indigo-900/50 dark:text-indigo-350' 
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 flex gap-2.5 overflow-x-auto min-h-0 pb-1.5 scrollbar-thin select-none" onMouseDown={e => e.stopPropagation()}>
            {kanbanCols.map(col => (
              <div 
                key={col.id} 
                onDragOver={handleDragOverCol}
                onDrop={(e) => handleDropOnCol(e, col.id)}
                className={`flex-1 rounded-2xl border ${col.border} ${col.bg} p-2 flex flex-col min-h-0 ${isFullScreen ? 'min-w-[210px]' : 'min-w-[135px] max-w-[170px]'}`}
              >
                <div className="flex items-center justify-between mb-2 px-1 select-none shrink-0 border-b border-dashed border-slate-200/40 pb-1.5">
                  <div className="flex items-center gap-1.5 truncate max-w-[80%]">
                    <span 
                      className="inline-block w-2 h-2 rounded-full shrink-0" 
                      style={{ backgroundColor: col.bulletColor || '#475569' }} 
                    />
                    <span className="text-[10px] font-extrabold text-slate-650 dark:text-slate-350 uppercase tracking-wide truncate">{col.title}</span>
                  </div>
                  <span className="text-[8.5px] font-extrabold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.2 rounded-full font-mono">{col.tasks.length}</span>
                </div>
                
                <div className={`flex-1 overflow-y-auto space-y-1.5 custom-scrollbar min-h-0 pr-0.5 ${isFullScreen ? 'max-h-[66vh]' : 'max-h-[175px]'}`}>
                  {col.tasks.map(child => (
                    <div 
                      key={child.id} 
                      draggable
                      onDragStart={(e) => handleDragTaskStart(e, child.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(child.id);
                      }}
                      className="p-2 rounded-xl border border-slate-150/80 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-indigo-400 dark:hover:border-indigo-800 shadow-2xs flex flex-col group/item cursor-pointer transition-all hover:shadow-2xs"
                    >
                      <div className="flex items-start gap-2">
                        {/* Custom styled circle checkbox */}
                        <div 
                          className="pt-0.5 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleNodeCompleted(child.id);
                          }}
                        >
                          {child.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:text-emerald-600 transition-all cursor-pointer shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 dark:text-slate-700 hover:text-indigo-500 transition-all cursor-pointer shrink-0" />
                          )}
                        </div>
                        <span 
                          className={`font-semibold leading-normal break-words flex-1 text-[10px] ${child.completed ? 'line-through text-slate-400 dark:text-slate-550' : 'text-slate-750 dark:text-slate-200'}`}
                        >
                          {child.text}
                        </span>
                      </div>

                      {/* Info indicators */}
                      {(child.priority || child.dueDate || child.notes || (child.files && child.files.length > 0)) && (
                        <div className="flex flex-wrap items-center gap-1 mt-2 pt-1.5 border-t border-slate-100/50 dark:border-slate-900/50 shrink-0">
                          {child.priority && child.priority !== 'none' && (
                            <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-md ${
                              child.priority === 'urgent' 
                                ? 'bg-rose-50 border border-rose-200 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-400' 
                                : child.priority === 'high' 
                                ? 'bg-amber-50 border border-amber-200 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-400'
                                : child.priority === 'medium'
                                ? 'bg-yellow-55/60 border border-yellow-250 text-yellow-600 dark:bg-yellow-950/40 dark:border-yellow-900/50 dark:text-yellow-450'
                                : 'bg-emerald-50 border border-emerald-250 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-450'
                            }`}>
                              {child.priority === 'urgent' ? 'Срочно' : child.priority === 'high' ? 'Высокий' : child.priority === 'medium' ? 'Средний' : 'Низкий'}
                            </span>
                          )}

                          {child.dueDate && (
                            <span className="flex items-center gap-0.5 text-[8px] font-extrabold px-1.5 py-0.2 rounded-md bg-slate-50 border border-slate-200 text-slate-450 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500 font-mono">
                              <Calendar className="w-2.5 h-2.5" />
                              {formatDisplayDate(child.dueDate)}
                            </span>
                          )}

                          {child.notes && (
                            <FileText className="w-3 h-3 text-slate-400 dark:text-slate-550" title="Есть описание" />
                          )}

                          {child.files && child.files.length > 0 && (
                            <Paperclip className="w-3 h-3 text-slate-400 dark:text-slate-550" title={`Файлов: ${child.files.length}`} />
                          )}
                        </div>
                      )}

                      {/* Render custom tag pills inside card */}
                      {child.tags && child.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-2 shrink-0">
                          {child.tags.map(t => (
                            <span 
                              key={t}
                              className="text-[7.5px] font-black px-1.2 py-0.2 rounded-md bg-slate-50 border border-slate-150/60 text-slate-450 dark:bg-slate-900/50 dark:border-slate-800/60 dark:text-slate-500 truncate max-w-[50px]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {col.tasks.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center py-6 px-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl select-none bg-slate-50/20 dark:bg-slate-900/10 transition-all hover:bg-slate-50/30">
                      <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-500 text-center leading-normal">Перетащите карточки сюда</span>
                    </div>
                  )}
                </div>

                {/* Quick Inline add form */}
                <div className="mt-2 shrink-0 border-t border-slate-100/40 dark:border-slate-900/40 pt-2" onMouseDown={e => e.stopPropagation()}>
                  {inlineColAddTexts[col.id] !== undefined ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const txt = inlineColAddTexts[col.id] || '';
                        if (txt.trim()) {
                          let extraProps: Partial<TaskNode> = {};
                          if (grouping === 'status') {
                            if (col.id === 'todo') {
                              extraProps = { completed: false, progress: 0 };
                            } else if (col.id === 'progress') {
                              extraProps = { completed: false, progress: 50 };
                            } else if (col.id === 'done') {
                              extraProps = { completed: true, progress: 100 };
                            }
                          } else if (grouping === 'priority') {
                            extraProps = { priority: col.id as Priority };
                          } else if (grouping === 'category') {
                            if (col.id !== 'tagcol_none') {
                              const tagName = col.id.replace('tagcol_', '');
                              extraProps = { tags: [tagName] };
                            }
                          } else if (grouping === 'tag') {
                            if (col.id !== 'tag_none') {
                              const tagName = col.id.replace('tag_', '');
                              extraProps = { tags: [tagName] };
                            }
                          }
                          
                          onAddFloatingNode(node.x, node.y, node.id, txt.trim(), extraProps);
                          setInlineColAddTexts(prev => {
                            const updated = { ...prev };
                            delete updated[col.id];
                            return updated;
                          });
                        }
                      }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <input
                        autoFocus
                        type="text"
                        placeholder="Название..."
                        value={inlineColAddTexts[col.id]}
                        onChange={(e) => setInlineColAddTexts(prev => ({ ...prev, [col.id]: e.target.value }))}
                        onBlur={() => {
                          if (!(inlineColAddTexts[col.id] || '').trim()) {
                            setInlineColAddTexts(prev => {
                              const updated = { ...prev };
                              delete updated[col.id];
                              return updated;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setInlineColAddTexts(prev => {
                              const updated = { ...prev };
                              delete updated[col.id];
                              return updated;
                            });
                          }
                        }}
                        className="flex-1 text-[9px] py-1 px-2 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 placeholder-slate-400"
                      />
                      <button
                        type="submit"
                        className="p-1 px-2 text-[9px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer shrink-0 shadow-3xs"
                      >
                        +
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineColAddTexts(prev => ({ ...prev, [col.id]: '' }));
                      }}
                      className="w-full flex items-center justify-center gap-1 py-1 px-2.5 rounded-lg border border-dashed border-slate-200/80 dark:border-slate-800 text-slate-450 dark:text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-900/30 text-[9.5px] font-bold cursor-pointer transition-all"
                    >
                      <span>+</span> Добавить задачу
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (viewMode === 'calendar') {
      const groups = getCalendarGroups(containerChildren);
      return (
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar ${isFullScreen ? 'max-h-[70vh]' : 'max-h-[220px]'}`}>
            {groups.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-xl select-none min-h-[140px] text-center my-auto">
                <span className="text-[9px] text-slate-455 dark:text-slate-500">Задач с датами нет</span>
              </div>
            ) : (
              groups.map(g => (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center gap-1.5 mb-1 shrink-0 select-none">
                    <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-md ${g.color} shadow-2xs`}>
                      {g.title}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 font-mono">({g.tasks.length})</span>
                  </div>
                  
                  <div className="space-y-1 pl-1">
                    {g.tasks.map(child => (
                      <div 
                        key={child.id} 
                        onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                        className="p-1 px-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 shadow-2xs flex items-center justify-between gap-2 hover:border-slate-200 group/item cursor-pointer"
                      >
                        <span className={`font-semibold truncate flex-1 ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${child.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-205'}`}>
                          {child.text}
                        </span>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          {child.dueDate && (
                            <span className="text-[8px] font-extrabold text-slate-400 font-mono">
                              {formatDisplayDate(child.dueDate)}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleNodeCompleted(child.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            data-drag-ignore
                            className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 select-none cursor-pointer"
                          >
                            {child.completed ? '✅' : '⬜'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
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
              
              <div className={`flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 ${isFullScreen ? 'max-h-[70vh]' : 'max-h-[170px]'}`}>
                {ganttTasks.map(child => {
                  const startDate = child.startDate || child.dueDate;
                  const endDate = child.dueDate || child.startDate;
                  return (
                    <div key={child.id} className="flex items-center gap-1 text-[9.5px]">
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
                              className={`flex-1 rounded-xs border ${
                                isDayOfTask 
                                  ? child.completed 
                                    ? 'bg-emerald-500/20 border-emerald-400/30' 
                                    : 'bg-amber-500/70 border-amber-400 shadow-3xs' 
                                  : 'bg-slate-100/10 border-slate-100/50 dark:bg-slate-900/10 dark:border-slate-805/30'
                              }`}
                              title={`${child.text} (${startDate ?? ''} — ${endDate ?? ''})`}
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
        <div className="flex-1 flex flex-col min-h-0">
          <div className="w-full flex items-center border-b border-slate-150 dark:border-slate-800 pb-1 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest select-none shrink-0 mb-1">
            <div className="w-1/2">Задача</div>
            <div className="w-1/4 text-center">Приоритет</div>
            <div className="w-1/4 text-right">Срок</div>
          </div>
          
          <div className={`flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-0 ${isFullScreen ? 'max-h-[70vh]' : 'max-h-[200px]'}`}>
            {containerChildren.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-6 border border-dashed border-slate-200/40 dark:border-slate-850 rounded-lg select-none">
                <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-555 uppercase tracking-widest">Нет данных</span>
              </div>
            ) : (
              containerChildren.map(child => {
                const pDot = child.priority === 'urgent' ? '🔴' : child.priority === 'high' ? '🟠' : child.priority === 'medium' ? '🔵' : child.priority === 'low' ? '🟢' : '⚪';
                return (
                  <div 
                    key={child.id} 
                    className="w-full flex items-center py-1.5 border-b border-slate-100/50 dark:border-slate-850/60 hover:bg-slate-50/40 dark:hover:bg-slate-900/20 group/row"
                  >
                    <div className="w-1/2 min-w-0 pr-2 flex items-center gap-1.5">
                       <button 
                         onClick={(e) => { e.stopPropagation(); onToggleNodeCompleted(child.id); }}
                         onMouseDown={(e) => e.stopPropagation()}
                         data-drag-ignore
                         className="text-slate-400 hover:text-indigo-600 transition-all cursor-pointer text-[10px] shrink-0"
                       >
                         {child.completed ? '✅' : '⬜'}
                       </button>
                       <span 
                         onClick={(e) => { e.stopPropagation(); onSelectNode(child.id); }}
                         className={`truncate font-semibold cursor-pointer ${isFullScreen ? 'text-xs' : 'text-[9.5px]'} ${child.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-205'}`}
                       >
                         {child.text}
                       </span>
                    </div>
                    <div className="w-1/4 text-center text-[9px] font-bold">
                      <span title={`Приоритет: ${child.priority}`}>{pDot}</span>
                    </div>
                    <div className="w-1/4 text-right font-mono text-[8.5px] text-slate-400 dark:text-slate-450 pr-0.5">
                      {child.dueDate ? formatDisplayDate(child.dueDate) : '—'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
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

  // Reset focus mode if the focused container is deleted or project is switched
  useEffect(() => {
    if (focusedContainerId && !nodes.some(n => n.id === focusedContainerId)) {
      setFocusedContainerId(null);
    }
  }, [nodes, focusedContainerId]);

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
      const isSearching = searchQuery.trim() !== "";
      if (node.archived && !isSearching) return false;
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
    // 0. Resize container operation
    if (resizingNodeId) {
      const node = nodes.find(n => n.id === resizingNodeId);
      if (!node) return;

      const deltaX = (e.clientX - resizeStartPos.x) / zoom;
      const deltaY = (e.clientY - resizeStartPos.y) / zoom;

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
      const newWidth = Math.max(300, newRight - newLeft);
      const newHeight = Math.max(200, newBottom - newTop);

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
      }

      onUpdateNodeCoordinates(draggingNodeId, newX, newY);

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
          if (overlapNode.isContainer) {
            // Instant parenting for containers! No loop, no delay, no "bounce" back.
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            onUpdateNodeParent(draggingNodeId, overlapNode.id);
            setHoverTargetId(null);
          } else {
            // For regular branches, keep the 450ms delay to prevent accidental parenting while passing by
            if (hoverTargetId !== overlapNode.id) {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              setHoverTargetId(overlapNode.id);
              hoverTimerRef.current = setTimeout(() => {
                onUpdateNodeParent(draggingNodeId, overlapNode.id);
                if (navigator.vibrate) {
                  try { navigator.vibrate([60, 40, 60]); } catch (err) {}
                }
                setHoverTargetId(null);
              }, 450);
            }
          }
        } else {
          if (hoverTargetId !== null) {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoverTargetId(null);
        }
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setResizingNodeId(null);
    setResizeDirection(null);

    if (draggingNodeId && hasDraggedNode) {
      const node = nodes.find(n => n.id === draggingNodeId);
      if (node) {
        const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
        const currentParent = nodes.find(p => p.id === node.parentId);
        
        if (overlap) {
          // Snap directly on release
          onUpdateNodeParent(node.id, overlap.id);
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
                  onUpdateNodeParent(node.id, focusedContainerId);
                }
              } else {
                onUpdateNodeParent(node.id, null);
              }
            }
          } else {
            // Dragged away from standard parent by more than 330px on empty space -> auto detach!
            const dx = node.x - currentParent.x;
            const dy = node.y - currentParent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 330) {
              if (focusedContainerId) {
                onUpdateNodeParent(node.id, focusedContainerId);
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
                  onUpdateNodeParent(node.id, container.id);
                } else {
                  onUpdateNodeParent(node.id, null);
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
            setHasDraggedNode(true);
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
      const newWidth = Math.max(300, newRight - newLeft);
      const newHeight = Math.max(200, newBottom - newTop);

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
      }

      onUpdateNodeCoordinates(draggingNodeId, newX, newY);

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
          if (overlapNode.isContainer) {
            // Instant parenting for containers! No loop, no delay, no "bounce" back.
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            onUpdateNodeParent(draggingNodeId, overlapNode.id);
            setHoverTargetId(null);
          } else {
            // For regular branches, keep the 450ms delay to prevent accidental parenting while passing by
            if (hoverTargetId !== overlapNode.id) {
              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
              setHoverTargetId(overlapNode.id);
              hoverTimerRef.current = setTimeout(() => {
                onUpdateNodeParent(draggingNodeId, overlapNode.id);
                if (navigator.vibrate) {
                  try { navigator.vibrate([60, 40, 60]); } catch (err) {}
                }
                setHoverTargetId(null);
              }, 450);
            }
          }
        } else {
          if (hoverTargetId !== null) {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            setHoverTargetId(null);
          }
        }
      } else {
        if (hoverTargetId !== null) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoverTargetId(null);
        }
      }

      e.preventDefault(); // prevent scroll
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setResizingNodeId(null);
    setResizeDirection(null);
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
          const overlap = getOverlapParent(draggingNodeId, node.x, node.y);
          const currentParent = nodes.find(p => p.id === node.parentId);
          
          if (overlap) {
            // Snap inside container or parent directly on drop
            onUpdateNodeParent(node.id, overlap.id);
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
                    onUpdateNodeParent(node.id, focusedContainerId);
                  }
                } else {
                  onUpdateNodeParent(node.id, null);
                }
              }
            } else {
              // Dragged away from standard parent by more than 330px on empty space -> auto detach!
              const dx = node.x - currentParent.x;
              const dy = node.y - currentParent.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 330) {
                if (focusedContainerId) {
                  onUpdateNodeParent(node.id, focusedContainerId);
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
                    onUpdateNodeParent(node.id, container.id);
                  } else {
                    onUpdateNodeParent(node.id, null);
                  }
                }
              }
            }
          }
        }
      }

      if (!isLongPressDragging && potentialDragNodeIdRef.current) {
        onSelectNode(potentialDragNodeIdRef.current);
      } else if (hasDraggedNode || isLongPressDragging) {
        onSelectNode(null);
      }
      setIsPanning(false);
      setDraggingNodeId(null);
      setHasDraggedNode(false);
      setIsLongPressDragging(false);
      potentialDragNodeIdRef.current = null;
    }
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
  };

  // Start container resizing from Mouse Down
  const startResize = (e: React.MouseEvent, node: TaskNode, direction: string = 'se') => {
    e.stopPropagation();
    e.preventDefault();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    setResizeStartPos({ x: e.clientX, y: e.clientY });
    setResizeStartSize({
      width: node.width || 520,
      height: node.height || 400
    });
    setResizeStartCenter({ x: node.x, y: node.y });
  };

  // Start container resizing from Touch Start
  const startResizeTouch = (e: React.TouchEvent, node: TaskNode, direction: string = 'se') => {
    if (e.touches.length === 0) return;
    e.stopPropagation();
    onSelectNode(node.id);
    setResizingNodeId(node.id);
    setResizeDirection(direction);
    const touch = e.touches[0];
    setResizeStartPos({ x: touch.clientX, y: touch.clientY });
    setResizeStartSize({
      width: node.width || 520,
      height: node.height || 400
    });
    setResizeStartCenter({ x: node.x, y: node.y });
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
    <div className="flex flex-col h-full w-full overflow-hidden select-none bg-white dark:bg-slate-950">
      {/* Solid Focused Container Top Stats Bar */}
      {focusedContainerId && (() => {
        const focusedContainer = nodes.find(n => n.id === focusedContainerId);
        if (!focusedContainer) return null;
        
        const containerChildren = nodes.filter(n => n.id !== focusedContainerId && !n.isContainer && isDescendantOrSelf(n.id, focusedContainerId, nodes));
        const totalChildren = containerChildren.length;
        const completedChildren = containerChildren.filter(n => n.completed).length;
        const progress = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;
        
        return (
          <div className="w-full bg-slate-50 dark:bg-slate-900 border-b border-amber-305 dark:border-amber-950/60 shadow-xs flex flex-col md:flex-row items-center gap-1.5 md:gap-3 px-3 py-1.5 md:px-4 md:py-1.5 shrink-0 select-none animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between w-full md:w-auto gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">📦</span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[9px] text-amber-600 dark:text-amber-400 font-bold tracking-wider uppercase font-sans leading-none">Режим фокусировки</div>
                  <input
                    type="text"
                    value={focusedContainer.text}
                    onChange={(e) => {
                      onUpdateNode({
                        ...focusedContainer,
                        text: e.target.value
                      });
                    }}
                    className="text-xs font-sans font-extrabold text-slate-800 dark:text-slate-100 bg-transparent border-b border-dashed border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:outline-none focus:ring-0 px-0.5 py-0 min-w-0 max-w-[130px] sm:max-w-[200px]"
                    placeholder="Имя контейнера"
                  />
                </div>
              </div>

              {/* Progress and Return button stacked on mobile next to title for compactness */}
              <div className="flex items-center gap-2 md:hidden">
                <div className="flex flex-col items-end text-right leading-none">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {completedChildren}/{totalChildren} Выполнено
                  </span>
                  <div className="w-10 bg-slate-200 dark:bg-slate-800 h-1 mt-0.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
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
                  className="flex items-center gap-1 px-2 py-1 hover:bg-rose-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-[10px] font-bold transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs whitespace-nowrap"
                >
                  <Minimize2 className="w-3 h-3 text-rose-500" />
                  <span>Вернуться</span>
                </button>
              </div>
            </div>
            
            <div className="hidden md:block w-[1px] h-6 bg-slate-200 dark:bg-slate-800 shrink-0" />

            {/* View Selector for Focused Mode - 100% width on Mobile for smooth touch scroll */}
            <div className="flex items-center gap-0.5 bg-slate-200/50 dark:bg-slate-950/40 p-0.5 rounded-lg border border-slate-200/40 dark:border-slate-800/60 overflow-x-auto scrollbar-none select-none w-full md:w-auto justify-start md:justify-center">
              {[
                { id: 'canvas', label: 'Карта', icon: '🕸️' },
                { id: 'list', label: 'Список', icon: '📋' },
                { id: 'kanban', label: 'Канбан', icon: '📊' },
                { id: 'calendar', label: 'Календарь', icon: '📅' },
                { id: 'gantt', label: 'Гант', icon: '📈' },
                { id: 'table', label: 'Таблица', icon: '🗂️' }
              ].map(v => {
                const active = (containerViewModes[focusedContainer.id] || 'canvas') === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContainerViewMode(focusedContainer.id, v.id as any);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    data-drag-ignore
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      active 
                        ? 'bg-amber-100 dark:bg-amber-950/75 text-amber-800 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/50 shadow-2xs' 
                        : 'text-slate-650 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <span className="text-xs">{v.icon}</span>
                    <span>{v.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="hidden md:block w-[1px] h-6 bg-slate-200 dark:bg-slate-800 shrink-0" />
            
            {/* Desktop-only Stats, Progress and Return button */}
            <div className="hidden md:flex items-center gap-3 shrink-0 ml-auto">
              <div className="flex flex-col items-end gap-0.5 select-none text-right">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {completedChildren}/{totalChildren} Выполнено
                </span>
                <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
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
                className="flex items-center gap-1 px-2.5 py-1 md:py-1.5 hover:bg-rose-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-[10px] md:text-[11px] font-bold transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
              >
                <Minimize2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-rose-500" />
                <span>Вернуться</span>
              </button>
            </div>
          </div>
        );
      })()}

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
        {/* Immersive Fullscreen View Content for Focused Container */}
        {focusedContainerId && (() => {
          const focusedContainer = nodes.find(n => n.id === focusedContainerId);
          if (!focusedContainer) return null;
          const viewMode = containerViewModes[focusedContainer.id] || 'canvas';
          if (viewMode === 'canvas') return null;

          const containerChildren = nodes.filter(n => n.id !== focusedContainerId && !n.isContainer && isDescendantOrSelf(n.id, focusedContainerId, nodes));
          
          return (
            <div className="absolute inset-0 bg-slate-550/10 dark:bg-slate-950/40 backdrop-blur-xs z-30 flex items-center justify-center p-4">
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-amber-200 dark:border-amber-900/50 rounded-3xl shadow-2xl w-full max-w-none h-full flex flex-col p-4 sm:p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-30">
                <div className="flex-1 flex flex-col min-h-0 select-text overflow-hidden z-30">
                  {renderContainerBody(focusedContainer, containerChildren, true)}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Floating Canvas UI Controls */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
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
            onAddFloatingNode(x, y, focusedContainerId);
          }}
          title={focusedContainerId ? "Создать новую задачу внутри текущего контейнера" : "Создать независимую плавующую задачу по центру холста (или дважды кликните на пустом месте)"}
          className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-350 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40 shrink-0"
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span className="hidden sm:inline">{focusedContainerId ? 'Создать задачу' : 'Плавающая задача'}</span>
          <span className="sm:hidden">{focusedContainerId ? 'Задача' : 'Плавающая'}</span>
        </button>

        <button
          onClick={startCanvasDictation}
          title={focusedContainerId ? "Продиктовать название новой задачи внутри текущего контейнера" : "Записать новую задачу на холст голосом"}
          className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-xs font-semibold select-none cursor-pointer border text-indigo-600 dark:text-indigo-400 hover:text-indigo-705 dark:hover:text-indigo-350 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border-transparent hover:border-indigo-200 dark:hover:border-indigo-900/40 shrink-0"
        >
          <Mic className="w-3.5 h-3.5 text-indigo-500" />
          <span className="hidden sm:inline">Продиктовать задачу</span>
          <span className="sm:hidden">Голос</span>
        </button>

        {!focusedContainerId && (
          <>
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
          </>
        )}
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
        className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible origin-center"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transition: isTransitioningTransform ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
        }}
      >
        {/* SVG connection lines render */}
        <svg className="absolute inset-0 pointer-events-none overflow-visible w-1 h-1">
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

            const containerChildren = nodes.filter(n => n.id !== node.id && !n.isContainer && isDescendantOrSelf(n.id, node.id, nodes));
            const totalChildren = containerChildren.length;
            const completedChildren = containerChildren.filter(n => n.completed).length;
            const containerProgress = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;
            const isContainerSelected = isSelected;
            const isContainerCollapsed = !!node.collapsed;
            const isDraggingThisNode = draggingNodeId === node.id || (isLongPressDragging && potentialDragNodeIdRef.current === node.id);
            const matches = isNodeMatched(node);
            const isDimmed = isAnyFilterActive && !matches;

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                style={{
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isContainerSelected ? 30 : 2, 
                  width: isContainerCollapsed ? '220px' : `${node.width || 520}px`,
                  height: isContainerCollapsed ? '100px' : `${node.height || 400}px`,
                }}
                className={`absolute rounded-2xl border-2 ${(isDraggingThisNode || resizingNodeId === node.id) ? '' : 'transition-all duration-150'} ${
                  isDimmed ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 duration-300' : ''
                } ${
                  hoverTargetId === node.id
                    ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-500 ring-4 ring-amber-500/30 scale-[1.015]'
                    : isContainerSelected
                      ? 'bg-slate-50/40 dark:bg-slate-900/40 border-amber-500 shadow-lg ring-4 ring-amber-500/20'
                      : 'bg-slate-50/10 dark:bg-slate-900/15 border-slate-300 dark:border-slate-800 shadow-sm hover:border-slate-400 dark:hover:border-slate-700'
                } flex flex-col`}
                onMouseDown={(e) => startDragNode(e, node)}
                onClick={(e) => {
                  if (hasDraggedNode) return;
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                {/* Header of Container Canvas */}
                <div className={`p-3 flex items-center justify-between border-b ${isContainerSelected ? 'border-amber-200 dark:border-amber-900/50' : 'border-slate-200/80 dark:border-slate-800'} rounded-t-2xl bg-white/40 dark:bg-slate-950/40 select-none pb-2.5`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-amber-500 dark:text-amber-400 shrink-0 text-sm">
                      📦
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate font-sans tracking-wide">
                      {node.text || 'Новый холст-контейнер'}
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
                  <div className="px-3 py-1.5 flex items-center gap-1 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800/60 overflow-x-auto scrollbar-none select-none z-10 shrink-0">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1 shrink-0">Вид:</span>
                    {[
                      { id: 'canvas', label: 'Карта', icon: '🕸️' },
                      { id: 'list', label: 'Список', icon: '📋' },
                      { id: 'kanban', label: 'Канбан', icon: '📊' },
                      { id: 'calendar', label: 'Календарь', icon: '📅' },
                      { id: 'gantt', label: 'Гант', icon: '📈' },
                      { id: 'table', label: 'Таблица', icon: '🗂️' }
                    ].map(v => {
                      const active = (containerViewModes[node.id] || 'canvas') === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setContainerViewMode(node.id, v.id as any);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          data-drag-ignore
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                            active 
                              ? 'bg-amber-100 dark:bg-amber-950/75 text-amber-800 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/50 shadow-2xs' 
                              : 'text-slate-550 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <span className="text-[10px]">{v.icon}</span>
                          <span>{v.label}</span>
                        </button>
                      );
                    })}
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
                      <div className="mt-auto pt-2 border-t border-slate-100/40 dark:border-slate-800/40 flex items-center justify-between select-none bg-white/20 dark:bg-slate-950/20 px-2 py-1.5 rounded-lg z-10 shrink-0">
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
                      <svg width="6" height="6" viewBox="0 0 6 6" className="text-amber-600 dark:text-amber-400 opacity-60">
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
              </div>
            );
          }
const pInfo = getPriorityInfo(node.priority);
          const hasNotes = node.notes.trim().length > 0;
          const hasFiles = node.files.length > 0;
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

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={{
                left: node.x,
                top: node.y,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 30 : 10,
              }}
              className={`absolute group cursor-grab active:cursor-grabbing w-[210px] rounded-xl border ${isDraggingThisNode ? '' : 'transition-all duration-150'} ${
                isDimmed 
                  ? 'opacity-20 dark:opacity-15 grayscale-[50%] scale-95 hover:opacity-90 hover:grayscale-0 hover:scale-100 duration-300' 
                  : ''
              } ${
                hoverTargetId === node.id
                  ? 'bg-indigo-50/10 dark:bg-indigo-950/20 border-indigo-500 ring-4 ring-indigo-500 scale-[1.03] shadow-[0_0_15px_rgba(99,102,241,0.4)] animate-pulse'
                  : isRoot
                    ? isSelected
                      ? 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent ring-4 ring-indigo-250 dark:ring-indigo-900 shadow-xl'
                      : 'bg-indigo-600 dark:bg-indigo-800 text-white border-transparent shadow-md hover:shadow-lg hover:scale-[1.02]'
                    : priorityViewActive
                      ? `bg-white dark:bg-slate-900 ${getPriorityCardStyles(node.priority, isSelected)}`
                      : isSelected 
                        ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-500 ring-4 ring-indigo-50 dark:ring-indigo-950/40 shadow-lg' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-650 shadow-sm'
              } ${node.completed ? 'opacity-85' : isOverdue(node.dueDate) ? 'border-red-400 dark:border-red-900/60 shadow-[0_0_10px_rgba(239,68,68,0.25)] bg-red-50/10 dark:bg-red-950/5' : ''}`}
              onMouseDown={(e) => startDragNode(e, node)}
              onClick={(e) => {
                if (hasDraggedNode) return; // ignore click if dragged
                e.stopPropagation();
                onSelectNode(node.id);
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
                    <p className={`text-xs font-semibold leading-snug font-sans break-words ${
                      isRoot 
                        ? 'text-white' 
                        : 'text-slate-800 dark:text-slate-100 font-medium'
                    } ${node.completed ? 'line-through opacity-60 italic' : ''} flex items-center flex-wrap gap-1`}>
                      <span>{node.text || 'Без названия'}</span>
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
                              : isOverdue(node.dueDate)
                                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-900/60 animate-pulse font-extrabold shadow-[0_0_6px_rgba(244,63,94,0.3)]'
                                : isRoot
                                  ? 'bg-indigo-500/20 text-indigo-100 border-indigo-400/30'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-250 dark:border-emerald-900'
                          }`}
                          title={
                            node.completed 
                              ? `Срок выполнения: ${formatDisplayDate(node.dueDate)} (Выполнено)`
                              : isOverdue(node.dueDate)
                                ? `Внимание! Срок выполнения истек: ${formatDisplayDate(node.dueDate)}`
                                : `Срок выполнения: ${formatDisplayDate(node.dueDate)}`
                          }
                        >
                          {isOverdue(node.dueDate) && !node.completed ? (
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-bounce" />
                          ) : (
                            <Calendar className="w-2.5 h-2.5 text-indigo-500 dark:text-indigo-400" />
                          )}
                          <span>{formatDisplayDate(node.dueDate)}</span>
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
                          const matchedCategory = tagCategories.find(cat => cat.tags && cat.tags.includes(tag));
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
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2 text-[9px] text-slate-400 dark:text-slate-500 font-medium select-none">
                    <span className="px-1 text-[8px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-550 rounded border border-slate-250 dark:border-slate-750">
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
                  className="absolute -bottom-11 left-1/2 transform -translate-x-1/2 flex items-center gap-1 px-1.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-[0_8px_25px_-4px_rgba(99,102,241,0.25)] dark:shadow-[0_8px_25px_-4px_rgba(0,0,0,0.6)] z-50 pointer-events-auto whitespace-nowrap animate-fade-in"
                >
                  {/* Button 1: Добавить дочернюю задачу */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChildNode(node.id);
                    }}
                    title="Добавить дочернюю задачу"
                    className="flex items-center justify-center w-7 h-7 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

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
                    className="flex items-center justify-center w-7 h-7 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    {node.isCardCollapsed ? (
                      <FolderPlus className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <FolderMinus className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {node.parentId !== null && (
                    <>
                      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                      {/* Button 1.5: Отсоединить задачу */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNodeParent(node.id, null);
                        }}
                        title="Отсоединить задачу от родительской (сделать свободной)"
                        className="flex items-center justify-center w-7 h-7 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                      >
                        <Link2Off className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2: Заметки */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotesModalNodeId(node.id);
                    }}
                    title="Открыть заметки"
                    className="flex items-center justify-center w-7 h-7 text-emerald-600 dark:text-emerald-450 hover:bg-emerald-55 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                  {/* Button 2.5: Открыть всю задачу (Eye) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrawer();
                    }}
                    title="Открыть всю задачу"
                    className="flex items-center justify-center w-7 h-7 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

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
                    className="flex items-center justify-center w-7 h-7 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {!isRoot && (
                    <>
                      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 3.5: Архивировать */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNode({
                            ...node,
                            archived: !node.archived
                          });
                        }}
                        title={node.archived ? "Восстановить из архива" : "Архивировать задачу и подзадачи"}
                        className={`flex items-center justify-center w-7 h-7 rounded-full cursor-pointer transition-colors ${
                          node.archived
                            ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800"
                            : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Archive className="w-4 h-4" />
                      </button>

                      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />

                      {/* Button 4: Удалить */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNode(node.id);
                        }}
                        title="Удалить ветвь"
                        className="flex items-center justify-center w-7 h-7 text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
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
        className="absolute top-4 right-4 z-40 pointer-events-auto select-none"
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
          <div className="w-80 max-h-[460px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {node.files.map((file) => {
                        const isImg = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp)$/i.test(file.name);
                        return (
                          <div 
                            key={file.id} 
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-750 text-xs text-slate-700 dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200"
                          >
                            <div 
                              onClick={() => {
                                if (isImg && file.dataUrl) {
                                  openPreviewImage(file.dataUrl, file.name);
                                }
                              }}
                              className={`flex items-center gap-2 min-w-0 flex-1 mr-2 ${isImg ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors' : ''}`}
                              title={isImg ? "Нажмите для просмотра изображения" : undefined}
                            >
                              {isImg ? (
                                <FileImage className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              ) : (
                                <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              )}
                              <span className={`truncate font-semibold ${isImg ? 'underline decoration-dotted decoration-emerald-500/50 hover:decoration-emerald-500' : 'text-slate-755 dark:text-slate-255'}`}>{file.name}</span>
                              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">
                                ({formatFileSize(file.size)})
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {isImg && file.dataUrl && (
                                <button
                                  onClick={() => openPreviewImage(file.dataUrl, file.name)}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-605 dark:hover:text-indigo-405"
                                  title="Просмотреть изображение"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {/* Download */}
                              {file.dataUrl && (
                                <a
                                  href={file.dataUrl}
                                  download={file.name}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                                  title="Скачать файл"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}

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

      {/* Lightbox Modal for Image Preview */}
      {previewImage && createPortal(
        <div 
          className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-fade-in"
          onClick={closePreviewImage}
          onWheel={(e) => {
            e.stopPropagation();
            const delta = e.deltaY;
            setZoomScale(prev => {
              const zoomFactor = delta < 0 ? 1.15 : 0.85;
              const next = prev * zoomFactor;
              return Math.min(Math.max(next, 0.4), 12);
            });
          }}
        >
          {/* Header toolbar */}
          <div 
            className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title / Name */}
            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 text-white text-xs font-bold font-sans max-w-[50vw] truncate pointer-events-auto shadow-lg select-all">
              {previewImage.name}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomScale(prev => Math.min(prev * 1.25, 12));
                }}
                className="p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition border border-slate-800 shadow-lg cursor-pointer flex items-center justify-center"
                title="Увеличить (Колесо мыши вверх)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomScale(prev => Math.max(prev * 0.8, 0.4));
                }}
                className="p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition border border-slate-800 shadow-lg cursor-pointer flex items-center justify-center"
                title="Уменьшить (Колесо мыши вниз)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomScale(1);
                  setDragOffset({ x: 0, y: 0 });
                }}
                className="p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition border border-slate-800 shadow-lg cursor-pointer flex items-center justify-center font-bold text-xs"
                title="Сбросить масштаб"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <a
                href={previewImage.url}
                download={previewImage.name}
                className="p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition border border-slate-800 shadow-lg cursor-pointer flex items-center justify-center"
                title="Скачать изображение"
              >
                <Download className="w-5 h-5" />
              </a>
              <button
                onClick={closePreviewImage}
                className="p-2.5 bg-slate-900/80 hover:bg-rose-950 text-white hover:text-rose-450 rounded-full transition border border-slate-800 hover:border-rose-900 shadow-lg cursor-pointer flex items-center justify-center"
                title="Закрыть (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Image Container */}
          <div 
            className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onClick={closePreviewImage}
            onMouseDown={(e) => {
              if (e.button !== 0) return; // Only left click
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingImage(true);
              setDragStartImage({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
            }}
            onMouseMove={(e) => {
              if (!isDraggingImage) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOffset({
                x: e.clientX - dragStartImage.x,
                y: e.clientY - dragStartImage.y
              });
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              setIsDraggingImage(false);
            }}
            onMouseLeave={() => {
              setIsDraggingImage(false);
            }}
          >
            <img 
              src={previewImage.url} 
              alt={previewImage.name} 
              referrerPolicy="no-referrer"
              draggable="false"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl transition-transform duration-75 ease-out select-none"
              style={{
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(${zoomScale})`,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Bottom Info Hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 bg-slate-900/60 backdrop-blur-sm px-4 py-1.5 rounded-full pointer-events-none font-medium text-center">
            Используйте колесо мыши для масштабирования • Зажмите левую кнопку мыши для перемещения
          </div>
        </div>,
        document.body
      )}
    </div>
    </div>
  );
}
