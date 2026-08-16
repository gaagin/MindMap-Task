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

  const hierarchicalTasks = useMemo(() => {
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

    const result: { node: TaskNode; depth: number; hasChildren: boolean }[] = [];

    const traverse = (siblings: TaskNode[], depth: number, parentCollapsed: boolean) => {
      const sortedSiblings = sortSiblings(siblings);

      sortedSiblings.forEach(task => {
        const children = rawTasks.filter(c => c.parentId === task.id);
        const hasChildren = children.length > 0;

        if (!parentCollapsed) {
          result.push({
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
    return result;
  }, [rawTasks, sortField, sortOrder, nodes]);

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
      {/* NOTION TABLE SPREADSHEET CONTAINER */}
      <div className="flex-1 overflow-auto custom-scrollbar px-6 sm:px-10 pb-16 pt-4">
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
