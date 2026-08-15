import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Loader2, 
  Tag, 
  Calendar, 
  ChevronUp, 
  ChevronDown, 
  ChevronRight,
  SlidersHorizontal,
  ArrowUpDown,
  FileText,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  Timer,
  MessageSquare,
  Layers,
  Search,
  Zap,
  MoreHorizontal,
  Grid,
  GanttChart,
  Kanban,
  Hourglass,
  ExternalLink,
  Check,
  Eye
} from 'lucide-react';
import { TaskNode, TagCategory, Priority, ViewMode } from '../types';
import { getPomoStatsForNode, formatTotalPomoTime, getTaskExternalLinks } from '../utils';

interface TableViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], priority?: Priority, dueDate?: string) => void;
  selectedNodeIds?: string[];
  onToggleSelectNode?: (id: string) => void;
  onToggleSelectAll?: (ids: string[]) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  onFocusedTaskIdChange?: (id: string | null) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  setViewMode?: (mode: ViewMode) => void;
}

type SortField = 'text' | 'completed' | 'priority' | 'progress' | 'dueDate' | 'startDate' | 'pomodoroTotalTime';
type SortOrder = 'asc' | 'desc';

// Helper to format dates cleanly like in Notion (e.g. "14 мая 2025" or "May 14, 2025")
function formatNotionDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// Extract or generate a clean Notion icon for each task item
function getTaskPageIcon(task: TaskNode): string {
  if (task.icon) return task.icon;
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
  const match = task.text.match(emojiRegex);
  if (match) return match[0];
  
  if (task.isContainer) return '📁';
  const lower = task.text.toLowerCase();
  if (lower.includes('видео') || lower.includes('video')) return '🎬';
  if (lower.includes('иллюстрац') || lower.includes('изображ') || lower.includes('фото') || lower.includes('картин')) return '🖼️';
  if (lower.includes('пост') || lower.includes('статья') || lower.includes('текст') || lower.includes('copy')) return '📝';
  if (lower.includes('сайт') || lower.includes('главн') || lower.includes('page') || lower.includes('web')) return '🌐';
  if (lower.includes('отчет') || lower.includes('аналит') || lower.includes('стат')) return '📊';
  if (lower.includes('конкурент') || lower.includes('сравн')) return '🆚';
  if (task.priority === 'urgent' || task.priority === 'high') return '⚡';
  return '📄';
}

// Clean task text by removing leading emoji if present for the text input
function cleanTaskTitle(text: string): string {
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u;
  return text.replace(emojiRegex, '');
}

export default function TableView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  selectedNodeIds = [],
  onToggleSelectNode,
  onToggleSelectAll,
  onFullScreenChange,
  onFocusedTaskIdChange,
  projectName = 'Проекты',
  projectIcon = '📁',
  onUpdateProjectName,
  setViewMode
}: TableViewProps) {
  const [sortField, setSortField] = useState<SortField>('text');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'todo' | 'progress' | 'waiting' | 'done'>('all');
  const [containerFilter, setContainerFilter] = useState<string>('all');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [inlineNewText, setInlineNewText] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(projectName);
  const [activePriorityMenuTaskId, setActivePriorityMenuTaskId] = useState<string | null>(null);

  // Visible columns state
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('notion_table_visible_columns');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      startDate: true,
      dueDate: true,
      effort: true,
      focus: false,
      progress: true,
      tags: true
    };
  });

  const toggleColumnVisibility = (key: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('notion_table_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    setEditedTitle(projectName);
  }, [projectName]);

  useEffect(() => {
    if (onFullScreenChange) {
      onFullScreenChange(isFullScreen);
    }
  }, [isFullScreen, onFullScreenChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) setIsFullScreen(false);
        setIsFilterOpen(false);
        setIsSortOpen(false);
        setIsPropertiesOpen(false);
        setActivePriorityMenuTaskId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Column widths state in pixels
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('notion_table_column_widths');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      name: 380,
      startDate: 150,
      dueDate: 150,
      effort: 140,
      progress: 130,
      focus: 110,
      tags: 160,
      actions: 60
    };
  });

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widths[colKey];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextWidth = Math.max(70, startWidth + deltaX);
      setWidths(prev => ({ ...prev, [colKey]: nextWidth }));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const deltaX = upEvent.clientX - startX;
      const finalWidth = Math.max(70, startWidth + deltaX);
      setWidths(prev => {
        const finalWidths = { ...prev, [colKey]: finalWidth };
        localStorage.setItem('notion_table_column_widths', JSON.stringify(finalWidths));
        return finalWidths;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderResizer = (colKey: string) => (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        handleResizeStart(colKey, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#2383E2] active:bg-[#2383E2] transition-colors z-20 group-hover:bg-slate-200 dark:group-hover:bg-neutral-700"
      title="Изменить ширину столбца"
    />
  );

  const priorityLevels: Record<Priority, number> = {
    'urgent': 4,
    'high': 3,
    'medium': 2,
    'low': 1,
    'none': 0
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getTaskContainerId = (node: TaskNode): string | null => {
    let curr: TaskNode | undefined = node;
    const visited = new Set<string>();
    while (curr && curr.parentId) {
      if (visited.has(curr.parentId)) break;
      visited.add(curr.parentId);
      const parentNode = nodes.find(n => n.id === curr!.parentId);
      if (parentNode && parentNode.isContainer) return parentNode.id;
      curr = parentNode;
    }
    return null;
  };

  const allContainers = useMemo(() => {
    return nodes.filter(n => n.isContainer && !n.archived);
  }, [nodes]);

  const rawTasks = useMemo(() => {
    return nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle);
  }, [nodes]);

  const hierarchicalTasks = useMemo(() => {
    const tasksMap = new Map<string, TaskNode>();
    rawTasks.forEach(t => tasksMap.set(t.id, t));

    const taskMatchesFilter = (task: TaskNode): boolean => {
      const matchText = task.text.toLowerCase().includes(filterText.toLowerCase());
      const matchNote = task.notes && task.notes.toLowerCase().includes(filterText.toLowerCase());
      if (!matchText && !matchNote) return false;

      if (containerFilter !== 'all') {
        const tContainerId = getTaskContainerId(task);
        if (containerFilter === 'no-container') {
          if (tContainerId !== null) return false;
        } else {
          if (tContainerId !== containerFilter) return false;
        }
      }

      if (statusFilter === 'active') {
        return !task.completed;
      } else if (statusFilter === 'todo') {
        return !task.completed && (!task.progress || task.progress === 0) && task.status !== 'waiting';
      } else if (statusFilter === 'progress') {
        return !task.completed && task.progress !== undefined && task.progress > 0 && task.status !== 'waiting';
      } else if (statusFilter === 'waiting') {
        return !task.completed && task.status === 'waiting';
      } else if (statusFilter === 'done') {
        return task.completed;
      }
      return true;
    };

    const memoMatch = new Map<string, boolean>();
    const checkMatchOrDescendantMatch = (taskId: string): boolean => {
      if (memoMatch.has(taskId)) return memoMatch.get(taskId)!;
      const task = tasksMap.get(taskId);
      if (!task) return false;

      if (taskMatchesFilter(task)) {
        memoMatch.set(taskId, true);
        return true;
      }

      const children = rawTasks.filter(t => t.parentId === taskId);
      for (const child of children) {
        if (checkMatchOrDescendantMatch(child.id)) {
          memoMatch.set(taskId, true);
          return true;
        }
      }

      memoMatch.set(taskId, false);
      return false;
    };

    const roots = rawTasks.filter(t => !t.parentId || !tasksMap.has(t.parentId));

    const sortSiblings = (siblings: TaskNode[]) => {
      const sorted = [...siblings];
      sorted.sort((a, b) => {
        let comparison = 0;
        if (sortField === 'text') {
          comparison = a.text.localeCompare(b.text);
        } else if (sortField === 'completed') {
          comparison = (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
        } else if (sortField === 'priority') {
          comparison = priorityLevels[a.priority] - priorityLevels[b.priority];
        } else if (sortField === 'progress') {
          comparison = (a.progress || 0) - (b.progress || 0);
        } else if (sortField === 'dueDate') {
          comparison = (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
        } else if (sortField === 'startDate') {
          comparison = (a.startDate || a.createdAt || '9999-12-31').localeCompare(b.startDate || b.createdAt || '9999-12-31');
        } else if (sortField === 'pomodoroTotalTime') {
          const timeA = getPomoStatsForNode(a, nodes).pomodoroTotalTime;
          const timeB = getPomoStatsForNode(b, nodes).pomodoroTotalTime;
          comparison = timeA - timeB;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
      return sorted;
    };

    const result: { node: TaskNode; depth: number; hasChildren: boolean }[] = [];

    const traverse = (siblings: TaskNode[], depth: number, parentCollapsed: boolean) => {
      const visibleSiblings = siblings.filter(s => checkMatchOrDescendantMatch(s.id));
      const sortedSiblings = sortSiblings(visibleSiblings);

      sortedSiblings.forEach(task => {
        const children = rawTasks.filter(c => c.parentId === task.id);
        const hasChildren = children.some(c => checkMatchOrDescendantMatch(c.id));

        if (!parentCollapsed) {
          result.push({
            node: task,
            depth,
            hasChildren
          });
        }

        if (children.length > 0) {
          traverse(children, depth + 1, parentCollapsed || !!task.collapsed);
        }
      });
    };

    traverse(roots, 0, false);
    return result;
  }, [rawTasks, filterText, statusFilter, containerFilter, sortField, sortOrder, nodes]);

  const handleCreateNewTask = (textToCreate?: string) => {
    const defaultText = textToCreate?.trim() || 'Новая запись';
    if (onCreateTask) {
      onCreateTask(defaultText, [], 'medium');
    } else {
      const fallback: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text: defaultText,
        x: 0,
        y: 0,
        parentId: null,
        priority: 'medium',
        tags: [],
        notes: '',
        completed: false,
        files: [],
        createdAt: new Date().toISOString(),
        startDate: new Date().toISOString().split('T')[0]
      };
      onUpdateNode(fallback);
    }
  };

  const handleInlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inlineNewText.trim()) {
      handleCreateNewTask(inlineNewText.trim());
      setInlineNewText('');
      setIsAddingInline(false);
    }
  };

  // Effort level badge colors in Notion style
  const renderEffortBadge = (priority: Priority, taskId: string) => {
    let label = 'None';
    let styleClass = 'notion-tag-gray';

    switch (priority) {
      case 'low':
        label = 'Small';
        styleClass = 'notion-tag-green';
        break;
      case 'medium':
        label = 'Medium';
        styleClass = 'notion-tag-yellow';
        break;
      case 'high':
        label = 'Large';
        styleClass = 'notion-tag-orange';
        break;
      case 'urgent':
        label = 'Urgent';
        styleClass = 'notion-tag-red';
        break;
      default:
        label = 'None';
        styleClass = 'notion-tag-gray';
        break;
    }

    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActivePriorityMenuTaskId(activePriorityMenuTaskId === taskId ? null : taskId);
          }}
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-normal transition-all hover:opacity-85 cursor-pointer select-none ${styleClass}`}
          title="Нажмите для смены уровня сложности / приоритета"
        >
          {label}
        </button>

        {activePriorityMenuTaskId === taskId && (
          <div 
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full left-0 mt-1 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-lg rounded-md p-1 z-50 w-32 space-y-0.5"
          >
            {(['none', 'low', 'medium', 'high', 'urgent'] as Priority[]).map((p) => {
              let pLabel = 'None';
              let pClass = 'notion-tag-gray';
              if (p === 'low') { pLabel = 'Small'; pClass = 'notion-tag-green'; }
              else if (p === 'medium') { pLabel = 'Medium'; pClass = 'notion-tag-yellow'; }
              else if (p === 'high') { pLabel = 'Large'; pClass = 'notion-tag-orange'; }
              else if (p === 'urgent') { pLabel = 'Urgent'; pClass = 'notion-tag-red'; }

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    const task = nodes.find(n => n.id === taskId);
                    if (task) {
                      onUpdateNode({ ...task, priority: p });
                    }
                    setActivePriorityMenuTaskId(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 flex items-center justify-between text-xs cursor-pointer"
                >
                  <span className={`px-1.5 py-0.5 rounded text-[11px] ${pClass}`}>{pLabel}</span>
                  {priority === p && <Check className="w-3 h-3 text-[#2383E2]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const isAnyFilterActive = statusFilter !== 'all' || containerFilter !== 'all' || filterText.trim().length > 0;

  return (
    <div 
      id="notion-database-table-view"
      onClick={() => setActivePriorityMenuTaskId(null)}
      className={`flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#E3E2E0] font-sans overflow-hidden transition-all select-none ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'w-full h-full'
      }`}
    >
      {/* 1. NOTION TOP HEADER / BREADCRUMB BAR */}
      <div className="shrink-0 px-6 sm:px-10 pt-5 pb-3">
        {/* Breadcrumbs */}
        <div className="flex items-center justify-between text-[13px] text-[#787774] dark:text-[#9B9A97] mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{projectIcon}</span>
            <span className="font-medium text-[#37352F] dark:text-[#E3E2E0]">{projectName}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1 hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] rounded transition-colors cursor-pointer"
              title={isFullScreen ? "Свернуть (Esc)" : "На весь экран"}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Big Notion Database Title */}
        <div className="flex items-center gap-3 group/header mb-4">
          <span className="text-3xl sm:text-4xl cursor-pointer hover:scale-105 transition-transform" title="Иконка проекта">
            {projectIcon}
          </span>

          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              autoFocus
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                if (editedTitle.trim() && onUpdateProjectName) {
                  onUpdateProjectName(editedTitle.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingTitle(false);
                  if (editedTitle.trim() && onUpdateProjectName) {
                    onUpdateProjectName(editedTitle.trim());
                  }
                }
              }}
              className="text-2xl sm:text-3xl font-bold bg-transparent border-b border-[#2383E2] focus:outline-none text-[#37352F] dark:text-[#E3E2E0]"
            />
          ) : (
            <h1 
              onClick={() => setIsEditingTitle(true)}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-[#37352F] dark:text-[#E3E2E0] hover:bg-[#EFEFED]/60 dark:hover:bg-[#2A2A2A]/60 px-2 py-0.5 -ml-2 rounded-md cursor-pointer transition-colors"
              title="Нажмите, чтобы переименовать"
            >
              {projectName}
            </h1>
          )}
        </div>

        {/* 2. NOTION VIEW TABS & DATABASE ACTION CONTROLS BAR */}
        <div className="flex items-center justify-between gap-2 border-b border-[#E9E9E7] dark:border-[#2F2F2F] pb-2 text-[13px]">
          {/* Left View Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto invisible-scrollbar">
            {/* Active Table Tab */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#EFEFED] dark:bg-[#2A2A2A] font-medium text-[#37352F] dark:text-[#E3E2E0] cursor-pointer shadow-2xs">
              <Grid className="w-3.5 h-3.5 text-[#37352F] dark:text-[#E3E2E0]" />
              <span>Таблица</span>
            </div>

            {/* Other Notion Views Switchers if setViewMode is available */}
            {setViewMode && (
              <>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Календарь</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('gantt')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer"
                >
                  <GanttChart className="w-3.5 h-3.5" />
                  <span>График</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>Доска</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                if (setViewMode) setViewMode('canvas');
              }}
              className="p-1 rounded text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] transition-colors cursor-pointer"
              title="Добавить или переключить вид"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Action Icons Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                isAnyFilterActive || isFilterOpen
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-medium'
                  : 'text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
              title="Фильтрация"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Фильтр</span>
              {isAnyFilterActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#2383E2]" />
              )}
            </button>

            {/* Sort Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSortOpen(!isSortOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                isSortOpen
                  ? 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#37352F] dark:text-[#E3E2E0] font-medium'
                  : 'text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
              title="Сортировка"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Сортировка</span>
            </button>

            {/* Search Input / Button */}
            {isSearchOpen ? (
              <div className="flex items-center bg-[#EFEFED] dark:bg-[#2A2A2A] rounded px-2 py-0.5 gap-1.5 animate-fadeIn">
                <Search className="w-3.5 h-3.5 text-[#787774]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Поиск..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="bg-transparent border-0 text-xs text-[#37352F] dark:text-[#E3E2E0] focus:outline-none w-24 sm:w-36"
                />
                {filterText && (
                  <button onClick={() => setFilterText('')} className="text-[10px] text-slate-400 hover:text-slate-600">✕</button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="p-1 rounded text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] transition-colors cursor-pointer"
                title="Поиск по таблице"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Properties Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsPropertiesOpen(!isPropertiesOpen)}
                className="p-1 rounded text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] transition-colors cursor-pointer"
                title="Отображение свойств / колонок"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {isPropertiesOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg p-2.5 z-50 w-52 text-xs space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase text-slate-400 px-1">Видимость свойств</div>
                  {Object.keys(visibleColumns).map((col) => {
                    const titles: Record<string, string> = {
                      startDate: '📅 Дата начала',
                      dueDate: '📅 Срок',
                      effort: '⌛ Сложность (Effort)',
                      progress: '◷ Прогресс',
                      focus: '🍅 Фокус (Pomodoro)',
                      tags: '🏷️ Теги'
                    };
                    return (
                      <label key={col} className="flex items-center justify-between px-1 py-1 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 cursor-pointer">
                        <span>{titles[col] || col}</span>
                        <input
                          type="checkbox"
                          checked={visibleColumns[col]}
                          onChange={() => toggleColumnVisibility(col)}
                          className="rounded accent-[#2383E2]"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* NOTION ICONIC BLUE NEW BUTTON */}
            <div className="flex items-center ml-1">
              <button
                type="button"
                onClick={() => handleCreateNewTask()}
                className="bg-[#2383E2] hover:bg-[#1A73E8] text-white text-xs font-semibold px-3 py-1 rounded-md flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                title="Создать новую задачу"
              >
                <span>New</span>
                <ChevronDown className="w-3 h-3 opacity-80" />
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Filter / Sort Bar */}
        <AnimatePresence>
          {(isFilterOpen || isSortOpen) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-b border-[#E9E9E7] dark:border-[#2F2F2F] py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {isFilterOpen && (
                  <>
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#F7F7F5] dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F]">
                      <span className="text-[#787774] text-[11px]">Статус:</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="bg-transparent border-0 text-[#37352F] dark:text-[#E3E2E0] font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="all" className="dark:bg-[#202020]">Все</option>
                        <option value="active" className="dark:bg-[#202020]">Активные</option>
                        <option value="todo" className="dark:bg-[#202020]">План</option>
                        <option value="progress" className="dark:bg-[#202020]">В работе</option>
                        <option value="waiting" className="dark:bg-[#202020]">В ожидании</option>
                        <option value="done" className="dark:bg-[#202020]">Завершенные</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#F7F7F5] dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F]">
                      <span className="text-[#787774] text-[11px]">Область:</span>
                      <select
                        value={containerFilter}
                        onChange={(e) => setContainerFilter(e.target.value)}
                        className="bg-transparent border-0 text-[#37352F] dark:text-[#E3E2E0] font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
                      >
                        <option value="all" className="dark:bg-[#202020]">Все области</option>
                        <option value="no-container" className="dark:bg-[#202020]">Вне областей</option>
                        {allContainers.map(c => (
                          <option key={c.id} value={c.id} className="dark:bg-[#202020]">{c.text}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {isSortOpen && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#F7F7F5] dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F]">
                    <span className="text-[#787774] text-[11px]">Сортировать по:</span>
                    <select
                      value={sortField}
                      onChange={(e) => handleSort(e.target.value as SortField)}
                      className="bg-transparent border-0 text-[#37352F] dark:text-[#E3E2E0] font-medium focus:outline-none cursor-pointer"
                    >
                      <option value="text" className="dark:bg-[#202020]">Имени (Aa)</option>
                      <option value="startDate" className="dark:bg-[#202020]">Дате начала</option>
                      <option value="dueDate" className="dark:bg-[#202020]">Сроку</option>
                      <option value="priority" className="dark:bg-[#202020]">Сложности</option>
                      <option value="progress" className="dark:bg-[#202020]">Прогрессу</option>
                      <option value="completed" className="dark:bg-[#202020]">Статусу</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="ml-1 text-[11px] font-semibold text-[#2383E2] cursor-pointer"
                    >
                      {sortOrder === 'asc' ? '↑ Возр' : '↓ Убыв'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. NOTION TABLE SPREADSHEET CONTAINER */}
      <div className="flex-1 overflow-auto custom-scrollbar px-6 sm:px-10 pb-16">
        <table className="w-full text-left border-collapse table-fixed">
          {/* Header */}
          <thead>
            <tr className="border-b border-[#E9E9E7] dark:border-[#2F2F2F] text-[13px] font-normal text-[#787774] dark:text-[#9B9A97] h-8">
              {/* Name Column */}
              <th 
                className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                style={{ width: widths.name }}
                onClick={() => handleSort('text')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-[#9B9A97]">Aa</span>
                  <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Name</span>
                  {sortField === 'text' && (
                    <span className="text-[10px] text-[#2383E2]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
                {renderResizer('name')}
              </th>

              {/* Start Date Column */}
              {visibleColumns.startDate && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                  style={{ width: widths.startDate }}
                  onClick={() => handleSort('startDate')}
                >
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#9B9A97]" />
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Start date</span>
                    {sortField === 'startDate' && (
                      <span className="text-[10px] text-[#2383E2]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  {renderResizer('startDate')}
                </th>
              )}

              {/* Due Date Column */}
              {visibleColumns.dueDate && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                  style={{ width: widths.dueDate }}
                  onClick={() => handleSort('dueDate')}
                >
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#9B9A97]" />
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Due date</span>
                    {sortField === 'dueDate' && (
                      <span className="text-[10px] text-[#2383E2]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  {renderResizer('dueDate')}
                </th>
              )}

              {/* Effort Level Column */}
              {visibleColumns.effort && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                  style={{ width: widths.effort }}
                  onClick={() => handleSort('priority')}
                >
                  <div className="flex items-center gap-1.5">
                    <Hourglass className="w-3.5 h-3.5 text-[#9B9A97]" />
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Effort level</span>
                    <span className="text-[10px] text-slate-400">ⓘ</span>
                    {sortField === 'priority' && (
                      <span className="text-[10px] text-[#2383E2]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  {renderResizer('effort')}
                </th>
              )}

              {/* Progress Column */}
              {visibleColumns.progress && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                  style={{ width: widths.progress }}
                  onClick={() => handleSort('progress')}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#9B9A97]">◷</span>
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Progress</span>
                    {sortField === 'progress' && (
                      <span className="text-[10px] text-[#2383E2]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  {renderResizer('progress')}
                </th>
              )}

              {/* Pomodoro Focus Time */}
              {visibleColumns.focus && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
                  style={{ width: widths.focus }}
                  onClick={() => handleSort('pomodoroTotalTime')}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🍅</span>
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Focus</span>
                  </div>
                  {renderResizer('focus')}
                </th>
              )}

              {/* Tags Column */}
              {visibleColumns.tags && (
                <th 
                  className="relative group select-none font-normal px-2 py-1.5 border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020]"
                  style={{ width: widths.tags }}
                >
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#9B9A97]" />
                    <span className="font-medium text-[#787774] dark:text-[#9B9A97]">Tags</span>
                  </div>
                  {renderResizer('tags')}
                </th>
              )}

              {/* Actions Column */}
              <th className="font-normal px-2 py-1.5 text-center text-slate-400" style={{ width: widths.actions }}>
                <MoreHorizontal className="w-3.5 h-3.5 mx-auto" />
              </th>
            </tr>
          </thead>

          {/* Rows */}
          <tbody>
            {hierarchicalTasks.length === 0 ? (
              <tr>
                <td 
                  colSpan={8} 
                  className="py-14 text-center text-xs text-[#787774] dark:text-[#9B9A97]"
                >
                  Задачи не найдены. Нажмите «+ New» чтобы добавить страницу.
                </td>
              </tr>
            ) : (
              hierarchicalTasks.map(({ node: task, depth, hasChildren }) => {
                const isSelected = selectedNodeId === task.id;
                const pageIcon = getTaskPageIcon(task);
                const cleanTitle = cleanTaskTitle(task.text);

                return (
                  <tr
                    key={task.id}
                    onClick={(e) => onSelectNode(task.id, e)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                    }}
                    className={`group/row transition-colors h-[38px] text-[13.5px] border-b border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer ${
                      isSelected ? 'bg-[#EFEFED]/80 dark:bg-[#2A2A2A]/80' : ''
                    } ${task.archived ? 'opacity-50' : ''}`}
                  >
                    {/* 1. Name Cell */}
                    <td 
                      className="px-2 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F] relative"
                      style={{ paddingLeft: `${depth * 18 + 8}px` }}
                    >
                      <div className="flex items-center justify-between gap-1.5 overflow-hidden w-full">
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                          {/* Tree expand toggle if task has subtasks */}
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateNode({ ...task, collapsed: !task.collapsed });
                              }}
                              className="p-0.5 hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-500 rounded cursor-pointer shrink-0 transition-colors"
                            >
                              {task.collapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <div className="w-3.5 shrink-0" />
                          )}

                          {/* Completion Toggle */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextCompleted = !task.completed;
                              onUpdateNode({
                                ...task,
                                completed: nextCompleted,
                                progress: nextCompleted ? 100 : 0,
                                status: nextCompleted ? 'done' : 'todo'
                              });
                            }}
                            className={`p-0.5 rounded cursor-pointer shrink-0 text-[#9B9A97] hover:text-[#2383E2] transition-colors ${
                              task.completed ? 'text-[#2383E2]' : ''
                            }`}
                            title={task.completed ? "Отметить невыполненной" : "Отметить выполненной"}
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Circle className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Page Emoji / Icon */}
                          <span className="text-sm shrink-0">{pageIcon}</span>

                          {/* Inline Task Text Input */}
                          <input
                            type="text"
                            value={cleanTitle}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(task.id);
                            }}
                            onChange={(e) => {
                              onUpdateNode({ ...task, text: e.target.value });
                            }}
                            className={`w-full bg-transparent border-0 p-0 focus:outline-none text-[#37352F] dark:text-[#E3E2E0] font-normal truncate ${
                              task.completed ? 'line-through text-[#9B9A97]' : ''
                            }`}
                          />
                        </div>

                        {/* NOTION OPEN BUTTON (Appears on row hover) */}
                        <div className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(task.id);
                            }}
                            className="px-1.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#E3E2E0] bg-white dark:bg-[#2F2F2F] border border-[#E9E9E7] dark:border-[#383838] shadow-2xs rounded hover:shadow-xs transition-all cursor-pointer"
                            title="Открыть свойства страницы"
                          >
                            OPEN
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* 2. Start Date Cell */}
                    {visibleColumns.startDate && (
                      <td className="px-2.5 py-1 text-[13px] border-r border-[#E9E9E7] dark:border-[#2F2F2F] text-[#37352F] dark:text-[#E3E2E0]">
                        <div className="relative group/date">
                          <span className="text-[#37352F] dark:text-[#E3E2E0]">
                            {formatNotionDate(task.startDate || task.createdAt)}
                          </span>
                          <input
                            type="date"
                            value={task.startDate || (task.createdAt ? task.createdAt.split('T')[0] : '')}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              onUpdateNode({ ...task, startDate: e.target.value || undefined });
                            }}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            title="Изменить дату начала"
                          />
                        </div>
                      </td>
                    )}

                    {/* 3. Due Date Cell */}
                    {visibleColumns.dueDate && (
                      <td className="px-2.5 py-1 text-[13px] border-r border-[#E9E9E7] dark:border-[#2F2F2F] text-[#37352F] dark:text-[#E3E2E0]">
                        <div className="relative group/date">
                          <span className={task.dueDate ? "text-[#37352F] dark:text-[#E3E2E0]" : "text-[#9B9A97]"}>
                            {formatNotionDate(task.dueDate)}
                          </span>
                          <input
                            type="date"
                            value={task.dueDate || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              onUpdateNode({ ...task, dueDate: e.target.value || undefined });
                            }}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            title="Изменить срок выполнения"
                          />
                        </div>
                      </td>
                    )}

                    {/* 4. Effort Level Cell */}
                    {visibleColumns.effort && (
                      <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                        {renderEffortBadge(task.priority, task.id)}
                      </td>
                    )}

                    {/* 5. Progress Bar Cell */}
                    {visibleColumns.progress && (
                      <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#EFEFED] dark:bg-[#2A2A2A] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#2383E2] transition-all rounded-full" 
                              style={{ width: `${task.progress || 0}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-[#787774] dark:text-[#9B9A97]">
                            {task.progress || 0}%
                          </span>
                        </div>
                      </td>
                    )}

                    {/* 6. Pomodoro Focus Cell */}
                    {visibleColumns.focus && (
                      <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F] text-xs">
                        <div className="flex items-center gap-1 font-mono text-[11px] text-[#787774] dark:text-[#9B9A97]">
                          <span>🍅</span>
                          <span>{formatTotalPomoTime(getPomoStatsForNode(task, nodes).pomodoroTotalTime)}</span>
                        </div>
                      </td>
                    )}

                    {/* 7. Tags Cell */}
                    {visibleColumns.tags && (
                      <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                        <div className="flex flex-wrap gap-1">
                          {task.tags && task.tags.length > 0 ? (
                            task.tags.map(t => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded text-[11px] notion-tag-gray"
                              >
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#9B9A97] text-xs">—</span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* 8. Quick Actions Cell */}
                    <td className="px-2 py-1 text-center">
                      <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNode(task.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}

            {/* NOTION "+ New page" ROW */}
            <tr className="hover:bg-[#F7F7F5] dark:hover:bg-[#202020] transition-colors border-b border-[#E9E9E7] dark:border-[#2F2F2F]">
              <td colSpan={8} className="px-2 py-2">
                {isAddingInline ? (
                  <form onSubmit={handleInlineSubmit} className="flex items-center gap-2">
                    <span className="text-sm">📄</span>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Название новой записи... (Enter для сохранения)"
                      value={inlineNewText}
                      onChange={(e) => setInlineNewText(e.target.value)}
                      onBlur={() => {
                        if (inlineNewText.trim()) handleCreateNewTask(inlineNewText.trim());
                        setInlineNewText('');
                        setIsAddingInline(false);
                      }}
                      className="text-[13.5px] bg-transparent border-0 focus:outline-none text-[#37352F] dark:text-[#E3E2E0] w-full"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingInline(true)}
                    className="flex items-center gap-2 text-[13px] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer w-full text-left"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#9B9A97]" />
                    <span>New page</span>
                  </button>
                )}
              </td>
            </tr>

            {/* NOTION TABLE CALCULATE FOOTER */}
            <tr className="text-[12px] text-[#9B9A97] h-8">
              <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                <div className="flex items-center justify-between text-[#9B9A97]">
                  <span>Count {hierarchicalTasks.length}</span>
                </div>
              </td>
              {visibleColumns.startDate && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              {visibleColumns.dueDate && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              {visibleColumns.effort && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              {visibleColumns.progress && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              {visibleColumns.focus && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              {visibleColumns.tags && (
                <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <span className="hover:text-[#37352F] cursor-pointer">Calculate</span>
                </td>
              )}
              <td className="px-2 py-1"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
