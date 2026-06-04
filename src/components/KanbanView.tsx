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
  onSelectNode: (id: string | null) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, initialTags: string[]) => void;
  onCreateTagCategory: (name: string, color: string) => void;
}

export default function KanbanView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onCreateTagCategory,
}: KanbanViewProps) {
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

  if (tagCategories.length === 0) {
    return (
      <div id="kanban-empty-state" className="flex flex-col items-center justify-center p-8 text-center h-[calc(100vh-12rem)] max-w-xl mx-auto">
        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-xs border border-slate-200 dark:border-slate-800 animate-pulse mb-4">
          <KanbanIcon className="w-8 h-8 text-indigo-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">Создайте категории тегов</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          Канбан-доска автоматически группирует ваши задачи по тегам выбранной категории. Сначала добавьте категории тегов (например, «Этап разработки», «Приоритет» или «Исполнитель») в левой панели или в параметрах задач.
        </p>
        <button
          id="kanban-create-first-cat-btn"
          onClick={() => {
            const name = prompt('Введите название новой категории тегов (например, Статус):');
            if (name && name.trim()) {
              onCreateTagCategory(name.trim(), '#6366f1');
            }
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Добавить первую категорию
        </button>
      </div>
    );
  }

  // Get tags of the active category
  const activeTags = activeCategory?.tags || [];

  // Helper to extract which tag of the active category a node has
  const getNodeCategoryTag = (node: TaskNode): string | null => {
    if (!node.tags) return null;
    // Find first tag of the node that is in the active category's tags
    const found = node.tags.find(t => activeTags.includes(t));
    return found || null;
  };

  // Classify nodes in columns
  const columns: { id: string; title: string; color: string; isUncategorized: boolean; items: TaskNode[] }[] = [];

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
      color: activeCategory.color,
      isUncategorized: false,
      items
    });
  });

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.setData('text/plain', id);
    // Allow move effect
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (draggedOverColumn !== columnId) {
      setDraggedOverColumn(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // only reset if leaving to outer space
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
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
  };

  const handleCreateTaskInColumn = (columnId: string) => {
    const text = newTaskNameInColumn.trim();
    if (!text) return;

    const tagsToAssign: string[] = [];
    if (columnId !== 'uncategorized') {
      tagsToAssign.push(columnId);
    }

    onCreateTask(text, tagsToAssign);

    // Reset inline input
    setActiveAddInColumn(null);
    setNewTaskNameInColumn('');
  };

  const renderPriorityBadge = (priority: Priority) => {
    let style = "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700/50";
    let text = "Без приоритета";

    if (priority === 'low') {
      style = "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-950/45";
      text = "Низкий";
    } else if (priority === 'medium') {
      style = "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-950/45";
      text = "Средний";
    } else if (priority === 'high') {
      style = "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-950/45";
      text = "Высокий";
    } else if (priority === 'urgent') {
      style = "bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400 border-rose-150 dark:border-rose-950/50";
      text = "Критический";
    }

    return (
      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-sm border ${style} select-none`}>
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
        className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 px-4 sm:px-6 py-2 select-none"
      >
        {/* Mobile Header Toggle, visible on mobile, hidden on tablet/desktop */}
        <div className="flex md:hidden items-center justify-between">
          <button 
            type="button"
            onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
            className="flex items-center gap-2 cursor-pointer py-1 text-left focus:outline-none"
          >
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Группировка:
            </span>
            {activeCategory && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700/60 text-[11px] font-bold text-slate-705 dark:text-slate-200">
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
        <div className={`${isCategoriesExpanded ? 'flex' : 'hidden md:flex'} mt-1.5 md:mt-0 flex-col md:flex-row md:items-center gap-3 overflow-x-auto scrollbar-none`}>
          <span className="hidden md:inline text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">
            Группировка:
          </span>
          
          <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 overflow-[x-auto] py-0.5 scrollbar-none">
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
                  className={`px-2.5 py-1 rounded-md border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 ${
                    isSelected 
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 font-bold ring-2 ring-indigo-500/5'
                      : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/60 text-slate-450 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span>{cat.name}</span>
                  <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200/60 dark:bg-slate-800/60 text-slate-505 dark:text-slate-400">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pillars Columns Area */}
      <div 
        id="kanban-columns-container" 
        className="flex-1 overflow-x-auto min-h-0 bg-slate-50/30 dark:bg-slate-950/10 p-5 sm:p-6"
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
                className={`w-72 sm:w-80 shrink-0 rounded-xl bg-slate-100/40 dark:bg-slate-900/10 border p-3 flex flex-col max-h-full transition-all duration-200 scrollbar-thin ${
                  isDraggedOver 
                    ? 'border-indigo-400 dark:border-indigo-500/80 bg-indigo-50/20 dark:bg-indigo-950/20 ring-2 ring-indigo-500/10 shadow-xs' 
                    : 'border-slate-200 dark:border-slate-900/60'
                }`}
                style={{ borderTop: `4px solid ${col.color}` }}
              >
                {/* Column top header */}
                <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-slate-200/50 dark:border-slate-800/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 truncate" title={col.title}>
                      {col.title}
                    </h4>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black font-mono bg-slate-200/50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 shrink-0">
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
                          layoutId={`kanban-card-motion-${node.id}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className={`group select-none bg-white dark:bg-slate-900 border hover:border-slate-350 dark:hover:border-slate-700/80 rounded-xl p-3 hover:shadow-xs transition-all cursor-grab active:cursor-grabbing relative flex flex-col gap-2.5 ${
                            node.id === selectedNodeId 
                              ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/10 shadow-xs' 
                              : 'border-slate-200 dark:border-slate-850'
                          }`}
                        >
                          {/* Completed toggle checkbox and text */}
                          <div className="flex items-start gap-2">
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
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0 mt-0.5 cursor-pointer"
                              title={node.completed ? "Отметить активной" : "Отметить выполненной"}
                            >
                              {node.completed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-500 fill-emerald-100 dark:fill-emerald-900/10" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-200 ${
                                node.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                              }`}>
                                {node.text}
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
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                                <span>Прогресс</span>
                                <span>{node.progress}%</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-indigo-500 transition-all rounded-full"
                                  style={{ width: `${node.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Card metadata row (Priority, Due Date, attachments/notes) */}
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            {renderPriorityBadge(node.priority)}

                            {hasDueDate && (
                              <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md border font-bold ${
                                isOverdue(node.dueDate)
                                  ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-950/45'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-205 dark:border-slate-705'
                              }`} title={isOverdue(node.dueDate) ? "Просрочен дедлайн" : "Дедлайн"}>
                                <Clock className="w-2.5 h-2.5" />
                                {formatRussianDate(node.dueDate)}
                              </span>
                            )}

                            {hasNotes && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400" title="Есть описание">
                                <FileText className="w-3 h-3" />
                              </span>
                            )}

                            {hasAttachments && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-450 font-bold" title="Прикреплены файлы">
                                <Paperclip className="w-3 h-3" />
                                {node.files.length}
                              </span>
                            )}
                          </div>

                          {/* Secondary tag pills (other tags excluding current category tags) */}
                          {(() => {
                            const otherTags = (node.tags || []).filter(t => !activeTags.includes(t));
                            if (otherTags.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1 border-t border-slate-100 dark:border-slate-800/40 pt-2">
                                {otherTags.map(t => (
                                  <span 
                                    key={t} 
                                    className="text-[9px] font-semibold px-1 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200/55 dark:border-slate-700/50"
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
                    <div className="text-center py-6 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-[10px] text-slate-400 dark:text-slate-500 select-none">
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
                      className="w-full py-1.5 hover:bg-white dark:hover:bg-slate-900/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-800/80 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-1 cursor-pointer"
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
