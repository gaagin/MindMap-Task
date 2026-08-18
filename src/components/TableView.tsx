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
  Eye,
  EyeOff
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
  collapseCompleted?: boolean;
  onCollapseCompletedChange?: (val: boolean) => void;
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

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  } catch {
    return false;
  }
}

const getNotionTagColor = (tagName: string) => {
  const notionPalettes = [
    { bg: 'bg-[#E3E2E0] dark:bg-[#2C2C2C]', text: 'text-[#32302C] dark:text-[#D4D4D4]' },
    { bg: 'bg-[#EEE0DA] dark:bg-[#432A1C]', text: 'text-[#64473A] dark:text-[#D4A373]' },
    { bg: 'bg-[#FADEC9] dark:bg-[#4A2D13]', text: 'text-[#8A480B] dark:text-[#E89943]' },
    { bg: 'bg-[#FDECC8] dark:bg-[#4D3A1B]', text: 'text-[#8A6700] dark:text-[#F3CE63]' },
    { bg: 'bg-[#DBEDDB] dark:bg-[#1E3B29]', text: 'text-[#1E7242] dark:text-[#8EE6A5]' },
    { bg: 'bg-[#D3E5EF] dark:bg-[#1C354A]', text: 'text-[#0B6E99] dark:text-[#7EBDE6]' },
    { bg: 'bg-[#E8DEEE] dark:bg-[#3C254C]', text: 'text-[#6940A5] dark:text-[#D5B8F6]' },
    { bg: 'bg-[#F5E0E9] dark:bg-[#4E2439]', text: 'text-[#961964] dark:text-[#EE85B5]' },
    { bg: 'bg-[#FFE2DD] dark:bg-[#4D2420]', text: 'text-[#C23C32] dark:text-[#FFAAA0]' },
  ];
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return notionPalettes[Math.abs(hash) % notionPalettes.length];
};

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
  collapseCompleted: propsCollapseCompleted,
  onCollapseCompletedChange,
  projectName = 'Проекты',
  projectIcon = '📁',
  onUpdateProjectName,
  setViewMode
}: TableViewProps) {
  const [localCollapseCompleted, setLocalCollapseCompleted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('notion_table_collapse_completed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });
  const collapseCompleted = propsCollapseCompleted !== undefined ? propsCollapseCompleted : localCollapseCompleted;
  const setCollapseCompleted = (val: boolean) => {
    setLocalCollapseCompleted(val);
    try {
      localStorage.setItem('notion_table_collapse_completed', String(val));
    } catch {}
    if (onCollapseCompletedChange) onCollapseCompletedChange(val);
  };

  const [isCompletedSectionOpen, setIsCompletedSectionOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('text');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [inlineNewText, setInlineNewText] = useState('');
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
    if (onFullScreenChange) {
      onFullScreenChange(isFullScreen);
    }
  }, [isFullScreen, onFullScreenChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullScreen) setIsFullScreen(false);
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

  const { activeHierarchicalTasks, completedHierarchicalTasks, allHierarchicalTasks } = useMemo(() => {
    const tasksMap = new Map<string, TaskNode>();
    rawTasks.forEach(t => tasksMap.set(t.id, t));

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

    const allResult: { node: TaskNode; depth: number; hasChildren: boolean }[] = [];

    const traverse = (siblings: TaskNode[], depth: number, parentCollapsed: boolean) => {
      const sortedSiblings = sortSiblings(siblings);

      sortedSiblings.forEach(task => {
        const children = rawTasks.filter(c => c.parentId === task.id);
        const hasChildren = children.length > 0;

        if (!parentCollapsed) {
          allResult.push({
            node: task,
            depth,
            hasChildren
          });
        }

        if (hasChildren) {
          traverse(children, depth + 1, parentCollapsed || !!task.collapsed);
        }
      });
    };

    const roots = rawTasks.filter(t => !t.parentId || !tasksMap.has(t.parentId));
    traverse(roots, 0, false);

    if (!collapseCompleted) {
      return { activeHierarchicalTasks: allResult, completedHierarchicalTasks: [], allHierarchicalTasks: allResult };
    }

    const activeList = allResult.filter(item => !item.node.completed);
    const completedList = allResult.filter(item => item.node.completed);

    return { activeHierarchicalTasks: activeList, completedHierarchicalTasks: completedList, allHierarchicalTasks: allResult };
  }, [rawTasks, sortField, sortOrder, nodes, collapseCompleted]);

  const completedTasksCount = useMemo(() => {
    return rawTasks.filter(t => t.completed).length;
  }, [rawTasks]);

  const activeTasksCount = rawTasks.length - completedTasksCount;

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

  const renderRowItem = (item: { node: TaskNode; depth: number; hasChildren: boolean }) => {
    const task = item.node;
    const isSelected = selectedNodeId === task.id;
    const pomoStats = getPomoStatsForNode(task, nodes);
    const overdue = isOverdue(task.dueDate);
    const dateFormatted = formatNotionDate(task.dueDate);
    const startDateFormatted = formatNotionDate(task.startDate || task.createdAt);

    return (
      <tr
        key={task.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode(task.id, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
        }}
        className={`group border-b border-[#E9E9E7] dark:border-[#2F2F2F] text-[13px] h-8.5 hover:bg-[#F7F7F5] dark:hover:bg-[#202020] transition-colors cursor-pointer ${
          isSelected ? 'bg-[#EBF5FB] dark:bg-[#203040]' : ''
        }`}
      >
        {/* Name Column */}
        <td 
          className="px-2 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F] relative"
          style={{ width: widths.name, paddingLeft: `${item.depth * 18 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Collapse toggle for parent nodes */}
            {item.hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNode({ ...task, collapsed: !task.collapsed });
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-neutral-700 cursor-pointer"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${task.collapsed ? '' : 'rotate-90'}`} />
              </button>
            ) : (
              <span className="w-4.5" />
            )}

            {/* Checkbox */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateNode({ ...task, completed: !task.completed, updatedAt: new Date().toISOString() });
              }}
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                task.completed
                  ? 'bg-[#1E7242] border-[#1E7242] text-white'
                  : 'border-[#C4C3BE] dark:border-[#555555] hover:border-slate-500 bg-white dark:bg-[#202020]'
              }`}
            >
              {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </button>

            {/* Title */}
            <span className={`truncate font-normal flex-1 ${task.completed ? 'line-through text-[#9B9A97] dark:text-[#6F6E6B]' : 'text-[#37352F] dark:text-[#E3E2E0]'}`}>
              {task.text}
            </span>

            {/* Hover details / delete actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(task.id);
                }}
                className="p-1 rounded text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white"
                title="Подробнее"
              >
                <FileText className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNode(task.id);
                }}
                className="p-1 rounded text-[#9B9A97] hover:text-rose-500"
                title="Удалить"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </td>

        {/* Start Date Column */}
        {visibleColumns.startDate && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.startDate }}>
            <span className="text-[12px] text-[#787774] dark:text-[#9B9A97]">{startDateFormatted}</span>
          </td>
        )}

        {/* Due Date Column */}
        {visibleColumns.dueDate && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.dueDate }}>
            {task.dueDate ? (
              <span className={`text-[12px] font-medium ${overdue && !task.completed ? 'text-[#EB5757]' : 'text-[#787774] dark:text-[#9B9A97]'}`}>
                {dateFormatted}
              </span>
            ) : (
              <span className="text-[12px] text-[#C4C3BE] dark:text-[#555555]">Empty</span>
            )}
          </td>
        )}

        {/* Effort Column */}
        {visibleColumns.effort && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.effort }}>
            {renderEffortBadge(task.priority, task.id)}
          </td>
        )}

        {/* Progress Column */}
        {visibleColumns.progress && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.progress }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-200 dark:bg-neutral-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${task.completed ? 'bg-[#1E7242]' : 'bg-[#2383E2]'}`}
                  style={{ width: `${task.completed ? 100 : (task.progress || 0)}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-[#787774] dark:text-[#9B9A97]">
                {task.completed ? 100 : (task.progress || 0)}%
              </span>
            </div>
          </td>
        )}

        {/* Focus Column */}
        {visibleColumns.focus && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.focus }}>
            {pomoStats.pomodoroTotalTime > 0 ? (
              <span className="text-[11.5px] font-mono text-rose-600 dark:text-rose-400 font-medium">
                🍅 {formatTotalPomoTime(pomoStats.pomodoroTotalTime)}
              </span>
            ) : (
              <span className="text-[12px] text-[#C4C3BE] dark:text-[#555555]">—</span>
            )}
          </td>
        )}

        {/* Tags Column */}
        {visibleColumns.tags && (
          <td className="px-2.5 py-1 border-r border-[#E9E9E7] dark:border-[#2F2F2F]" style={{ width: widths.tags }}>
            <div className="flex flex-wrap items-center gap-1 overflow-hidden">
              {task.tags && task.tags.length > 0 ? (
                task.tags.map((tag, tIdx) => {
                  const style = getNotionTagColor(tag);
                  return (
                    <span key={tIdx} className={`px-1.5 py-0.5 rounded text-[10.5px] font-normal ${style.bg} ${style.text}`}>
                      {tag}
                    </span>
                  );
                })
              ) : (
                <span className="text-[12px] text-[#C4C3BE] dark:text-[#555555]">Empty</span>
              )}
            </div>
          </td>
        )}

        {/* Actions Column */}
        <td className="px-2 py-1 text-center" style={{ width: widths.actions }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(task.id);
            }}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5 mx-auto" />
          </button>
        </td>
      </tr>
    );
  };

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
      {/* Table Top Filter & Action Bar */}
      <div className="px-6 sm:px-10 py-2 border-b border-[#E9E9E7] dark:border-[#2F2F2F] bg-[#FAF9F6] dark:bg-[#1E1E1E] flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 text-[#787774] dark:text-[#9B9A97]">
          <span className="font-semibold text-[#37352F] dark:text-[#EBEBEB]">Таблица</span>
          <span className="bg-[#E9E9E7] dark:bg-[#2C2C2C] px-1.5 py-0.5 rounded-full text-[11px] font-mono">
            {activeTasksCount}/{rawTasks.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Hide/Collapse Completed Toggle */}
          {completedTasksCount > 0 && (
            <button
              type="button"
              onClick={() => setCollapseCompleted(!collapseCompleted)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                collapseCompleted
                  ? 'bg-[#2383E2]/15 text-[#2383E2] dark:bg-[#2383E2]/25 font-semibold'
                  : 'text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white hover:bg-[#EAEAEA] dark:hover:bg-[#2C2C2C]'
              }`}
              title={collapseCompleted ? "Показать все записи" : "Скрыть выполненные записи"}
            >
              {collapseCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{collapseCompleted ? `Скрыто: ${completedTasksCount}` : 'Скрыть выполненные'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAddingInline(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#2383E2] hover:bg-[#1d6fc2] text-white text-xs font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Новая запись</span>
          </button>
        </div>
      </div>

      {/* NOTION TABLE SPREADSHEET CONTAINER */}
      <div className="flex-1 overflow-auto custom-scrollbar px-6 sm:px-10 pb-16 pt-4">
        <table className="w-full text-left border-collapse table-fixed">
          {/* Header */}
          <thead className="sticky top-0 z-20 bg-white dark:bg-[#191919]">
            <tr className="border-b border-[#E9E9E7] dark:border-[#2F2F2F] text-[13px] font-normal text-[#787774] dark:text-[#9B9A97] h-8">
              {/* Name Column */}
              <th 
                className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] cursor-pointer"
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
                  className="sticky top-0 z-20 bg-white dark:bg-[#191919] relative group select-none font-normal px-2 py-1.5 border-b border-r border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#F7F7F5] dark:hover:bg-[#202020]"
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
              <th 
                className="sticky top-0 z-20 bg-white dark:bg-[#191919] font-normal px-2 py-1.5 border-b border-[#E9E9E7] dark:border-[#2F2F2F] text-center text-slate-400" 
                style={{ width: widths.actions }}
              >
                <MoreHorizontal className="w-3.5 h-3.5 mx-auto" />
              </th>
            </tr>
          </thead>

          {/* Rows */}
          <tbody>
            {allHierarchicalTasks.length === 0 ? (
              <tr>
                <td 
                  colSpan={8} 
                  className="py-14 text-center text-xs text-[#787774] dark:text-[#9B9A97]"
                >
                  Задачи не найдены. Нажмите «+ New» чтобы добавить страницу.
                </td>
              </tr>
            ) : activeHierarchicalTasks.length === 0 && completedHierarchicalTasks.length > 0 ? (
              <tr>
                <td 
                  colSpan={8} 
                  className="py-10 text-center text-xs text-[#787774] dark:text-[#9B9A97]"
                >
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[#2383E2] opacity-80" />
                  <span className="font-semibold text-[#37352F] dark:text-[#EBEBEB]">Все задачи выполнены! 🎉</span>
                  <p className="mt-1 text-[11px]">Выполненные задачи свернуты в секцию ниже ({completedTasksCount})</p>
                </td>
              </tr>
            ) : (
              activeHierarchicalTasks.map(item => renderRowItem(item))
            )}

            {/* Collapsible Completed Rows Section */}
            {collapseCompleted && completedHierarchicalTasks.length > 0 && (
              <>
                <tr className="bg-[#FAF9F6] dark:bg-[#202020] border-t-2 border-b border-[#E9E9E7] dark:border-[#2F2F2F]">
                  <td colSpan={8} className="px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setIsCompletedSectionOpen(prev => !prev)}
                      className="flex items-center gap-2 text-xs font-semibold text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#EBEBEB] cursor-pointer"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${isCompletedSectionOpen ? 'rotate-90' : ''}`} />
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2383E2]" />
                      <span>Выполненные задачи ({completedTasksCount})</span>
                    </button>
                  </td>
                </tr>
                {isCompletedSectionOpen && (
                  completedHierarchicalTasks.map(item => renderRowItem(item))
                )}
              </>
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
                  <span>Count {allHierarchicalTasks.length}</span>
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
