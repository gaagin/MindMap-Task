import React, { useState } from 'react';
import { 
  Kanban as KanbanIcon, 
  Plus, 
  X, 
  Calendar, 
  Paperclip, 
  FileText, 
  CheckCircle2, 
  Circle,
  Loader2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Tag,
  Clock,
  Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';

interface KanbanViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, initialTags: string[], priority?: Priority, parentId?: string | null) => void;
  onCreateTagCategory: (name: string, color: string) => void;
  selectedNodeIds?: string[];
  onToggleSelectNode?: (id: string) => void;
}

export default function KanbanView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onCreateTagCategory,
  selectedNodeIds = [],
  onToggleSelectNode,
}: KanbanViewProps) {
  const [groupBy, setGroupBy] = useState<'category' | 'priority' | 'container'>(() => {
    return tagCategories.length === 0 ? 'priority' : 'category';
  });

  // State to manage whether completed tasks are globally collapsed
  const [collapseCompleted, setCollapseCompleted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_collapse_completed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_collapse_completed', String(collapseCompleted));
    } catch {}
  }, [collapseCompleted]);

  // State to manage whether subtasks are shown in lists
  const [showSubtasks, setShowSubtasks] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_show_subtasks');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_show_subtasks', String(showSubtasks));
    } catch {}
  }, [showSubtasks]);

  const isSubtask = (node: TaskNode): boolean => {
    if (!node.parentId) return false;
    const parentNode = nodes.find(n => n.id === node.parentId);
    return !!parentNode && !parentNode.isContainer;
  };

  const matchesSubtaskFilter = (node: TaskNode): boolean => {
    if (showSubtasks) return true;
    return !isSubtask(node);
  };

  // Try to pre-select the first category if any exists
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    return tagCategories.length > 0 ? tagCategories[0].id : null;
  });

  // State to manage inline card creation inputs for each column
  // Map of column key (either 'uncategorized' or tag name) to boolean and text value
  const [activeAddInColumn, setActiveAddInColumn] = useState<string | null>(null);
  const [newTaskNameInColumn, setNewTaskNameInColumn] = useState('');

  // Track which cards have expanded subtasks nested inline
  const [expandedCardSubtasks, setExpandedCardSubtasks] = useState<Record<string, boolean>>({});

  // Dropdown card move menu state for mobile and responsive accessibility
  const [activeMoveMenuCardId, setActiveMoveMenuCardId] = useState<string | null>(null);

  // Drag states for column highlighting
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);
  // Track which task card has a tag hovered over it during drag and drop
  const [draggedOverTagCardId, setDraggedOverTagCardId] = useState<string | null>(null);

  // Collapsible state for category select on mobile/tablet screens
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_categories_expanded');
      if (saved !== null) return saved === 'true';
    } catch {}
    // Default collapsed on mobile/tablet (< 768px), expanded on desktop
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : false;
  });

  React.useEffect(() => {
    localStorage.setItem('task_mindmap_categories_expanded', String(isCategoriesExpanded));
  }, [isCategoriesExpanded]);

  const activeCategory = tagCategories.find(c => c.id === selectedCategoryId) || tagCategories[0];

  // If there's an active project but our selectedCategory is null and categories just loaded/exist:
  React.useEffect(() => {
    if (!selectedCategoryId && tagCategories.length > 0) {
      setSelectedCategoryId(tagCategories[0].id);
    }
  }, [tagCategories, selectedCategoryId]);

  // Get tags of the active category
  const activeTags = activeCategory?.tags || [];

  // Container filter states and helper methods
  const [selectedContainerFilterId, setSelectedContainerFilterId] = useState<string>('all');
  const allContainers = nodes.filter(n => n.isContainer && !n.archived);

  const getTaskContainerId = (node: TaskNode): string | null => {
    let curr: TaskNode | undefined = node;
    const visited = new Set<string>();
    while (curr && curr.parentId) {
      if (visited.has(curr.parentId)) break; // cycle protection
      visited.add(curr.parentId);
      const parentNode = nodes.find(n => n.id === curr!.parentId);
      if (parentNode && parentNode.isContainer) return parentNode.id;
      curr = parentNode;
    }
    return null;
  };

  const isInsideAnyContainer = (node: TaskNode): boolean => {
    return !!getTaskContainerId(node);
  };

  // Filter tasks shown on the board (only keep non-container tasks belonging to the filtered container)
  const filteredNodes = nodes.filter(n => {
    if (n.isContainer) return false;
    if (n.archived) return false;
    if (!matchesSubtaskFilter(n)) return false;
    if (selectedContainerFilterId === 'all') return true;
    if (selectedContainerFilterId === 'no-container') {
      return !getTaskContainerId(n);
    }
    return getTaskContainerId(n) === selectedContainerFilterId;
  });

  // Helper to extract which tag of the active category a node has
  const getNodeCategoryTag = (node: TaskNode): string | null => {
    if (!node.tags) return null;
    // Find first tag of the node that is in the active category's tags
    const found = node.tags.find(t => activeTags.includes(t));
    return found || null;
  };

  // Classify nodes in columns based on groupBy
  const columns: { id: string; title: string; color: string; isUncategorized: boolean; items: TaskNode[] }[] = [];

  if (groupBy === 'priority') {
    columns.push(
      { id: 'urgent', title: 'Критический', color: '#f43f5e', isUncategorized: false, items: filteredNodes.filter(n => n.priority === 'urgent') },
      { id: 'high', title: 'Высокий', color: '#f59e0b', isUncategorized: false, items: filteredNodes.filter(n => n.priority === 'high') },
      { id: 'medium', title: 'Средний', color: '#3b82f6', isUncategorized: false, items: filteredNodes.filter(n => n.priority === 'medium') },
      { id: 'low', title: 'Низкий', color: '#10b981', isUncategorized: false, items: filteredNodes.filter(n => n.priority === 'low') },
      { id: 'none', title: 'Без приоритета', color: '#64748b', isUncategorized: true, items: filteredNodes.filter(n => !n.priority || n.priority === 'none') }
    );
  } else if (groupBy === 'category') {
    // 1. Column for Uncategorized (Без тегов текущей категории)
    const uncategorizedItems = filteredNodes.filter(n => {
      const nodeTag = getNodeCategoryTag(n);
      return nodeTag === null;
    });

    columns.push({
      id: 'uncategorized',
      title: 'Без тега',
      color: '#94a3b8', // slate-400 color
      isUncategorized: true,
      items: uncategorizedItems
    });

    // 2. Column for each tag in active category
    activeTags.forEach(tag => {
      const items = filteredNodes.filter(n => {
        const nodeTag = getNodeCategoryTag(n);
        return nodeTag === tag;
      });

      columns.push({
        id: tag,
        title: '#' + tag,
        color: activeCategory?.color || '#6366f1',
        isUncategorized: false,
        items
      });
    });
  } else if (groupBy === 'container') {
    // 1. Find all active containers in the project
    const containerNodes = nodes.filter(n => n.isContainer && !n.archived);
    
    // 2. Column for "Without Container" (Без контейнера)
    // A task is NOT in any container if none of its ancestors is a container
    const tasksWithoutContainer = nodes.filter(n => !n.isContainer && !n.archived && !isInsideAnyContainer(n) && matchesSubtaskFilter(n));
    columns.push({
      id: 'no-container',
      title: 'Без контейнера',
      color: '#94a3b8',
      isUncategorized: true,
      items: tasksWithoutContainer
    });

    // 3. Columns for each container
    containerNodes.forEach(c => {
      const items = nodes.filter(n => !n.isContainer && !n.archived && getTaskContainerId(n) === c.id && matchesSubtaskFilter(n));
      columns.push({
        id: c.id,
        title: c.text,
        color: c.color || '#6366f1',
        isUncategorized: false,
        items
      });
    });
  }

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.setData('text/plain', id);
    // Allow move effect
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/task-tag')) {
      return;
    }
    if (draggedOverColumn !== columnId) {
      setDraggedOverColumn(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // only reset if leaving to outer space
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    
    // Ignore tag dropped on column background
    if (e.dataTransfer.types.includes('application/task-tag')) {
      setDraggedOverColumn(null);
      return;
    }

    const cardId = e.dataTransfer.getData('text/plain') || draggedCardId;
    setDraggedOverColumn(null);
    setDraggedCardId(null);

    if (!cardId) return;

    const findNode = nodes.find(n => n.id === cardId);
    if (!findNode) return;

    // Apply movement logic
    moveCardToColumn(findNode, targetColumnId);
  };

  const moveCardToColumn = (node: TaskNode, targetColumnId: string) => {
    let targetParentId = node.parentId;
    if (selectedContainerFilterId !== 'all' && selectedContainerFilterId !== 'no-container') {
      targetParentId = selectedContainerFilterId;
    } else if (selectedContainerFilterId === 'no-container') {
      targetParentId = null;
    }

    if (groupBy === 'priority') {
      onUpdateNode({
        ...node,
        priority: targetColumnId as Priority,
        parentId: targetParentId
      });
    } else if (groupBy === 'container') {
      onUpdateNode({
        ...node,
        parentId: targetColumnId === 'no-container' ? null : targetColumnId
      });
    } else {
      // Create new list of tags
      let updatedTags = node.tags ? [...node.tags] : [];

      // Remove any Tag from this category that is currently present in node.tags
      updatedTags = updatedTags.filter(t => !activeTags.includes(t));

      // If we're dropping in a specific tag column, add that tag
      if (targetColumnId !== 'uncategorized') {
        updatedTags.push(targetColumnId);
      }

      onUpdateNode({
        ...node,
        tags: updatedTags,
        parentId: targetParentId
      });
    }
  };

  const handleCreateTaskInColumn = (columnId: string) => {
    const text = newTaskNameInColumn.trim();
    if (!text) return;

    let targetParentId: string | null = null;
    if (selectedContainerFilterId !== 'all' && selectedContainerFilterId !== 'no-container') {
      targetParentId = selectedContainerFilterId;
    }

    if (groupBy === 'priority') {
      onCreateTask(text, [], columnId as Priority, targetParentId);
    } else if (groupBy === 'container') {
      onCreateTask(text, [], 'none', columnId === 'no-container' ? null : columnId);
    } else {
      const tagsToAssign: string[] = [];
      if (columnId !== 'uncategorized') {
        tagsToAssign.push(columnId);
      }
      onCreateTask(text, tagsToAssign, 'none', targetParentId);
    }

    // Reset inline input
    setActiveAddInColumn(null);
    setNewTaskNameInColumn('');
  };

  const renderPriorityBadge = (priority: Priority) => {
    let style = "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700/50";
    let text = "Без приоритета";

    if (priority === 'low') {
      style = "bg-[#effaf3] dark:bg-emerald-950/20 text-[#10b981] dark:text-emerald-400 border-emerald-100 dark:border-emerald-950/45";
      text = "Низкий";
    } else if (priority === 'medium') {
      style = "bg-[#eff6ff] dark:bg-blue-950/20 text-[#3b82f6] dark:text-blue-400 border-blue-100 dark:border-blue-950/45";
      text = "Средний";
    } else if (priority === 'high') {
      style = "bg-[#fffbeb] dark:bg-amber-950/20 text-[#f59e0b] dark:text-amber-400 border-amber-100 dark:border-amber-950/45";
      text = "Высокий";
    } else if (priority === 'urgent') {
      style = "bg-[#fff5f5] dark:bg-rose-950/25 text-[#f43f5e] dark:text-rose-400 border-rose-150 dark:border-rose-950/50";
      text = "Критический";
    }

    return (
      <span className={`px-2 py-0.5 text-[9.5px] font-extrabold rounded-md border ${style} select-none`}>
        {text}
      </span>
    );
  };

  const isOverdue = (dateStr: string) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dateStr);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime();
    } catch {
      return false;
    }
  };

  const formatRussianDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const renderCard = (node: TaskNode) => {
    const hasAttachments = node.files && node.files.length > 0;
    const hasNotes = node.notes && node.notes.trim().length > 0;
    const linkPattern = /(\[([^\]]+)\]\(task:([a-zA-Z0-9\-]+)\)|\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]|task:\/\/([a-zA-Z0-9\-]+))/;
    const hasTaskLinks = node.notes && linkPattern.test(node.notes);
    const hasDueDate = node.dueDate;

    return (
      <motion.div
        key={node.id}
        id={`kanban-card-${node.id}`}
        draggable="true"
        onDragStart={(e) => handleDragStart(e, node.id)}
        onClick={(e) => onSelectNode(node.id, e)}
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
            setDraggedOverTagCardId(node.id);
          }
        }}
        onDragLeave={() => {
          if (draggedOverTagCardId === node.id) {
            setDraggedOverTagCardId(null);
          }
        }}
        onDrop={(e) => {
          const tag = e.dataTransfer.getData('application/task-tag');
          if (tag) {
            e.preventDefault();
            e.stopPropagation();
            setDraggedOverTagCardId(null);
            const existingTags = node.tags || [];
            if (!existingTags.includes(tag)) {
              onUpdateNode({
                ...node,
                tags: [...existingTags, tag]
              });
            }
          }
        }}
        layoutId={`kanban-card-motion-${node.id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className={`group select-none text-left bg-white dark:bg-slate-910 border hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.01),0_1px_3px_rgba(15,23,42,0.015)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.03)] hover:translate-y-[-1.5px] transition-all duration-200 cursor-grab active:cursor-grabbing relative flex flex-col gap-3.5 ${
          draggedOverTagCardId === node.id
            ? 'border-emerald-500 dark:border-emerald-400 ring-4 ring-emerald-500/20 shadow-md bg-emerald-50/10 dark:bg-emerald-950/10 scale-[1.01]'
            : (node.id === selectedNodeId || (selectedNodeIds && selectedNodeIds.includes(node.id))) 
              ? 'border-[#4f46e5] dark:border-indigo-400 ring-4 ring-indigo-500/15 shadow-md scale-[1.015]' 
              : 'border-slate-200/80 dark:border-slate-850'
        }`}
      >
        {/* Completed toggle checkbox and text */}
        <div className="flex items-start gap-3">
          {onToggleSelectNode && (
            <input
              type="checkbox"
              checked={selectedNodeIds.includes(node.id)}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelectNode(node.id);
              }}
              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-505 h-3.5 w-3.5 mt-1 cursor-pointer shrink-0 z-10"
              title="Выбрать задачу"
            />
          )}
          <button
            id={`kanban-card-check-${node.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateNode({
                ...node,
                completed: !node.completed
              });
            }}
            className="text-slate-400 hover:text-[#4f46e5] dark:hover:text-indigo-400 transition-colors shrink-0 mt-0.5 cursor-pointer"
            title={node.completed ? "Отметить активной" : "Отметить выполненной"}
          >
            {node.completed ? (
              <CheckCircle2 className="w-[18px] h-[18px] text-emerald-600 dark:text-emerald-500 fill-emerald-100/30 dark:fill-emerald-900/10" />
            ) : activePomodoroNodeId === node.id ? (
              <span className="relative flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 opacity-75"></span>
                <Loader2 className="w-[18px] h-[18px] text-rose-500 animate-spin" />
              </span>
            ) : (
              <Circle className="w-[18px] h-[18px]" />
            )}
          </button>
          
          <div className="min-w-0 flex-1">
            <p className={`text-[12px] font-bold leading-relaxed text-slate-800 dark:text-slate-100 ${
              node.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
            } flex items-center flex-wrap gap-1.5`}>
              <span>{node.text}</span>
              {node.externalLink && (
                <a
                  href={node.externalLink.startsWith('http') ? node.externalLink : `https://${node.externalLink}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center p-0.5 hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                  title={`Открыть внешнюю ссылку: ${node.externalLink}`}
                >
                  <LinkIcon className="w-3 h-3 text-indigo-505" />
                </a>
              )}
              {activePomodoroNodeId === node.id && (
                <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded-md text-[10px] font-sans font-extrabold animate-pulse ml-1 shrink-0 border border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" title="Запущена фокусировка Pomodoro">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                  </span>
                  <span>🍅</span>
                </span>
              )}
            </p>
          </div>

          {/* Move category drop down for mobile touch responsiveness triggers */}
          <div className="relative shrink-0 flex items-center">
            <button
              id={`kanban-card-more-${node.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMoveMenuCardId(activeMoveMenuCardId === node.id ? null : node.id);
              }}
              className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-650 dark:hover:text-slate-200 transition-all cursor-pointer"
              title="Переместить в колонку"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {activeMoveMenuCardId === node.id && (
              <div 
                className="absolute right-0 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl shadow-lg p-1.5 w-44 z-40 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Переместить:</p>
                <div className="space-y-0.5">
                  {columns.map(destCol => {
                    const isCurrent = (colIdOfNode(node) === destCol.id);
                    if (isCurrent) return null;
                    return (
                      <button
                        key={destCol.id}
                        id={`kanban-card-move-to-${node.id}-${destCol.id}`}
                        type="button"
                        onClick={() => {
                          moveCardToColumn(node, destCol.id);
                          setActiveMoveMenuCardId(null);
                        }}
                        className="w-full text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-705 px-2 py-1 text-[10.5px] rounded text-slate-650 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: destCol.color }} />
                        <span className="truncate">{destCol.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress slider visually if active */}
        {node.progress !== undefined && node.progress > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] font-extrabold text-[#94a3b8] dark:text-slate-500 uppercase tracking-widest">
              <span>Прогресс</span>
              <span>{node.progress}%</span>
            </div>
            <div className="w-full bg-[#f1f5f9] dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#4f46e5] dark:bg-indigo-500 transition-all rounded-full shadow-[0_0_8px_rgba(79,70,229,0.2)]"
                style={{ width: `${node.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Card metadata row (Priority, Due Date, attachments/notes) */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {renderPriorityBadge(node.priority)}

          {hasDueDate && (
            <span className={`inline-flex items-center gap-1.5 text-[9.5px] px-2 py-0.5 rounded-lg border font-extrabold shadow-sm ${
              isOverdue(node.dueDate)
                ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-950/45'
                : 'bg-white dark:bg-slate-800 text-slate-550 border-slate-200 dark:border-slate-705'
            }`} title={isOverdue(node.dueDate) ? "Просрочен дедлайн" : "Дедлайн"}>
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{formatRussianDate(node.dueDate)}</span>
            </span>
          )}

          {hasNotes && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-slate-50/50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-slate-400 hover:text-slate-600" title="Есть описание">
              <FileText className="w-3 h-3" />
            </span>
          )}

          {hasTaskLinks && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-indigo-50/55 dark:bg-indigo-950/40 border border-indigo-150/50 dark:border-indigo-900/45 text-indigo-600 dark:text-indigo-400" title="Содержит ссылки на другие задачи">
              <LinkIcon className="w-3 h-3" />
            </span>
          )}

          {hasAttachments && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-500 font-bold" title="Прикреплены файлы">
              <Paperclip className="w-3 h-3" />
              <span>{node.files.length}</span>
            </span>
          )}
        </div>

        {/* Secondary tag pills (other tags excluding current category tags) */}
        {(() => {
          const otherTags = (node.tags || []).filter(t => !activeTags.includes(t));
          if (otherTags.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-800/40 pt-2.5">
              {otherTags.map(t => (
                <span 
                  key={t} 
                  className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-505 border border-slate-200/50 dark:border-slate-700/50 shadow-2xs"
                >
                  #{t}
                </span>
              ))}
            </div>
          );
        })()}

        {/* Subtasks inline list */}
        {(() => {
          const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.archived);
          if (subtasks.length === 0) return null;
          const isExpanded = expandedCardSubtasks[node.id] || false;
          const completedCount = subtasks.filter(s => s.completed).length;

          return (
            <div className="border-t border-slate-100 dark:border-slate-800/60 pt-2.5 mt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setExpandedCardSubtasks(prev => ({
                    ...prev,
                    [node.id]: !isExpanded
                  }));
                }}
                className="flex items-center justify-between w-full text-[10px] font-black text-slate-505 hover:text-[#4f46e5] dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5 pl-0.5 pb-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                  </span>
                  <span>ПОДЗАДАЧИ:</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-100 dark:bg-slate-800/80 font-extrabold text-slate-600 dark:text-slate-400">
                    {completedCount}/{subtasks.length}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-medium text-slate-400">{isExpanded ? 'Свернуть' : 'Развернуть'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 pl-1.5 border-l-2 border-indigo-100 dark:border-indigo-950/60 space-y-1.5 overflow-hidden"
                  >
                    {subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(subtask.id, e);
                        }}
                        className="group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center gap-2 transition-all text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode({
                              ...subtask,
                              completed: !subtask.completed
                            });
                          }}
                          className="text-slate-400 hover:text-[#4f46e5] dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                        >
                          {subtask.completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 fill-emerald-100/30 dark:fill-emerald-900/10" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                        <span className={`truncate leading-normal font-semibold ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                          {subtask.text}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </motion.div>
    );
  };

  const colIdOfNode = (node: TaskNode): string => {
    if (groupBy === 'priority') {
      return node.priority || 'none';
    } else if (groupBy === 'category') {
      return getNodeCategoryTag(node) || 'uncategorized';
    } else {
      // Find parent container ID
      let curr: TaskNode | undefined = node;
      const visited = new Set<string>();
      while (curr && curr.parentId) {
        if (visited.has(curr.parentId)) break;
        visited.add(curr.parentId);
        const parentNode = nodes.find(n => n.id === curr!.parentId);
        if (parentNode && parentNode.isContainer) return parentNode.id;
        curr = parentNode;
      }
      return 'no-container';
    }
  };

  return (
    <div id="kanban-view-root" className="flex flex-col h-full w-full select-none">
      
      {/* Category selector panel */}
      <div 
        id="kanban-categories-bar" 
        className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-900 px-4 sm:px-6 py-4 select-none"
      >
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-x-8 gap-y-4">
          {/* Container Selection Row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-b border-slate-200/40 dark:border-slate-800/20 pb-3 lg:border-none lg:pb-0 lg:pt-0">
            <span className="text-[10px] font-black text-slate-505 dark:text-slate-400 uppercase tracking-widest shrink-0 flex items-center gap-1.5">
              <KanbanIcon className="w-3.5 h-3.5 text-indigo-505 dark:text-indigo-400" />
              КОНТЕЙНЕР:
            </span>
            <div className="relative min-w-[200px] max-w-xs animate-fade-in">
              <select
                id="kanban-container-filter-select"
                value={selectedContainerFilterId}
                onChange={(e) => setSelectedContainerFilterId(e.target.value)}
                className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-705 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-3.5 py-1.5 pr-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-[#4f46e5] transition-all"
              >
                <option value="all">
                  Все задачи ({nodes.filter(n => !n.isContainer && !n.archived).length})
                </option>
                <option value="no-container">
                  Без контейнера ({nodes.filter(n => !n.isContainer && !n.archived && !isInsideAnyContainer(n)).length})
                </option>
                {allContainers.map(container => {
                  const count = nodes.filter(n => !n.isContainer && !n.archived && getTaskContainerId(n) === container.id).length;
                  return (
                    <option key={container.id} value={container.id}>
                      📦 {container.text} ({count})
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 dark:text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/40 dark:border-slate-800/20 lg:border-none lg:pb-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">ГРУППИРОВКА KANBAN:</span>
              <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => setGroupBy('category')}
                  className={`px-3.5 py-1 border text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    groupBy === 'category' 
                      ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.06)]' 
                      : 'bg-transparent border-transparent text-slate-505 hover:text-slate-800 dark:hover:text-slate-350'
                  }`}
                >
                  По категориям
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy('priority')}
                  className={`px-3.5 py-1 border text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    groupBy === 'priority' 
                      ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.06)]' 
                      : 'bg-transparent border-transparent text-slate-550 hover:text-slate-800 dark:hover:text-slate-350'
                  }`}
                >
                  По приоритетам
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy('container')}
                  className={`px-3.5 py-1 border text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    groupBy === 'container' 
                      ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 shadow-[0_2px_8px_rgba(0,0,0,0.06)]' 
                      : 'bg-transparent border-transparent text-slate-550 hover:text-slate-805 dark:hover:text-slate-350'
                  }`}
                >
                  По контейнерам
                </button>
              </div>

              {/* Global toggle for completed tasks */}
              <button
                type="button"
                onClick={() => {
                  const newVal = !collapseCompleted;
                  setCollapseCompleted(newVal);
                  // Apply new state across all columns
                  const updated: Record<string, boolean> = {};
                  columns.forEach(col => {
                    updated[col.id] = newVal;
                  });
                  setCollapsedColumns(updated);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-black rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                  collapseCompleted 
                    ? 'bg-indigo-50/75 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-805 text-slate-600 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-850'
                }`}
                title={collapseCompleted ? "Развернуть выполненные задачи во всех колонках" : "Свернуть выполненные задачи во всех колонках"}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${collapseCompleted ? 'text-indigo-505 dark:text-indigo-400' : 'text-slate-400'}`} />
                <span>{collapseCompleted ? 'Выполненные: Свёрнуты' : 'Выполненные: Свернуть все'}</span>
              </button>

              {/* Subtasks show/hide filter toggle */}
              <button
                type="button"
                onClick={() => setShowSubtasks(!showSubtasks)}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-black rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                  showSubtasks 
                    ? 'bg-emerald-50/75 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-805 text-slate-605 dark:text-slate-350 hover:bg-slate-50/50 dark:hover:bg-slate-850'
                }`}
                title={showSubtasks ? "Скрыть дочерние подзадачи во всех колонках" : "Показать дочерние подзадачи во всех колонках"}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                  showSubtasks 
                    ? 'border-emerald-500 bg-emerald-500 text-white' 
                    : 'border-slate-300 dark:border-slate-700'
                }`}>
                  {showSubtasks && (
                    <svg className="w-2.5 h-2.5 text-white stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span>Показывать подзадачи</span>
              </button>
            </div>
          </div>

          {groupBy === 'category' && tagCategories.length > 0 && (
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full lg:w-auto">
              {/* Mobile Header Toggle, visible on mobile, hidden on tablet/desktop */}
              <div className="flex md:hidden items-center justify-between">
                <button 
                  type="button"
                  onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
                  className="flex items-center gap-2 cursor-pointer py-1 text-left focus:outline-none"
                >
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    КАТЕГОРИЯ:
                  </span>
                  {activeCategory && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700/60 text-[11px] font-bold text-slate-705 dark:text-slate-200">
                      <span className="w-2 h-2 rounded-full shrink-0 animate-pulse-subtle" style={{ backgroundColor: activeCategory.color }} />
                      <span>{activeCategory.name}</span>
                    </span>
                  )}
                  <ChevronDown 
                    className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                      isCategoriesExpanded ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
              </div>

              {/* Categories container: always visible on desktop, conditionally collapsed/expanded with animation on mobile */}
              <div className={`${isCategoriesExpanded ? 'flex' : 'hidden md:flex'} mt-1 lg:mt-0 flex-col md:flex-row md:items-center gap-3 overflow-x-auto scrollbar-none`}>
                <span className="hidden md:inline text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
                  КАТЕГОРИЯ:
                </span>
                
                <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5 overflow-[x-auto] py-0.5 scrollbar-none">
                  {tagCategories.map(cat => {
                    const isSelected = cat.id === selectedCategoryId;
                    
                    // Count cards belonging to this category overall
                    const count = nodes.filter(n => {
                      if (!n.tags) return false;
                      return n.tags.some(t => cat.tags?.includes(t));
                    }).length;

                    return (
                      <button
                        key={cat.id}
                        id={`kanban-cat-tab-${cat.id}`}
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          // Automatically collapse picker on mobile/tablet after selection
                          if (window.innerWidth < 768) {
                            setIsCategoriesExpanded(false);
                          }
                        }}
                        className={`px-4 py-2 rounded-2xl border text-xs font-black flex items-center gap-2.5 cursor-pointer transition-all duration-200 shrink-0 ${
                          isSelected 
                            ? 'bg-white dark:bg-slate-900 border-[#4f46e5]/85 dark:border-indigo-500 text-[#4f46e5] dark:text-indigo-300 ring-2 ring-indigo-500/10 shadow-[0_4px_15px_rgba(79,70,229,0.06)] scale-[1.01]'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-705 hover:bg-slate-50/60 dark:hover:bg-slate-850'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span>{cat.name}</span>
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {groupBy === 'category' && tagCategories.length === 0 && (
            <div className="text-center py-2 text-[10.5px] text-slate-500 dark:text-slate-450 font-medium lg:py-0 lg:ml-auto">
              Нет категорий. Вы всегда можете переключиться на вид по приоритетам выше!
            </div>
          )}
        </div>
      </div>

      {/* Pillars Columns Area */}
      <div 
        id="kanban-columns-container" 
        className="flex-1 overflow-x-auto min-h-0 bg-slate-50/10 dark:bg-slate-950/5 p-5 sm:p-6"
      >
        <div className="flex gap-5 h-full items-start pb-2">
          {columns.map(col => {
            const isAddActive = activeAddInColumn === col.id;
            const isDraggedOver = draggedOverColumn === col.id;

            return (
              <div
                key={col.id}
                id={`kanban-column-root-${col.id}`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-72 sm:w-80 shrink-0 rounded-2xl bg-[#f8fafc] dark:bg-slate-905/80 border p-4 flex flex-col max-h-full transition-all duration-250 scrollbar-thin ${
                  isDraggedOver 
                    ? 'border-indigo-400 dark:border-indigo-505 bg-indigo-50/10 dark:bg-indigo-950/10 scale-[1.01] ring-2 ring-indigo-500/10 shadow-[0_10px_30px_rgba(99,102,241,0.08)]' 
                    : 'border-slate-200 dark:border-slate-850 shadow-[0_2px_8px_rgba(15,23,42,0.015),0_1px_3px_rgba(15,23,42,0.01)]'
                }`}
                style={{ borderTop: `3px solid ${col.color}` }}
              >
                {/* Column top header */}
                <div className="flex items-center justify-between pb-3 mb-3 px-1 border-b border-slate-200/50 dark:border-slate-800/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate" title={col.title}>
                      {col.title}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                      {col.items.length}
                    </span>
                  </div>
                </div>

                {/* Vertical list of cards */}
                <div 
                  id={`kanban-column-cards-${col.id}`}
                  className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[50px] scrollbar-thin max-h-[calc(100vh-23rem)]"
                >
                  {(() => {
                    const sortedItems = [...col.items].sort((a, b) => {
                      if (a.completed && !b.completed) return 1;
                      if (!a.completed && b.completed) return -1;
                      return 0;
                    });
                    const activeItems = sortedItems.filter(n => !n.completed);
                    const completedItems = sortedItems.filter(n => n.completed);
                    const isCompletedCollapsed = collapsedColumns[col.id] !== undefined
                      ? collapsedColumns[col.id]
                      : collapseCompleted;

                    return (
                      <>
                        <AnimatePresence initial={false}>
                          {activeItems.map(node => renderCard(node))}
                        </AnimatePresence>

                        {completedItems.length > 0 && (
                          <div id={`completed-section-${col.id}`} className="mt-3.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCollapsedColumns(prev => ({
                                  ...prev,
                                  [col.id]: !isCompletedCollapsed
                                }));
                              }}
                              className="w-full flex items-center justify-between py-1.5 px-2 bg-slate-100/70 dark:bg-slate-800/40 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors rounded-xl text-[10px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer mb-2 shadow-xs"
                            >
                              <span className="flex items-center gap-1.5 pl-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
                                <span>Выполненные</span>
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-200/80 dark:bg-slate-705 font-extrabold shrink-0 text-slate-600 dark:text-slate-350">
                                  {completedItems.length}
                                </span>
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isCompletedCollapsed ? '-rotate-90' : ''}`} />
                            </button>

                            <AnimatePresence initial={false}>
                              {!isCompletedCollapsed && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="space-y-2.5 overflow-hidden"
                                >
                                  {completedItems.map(node => renderCard(node))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {col.items.length === 0 && (
                          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[10.5px] font-bold text-slate-400 dark:text-slate-555 select-none">
                            Перетащите карточки сюда
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Inline Add Task panel in column */}
                <div className="mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/30">
                  {isAddActive ? (
                    <div className="space-y-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl">
                      <input
                        id={`kanban-add-input-${col.id}`}
                        type="text"
                        placeholder="Краткое название задачи..."
                        value={newTaskNameInColumn}
                        onChange={(e) => setNewTaskNameInColumn(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateTaskInColumn(col.id);
                          }
                          if (e.key === 'Escape') {
                            setActiveAddInColumn(null);
                            setNewTaskNameInColumn('');
                          }
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-200"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          id={`kanban-add-cancel-btn-${col.id}`}
                          type="button"
                          onClick={() => {
                            setActiveAddInColumn(null);
                            setNewTaskNameInColumn('');
                          }}
                          className="px-2 py-1 text-[10px] text-slate-600 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          id={`kanban-add-confirm-btn-${col.id}`}
                          type="button"
                          onClick={() => handleCreateTaskInColumn(col.id)}
                          className="px-2.5 py-1 text-[10px] text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors font-medium cursor-pointer"
                        >
                          Создать
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      id={`kanban-add-trigger-${col.id}`}
                      type="button"
                      onClick={() => {
                        setActiveAddInColumn(col.id);
                        setNewTaskNameInColumn('');
                      }}
                      className="w-full py-2 bg-slate-100/40 hover:bg-white dark:bg-slate-900/20 dark:hover:bg-slate-900 border border-dashed border-slate-200 hover:border-slate-350 dark:border-slate-800 dark:hover:border-slate-700 hover:shadow-[0_2px_8px_rgba(0,0,0,0.03)] rounded-xl text-[11px] font-extrabold text-slate-550 hover:text-[#4f46e5] dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить задачу</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
