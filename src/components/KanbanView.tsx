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
import { isNodeOverdue, isContainerOverdue } from '../utils';

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
  searchQuery?: string;
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
  searchQuery = '',
}: KanbanViewProps) {
  const [groupBy, setGroupBy] = useState<'category' | 'priority' | 'container'>(() => {
    return tagCategories.length === 0 ? 'priority' : 'category';
  });

  const [sortBy, setSortBy] = useState<'default' | 'priority' | 'dueDate'>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_sort_by');
      if (saved) return saved as any;
    } catch {}
    return 'default';
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_sort_by', sortBy);
    } catch {}
  }, [sortBy]);

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

  // Inline edit menus state for spot selection (priority, due dates, tags) without opening props sidebar
  const [activeInlineMenu, setActiveInlineMenu] = useState<{
    cardId: string;
    type: 'priority' | 'date' | 'tag';
  } | null>(null);

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

  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_filters_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_filters_collapsed', String(isFiltersCollapsed));
    } catch {}
  }, [isFiltersCollapsed]);

  const activeCategory = tagCategories.find(c => c.id === selectedCategoryId) || tagCategories[0];

  // If there's an active project but our selectedCategory is null and categories just loaded/exist:
  React.useEffect(() => {
    if (!selectedCategoryId && tagCategories.length > 0) {
      setSelectedCategoryId(tagCategories[0].id);
    }
  }, [tagCategories, selectedCategoryId]);

  // Get tags of the active category
  const activeTags = activeCategory?.tags || [];

  const isSearchActive = !!searchQuery?.trim();
  const isArchivedNodeMatchingSearch = (n: TaskNode): boolean => {
    if (!n.archived) return true; // not archived
    if (n.isContainer) return false; // exclude containers
    if (isSearchActive) {
      const q = searchQuery.toLowerCase();
      const textMatches = n.text?.toLowerCase().includes(q);
      const tagMatches = n.tags?.some(t => t.toLowerCase().includes(q)) || false;
      const notesMatches = n.notes?.toLowerCase().includes(q) || false;
      return textMatches || tagMatches || notesMatches;
    }
    return false;
  };

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
    if (n.archived && !isArchivedNodeMatchingSearch(n)) return false;
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
    const tasksWithoutContainer = nodes.filter(n => !n.isContainer && (!n.archived || isArchivedNodeMatchingSearch(n)) && !isInsideAnyContainer(n) && matchesSubtaskFilter(n));
    columns.push({
      id: 'no-container',
      title: 'Без контейнера',
      color: '#94a3b8',
      isUncategorized: true,
      items: tasksWithoutContainer
    });

    // 3. Columns for each container
    containerNodes.forEach(c => {
      const items = nodes.filter(n => !n.isContainer && (!n.archived || isArchivedNodeMatchingSearch(n)) && getTaskContainerId(n) === c.id && matchesSubtaskFilter(n));
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
        className={`group select-none text-left rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.01),0_1px_3px_rgba(15,23,42,0.015)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.03)] hover:translate-y-[-1.5px] transition-all duration-200 cursor-grab active:cursor-grabbing relative flex flex-col gap-3.5 ${
          activeInlineMenu?.cardId === node.id || activeMoveMenuCardId === node.id
            ? 'z-55 ring-2 ring-indigo-500 bg-white dark:bg-slate-900 shadow-xl scale-[1.01]' 
            : 'z-10'
        } ${
          node.archived
            ? 'bg-amber-50/5 dark:bg-amber-950/2 border-dashed border-amber-300 dark:border-amber-900/40 opacity-60 saturate-60'
            : 'bg-white dark:bg-slate-910'
        } ${
          draggedOverTagCardId === node.id
            ? 'border-emerald-500 dark:border-emerald-400 ring-4 ring-emerald-500/20 shadow-md bg-emerald-50/10 dark:bg-emerald-950/10 scale-[1.01]'
            : node.id === selectedNodeId 
              ? 'border-[#4f46e5] dark:border-indigo-400 ring-4 ring-indigo-500/15 shadow-md scale-[1.015]' 
              : isNodeOverdue(node, nodes)
                ? 'border-rose-400 dark:border-rose-900/60 bg-rose-50/5 dark:bg-rose-950/2 shadow-sm'
                : node.archived
                  ? ''
                  : 'border-slate-200/80 dark:border-slate-850'
        }`}
      >
        {/* Completed toggle checkbox and text */}
        <div className="flex items-start gap-3">
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
                className="absolute right-0 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl shadow-lg p-1.5 w-44 z-55 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Архив:</p>
                <div className="px-1 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-700/60">
                  {node.archived ? (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode({ ...node, archived: false });
                        setActiveMoveMenuCardId(null);
                      }}
                      className="w-full text-left font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 px-1 py-1 rounded text-[10.5px] flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>📥 Вывести</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode({ ...node, archived: true });
                        setActiveMoveMenuCardId(null);
                      }}
                      className="w-full text-left font-semibold text-slate-550 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-1 py-1 rounded text-[10.5px] flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>📦 В архив</span>
                    </button>
                  )}
                </div>

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
          {/* Priority spot edit popup */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveInlineMenu(activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'priority' ? null : { cardId: node.id, type: 'priority' });
              }}
              className="hover:scale-[1.03] transition-transform cursor-pointer block"
              title="Нажмите, чтобы изменить приоритет на месте"
            >
              {renderPriorityBadge(node.priority)}
            </button>

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'priority' && (
              <div 
                className="absolute left-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl shadow-lg p-1.5 w-44 z-40 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
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
                        className={`w-full text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-705 px-2 py-1 text-[10.5px] rounded flex items-center justify-between cursor-pointer ${
                          isSelected ? 'text-[#4f46e5] dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20' : 'text-slate-650 dark:text-slate-300'
                        }`}
                      >
                        <span>{label}</span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-[#4f46e5] dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Due date spot edit popup */}
          <div className="relative">
            {hasDueDate ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInlineMenu(activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'date' ? null : { cardId: node.id, type: 'date' });
                }}
                className={`inline-flex items-center gap-1.5 text-[9.5px] px-2 py-0.5 rounded-lg border font-extrabold shadow-sm hover:scale-[1.03] transition-transform cursor-pointer ${
                  isNodeOverdue(node, nodes)
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-605 dark:text-rose-400 border-rose-100 dark:border-rose-950/45 animate-pulse'
                    : 'bg-white dark:bg-slate-800 text-slate-550 border-slate-200 dark:border-slate-705 hover:bg-slate-50/50 dark:hover:bg-slate-755'
                }`}
                title={isNodeOverdue(node, nodes) ? `Просрочен дедлайн: ${formatRussianDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения на месте)` : `Дедлайн: ${formatRussianDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения на месте)`}
              >
                <Clock className={`w-3 h-3 ${isNodeOverdue(node, nodes) ? 'text-rose-550' : 'text-slate-400'}`} />
                <span>{formatRussianDate(node.dueDate)}{node.dueTime ? ` ${node.dueTime}` : ''}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInlineMenu(activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'date' ? null : { cardId: node.id, type: 'date' });
                }}
                className="inline-flex items-center gap-1.5 text-[9.5px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-0.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850 hover:scale-[1.03] transition-all select-none cursor-pointer"
                title="Добавить срок выполнения прямо на месте"
              >
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                <span>+ Срок</span>
              </button>
            )}

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'date' && (
              <div 
                className="absolute left-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-2xl shadow-xl p-3 w-56 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Срок выполнения:</p>
                
                <div className="space-y-1 text-left">
                  <label htmlFor={`inline-date-${node.id}`} className="text-[9px] font-bold text-slate-500">Дата</label>
                  <input 
                    type="date"
                    id={`inline-date-${node.id}`}
                    defaultValue={node.dueDate || ''}
                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label htmlFor={`inline-time-${node.id}`} className="text-[9px] font-bold text-slate-500">Время</label>
                  <input 
                    type="time"
                    id={`inline-time-${node.id}`}
                    defaultValue={node.dueTime || ''}
                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex gap-1.5 mt-1 border-t border-slate-100 dark:border-slate-800/60 pt-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const dateInput = document.getElementById(`inline-date-${node.id}`) as HTMLInputElement | null;
                      const timeInput = document.getElementById(`inline-time-${node.id}`) as HTMLInputElement | null;
                      const dateVal = dateInput?.value || undefined;
                      const timeVal = timeInput?.value || undefined;
                      
                      onUpdateNode({
                        ...node,
                        dueDate: dateVal || undefined,
                        dueTime: dateVal ? (timeVal || undefined) : undefined
                      });
                      setActiveInlineMenu(null);
                    }}
                    className="flex-1 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-[10px] transition-all cursor-pointer text-center"
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
                          dueTime: undefined
                        });
                        setActiveInlineMenu(null);
                      }}
                      className="flex-1 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-650 dark:text-rose-400 font-bold text-[10px] transition-all cursor-pointer text-center"
                    >
                      Сбросить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveInlineMenu(null)}
                    className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 font-bold text-[10px] transition-all cursor-pointer text-center"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tags spot edit popup trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveInlineMenu(activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'tag' ? null : { cardId: node.id, type: 'tag' });
              }}
              className="inline-flex items-center gap-1.5 text-[9.5px] text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-0.5 rounded-lg border border-dashed border-slate-205 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850 hover:scale-[1.03] transition-all cursor-pointer"
              title="Добавить или изменить теги на месте"
            >
              <Tag className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Теги</span>
            </button>

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'tag' && (
              <div 
                className="absolute left-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-2xl shadow-xl p-3 w-64 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2"
                onClick={(e) => e.stopPropagation()}
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

                <div className="max-h-48 overflow-y-auto space-y-2.5 my-1 pr-1 border-b border-slate-100 dark:border-slate-800/60 pb-2 text-left">
                  {tagCategories.length === 0 ? (
                    <p className="text-[10.5px] text-slate-400 font-medium">Нет созданных категорий или тегов в проекте.</p>
                  ) : (
                    tagCategories.map(cat => (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-extrabold" style={{ color: cat.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span>{cat.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cat.tags.map(tag => {
                            const isAssigned = (node.tags || []).includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  const currentTags = node.tags || [];
                                  const nextTags = isAssigned 
                                    ? currentTags.filter(t => t !== tag)
                                    : [...currentTags, tag];
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
                                #{tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1 select-none text-left leading-normal">
                  <span className="animate-pulse shrink-0">✨</span>
                  <span>Нажмите для изменения тегов</span>
                </div>
              </div>
            )}
          </div>

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
            <div 
              className="flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-800/40 pt-2.5 cursor-pointer hover:bg-slate-50/30 dark:hover:bg-slate-850/20 p-1 rounded-lg transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setActiveInlineMenu(activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'tag' ? null : { cardId: node.id, type: 'tag' });
              }}
              title="Нажмите, чтобы изменить теги задачи"
            >
              {otherTags.map(t => (
                <span 
                  key={t} 
                  className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-505 border border-slate-200/50 dark:border-slate-700/50 shadow-2xs hover:scale-[1.03] transition-transform"
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
                        className="group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-2 transition-all text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
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
                            className="text-slate-400 hover:text-[#4f46e5] dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                          >
                            {subtask.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 fill-emerald-100/30 dark:fill-emerald-900/10" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                          <span className={`truncate leading-normal font-semibold ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-500' : isNodeOverdue(subtask, nodes) ? 'text-rose-555 dark:text-rose-450' : ''}`}>
                            {subtask.text}
                          </span>
                        </div>
                        {subtask.dueDate && (
                          <span className={`shrink-0 flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded-lg border font-extrabold shadow-xs ${
                            isNodeOverdue(subtask, nodes) && !subtask.completed
                              ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 border-rose-100 dark:border-rose-950/30'
                              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-205 dark:border-slate-700/60'
                          }`}>
                            <Clock className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
                            <span>{formatRussianDate(subtask.dueDate)}{subtask.dueTime ? ` ${subtask.dueTime}` : ''}</span>
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
        className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-900 select-none transition-all duration-200"
      >
        {/* Compact Summary Header Row - Always visible, extremely thin and space-saving */}
        <div className="flex items-center justify-between px-3 py-1 md:px-5 md:py-1.5 border-b border-slate-200/30 dark:border-slate-800/20 bg-white/60 dark:bg-slate-900/30">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-350 flex-1 min-w-0 pr-2">
            <span className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/30 text-[#4f46e5] dark:text-indigo-400 px-1.5 py-0.5 rounded-md border border-indigo-100/30 font-black tracking-wide uppercase text-[9px] shrink-0">
              <KanbanIcon className="w-2.5 h-2.5" />
              КАНБАН
            </span>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px]">
              <span className="text-slate-500 dark:text-slate-400">Группа:</span>
              <span className="text-[#4f46e5] dark:text-indigo-400 font-extrabold px-1 py-0.2 text-[10px] rounded bg-indigo-50/40 dark:bg-indigo-950/20 shrink-0 border border-indigo-100/10">
                {groupBy === 'category' ? 'Категории' : groupBy === 'priority' ? 'Приоритеты' : 'Контейнеры'}
              </span>
              <span className="text-slate-300 dark:text-slate-700/60">|</span>
              <span className="text-slate-500 dark:text-slate-400">Внутри:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold px-1 py-0.2 text-[10px] rounded bg-emerald-50/40 dark:bg-emerald-950/20 truncate max-w-[100px] inline-block align-bottom shrink-0 border border-emerald-100/10">
                {selectedContainerFilterId === 'all' 
                  ? 'Все' 
                  : selectedContainerFilterId === 'no-container' 
                    ? 'Без контейнера' 
                    : allContainers.find(c => c.id === selectedContainerFilterId)?.text || 'Загрузка'}
              </span>
              {groupBy === 'category' && activeCategory && (
                <>
                  <span className="text-slate-300 dark:text-slate-700/60">|</span>
                  <span className="inline-flex items-center gap-1 px-1 py-0.2 text-[10px] rounded font-extrabold text-[#4f46e5] dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 shrink-0 border border-indigo-100/10">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeCategory.color }} />
                    <span className="truncate max-w-[70px]">{activeCategory.name}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0 md:ml-auto">
            {/* Сортировка */}
            <div className="flex items-center gap-1.5 bg-slate-100/60 dark:bg-slate-805/50 px-2 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-850">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 whitespace-nowrap select-none hidden sm:inline">
                Сортировка:
              </span>
              <div className="relative shrink-0">
                <select
                  id="kanban-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none bg-transparent text-slate-700 dark:text-slate-300 text-[10.5px] font-black pr-5 cursor-pointer focus:outline-none transition-all"
                >
                  <option value="default" className="bg-white dark:bg-slate-900">📋 По умолчанию</option>
                  <option value="priority" className="bg-white dark:bg-slate-900">🔥 По приоритету</option>
                  <option value="dueDate" className="bg-white dark:bg-slate-900">📅 По дате</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-slate-400 dark:text-slate-500">
                  <ChevronDown className="w-2.5 h-2.5" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
              className="flex items-center gap-1 px-2.5 py-0.5 text-[10.5px] font-black hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors border border-slate-200/50 dark:border-slate-800/85 text-slate-705 dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              <span>{isFiltersCollapsed ? 'Фильтры' : 'Свернуть'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
            </button>
          </div>
        </div>

        {/* Collapsible advanced filter controls with nice expand/collapse animation */}
        <AnimatePresence initial={false}>
          {!isFiltersCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 p-2 md:p-3 border-b border-indigo-100/10 dark:border-indigo-950/10 bg-slate-50/30 dark:bg-slate-950/20">
                {/* Clean side-by-side flex layout to save max vertical space */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  
                  {/* Container Selector as an elegant dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
                      Контейнер:
                    </span>
                    <div className="relative">
                      <select
                        id="kanban-container-filter-select"
                        value={selectedContainerFilterId}
                        onChange={(e) => setSelectedContainerFilterId(e.target.value)}
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10.5px] font-extrabold rounded-lg pl-2 pr-6 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-505 transition-all"
                      >
                        <option value="all">📁 Все ({nodes.filter(n => !n.isContainer && !n.archived).length})</option>
                        <option value="no-container">📦 Без контейнера ({nodes.filter(n => !n.isContainer && !n.archived && !isInsideAnyContainer(n)).length})</option>
                        {allContainers.map(container => {
                          const count = nodes.filter(n => !n.isContainer && !n.archived && getTaskContainerId(n) === container.id).length;
                          return (
                            <option key={container.id} value={container.id}>
                              📦 {container.text || 'Без названия'} ({count})
                            </option>
                          );
                        })}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 text-slate-400 dark:text-slate-500">
                        <ChevronDown className="w-3 h-3" />
                      </div>
                    </div>
                  </div>

                  {/* Grouping Selectors Segmented Control */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
                      Группировка:
                    </span>
                    <div className="flex items-center gap-0.5 bg-slate-200/50 dark:bg-slate-900/50 p-0.5 rounded-lg border border-slate-250 dark:border-slate-800/60 shrink-0">
                      <button
                        type="button"
                        onClick={() => setGroupBy('category')}
                        className={`px-1.5 py-0.5 border text-[10px] font-black rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'category' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        Категории
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupBy('priority')}
                        className={`px-1.5 py-0.5 border text-[10px] font-black rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'priority' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        Приоритеты
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupBy('container')}
                        className={`px-1.5 py-0.5 border text-[10px] font-black rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'container' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-[#4f46e5]/85 dark:hover:text-indigo-305'
                        }`}
                      >
                        Контейнеры
                      </button>
                    </div>
                  </div>

                  {/* Fast Checkboxes Toggles on the right side */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0 md:ml-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const newVal = !collapseCompleted;
                        setCollapseCompleted(newVal);
                        const updated: Record<string, boolean> = {};
                        columns.forEach(col => {
                          updated[col.id] = newVal;
                        });
                        setCollapsedColumns(updated);
                      }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black rounded border cursor-pointer transition-all ${
                        collapseCompleted 
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/10 border-indigo-200/40 text-[#4f46e5] dark:text-indigo-400' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className={`w-3 h-3 ${collapseCompleted ? 'text-[#4f46e5] dark:text-indigo-400' : 'text-slate-400'}`} />
                      <span>{collapseCompleted ? 'Развёрнуты' : 'Свернуть все'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSubtasks(!showSubtasks)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black rounded border cursor-pointer transition-all ${
                        showSubtasks 
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/10 border-emerald-200/40 text-emerald-605 dark:text-emerald-400 shadow-sm' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded border flex items-center justify-center text-[6px] text-white ${
                        showSubtasks ? 'border-emerald-500 bg-emerald-500' : 'border-slate-305 dark:border-slate-700'
                      }`}>
                        {showSubtasks && '✓'}
                      </div>
                      <span>Подзадачи</span>
                    </button>
                  </div>

                </div>

                {/* Categories selection row */}
                {groupBy === 'category' && tagCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 border-t border-slate-150 dark:border-slate-800/40 pt-1 px-0.5 mt-0.5 w-full">
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
                      Категория:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none w-full">
                      {tagCategories.map(cat => {
                        const isSelected = cat.id === selectedCategoryId;
                        const count = nodes.filter(n => {
                          if (!n.tags) return false;
                          return n.tags.some(t => cat.tags?.includes(t));
                        }).length;

                        return (
                          <button
                            key={cat.id}
                            id={`kanban-cat-tab-${cat.id}`}
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={`px-1.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1.5 cursor-pointer transition-all duration-150 shrink-0 rounded border ${
                              isSelected 
                                ? 'bg-white dark:bg-slate-900 border-[#4f46e5] text-[#4f46e5] dark:text-indigo-400 ring-1 ring-indigo-500/10'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50/50'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span>{cat.name}</span>
                            <span className="text-[9px] font-black px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pillars Columns Area */}
      <div 
        id="kanban-columns-container" 
        className="flex-1 overflow-x-auto min-h-0 bg-slate-50/10 dark:bg-slate-950/5 p-3 md:p-6"
      >
        <div className="flex gap-5 h-full items-stretch pb-2">
          {columns.map(col => {
            const isAddActive = activeAddInColumn === col.id;
            const isDraggedOver = draggedOverColumn === col.id;
            const containerNode = groupBy === 'container' && col.id !== 'no-container' ? nodes.find(n => n.id === col.id) : null;
            const isOverdueCont = containerNode ? isContainerOverdue(containerNode, nodes) : false;

            return (
              <div
                key={col.id}
                id={`kanban-column-root-${col.id}`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-72 sm:w-80 shrink-0 rounded-2xl border p-4 flex flex-col h-full transition-all duration-250 scrollbar-thin ${
                  isOverdueCont
                    ? 'border-rose-350 dark:border-rose-850 bg-rose-50/10 dark:bg-rose-950/5 ring-2 ring-rose-500/10 shadow-[0_10px_25px_rgba(244,63,94,0.04)]'
                    : isDraggedOver 
                      ? 'border-indigo-400 dark:border-indigo-505 bg-indigo-50/10 dark:bg-indigo-950/10 scale-[1.01] ring-2 ring-indigo-500/10 shadow-[0_10px_30px_rgba(99,102,241,0.08)]' 
                      : 'border-slate-200 dark:border-slate-850 bg-[#f8fafc] dark:bg-slate-905/80 shadow-[0_2px_8px_rgba(15,23,42,0.015),0_1px_3px_rgba(15,23,42,0.01)]'
                }`}
                style={{ borderTop: isOverdueCont ? '3px solid #f43f5e' : `3px solid ${col.color}` }}
              >
                {/* Column top header */}
                <div className="flex items-center justify-between pb-3 mb-3 px-1 border-b border-slate-200/50 dark:border-slate-800/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isOverdueCont ? '#f43f5e' : col.color }} />
                    <h4 className={`text-xs font-extrabold truncate ${isOverdueCont ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-800 dark:text-slate-100'}`} title={col.title}>
                      {isOverdueCont && '⚠️ '}{col.title}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono shrink-0 ${isOverdueCont ? 'bg-rose-200/60 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-550 dark:text-slate-400'}`}>
                      {col.items.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeAddInColumn === col.id) {
                        setActiveAddInColumn(null);
                      } else {
                        setActiveAddInColumn(col.id);
                        setNewTaskNameInColumn('');
                        // Scroll to input after it renders
                        setTimeout(() => {
                          const inputEl = document.getElementById(`kanban-add-input-${col.id}`);
                          if (inputEl) {
                            inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            inputEl.focus();
                          }
                        }, 100);
                      }
                    }}
                    title="Добавить задачу"
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-805 dark:hover:bg-slate-755 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-450 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Vertical list of cards */}
                <div 
                  id={`kanban-column-cards-${col.id}`}
                  className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[50px] scrollbar-thin"
                >
                  {(() => {
                    const sortedItems = [...col.items].sort((a, b) => {
                      // 1. Move completed to bottom
                      if (a.completed && !b.completed) return 1;
                      if (!a.completed && b.completed) return -1;

                      // 2. Sort by chosen sortBy option
                      if (sortBy === 'priority') {
                        const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
                        const weightA = priorityWeight[a.priority || 'none'] ?? 0;
                        const weightB = priorityWeight[b.priority || 'none'] ?? 0;
                        if (weightB !== weightA) {
                          return weightB - weightA; // High priority first
                        }
                      } else if (sortBy === 'dueDate') {
                        const timeA = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59:59'}`).getTime() : Infinity;
                        const timeB = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59:59'}`).getTime() : Infinity;
                        if (timeA !== timeB) {
                          return timeA - timeB; // Earliest first
                        }
                      }

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
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
