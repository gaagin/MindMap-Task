import React, { useState, useEffect } from 'react';
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
  Timer,
  Link as LinkIcon,
  Bell,
  AlertTriangle,
  Maximize2,
  Minimize2,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';
import { isNodeOverdue, isContainerOverdue, getPomoStatsForNode, formatTotalPomoTime } from '../utils';

interface KanbanViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, initialTags: string[], priority?: Priority, parentId?: string | null, dueDate?: string, extraFields?: Partial<TaskNode>) => void;
  onCreateTagCategory: (name: string, color: string) => void;
  selectedNodeIds?: string[];
  onToggleSelectNode?: (id: string) => void;
  searchQuery?: string;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  selectedCategoryId?: string | null;
  onSelectCategoryId?: (catId: string | null) => void;
  kanbanGroupBy?: 'status' | 'category' | 'priority' | 'container' | null;
  onKanbanGroupByChange?: (groupBy: 'status' | 'category' | 'priority' | 'container') => void;
  kanbanContainerFilterId?: string | null;
  onKanbanContainerFilterIdChange?: (containerId: string) => void;
  sortBy?: 'default' | 'priority' | 'dueDate';
  onSortByChange?: (val: 'default' | 'priority' | 'dueDate') => void;
  collapseCompleted?: boolean;
  onCollapseCompletedChange?: (val: boolean) => void;
  showSubtasks?: boolean;
  onShowSubtasksChange?: (val: boolean) => void;
  isFiltersCollapsed?: boolean;
  onFiltersCollapsedChange?: (val: boolean) => void;
  isCategoriesExpanded?: boolean;
  onCategoriesExpandedChange?: (val: boolean) => void;
  focusedContainerId?: string | null;
  focusedTaskId?: string | null;
  onFocusedTaskIdChange?: (id: string | null) => void;
  filterStatus?: string;
  filterPriority?: string;
  filterTag?: string;
  filterDueDate?: string;
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
  onFullScreenChange,
  selectedCategoryId: propsSelectedCategoryId,
  onSelectCategoryId,
  kanbanGroupBy: propsKanbanGroupBy,
  onKanbanGroupByChange,
  kanbanContainerFilterId: propsKanbanContainerFilterId,
  onKanbanContainerFilterIdChange,
  sortBy: propsSortBy,
  onSortByChange,
  collapseCompleted: propsCollapseCompleted,
  onCollapseCompletedChange,
  showSubtasks: propsShowSubtasks,
  onShowSubtasksChange,
  isFiltersCollapsed: propsIsFiltersCollapsed,
  onFiltersCollapsedChange,
  isCategoriesExpanded: propsIsCategoriesExpanded,
  onCategoriesExpandedChange,
  focusedContainerId,
  focusedTaskId = null,
  onFocusedTaskIdChange,
  filterStatus = 'all',
  filterPriority = 'all',
  filterTag = 'all',
  filterDueDate = 'all',
}: KanbanViewProps) {
  const [internalGroupBy, setInternalGroupBy] = useState<'status' | 'category' | 'priority' | 'container'>(() => 'status');
  const groupBy = propsKanbanGroupBy !== undefined && propsKanbanGroupBy !== null ? propsKanbanGroupBy : internalGroupBy;
  const setGroupBy = (g: 'status' | 'category' | 'priority' | 'container') => {
    setInternalGroupBy(g);
    if (onKanbanGroupByChange) {
      onKanbanGroupByChange(g);
    }
  };

  const [isFullScreen, setIsFullScreen] = useState(false);

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

  const [localSortBy, setLocalSortBy] = useState<'default' | 'priority' | 'dueDate'>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_sort_by');
      if (saved) return saved as any;
    } catch {}
    return 'default';
  });
  const sortBy = propsSortBy !== undefined ? propsSortBy : localSortBy;
  const setSortBy = (val: 'default' | 'priority' | 'dueDate') => {
    setLocalSortBy(val);
    try {
      localStorage.setItem('task_mindmap_kanban_sort_by', val);
    } catch {}
    if (onSortByChange) {
      onSortByChange(val);
    }
  };

  // State to manage whether completed tasks are globally collapsed
  const [localCollapseCompleted, setLocalCollapseCompleted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_collapse_completed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });
  const collapseCompleted = propsCollapseCompleted !== undefined ? propsCollapseCompleted : localCollapseCompleted;
  const setCollapseCompleted = (val: boolean) => {
    setLocalCollapseCompleted(val);
    try {
      localStorage.setItem('task_mindmap_kanban_collapse_completed', String(val));
    } catch {}
    if (onCollapseCompletedChange) {
      onCollapseCompletedChange(val);
    }
  };

  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_collapsed_columns');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse collapsedColumns from localStorage:', e);
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_collapsed_columns', JSON.stringify(collapsedColumns));
    } catch (e) {
      console.error('Failed to save collapsedColumns to localStorage:', e);
    }
  }, [collapsedColumns]);

  // State to manage whether subtasks are shown in lists
  const [localShowSubtasks, setLocalShowSubtasks] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_show_subtasks');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });
  const showSubtasks = propsShowSubtasks !== undefined ? propsShowSubtasks : localShowSubtasks;
  const setShowSubtasks = (val: boolean) => {
    setLocalShowSubtasks(val);
    try {
      localStorage.setItem('task_mindmap_kanban_show_subtasks', String(val));
    } catch {}
    if (onShowSubtasksChange) {
      onShowSubtasksChange(val);
    }
  };

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

  // Sync with prop if passed
  React.useEffect(() => {
    if (propsSelectedCategoryId !== undefined && propsSelectedCategoryId !== null) {
      setSelectedCategoryId(propsSelectedCategoryId);
    }
  }, [propsSelectedCategoryId]);

  const handleSelectCategory = (catId: string | null) => {
    setSelectedCategoryId(catId);
    if (onSelectCategoryId) {
      onSelectCategoryId(catId);
    }
    
    // Auto-save category selection to the active container if we are viewing a specific container ("Область")!
    if (selectedContainerFilterId && selectedContainerFilterId !== 'all' && selectedContainerFilterId !== 'no-container') {
      const containerNode = nodes.find(n => n.id === selectedContainerFilterId);
      if (containerNode) {
        onUpdateNode({
          ...containerNode,
          savedFilters: {
            ...(containerNode.savedFilters || {}),
            filterCategoryId: catId
          },
          updatedAt: new Date().toISOString()
        });
      }
    }
  };

  // State to manage inline card creation inputs for each column
  // Map of column key (either 'uncategorized' or tag name) to boolean and text value
  const [activeAddInColumn, setActiveAddInColumn] = useState<string | null>(null);
  const [newTaskNameInColumn, setNewTaskNameInColumn] = useState('');

  // Track which cards have expanded subtasks nested inline
  const [expandedCardSubtasks, setExpandedCardSubtasks] = useState<Record<string, boolean>>({});
  const [showCompletedInCard, setShowCompletedInCard] = useState<Record<string, boolean>>({});

  const renderSubtaskTree = (parentId: string, depth: number = 0): React.ReactNode => {
    const directChildren = nodes.filter(n => n.parentId === parentId && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
    if (directChildren.length === 0) return null;

    const activeSubtasks = directChildren.filter(s => !s.completed);
    const completedSubtasks = directChildren.filter(s => s.completed);
    const isCompletedExpanded = showCompletedInCard[parentId] || false;

    return (
      <div className={`space-y-1.5 ${depth > 0 ? 'pl-2 border-l border-slate-100 dark:border-slate-800' : ''}`}>
        {activeSubtasks.map(subtask => {
          const childrenOfSubtask = nodes.filter(n => n.parentId === subtask.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
          const hasChildren = childrenOfSubtask.length > 0;
          const isCollapsed = subtask.collapsed;

          return (
            <div key={subtask.id} className="flex flex-col gap-1">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(subtask.id, e);
                  if (onFocusedTaskIdChange) {
                    onFocusedTaskIdChange(subtask.id);
                  }
                  if (hasChildren) {
                    onUpdateNode({
                      ...subtask,
                      collapsed: !isCollapsed
                    });
                  }
                }}
                className="group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-2 transition-all text-[12.5px] text-slate-700 dark:text-slate-300 cursor-pointer"
                data-drag-ignore="true"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode({
                          ...subtask,
                          collapsed: !isCollapsed
                        });
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 rounded cursor-pointer shrink-0 transition-colors"
                      title={isCollapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
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
                  <span className={`truncate leading-normal font-medium ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-500' : isNodeOverdue(subtask, nodes) ? 'text-rose-555 dark:text-rose-450' : ''}`}>
                    {subtask.text}
                  </span>
                </div>
              </div>
              
              {hasChildren && !isCollapsed && (
                <div className="pl-3">
                  {renderSubtaskTree(subtask.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}

        {completedSubtasks.length > 0 && (
          <div className="pt-1 mt-1 border-t border-slate-100/30 dark:border-slate-800/20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCompletedInCard(prev => ({
                  ...prev,
                  [parentId]: !isCompletedExpanded
                }));
              }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:text-slate-505 dark:hover:text-indigo-400 transition-colors py-1 px-1 cursor-pointer select-none"
            >
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isCompletedExpanded ? 'rotate-180' : ''}`} />
              <span>Завершенные подзадачи ({completedSubtasks.length})</span>
            </button>

            {isCompletedExpanded && (
              <div className="space-y-1.5 mt-1 pl-1">
                {completedSubtasks.map(subtask => {
                  const childrenOfSubtask = nodes.filter(n => n.parentId === subtask.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
                  const hasChildren = childrenOfSubtask.length > 0;
                  const isCollapsed = subtask.collapsed;

                  return (
                    <div key={subtask.id} className="flex flex-col gap-1">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(subtask.id, e);
                          if (onFocusedTaskIdChange) {
                            onFocusedTaskIdChange(subtask.id);
                          }
                          if (hasChildren) {
                            onUpdateNode({
                              ...subtask,
                              collapsed: !isCollapsed
                            });
                          }
                        }}
                        className="group/sub relative py-1 px-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-2 transition-all text-[12.5px] text-slate-700 dark:text-slate-300 cursor-pointer"
                        data-drag-ignore="true"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {hasChildren && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateNode({
                                  ...subtask,
                                  collapsed: !isCollapsed
                                });
                              }}
                              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer shrink-0 transition-colors"
                              title={isCollapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
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
                          <span className={`truncate leading-normal font-medium ${subtask.completed ? 'line-through text-slate-400 dark:text-slate-500' : isNodeOverdue(subtask, nodes) ? 'text-rose-555 dark:text-rose-450' : ''}`}>
                            {subtask.text}
                          </span>
                        </div>
                      </div>
                      {hasChildren && !isCollapsed && (
                        <div className="pl-3">
                          {renderSubtaskTree(subtask.id, depth + 1)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Dropdown card move menu state for mobile and responsive accessibility
  const [activeMoveMenuCardId, setActiveMoveMenuCardId] = useState<string | null>(null);

  // Inline edit menus state for spot selection (priority, due dates, tags, pomodoro) without opening props sidebar
  const [activeInlineMenu, setActiveInlineMenu] = useState<{
    cardId: string;
    type: 'priority' | 'date' | 'tag' | 'pomodoro';
  } | null>(null);
  const [openInlineMenuUpwards, setOpenInlineMenuUpwards] = useState<boolean>(false);

  const handleToggleInlineMenu = (e: React.MouseEvent, cardId: string, type: 'priority' | 'date' | 'tag' | 'pomodoro') => {
    e.stopPropagation();
    const isSame = activeInlineMenu?.cardId === cardId && activeInlineMenu?.type === type;
    if (isSame) {
      setActiveInlineMenu(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const estHeight = type === 'date' ? 260 : type === 'tag' ? 220 : type === 'pomodoro' ? 180 : 150;
      const shouldOpenUp = rect.bottom + estHeight > windowHeight;
      setOpenInlineMenuUpwards(shouldOpenUp);
      setActiveInlineMenu({ cardId, type });
    }
  };

  // Drag states for column highlighting
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);
  // Track which task card has a tag hovered over it during drag and drop
  const [draggedOverTagCardId, setDraggedOverTagCardId] = useState<string | null>(null);

  // Touch drag state
  const [touchDrag, setTouchDrag] = useState<{
    taskId: string;
    text: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);

  const [isTouchDraggingActive, setIsTouchDraggingActive] = useState<boolean>(false);
  const touchStartRef = React.useRef<{
    taskId: string;
    text: string;
    startX: number;
    startY: number;
    rect: DOMRect;
  } | null>(null);
  const touchTimeoutRef = React.useRef<any>(null);

  // Prevent any browser scrolling (horizontal or vertical) while an active touch drag is in progress
  React.useEffect(() => {
    if (!touchDrag) return;

    const preventDefaultScroll = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Register with passive: false to allow canceling standard browser touch scrolling
    window.addEventListener('touchmove', preventDefaultScroll, { passive: false });
    
    return () => {
      window.removeEventListener('touchmove', preventDefaultScroll);
    };
  }, [touchDrag]);

  // Ref to store the current drag coordinates (for auto-scrolling)
  const dragCoordsRef = React.useRef<{ x: number; y: number } | null>(null);

  // Auto-scroll logic during mouse dragging and touch dragging
  React.useEffect(() => {
    if (!draggedCardId && !touchDrag) {
      dragCoordsRef.current = null;
      return;
    }

    let animationFrameId: number;

    const scrollContainer = document.getElementById('kanban-columns-container');
    if (!scrollContainer) return;

    const handleDragOver = (e: DragEvent) => {
      dragCoordsRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        dragCoordsRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    window.addEventListener('dragover', handleDragOver, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    const threshold = 80; // distance from edge in px to trigger scroll
    const maxSpeed = 16; // maximum scrolling speed in px per frame

    const tick = () => {
      if (dragCoordsRef.current && scrollContainer) {
        const { x, y } = dragCoordsRef.current;
        const rect = scrollContainer.getBoundingClientRect();

        // 1. Horizontal Scroll of columns container
        const leftEdge = rect.left + threshold;
        const rightEdge = rect.right - threshold;
        let scrollXAmount = 0;

        if (x < leftEdge) {
          const intensity = Math.max(0, Math.min(1, (leftEdge - x) / threshold));
          scrollXAmount = -maxSpeed * intensity;
        } else if (x > rightEdge) {
          const intensity = Math.max(0, Math.min(1, (x - rightEdge) / threshold));
          scrollXAmount = maxSpeed * intensity;
        }

        if (scrollXAmount !== 0) {
          scrollContainer.scrollLeft += scrollXAmount;
        }

        // 2. Vertical Scroll of specific columns if hovered
        let scrollYContainer: HTMLElement | null = null;
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
          if (el.id && el.id.startsWith('kanban-column-cards-')) {
            scrollYContainer = el as HTMLElement;
            break;
          }
        }

        if (scrollYContainer) {
          const colRect = scrollYContainer.getBoundingClientRect();
          const topEdge = colRect.top + threshold / 1.5;
          const bottomEdge = colRect.bottom - threshold / 1.5;
          let scrollYAmount = 0;

          if (y < topEdge) {
            const intensity = Math.max(0, Math.min(1, (topEdge - y) / (threshold / 1.5)));
            scrollYAmount = -maxSpeed * intensity;
          } else if (y > bottomEdge) {
            const intensity = Math.max(0, Math.min(1, (y - bottomEdge) / (threshold / 1.5)));
            scrollYAmount = maxSpeed * intensity;
          }

          if (scrollYAmount !== 0) {
            scrollYContainer.scrollTop += scrollYAmount;
          }
        }

        // 3. Highlight the correct column as it scrolls under a stationary finger/cursor
        if (touchDrag) {
          const matchedEl = document.elementFromPoint(x, y);
          if (matchedEl) {
            const colContainer = matchedEl.closest('[data-column-id]');
            if (colContainer) {
              const colId = colContainer.getAttribute('data-column-id');
              if (colId) {
                setDraggedOverColumn(prev => prev !== colId ? colId : prev);
              }
            } else {
              setDraggedOverColumn(prev => prev !== null ? null : prev);
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [draggedCardId, touchDrag]);

  // Clean up any pending touch timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  // Collapsible state for category select on mobile/tablet screens
  const [localIsCategoriesExpanded, setLocalIsCategoriesExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_categories_expanded');
      if (saved !== null) return saved === 'true';
    } catch {}
    // Default collapsed on mobile/tablet (< 768px), expanded on desktop
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : false;
  });
  const isCategoriesExpanded = propsIsCategoriesExpanded !== undefined ? propsIsCategoriesExpanded : localIsCategoriesExpanded;
  const setIsCategoriesExpanded = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isCategoriesExpanded) : val;
    setLocalIsCategoriesExpanded(nextVal);
    try {
      localStorage.setItem('task_mindmap_categories_expanded', String(nextVal));
    } catch {}
    if (onCategoriesExpandedChange) {
      onCategoriesExpandedChange(nextVal);
    }
  };

  const [localIsFiltersCollapsed, setLocalIsFiltersCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_filters_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });
  const isFiltersCollapsed = propsIsFiltersCollapsed !== undefined ? propsIsFiltersCollapsed : localIsFiltersCollapsed;
  const setIsFiltersCollapsed = (val: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof val === 'function' ? val(isFiltersCollapsed) : val;
    setLocalIsFiltersCollapsed(nextVal);
    try {
      localStorage.setItem('task_mindmap_kanban_filters_collapsed', String(nextVal));
    } catch {}
    if (onFiltersCollapsedChange) {
      onFiltersCollapsedChange(nextVal);
    }
  };

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

  const matchesFilters = (n: TaskNode): boolean => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const textMatches = n.text?.toLowerCase().includes(q);
      const tagMatches = n.tags?.some(t => t.toLowerCase().includes(q)) || false;
      const notesMatches = n.notes?.toLowerCase().includes(q) || false;
      if (!textMatches && !tagMatches && !notesMatches) return false;
    }

    // 2. Status filter
    if (filterStatus && filterStatus !== 'all') {
      if (filterStatus === "completed" && !n.completed) return false;
      if (filterStatus === "active" && n.completed) return false;
    }

    // 3. Priority filter
    if (filterPriority && filterPriority !== "all" && n.priority !== filterPriority) return false;

    // 4. Tag filter
    if (filterTag && filterTag !== "all" && !(n.tags || []).includes(filterTag)) return false;

    // 5. Due date filter
    if (filterDueDate && filterDueDate !== "all") {
      const hasDue = !!n.dueDate;
      if (filterDueDate === "has_due_date" && !hasDue) return false;
      if (filterDueDate === "no_due_date" && hasDue) return false;

      if (filterDueDate === "overdue" || filterDueDate === "today" || filterDueDate === "this_week") {
        if (!hasDue) return false;
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const nodeDate = new Date(n.dueDate!);
        nodeDate.setHours(0, 0, 0, 0);

        if (filterDueDate === "overdue" && (nodeDate.getTime() >= now.getTime() || n.completed)) return false;
        if (filterDueDate === "today" && nodeDate.getTime() !== now.getTime()) return false;
        
        if (filterDueDate === "this_week") {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Monday
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
          if (nodeDate.getTime() < startOfWeek.getTime() || nodeDate.getTime() > endOfWeek.getTime()) return false;
        }
      }
    }

    return true;
  };

  const isNodeMatchingAllFilters = (node: TaskNode): boolean => {
    if (node.isContainer) return false;
    if (node.isWorkflowRectangle) return false;
    if (node.archived && !isArchivedNodeMatchingSearch(node)) return false;
    if (!matchesSubtaskFilter(node)) return false;
    if (!matchesFilters(node)) return false;
    return true;
  };

  // Container filter states and helper methods
  const [internalSelectedContainerFilterId, setInternalSelectedContainerFilterId] = useState<string>('all');
  const selectedContainerFilterId = propsKanbanContainerFilterId !== undefined && propsKanbanContainerFilterId !== null ? propsKanbanContainerFilterId : internalSelectedContainerFilterId;

  const handleSelectContainerFilter = (id: string) => {
    setInternalSelectedContainerFilterId(id);
    if (onKanbanContainerFilterIdChange) {
      onKanbanContainerFilterIdChange(id);
    }

    // Load saved default filters from the selected container if applicable
    if (id && id !== 'all' && id !== 'no-container') {
      const containerNode = nodes.find(n => n.id === id);
      if (containerNode && containerNode.savedFilters) {
        if (containerNode.savedFilters.kanbanGroupBy) {
          setGroupBy(containerNode.savedFilters.kanbanGroupBy);
        }
        if (containerNode.savedFilters.filterCategoryId !== undefined) {
          setSelectedCategoryId(containerNode.savedFilters.filterCategoryId);
          if (onSelectCategoryId) {
            onSelectCategoryId(containerNode.savedFilters.filterCategoryId);
          }
        }
      }
    }

    // Auto-save container selection to the currently focused/selected node!
    if (selectedNodeId) {
      const focusedNode = nodes.find(n => n.id === selectedNodeId);
      if (focusedNode) {
        onUpdateNode({
          ...focusedNode,
          savedFilters: {
            ...(focusedNode.savedFilters || {}),
            kanbanContainerFilterId: id
          },
          updatedAt: new Date().toISOString()
        });
      }
    }
  };

  const handleGroupByChange = (newGroupBy: 'status' | 'category' | 'priority' | 'container') => {
    setGroupBy(newGroupBy);

    // Auto-save grouping selection to the active container if we are viewing a specific container ("Область")!
    if (selectedContainerFilterId && selectedContainerFilterId !== 'all' && selectedContainerFilterId !== 'no-container') {
      const containerNode = nodes.find(n => n.id === selectedContainerFilterId);
      if (containerNode) {
        onUpdateNode({
          ...containerNode,
          savedFilters: {
            ...(containerNode.savedFilters || {}),
            kanbanGroupBy: newGroupBy
          },
          updatedAt: new Date().toISOString()
        });
      }
    }

    // Also auto-save grouping selection to the currently focused/selected node!
    if (selectedNodeId) {
      const focusedNode = nodes.find(n => n.id === selectedNodeId);
      if (focusedNode) {
        onUpdateNode({
          ...focusedNode,
          savedFilters: {
            ...(focusedNode.savedFilters || {}),
            kanbanGroupBy: newGroupBy
          },
          updatedAt: new Date().toISOString()
        });
      }
    }
  };

  const allContainers = nodes.filter(n => n.isContainer && !n.archived);

  // Load saved default category filter when selecting a container
  React.useEffect(() => {
    if (selectedContainerFilterId && selectedContainerFilterId !== 'all' && selectedContainerFilterId !== 'no-container') {
      const containerNode = nodes.find(n => n.id === selectedContainerFilterId);
      if (containerNode && containerNode.savedFilters) {
        if (containerNode.savedFilters.filterCategoryId) {
          setSelectedCategoryId(containerNode.savedFilters.filterCategoryId);
          if (onSelectCategoryId) {
            onSelectCategoryId(containerNode.savedFilters.filterCategoryId);
          }
        }
        if (containerNode.savedFilters.kanbanGroupBy) {
          setGroupBy(containerNode.savedFilters.kanbanGroupBy);
        }
      }
    }
  }, [selectedContainerFilterId, nodes, onSelectCategoryId]);

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
    if (!isNodeMatchingAllFilters(n)) return false;
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

  if (groupBy === 'status') {
    columns.push(
      { id: 'todo', title: 'План', color: '#64748b', isUncategorized: false, items: filteredNodes.filter(n => !n.completed && (!n.progress || n.progress === 0) && n.status !== 'waiting') },
      { id: 'progress', title: 'В работе', color: '#f59e0b', isUncategorized: false, items: filteredNodes.filter(n => !n.completed && n.progress !== undefined && n.progress > 0 && n.status !== 'waiting') },
      { id: 'waiting', title: 'В ожидании', color: '#6366f1', isUncategorized: false, items: filteredNodes.filter(n => !n.completed && n.status === 'waiting') },
      { id: 'done', title: 'Готово', color: '#10b981', isUncategorized: false, items: filteredNodes.filter(n => n.completed) }
    );
  } else if (groupBy === 'priority') {
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

      // Hide tag columns that have no active (not completed) tasks
      const hasActiveTasks = items.some(n => !n.completed);
      if (!hasActiveTasks) return;

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
    const tasksWithoutContainer = nodes.filter(n => isNodeMatchingAllFilters(n) && !isInsideAnyContainer(n));
    columns.push({
      id: 'no-container',
      title: 'Без контейнера',
      color: '#94a3b8',
      isUncategorized: true,
      items: tasksWithoutContainer
    });

    // 3. Columns for each container
    containerNodes.forEach(c => {
      const items = nodes.filter(n => isNodeMatchingAllFilters(n) && getTaskContainerId(n) === c.id);
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

  const isInteractiveElement = (target: HTMLElement): boolean => {
    let el: HTMLElement | null = target;
    while (el && el !== document.body) {
      const tagName = el.tagName.toLowerCase();
      if (
        tagName === 'button' || 
        tagName === 'input' || 
        tagName === 'textarea' || 
        tagName === 'select' || 
        tagName === 'a' ||
        el.getAttribute('contenteditable') === 'true' ||
        el.getAttribute('data-drag-ignore') === 'true' ||
        el.classList.contains('cursor-grab')
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  // Touch drag-and-drop for mobile devices (long-press drag & swipe-scroll separation)
  const handleTouchStart = (e: React.TouchEvent, taskId: string, text: string) => {
    if (isInteractiveElement(e.target as HTMLElement)) {
      return;
    }
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Clear any existing timer
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
    }
    
    // Preliminary start position coordinates (no reactive state update yet)
    touchStartRef.current = {
      taskId,
      text,
      startX: touch.clientX,
      startY: touch.clientY,
      rect,
    };
    
    setIsTouchDraggingActive(false);
    
    // Set a 250ms timeout. If they hold their finger still for 250ms, initiate drag!
    touchTimeoutRef.current = setTimeout(() => {
      const startState = touchStartRef.current;
      if (startState && startState.taskId === taskId) {
        setTouchDrag({
          taskId: startState.taskId,
          text: startState.text,
          startX: startState.startX,
          startY: startState.startY,
          currentX: startState.startX,
          currentY: startState.startY,
          offsetX: startState.startX - startState.rect.left,
          offsetY: startState.startY - startState.rect.top,
          width: startState.rect.width,
          height: startState.rect.height,
        });
        
        setDraggedCardId(taskId);
        setIsTouchDraggingActive(true);
        
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(20); // Firm haptic response to confirm "grabbed" mode
        }
      }
    }, 250);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // If drag mode is NOT officially started yet, check if they are scrolling
    if (!isTouchDraggingActive) {
      if (touchStartRef.current) {
        const dx = Math.abs(touch.clientX - touchStartRef.current.startX);
        const dy = Math.abs(touch.clientY - touchStartRef.current.startY);
        
        // If they swipe more than 8px on any axis, they are scrolling!
        if (dx > 8 || dy > 8) {
          // Cancel custom drag and let the standard scroll happen!
          if (touchTimeoutRef.current) {
            clearTimeout(touchTimeoutRef.current);
            touchTimeoutRef.current = null;
          }
          touchStartRef.current = null;
        }
      }
      return; // Do not call preventDefault or update drag states
    }
    
    // If drag mode is ACTIVE, prevent browser page scroll
    if (e.cancelable) {
      e.preventDefault();
    }

    if (!touchDrag) return;

    setTouchDrag(prev => prev ? {
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY
    } : null);

    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (element) {
      const columnContainer = element.closest('[data-column-id]');
      if (columnContainer) {
        const colId = columnContainer.getAttribute('data-column-id');
        if (colId && draggedOverColumn !== colId) {
          setDraggedOverColumn(colId);
        }
      } else {
        setDraggedOverColumn(null);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear the active long press timer
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }

    const startInfo = touchStartRef.current;
    touchStartRef.current = null;

    if (!isTouchDraggingActive) {
      // If it never triggered drag state, check if it was a quick tap
      if (startInfo) {
        const touch = e.changedTouches[0];
        if (touch) {
          const dx = Math.abs(touch.clientX - startInfo.startX);
          const dy = Math.abs(touch.clientY - startInfo.startY);
          if (dx < 10 && dy < 10) {
            onSelectNode(startInfo.taskId);
          }
        }
      }
      setIsTouchDraggingActive(false);
      setTouchDrag(null);
      setDraggedOverColumn(null);
      setDraggedCardId(null);
      return;
    }

    setIsTouchDraggingActive(false);

    const targetColumnId = draggedOverColumn;
    const taskId = touchDrag ? touchDrag.taskId : null;

    setTouchDrag(null);
    setDraggedOverColumn(null);
    setDraggedCardId(null);

    if (!taskId || !targetColumnId) return;

    const node = nodes.find(n => n.id === taskId);
    if (!node) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }

    moveCardToColumn(node, targetColumnId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
    if (types.includes('application/task-tag')) {
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
    const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
    if (types.includes('application/task-tag')) {
      setDraggedOverColumn(null);
      return;
    }

    const cardId = (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '') || draggedCardId;
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

    if (groupBy === 'status') {
      if (targetColumnId === 'todo') {
        onUpdateNode({
          ...node,
          completed: false,
          progress: 0,
          status: 'todo',
          parentId: targetParentId
        });
      } else if (targetColumnId === 'progress') {
        onUpdateNode({
          ...node,
          completed: false,
          progress: node.progress && node.progress > 0 ? node.progress : 50,
          status: 'progress',
          parentId: targetParentId
        });
      } else if (targetColumnId === 'waiting') {
        onUpdateNode({
          ...node,
          completed: false,
          status: 'waiting',
          parentId: targetParentId
        });
      } else if (targetColumnId === 'done') {
        onUpdateNode({
          ...node,
          completed: true,
          progress: 100,
          status: 'done',
          parentId: targetParentId
        });
      }
    } else if (groupBy === 'priority') {
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
    } else if (selectedContainerFilterId === 'all' && focusedContainerId) {
      targetParentId = focusedContainerId;
    }

    if (groupBy === 'status') {
      if (columnId === 'todo') {
        onCreateTask(text, [], 'none', targetParentId, undefined, { completed: false, progress: 0, status: 'todo' });
      } else if (columnId === 'progress') {
        onCreateTask(text, [], 'none', targetParentId, undefined, { completed: false, progress: 50, status: 'progress' });
      } else if (columnId === 'waiting') {
        onCreateTask(text, [], 'none', targetParentId, undefined, { completed: false, status: 'waiting' });
      } else if (columnId === 'done') {
        onCreateTask(text, [], 'none', targetParentId, undefined, { completed: true, progress: 100, status: 'done' });
      }
    } else if (groupBy === 'priority') {
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
      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md border ${style} select-none`}>
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
    const isDraggingTouch = touchDrag?.taskId === node.id;

    return (
      <motion.div
        key={node.id}
        id={`kanban-card-${node.id}`}
        data-task-id={node.id}
        draggable="true"
        onDragStart={(e) => handleDragStart(e, node.id)}
        onClick={(e) => onSelectNode(node.id, e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (onFocusedTaskIdChange) {
            onFocusedTaskIdChange(node.id);
          }
          if (window.innerWidth < 1024) {
            onSelectNode(null);
          }
        }}
        onTouchStart={(e) => handleTouchStart(e, node.id, node.text)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragOver={(e) => {
          e.preventDefault();
          const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
          if (types.includes('application/task-tag')) {
            e.stopPropagation();
          }
        }}
        onDragEnter={(e) => {
          const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
          if (types.includes('application/task-tag')) {
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
          const tag = e.dataTransfer ? e.dataTransfer.getData('application/task-tag') : '';
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
        layout="position"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -1.5 }}
        transition={{
          type: "spring",
          stiffness: 320,
          damping: 28,
          opacity: { duration: 0.12 },
          scale: { duration: 0.12 },
          y: { type: "tween", duration: 0.15, ease: "easeOut" }
        }}
        className={`group select-none text-left rounded-2xl p-4 shadow-[0_2px_8px_rgba(15,23,42,0.01),0_1px_3px_rgba(15,23,42,0.015)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05),0_2px_6px_rgba(15,23,42,0.03)] transition-shadow duration-200 cursor-grab active:cursor-grabbing relative flex flex-col gap-3.5 ${
          isDraggingTouch ? 'opacity-40 scale-[0.98]' : ''
        } ${
          activeInlineMenu?.cardId === node.id || activeMoveMenuCardId === node.id
            ? 'z-[55] ring-2 ring-indigo-500 bg-white dark:bg-slate-900 shadow-xl scale-[1.01]' 
            : 'z-10'
        } ${
          node.archived
            ? 'bg-amber-50/5 dark:bg-amber-950/2 border-dashed border-amber-300 dark:border-amber-900/40 opacity-60 saturate-60'
            : 'bg-white dark:bg-slate-900'
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
            <p className={`text-[14px] font-medium leading-relaxed text-slate-800 dark:text-slate-100 ${
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
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                </a>
              )}
              {activePomodoroNodeId === node.id && (
                <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded-md text-[11.5px] font-sans font-medium animate-pulse ml-1 shrink-0 border border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" title="Запущена фокусировка Pomodoro">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                  </span>
                  <span>🍅</span>
                </span>
              )}
            </p>
            {node.mirrorParentText && (
              <div 
                className="text-[9px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100/30 dark:border-purple-900/30 px-1.5 py-0.5 rounded select-none max-w-max mt-1 truncate flex items-center gap-1 cursor-pointer hover:bg-purple-100/40 dark:hover:bg-purple-900/25"
                title={`Связано с родительской задачей: ${node.mirrorParentText}. Нажмите для перехода.`}
                onClick={(e) => {
                  if (node.mirrorParentId && onSelectNode) {
                    const exists = nodes.some(n => n.id === node.mirrorParentId);
                    if (exists) {
                      e.stopPropagation();
                      onSelectNode(node.mirrorParentId);
                    }
                  }
                }}
              >
                <span>🔗</span>
                <span className="truncate max-w-[125px]">{node.mirrorParentText}</span>
              </div>
            )}
            {node.mirrorGroupId && (() => {
              const mirrorCopies = nodes.filter(n => n.mirrorGroupId === node.mirrorGroupId && n.id !== node.id);
              if (mirrorCopies.length === 0) return null;
              return (
                <div 
                  className="text-[9px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100/30 dark:border-purple-900/30 px-1.5 py-0.5 rounded select-none max-w-max mt-1 truncate flex items-center gap-1 cursor-pointer hover:bg-purple-100/40 dark:hover:bg-purple-900/25"
                  title="Эта задача имеет зеркальные копии. Нажмите, чтобы открыть свойства и перейти."
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode && onSelectNode(node.id);
                  }}
                >
                  <span>🪞</span>
                  <span className="truncate max-w-[125px]">Зеркала ({mirrorCopies.length})</span>
                </div>
              );
            })()}
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
                className="absolute right-0 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl shadow-lg p-1.5 w-44 z-[55] animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Архив:</p>
                <div className="px-1 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-700/60">
                  {node.archived ? (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode({ ...node, archived: false });
                        setActiveMoveMenuCardId(null);
                      }}
                      className="w-full text-left font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 px-1 py-1 rounded text-[10.5px] flex items-center gap-1.5 cursor-pointer"
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
                      className="w-full text-left font-medium text-slate-550 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-1 py-1 rounded text-[10.5px] flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>📦 В архив</span>
                    </button>
                  )}
                </div>

                <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Переместить:</p>
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
                        className="w-full text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-705 px-2 py-1 text-[10.5px] rounded text-slate-650 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
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
            <div className="flex items-center justify-between text-[11.5px] font-medium text-[#94a3b8] dark:text-slate-500 uppercase tracking-widest">
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
              onClick={(e) => handleToggleInlineMenu(e, node.id, 'priority')}
              className="hover:scale-[1.03] transition-transform cursor-pointer block"
              title="Нажмите, чтобы изменить приоритет на месте"
            >
              {renderPriorityBadge(node.priority)}
            </button>

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'priority' && (
              <div 
                className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl shadow-lg p-1.5 w-44 z-50 animate-in fade-in zoom-in-95 duration-100 ${
                  openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 uppercase px-2 mb-1 tracking-wider text-left">Приоритет:</p>
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
                        className={`w-full text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-705 px-2 py-1 text-[10.5px] rounded flex items-center justify-between cursor-pointer ${
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
                onClick={(e) => handleToggleInlineMenu(e, node.id, 'date')}
                className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-lg border font-medium shadow-sm hover:scale-[1.03] transition-transform cursor-pointer ${
                  isNodeOverdue(node, nodes)
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-605 dark:text-rose-400 border-rose-100 dark:border-rose-950/45 animate-pulse'
                    : 'bg-white dark:bg-slate-800 text-slate-550 border-slate-205 dark:border-slate-705 hover:bg-slate-50/50 dark:hover:bg-slate-755'
                }`}
                title={isNodeOverdue(node, nodes) ? `Просрочен дедлайн: ${formatRussianDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения на месте)` : `Дедлайн: ${formatRussianDate(node.dueDate)}${node.dueTime ? ` ${node.dueTime}` : ''} (Нажмите для изменения на месте)`}
              >
                {isNodeOverdue(node, nodes) ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 select-none" />
                ) : (
                  <Calendar className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                )}
                <span>{formatRussianDate(node.dueDate)}{node.dueTime ? `, ${node.dueTime}` : ''}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => handleToggleInlineMenu(e, node.id, 'date')}
                className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-300 px-2 py-0.5 rounded-lg border border-dashed border-slate-205 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850 hover:scale-[1.03] transition-all select-none cursor-pointer"
                title="Добавить срок выполнения прямо на месте"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>+ Срок</span>
              </button>
            )}

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'date' && (
              <div 
                className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-2xl shadow-xl p-3 w-56 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2.5 ${
                  openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Срок выполнения:</p>
                
                <div className="space-y-1 text-left">
                  <label htmlFor={`inline-date-${node.id}`} className="text-[9px] font-medium text-slate-500">Дата</label>
                  <input 
                    type="date"
                    id={`inline-date-${node.id}`}
                    defaultValue={node.dueDate || ''}
                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label htmlFor={`inline-time-${node.id}`} className="text-[9px] font-medium text-slate-500">Время</label>
                  <input 
                    type="time"
                    id={`inline-time-${node.id}`}
                    defaultValue={node.dueTime || ''}
                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1 text-left whitespace-normal">
                  <div className="flex items-center gap-1">
                    <Bell className="w-2.5 h-2.5 text-slate-400" />
                    <label htmlFor={`inline-reminder-${node.id}`} className="text-[9px] font-medium text-slate-500">Напоминание</label>
                  </div>
                  <select 
                    id={`inline-reminder-${node.id}`}
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
                      const dateInput = document.getElementById(`inline-date-${node.id}`) as HTMLInputElement | null;
                      const timeInput = document.getElementById(`inline-time-${node.id}`) as HTMLInputElement | null;
                      const reminderInput = document.getElementById(`inline-reminder-${node.id}`) as HTMLSelectElement | null;
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
                    className="flex-1 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium text-[10px] transition-all cursor-pointer text-center"
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
                      className="flex-grow py-1 rounded-lg bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-650 dark:text-rose-400 font-medium text-[10px] transition-all cursor-pointer text-center whitespace-nowrap px-1"
                    >
                      Сбросить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveInlineMenu(null)}
                    className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 font-medium text-[10px] transition-all cursor-pointer text-center"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pomodoro quick start button */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => handleToggleInlineMenu(e, node.id, 'pomodoro')}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-lg border font-medium shadow-sm hover:scale-[1.03] transition-transform cursor-pointer ${
                activePomodoroNodeId === node.id
                  ? 'bg-rose-50/65 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 animate-pulse'
                  : 'bg-white dark:bg-slate-800 text-slate-550 border-slate-205 dark:border-slate-705 hover:bg-slate-50/50 dark:hover:bg-slate-755'
              }`}
              title="Запустить Pomodoro таймер быстро"
            >
              <span className="shrink-0 text-[12px]">🍅</span>
              <span>Фокус</span>
            </button>

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'pomodoro' && (
              <div 
                className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-755 rounded-2xl shadow-xl p-3 w-48 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2 ${
                  openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Время:</p>
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
                      className="py-1 px-2 text-[11px] font-medium rounded-lg border border-slate-150 dark:border-slate-700 bg-slate-50 dark:bg-slate-855 text-slate-650 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 dark:hover:border-rose-900/40 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer text-center"
                    >
                      {mins} мин
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tags spot edit popup trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => handleToggleInlineMenu(e, node.id, 'tag')}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-0.5 rounded-lg border border-dashed border-slate-205 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850 hover:scale-[1.03] transition-all cursor-pointer"
              title="Добавить или изменить теги на месте"
            >
              <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Теги</span>
            </button>

            {activeInlineMenu?.cardId === node.id && activeInlineMenu?.type === 'tag' && (
              <div 
                className={`absolute left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-2xl shadow-xl p-3 w-64 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2 ${
                  openInlineMenuUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Теги задачи:</p>
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
                        <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: cat.color }}>
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
                                className={`text-[9.5px] font-medium px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
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
              <FileText className="w-3.5 h-3.5" />
            </span>
          )}

          {hasTaskLinks && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-lg bg-indigo-50/55 dark:bg-indigo-950/40 border border-indigo-150/50 dark:border-indigo-900/45 text-indigo-600 dark:text-indigo-400" title="Содержит ссылки на другие задачи">
              <LinkIcon className="w-3.5 h-3.5" />
            </span>
          )}

          {hasAttachments && (
            <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-500 font-medium" title="Прикреплены файлы">
              <Paperclip className="w-3.5 h-3.5" />
              <span>{node.files.length}</span>
            </span>
          )}

          {/* Chat / Comments Indicator */}
          {(() => {
            const hasComments = node.comments && node.comments.length > 0;
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id, undefined, 'chat');
                }}
                className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                  hasComments
                    ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 font-medium hover:scale-105 shadow-2xs'
                    : 'bg-slate-50/50 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 text-slate-400 hover:text-slate-600 hover:border-slate-300 dark:hover:text-slate-300'
                }`}
                title={hasComments ? `Обсуждение (${node.comments.length} сообщений)` : 'Открыть чат'}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {hasComments && <span>{node.comments.length}</span>}
              </button>
            );
          })()}

          {(() => {
            const stats = getPomoStatsForNode(node, nodes);
            return stats.pomodoroTotalTime > 0 ? (
              <span 
                onMouseDown={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-150/40 dark:border-rose-900/35 text-rose-600 dark:text-rose-400 font-medium shrink-0 select-none"
                title={`Проведено на помидоре: ${formatTotalPomoTime(stats.pomodoroTotalTime)}`}
              >
                <span>🍅</span>
                <span>{formatTotalPomoTime(stats.pomodoroTotalTime)}</span>
              </span>
            ) : null;
          })()}

          {node.estimatedTime !== undefined && node.estimatedTime !== null && !isNaN(node.estimatedTime) ? (
            <span 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const val = prompt("Изменить ориентировочное время работы (в минутах):", node.estimatedTime?.toString() || "30");
                if (val !== null) {
                  if (val === "") {
                    onUpdateNode({ ...node, estimatedTime: undefined });
                  } else {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                      onUpdateNode({ ...node, estimatedTime: num });
                    }
                  }
                }
              }}
              className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-150/40 dark:border-indigo-900/35 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer transition-colors shrink-0" 
              title={`Ориентировочное время: ${node.estimatedTime} мин (нажмите для изменения)`}
            >
              <Timer className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>{node.estimatedTime} мин</span>
            </span>
          ) : (
            <span 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const val = prompt("Укажите ориентировочное время работы (в минутах):", "30");
                if (val !== null) {
                  if (val === "") {
                    onUpdateNode({ ...node, estimatedTime: undefined });
                  } else {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                      onUpdateNode({ ...node, estimatedTime: num });
                    }
                  }
                }
              }}
              className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-lg bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-medium hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 cursor-pointer transition-all shrink-0" 
              title="Нажмите, чтобы указать ориентировочное время работы прямо на месте"
            >
              <Timer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Оценка</span>
            </span>
          )}
        </div>

        {/* Subtasks inline list */}
        {(() => {
          const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
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
                className="flex items-center justify-between w-full text-[12px] font-medium text-slate-555 hover:text-[#4f46e5] dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5 pl-0.5 pb-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                  </span>
                  <span>ПОДЗАДАЧИ:</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10.5px] bg-slate-100 dark:bg-slate-800/80 font-medium text-slate-600 dark:text-slate-400">
                    {completedCount}/{subtasks.length}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10.5px] font-medium text-slate-400">{isExpanded ? 'Свернуть' : 'Развернуть'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-505 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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
                    {renderSubtaskTree(node.id)}
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
    if (groupBy === 'status') {
      if (node.completed) return 'done';
      if (node.status === 'waiting') return 'waiting';
      if (node.progress && node.progress > 0) return 'progress';
      return 'todo';
    } else if (groupBy === 'priority') {
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
    <div 
      id="kanban-view-root" 
      className={`flex flex-col select-none bg-white dark:bg-slate-900 transition-all duration-200 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'h-full w-full'
      }`}
    >
      
      {/* Category selector panel */}
      <div 
        id="kanban-categories-bar" 
        className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-900 select-none transition-all duration-200"
      >
        {/* Compact Summary Header Row - Always visible, extremely thin and space-saving */}
        <div className="flex items-center justify-between px-2.5 py-0.5 md:px-4 md:py-1 border-b border-slate-200/30 dark:border-slate-800/20 bg-white/60 dark:bg-slate-900/30">
          <div className="flex flex-nowrap items-center gap-x-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-350 flex-1 min-w-0 pr-1.5 overflow-x-auto scrollbar-none">
            <div className="flex flex-nowrap items-center gap-x-1 text-[11px] shrink-0">
              <span className="text-slate-500 dark:text-slate-400">Группа:</span>
              <span className="text-[#4f46e5] dark:text-indigo-400 font-medium px-1 py-0.2 text-[10.5px] rounded bg-indigo-50/40 dark:bg-indigo-950/20 shrink-0 border border-indigo-100/10">
                {groupBy === 'status' ? 'Статусы' : groupBy === 'category' ? 'Категории' : groupBy === 'priority' ? 'Приоритеты' : 'Области'}
              </span>
              <span className="text-slate-300 dark:text-slate-700/60 font-normal">|</span>
              <span className="text-slate-500 dark:text-slate-400">Внутри:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium px-1 py-0.2 text-[10.5px] rounded bg-emerald-50/40 dark:bg-emerald-950/20 truncate max-w-[80px] inline-block align-bottom shrink-0 border border-emerald-100/10">
                {selectedContainerFilterId === 'all' 
                  ? 'Все' 
                  : selectedContainerFilterId === 'no-container' 
                    ? 'Вне областей' 
                    : allContainers.find(c => c.id === selectedContainerFilterId)?.text || 'Загрузка'}
              </span>
              {groupBy === 'category' && activeCategory && (
                <>
                  <span className="text-slate-300 dark:text-slate-700/60 font-normal">|</span>
                  <span className="inline-flex items-center gap-1 px-1 py-0.2 text-[10.5px] rounded font-medium text-[#4f46e5] dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 shrink-0 border border-indigo-100/10">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeCategory.color }} />
                    <span className="truncate max-w-[60px]">{activeCategory.name}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto select-none">
            {/* Сортировка */}
            <div className="flex items-center gap-1 bg-slate-100/60 dark:bg-slate-800/50 px-1.5 py-0.2 rounded border border-slate-200/50 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap select-none hidden sm:inline">
                Сортировка:
              </span>
              <div className="relative shrink-0">
                <select
                  id="kanban-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="appearance-none bg-transparent text-slate-700 dark:text-slate-300 text-[11.5px] font-medium pr-4 cursor-pointer focus:outline-none transition-all py-0"
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

            {/* Фильтры Toggle */}
            <button
              type="button"
              onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
              className="flex items-center gap-0.5 px-1.5 py-0.2 text-[11.5px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors border border-slate-200/50 dark:border-slate-800/85 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              <span>{isFiltersCollapsed ? 'Фильтры' : 'Свернуть'}</span>
              <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
            </button>

            {/* Toggle Button for Full Screen */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className={`flex items-center gap-0.5 px-1.5 py-0.2 text-[11.5px] font-medium rounded cursor-pointer transition-all border shrink-0 ${
                isFullScreen 
                  ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-850 dark:text-amber-400' 
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-800'
              }`}
              title={isFullScreen ? "Выйти из полноэкранного режима" : "Войти в полноэкранный режим"}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-2.5 h-2.5" />
                  <span>Окно</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-2.5 h-2.5" />
                  <span>Экран</span>
                </>
              )}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {!isFiltersCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-t border-slate-200/60 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-950/20"
            >
              <div className="px-3 py-1.5 md:px-4 md:py-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
                      Область:
                    </span>
                    <div className="relative shrink-0">
                      <select
                        id="kanban-container-filter-select"
                        value={selectedContainerFilterId}
                        onChange={(e) => handleSelectContainerFilter(e.target.value)}
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[12px] font-medium rounded-lg pl-2 pr-6 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                      >
                        <option value="all">📁 Все ({nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.archived).length})</option>
                        <option value="no-container">📦 Вне областей ({nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.archived && !isInsideAnyContainer(n)).length})</option>
                        {allContainers.map(container => {
                          const count = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.archived && getTaskContainerId(n) === container.id).length;
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
                    <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
                      Группировка:
                    </span>
                    <div className="flex items-center gap-0.5 bg-slate-200/50 dark:bg-slate-900/50 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800/60 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleGroupByChange('status')}
                        className={`px-1.5 py-0.5 border text-[11.5px] font-medium rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'status' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        Статусы
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGroupByChange('category')}
                        className={`px-1.5 py-0.5 border text-[11.5px] font-medium rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'category' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        Категории
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGroupByChange('priority')}
                        className={`px-1.5 py-0.5 border text-[11.5px] font-medium rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'priority' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                      >
                        Приоритеты
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGroupByChange('container')}
                        className={`px-1.5 py-0.5 border text-[11.5px] font-medium rounded transition-all cursor-pointer whitespace-nowrap ${
                          groupBy === 'container' 
                            ? 'bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700 text-[#4f46e5] dark:text-indigo-400 shadow-sm' 
                            : 'bg-transparent border-transparent text-slate-500 hover:text-[#4f46e5]/85 dark:hover:text-indigo-300'
                        }`}
                      >
                        Области
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
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[11.5px] font-medium rounded border cursor-pointer transition-all ${
                        collapseCompleted 
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/10 border-indigo-200/40 text-[#4f46e5] dark:text-indigo-400' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className={`w-3 h-3 ${collapseCompleted ? 'text-[#4f46e5] dark:text-indigo-400' : 'text-slate-400'}`} />
                      <span>{collapseCompleted ? 'Развернуть все' : 'Свернуть все'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSubtasks(!showSubtasks)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[11.5px] font-medium rounded border cursor-pointer transition-all ${
                        showSubtasks 
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/10 border-emerald-200/40 text-emerald-605 dark:text-emerald-400 shadow-sm' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded border flex items-center justify-center text-[6px] text-white ${
                        showSubtasks ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-700'
                      }`}>
                        {showSubtasks && '✓'}
                      </div>
                      <span>Подзадачи</span>
                    </button>
                  </div>

                </div>

                {/* Categories selection row */}
                {groupBy === 'category' && tagCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 border-t border-slate-200 dark:border-slate-800/40 pt-1 px-0.5 mt-0.5 w-full">
                    <span className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase shrink-0">
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
                            onClick={() => handleSelectCategory(cat.id)}
                            className={`px-1.5 py-0.5 text-[11.5px] font-medium flex items-center gap-1.5 cursor-pointer transition-all duration-150 shrink-0 rounded border ${
                              isSelected 
                                ? 'bg-white dark:bg-slate-900 border-[#4f46e5] text-[#4f46e5] dark:text-indigo-400 ring-1 ring-indigo-500/10'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50/50'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span>{cat.name}</span>
                            <span className="text-[10.5px] font-medium px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
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
        className="flex-1 overflow-x-auto custom-scrollbar min-h-0 bg-slate-50/10 dark:bg-slate-950/5 p-3 md:p-6"
        onWheel={(e) => {
          // Translate vertical mouse wheel scrolling to horizontal scrolling for desktop users without a trackpad
          if (e.deltaY !== 0 && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
            const target = e.target as HTMLElement;
            // Only translate if not scrolling a vertically scrollable card container list
            const scrollableColumn = target.closest('[id^="kanban-column-cards-"]');
            if (scrollableColumn) {
              const hasVerticalOverflow = scrollableColumn.scrollHeight > scrollableColumn.clientHeight;
              if (hasVerticalOverflow) {
                return;
              }
            }
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
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
                data-column-id={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-64 sm:w-72 shrink-0 rounded-2xl border p-4 flex flex-col h-full transition-all duration-250 scrollbar-thin ${
                  isOverdueCont
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50/10 dark:bg-rose-950/5 ring-2 ring-rose-500/10 shadow-[0_10px_25px_rgba(244,63,94,0.04)]'
                    : isDraggedOver 
                      ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/10 scale-[1.01] ring-2 ring-indigo-500/10 shadow-[0_10px_30px_rgba(99,102,241,0.08)]' 
                      : 'border-slate-200 dark:border-slate-800 bg-[#f8fafc] dark:bg-slate-900/80 shadow-[0_2px_8px_rgba(15,23,42,0.015),0_1px_3px_rgba(15,23,42,0.01)]'
                }`}
                style={{ borderTop: isOverdueCont ? '3px solid #f43f5e' : `3px solid ${col.color}` }}
              >
                {/* Column top header */}
                <div className="flex items-center justify-between pb-3 mb-3 px-1 border-b border-slate-200/50 dark:border-slate-800/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isOverdueCont ? '#f43f5e' : col.color }} />
                    <h4 className={`text-[14px] font-medium truncate ${isOverdueCont ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-800 dark:text-slate-100'}`} title={col.title}>
                      {isOverdueCont && '⚠️ '}{col.title}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-medium font-mono shrink-0 ${isOverdueCont ? 'bg-rose-200/60 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
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
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 flex items-center justify-center"
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
                              className="w-full flex items-center justify-between py-1.5 px-2 bg-slate-100/70 dark:bg-slate-800/40 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors rounded-xl text-[11.5px] font-medium text-slate-500 dark:text-slate-400 cursor-pointer mb-2 shadow-xs"
                            >
                              <span className="flex items-center gap-1.5 pl-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
                                <span>Выполненные</span>
                                <span className="px-1.5 py-0.2 rounded-full text-[10.5px] bg-slate-200/80 dark:bg-slate-700 font-medium shrink-0 text-slate-600 dark:text-slate-350">
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
                          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[12.5px] font-medium text-slate-400 dark:text-slate-500 select-none">
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
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[13.5px] focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-200"
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
                          className="px-2 py-1 text-[11.5px] text-slate-600 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          id={`kanban-add-confirm-btn-${col.id}`}
                          type="button"
                          onClick={() => handleCreateTaskInColumn(col.id)}
                          className="px-2.5 py-1 text-[11.5px] text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors font-medium cursor-pointer"
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

      {/* Touch drag proxy illustration */}
      {touchDrag && (
        <div
          className="kanban-touch-drag-proxy fixed pointer-events-none z-[9999] opacity-90 scale-[1.03] shadow-2xl rounded-xl border-2 border-indigo-500 bg-white dark:bg-slate-900 p-2.5 flex flex-col justify-center text-slate-800 dark:text-slate-100 font-sans"
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${touchDrag.currentX - touchDrag.offsetX}px, ${touchDrag.currentY - touchDrag.offsetY}px, 0)`,
            width: `${touchDrag.width}px`,
            height: `${touchDrag.height}px`,
            willChange: 'transform',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0 bg-indigo-500" />
            <span className="font-medium text-[12px] md:text-xs truncate max-w-full">
              {touchDrag.text}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
