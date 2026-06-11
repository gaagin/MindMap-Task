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
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';

interface KanbanViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, initialTags: string[], priority?: Priority) => void;
  onCreateTagCategory: (name: string, color: string) => void;
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
}: KanbanViewProps) {
  const [groupBy, setGroupBy] = useState<'category' | 'priority'>(() => {
    return tagCategories.length === 0 ? 'priority' : 'category';
  });

  // Try to pre-select the first category if any exists
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    return tagCategories.length > 0 ? tagCategories[0].id : null;
  });

  // State to manage inline card creation inputs for each column
  // Map of column key (either 'uncategorized' or tag name) to boolean and text value
  const [activeAddInColumn, setActiveAddInColumn] = useState<string | null>(null);
  const [newTaskNameInColumn, setNewTaskNameInColumn] = useState('');

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
      { id: 'urgent', title: 'Критический', color: '#f43f5e', isUncategorized: false, items: nodes.filter(n => n.priority === 'urgent') },
      { id: 'high', title: 'Высокий', color: '#f59e0b', isUncategorized: false, items: nodes.filter(n => n.priority === 'high') },
      { id: 'medium', title: 'Средний', color: '#3b82f6', isUncategorized: false, items: nodes.filter(n => n.priority === 'medium') },
      { id: 'low', title: 'Низкий', color: '#10b981', isUncategorized: false, items: nodes.filter(n => n.priority === 'low') },
      { id: 'none', title: 'Без приоритета', color: '#64748b', isUncategorized: true, items: nodes.filter(n => !n.priority || n.priority === 'none') }
    );
  } else {
    // 1. Column for Uncategorized (Без тегов текущей категории)
    const uncategorizedItems = nodes.filter(n => {
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
      const items = nodes.filter(n => {
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
    if (groupBy === 'priority') {
      onUpdateNode({
        ...node,
        priority: targetColumnId as Priority
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
        tags: updatedTags
      });
    }
  };

  const handleCreateTaskInColumn = (columnId: string) => {
    const text = newTaskNameInColumn.trim();
    if (!text) return;

    if (groupBy === 'priority') {
      onCreateTask(text, [], columnId as Priority);
    } else {
      const tagsToAssign: string[] = [];
      if (columnId !== 'uncategorized') {
        tagsToAssign.push(columnId);
      }
      onCreateTask(text, tagsToAssign, 'none');
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

  return (
    <div id="kanban-view-root" className="flex flex-col h-full w-full select-none">
      
      {/* Category selector panel */}
      <div 
        id="kanban-categories-bar" 
        className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-900 px-4 sm:px-6 py-4 select-none space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/40 dark:border-slate-800/20">
          <div className="flex items-center gap-3">
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
            </div>
          </div>
          {groupBy === 'category' && (
            <button
              id="kanban-create-first-cat-btn"
              onClick={() => {
                const name = prompt('Введите название новой категории тегов (например, Статус):');
                if (name && name.trim()) {
                  onCreateTagCategory(name.trim(), '#6366f1');
                }
              }}
              className="px-4 py-2 bg-[#4f46e5] hover:bg-[#4338ca] hover:scale-[1.01] active:scale-[0.99] text-white rounded-xl text-[10.5px] font-black shadow-[0_3px_12px_rgba(79,70,229,0.25)] transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Добавить категорию
            </button>
          )}
        </div>

        {groupBy === 'category' && tagCategories.length > 0 && (
          <>
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
            <div className={`${isCategoriesExpanded ? 'flex' : 'hidden md:flex'} mt-1 flex-col md:flex-row md:items-center gap-3 overflow-x-auto scrollbar-none`}>
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
          </>
        )}

        {groupBy === 'category' && tagCategories.length === 0 && (
          <div className="text-center py-2 text-[10.5px] text-slate-500 dark:text-slate-450 font-medium">
            Нет категорий. Вы всегда можете переключиться на вид по приоритетам выше!
          </div>
        )}
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
                  <AnimatePresence initial={false}>
                    {col.items.map(node => {
                      const hasAttachments = node.files && node.files.length > 0;
                      const hasNotes = node.notes && node.notes.trim().length > 0;
                      const hasDueDate = node.dueDate;

                      return (
                        <motion.div
                          key={node.id}
                          id={`kanban-card-${node.id}`}
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, node.id)}
                          onClick={() => onSelectNode(node.id)}
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
                          className={`group select-none bg-white dark:bg-slate-910 border hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.01),0_1px_3px_rgba(15,23,42,0.015)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.03)] hover:translate-y-[-1.5px] transition-all duration-200 cursor-grab active:cursor-grabbing relative flex flex-col gap-3.5 ${
                            draggedOverTagCardId === node.id
                              ? 'border-emerald-500 dark:border-emerald-400 ring-4 ring-emerald-500/20 shadow-md bg-emerald-50/10 dark:bg-emerald-950/10 scale-[1.01]'
                              : node.id === selectedNodeId 
                                ? 'border-[#4f46e5] dark:border-indigo-400 ring-4 ring-indigo-500/10 shadow-sm' 
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
                                  className="absolute right-0 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-xl shadow-lg p-1.5 w-44 z-40 animate-in fade-in zoom-in-95 duration-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider">Переместить:</p>
                                  <div className="space-y-0.5">
                                    {columns.map(destCol => {
                                      const isCurrent = (col.id === destCol.id);
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
                              <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-widest">
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
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {col.items.length === 0 && (
                    <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[10.5px] font-bold text-slate-400 dark:text-slate-555 select-none">
                      Перетащите карточки сюда
                    </div>
                  )}
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
