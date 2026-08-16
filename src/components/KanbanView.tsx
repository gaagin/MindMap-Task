import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  MessageSquare,
  CornerUpLeft,
  SlidersHorizontal,
  ArrowUpDown,
  Search,
  Check,
  MoreHorizontal,
  Layers,
  Table,
  GanttChart,
  User,
  DollarSign,
  TrendingUp,
  Activity,
  ExternalLink,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority, ViewMode } from '../types';
import { isNodeOverdue, isContainerOverdue, hasContainerNonOverdueTasks, getPomoStatsForNode, formatTotalPomoTime, getTaskExternalLinks } from '../utils';

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
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  setViewMode?: (mode: ViewMode) => void;
}

// Notion date formatter (e.g., "October 24, 2025" or "24 окт. 2025")
function formatNotionDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
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
  if (lower.includes('campaign') || lower.includes('marketing') || lower.includes('реклам')) return '☵';
  if (lower.includes('design') || lower.includes('дизайн') || lower.includes('redesign')) return '☵';
  if (lower.includes('report') || lower.includes('отчет')) return '☵';
  if (lower.includes('mobile') || lower.includes('app') || lower.includes('приложен')) return '☵';
  if (lower.includes('training') || lower.includes('обучен')) return '☵';
  if (lower.includes('infrastructure') || lower.includes('it') || lower.includes('сервер')) return '☵';
  if (lower.includes('brand') || lower.includes('identity')) return '☵';
  if (lower.includes('feedback') || lower.includes('отзыв')) return '☵';
  if (lower.includes('relocation') || lower.includes('office')) return '☵';
  if (lower.includes('product') || lower.includes('launch')) return '☵';
  if (lower.includes('onboarding') || lower.includes('клиент')) return '☵';
  if (lower.includes('видео') || lower.includes('video')) return '🎬';
  if (lower.includes('сайт') || lower.includes('web')) return '🌐';
  return '☵';
}

// Clean task title by removing leading emoji if present
function cleanTaskTitle(text: string): string {
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u;
  return text.replace(emojiRegex, '');
}

// Sample assignees generator if not set
const DEFAULT_ASSIGNEES = ['Mr.Pugo', 'Gillde', 'Alex', 'Elena', 'Mark'];

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
  projectName = 'Project Workflow Kanban',
  projectIcon = '🗂️',
  onUpdateProjectName,
  setViewMode
}: KanbanViewProps) {
  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(projectName);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleInput(projectName);
  }, [projectName]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && onUpdateProjectName && titleInput.trim() !== projectName) {
      onUpdateProjectName(titleInput.trim());
    }
  };

  // Grouping state ('status' | 'category' | 'priority' | 'container')
  const [internalGroupBy, setInternalGroupBy] = useState<'status' | 'category' | 'priority' | 'container'>(() => 'status');
  const groupBy = propsKanbanGroupBy !== undefined && propsKanbanGroupBy !== null ? propsKanbanGroupBy : internalGroupBy;
  const setGroupBy = (g: 'status' | 'category' | 'priority' | 'container') => {
    setInternalGroupBy(g);
    if (onKanbanGroupByChange) {
      onKanbanGroupByChange(g);
    }
  };

  // Fullscreen state
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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Local Sort state
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

  // Search input state inside Notion database bar
  const [localSearch, setLocalSearch] = useState('');
  const activeSearch = searchQuery || localSearch;

  // Filter Popover state
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  // Subtasks visibility
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

  // Collapse completed cards
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

  // Collapsed individual columns
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_kanban_collapsed_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_kanban_collapsed_columns', JSON.stringify(collapsedColumns));
    } catch {}
  }, [collapsedColumns]);

  // Container filter
  const [selectedContainerFilterId, setSelectedContainerFilterId] = useState<string>(() => {
    if (propsKanbanContainerFilterId) return propsKanbanContainerFilterId;
    return 'all';
  });

  useEffect(() => {
    if (propsKanbanContainerFilterId !== undefined && propsKanbanContainerFilterId !== null) {
      setSelectedContainerFilterId(propsKanbanContainerFilterId);
    }
  }, [propsKanbanContainerFilterId]);

  const handleSelectContainerFilter = (containerId: string) => {
    setSelectedContainerFilterId(containerId);
    if (onKanbanContainerFilterIdChange) {
      onKanbanContainerFilterIdChange(containerId);
    }
  };

  // Active Category selection for Tag Grouping
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    return tagCategories.length > 0 ? tagCategories[0].id : null;
  });

  useEffect(() => {
    if (propsSelectedCategoryId !== undefined && propsSelectedCategoryId !== null) {
      setSelectedCategoryId(propsSelectedCategoryId);
    }
  }, [propsSelectedCategoryId]);

  const activeCategory = tagCategories.find(c => c.id === selectedCategoryId) || tagCategories[0];
  const activeTags = activeCategory?.tags || [];

  // Inline creation states
  const [activeAddInColumn, setActiveAddInColumn] = useState<string | null>(null);
  const [newTaskNameInColumn, setNewTaskNameInColumn] = useState('');

  // Inline property edit popover
  const [activeInlineMenu, setActiveInlineMenu] = useState<{
    cardId: string;
    type: 'priority' | 'date' | 'tag' | 'health' | 'assignee' | 'budget';
  } | null>(null);

  // Drag states
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);

  // Filter tasks helper
  const isInsideAnyContainer = (node: TaskNode): boolean => {
    if (!node.parentId) return false;
    let curr: TaskNode | undefined = nodes.find(n => n.id === node.parentId);
    while (curr) {
      if (curr.isContainer) return true;
      curr = curr.parentId ? nodes.find(n => n.id === curr!.parentId) : undefined;
    }
    return false;
  };

  const getTaskContainerId = (node: TaskNode): string | null => {
    if (!node.parentId) return null;
    let curr: TaskNode | undefined = nodes.find(n => n.id === node.parentId);
    while (curr) {
      if (curr.isContainer) return curr.id;
      curr = curr.parentId ? nodes.find(n => n.id === curr!.parentId) : undefined;
    }
    return null;
  };

  const matchesFilters = (n: TaskNode): boolean => {
    // Search query
    if (activeSearch.trim()) {
      const q = activeSearch.toLowerCase();
      const textMatches = n.text?.toLowerCase().includes(q);
      const tagMatches = n.tags?.some(t => t.toLowerCase().includes(q)) || false;
      const notesMatches = n.notes?.toLowerCase().includes(q) || false;
      const assigneeMatches = n.assignee?.toLowerCase().includes(q) || false;
      if (!textMatches && !tagMatches && !notesMatches && !assigneeMatches) return false;
    }

    // Status filter
    if (filterStatus && filterStatus !== 'all') {
      if (filterStatus === 'completed' && !n.completed) return false;
      if (filterStatus === 'active' && n.completed) return false;
    }

    // Priority filter
    if (filterPriority && filterPriority !== 'all' && n.priority !== filterPriority) return false;

    // Tag filter
    if (filterTag && filterTag !== 'all' && (!n.tags || !n.tags.includes(filterTag))) return false;

    // Due Date filter
    if (filterDueDate && filterDueDate !== 'all') {
      const today = new Date().toISOString().split('T')[0];
      if (filterDueDate === 'today' && n.dueDate !== today) return false;
      if (filterDueDate === 'overdue' && (!n.dueDate || n.dueDate >= today || n.completed)) return false;
      if (filterDueDate === 'hasDate' && !n.dueDate) return false;
      if (filterDueDate === 'noDate' && n.dueDate) return false;
    }

    return true;
  };

  const isNodeMatchingAllFilters = (node: TaskNode): boolean => {
    if (node.isContainer || node.isWorkflowRectangle || node.archived || node.isNotTask) return false;
    if (!showSubtasks && node.parentId) {
      const parent = nodes.find(n => n.id === node.parentId);
      if (parent && !parent.isContainer) return false;
    }
    return matchesFilters(node);
  };

  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (!isNodeMatchingAllFilters(n)) return false;
      if (selectedContainerFilterId === 'all') return true;
      if (selectedContainerFilterId === 'no-container') {
        return !getTaskContainerId(n);
      }
      return getTaskContainerId(n) === selectedContainerFilterId;
    });
  }, [nodes, showSubtasks, activeSearch, filterStatus, filterPriority, filterTag, filterDueDate, selectedContainerFilterId]);

  // Helper for workflow stage detection
  const getNodeWorkflowStage = (n: TaskNode): 'ideation' | 'planning' | 'execution' | 'refinement' | 'review' | 'done' => {
    if (n.stage) return n.stage;
    if (n.completed) return 'done';
    if (n.status === 'done') return 'done';
    if (n.status === 'waiting') return 'refinement';
    if (n.progress && n.progress > 0) return 'execution';
    const lower = n.text.toLowerCase();
    if (lower.includes('ideat') || lower.includes('иде') || lower.includes('feedback') || lower.includes('исследован')) return 'ideation';
    if (lower.includes('plan') || lower.includes('план') || lower.includes('report') || lower.includes('анализ')) return 'planning';
    if (lower.includes('review') || lower.includes('согласован') || lower.includes('проверк') || lower.includes('onboarding')) return 'review';
    if (lower.includes('refine') || lower.includes('доработк') || lower.includes('train')) return 'refinement';
    return 'execution';
  };

  // Build columns structure matching Notion style
  interface NotionColumn {
    id: string;
    title: string;
    bgBadge: string;
    textBadge: string;
    borderBadge: string;
    items: TaskNode[];
  }

  const columns = useMemo<NotionColumn[]>(() => {
    const cols: NotionColumn[] = [];

    if (groupBy === 'status') {
      // Flow Stages exactly as in Notion Screenshot:
      // Ideation, Planning, Execution, Refinement, Review, Done
      cols.push(
        {
          id: 'ideation',
          title: 'Ideation',
          bgBadge: 'bg-[#FDF3D7] dark:bg-[#4D3800]/40',
          textBadge: 'text-[#8F6B10] dark:text-[#F5D98B]',
          borderBadge: 'border-[#F1E0B3] dark:border-[#5E4700]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'ideation')
        },
        {
          id: 'planning',
          title: 'Planning',
          bgBadge: 'bg-[#DDEBF1] dark:bg-[#1A3B4D]/40',
          textBadge: 'text-[#2B5D7A] dark:text-[#99CCE3]',
          borderBadge: 'border-[#C5DDE8] dark:border-[#20495E]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'planning')
        },
        {
          id: 'execution',
          title: 'Execution',
          bgBadge: 'bg-[#DDEDE0] dark:bg-[#1C472A]/40',
          textBadge: 'text-[#2B6E44] dark:text-[#A3D9B1]',
          borderBadge: 'border-[#C6E2CB] dark:border-[#225834]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'execution')
        },
        {
          id: 'refinement',
          title: 'Refinement',
          bgBadge: 'bg-[#FAEBDD] dark:bg-[#522A0C]/40',
          textBadge: 'text-[#934F1A] dark:text-[#F5C49E]',
          borderBadge: 'border-[#F2D8C2] dark:border-[#6B3710]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'refinement')
        },
        {
          id: 'review',
          title: 'Review',
          bgBadge: 'bg-[#EAE4F2] dark:bg-[#382352]/40',
          textBadge: 'text-[#5B3D7D] dark:text-[#D2BFEC]',
          borderBadge: 'border-[#D9CFE6] dark:border-[#4B2F6E]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'review')
        },
        {
          id: 'done',
          title: 'Done',
          bgBadge: 'bg-[#E3E2E0] dark:bg-[#333333]',
          textBadge: 'text-[#5A5A58] dark:text-[#B8B7B5]',
          borderBadge: 'border-[#D1D0CE] dark:border-[#444444]',
          items: filteredNodes.filter(n => getNodeWorkflowStage(n) === 'done' || n.completed)
        }
      );
    } else if (groupBy === 'priority') {
      cols.push(
        {
          id: 'urgent',
          title: '🔥 Urgent',
          bgBadge: 'bg-[#FAECE7] dark:bg-[#5C231B]/40',
          textBadge: 'text-[#A8382B] dark:text-[#F7A89E]',
          borderBadge: 'border-[#F2D3CC] dark:border-[#732C22]',
          items: filteredNodes.filter(n => n.priority === 'urgent')
        },
        {
          id: 'high',
          title: 'High',
          bgBadge: 'bg-[#FAEBDD] dark:bg-[#522A0C]/40',
          textBadge: 'text-[#934F1A] dark:text-[#F5C49E]',
          borderBadge: 'border-[#F2D8C2] dark:border-[#6B3710]',
          items: filteredNodes.filter(n => n.priority === 'high')
        },
        {
          id: 'medium',
          title: 'Medium',
          bgBadge: 'bg-[#FDF3D7] dark:bg-[#4D3800]/40',
          textBadge: 'text-[#8F6B10] dark:text-[#F5D98B]',
          borderBadge: 'border-[#F1E0B3] dark:border-[#5E4700]',
          items: filteredNodes.filter(n => n.priority === 'medium')
        },
        {
          id: 'low',
          title: 'Low',
          bgBadge: 'bg-[#DDEBF1] dark:bg-[#1A3B4D]/40',
          textBadge: 'text-[#2B5D7A] dark:text-[#99CCE3]',
          borderBadge: 'border-[#C5DDE8] dark:border-[#20495E]',
          items: filteredNodes.filter(n => n.priority === 'low')
        },
        {
          id: 'none',
          title: 'No Priority',
          bgBadge: 'bg-[#E3E2E0] dark:bg-[#333333]',
          textBadge: 'text-[#5A5A58] dark:text-[#B8B7B5]',
          borderBadge: 'border-[#D1D0CE] dark:border-[#444444]',
          items: filteredNodes.filter(n => !n.priority || n.priority === 'none')
        }
      );
    } else if (groupBy === 'category') {
      cols.push({
        id: 'uncategorized',
        title: 'No Tag',
        bgBadge: 'bg-[#E3E2E0] dark:bg-[#333333]',
        textBadge: 'text-[#5A5A58] dark:text-[#B8B7B5]',
        borderBadge: 'border-[#D1D0CE] dark:border-[#444444]',
        items: filteredNodes.filter(n => !n.tags || n.tags.length === 0 || !n.tags.some(t => activeTags.includes(t)))
      });

      activeTags.forEach(tag => {
        cols.push({
          id: tag,
          title: tag,
          bgBadge: 'bg-[#EAE4F2] dark:bg-[#382352]/40',
          textBadge: 'text-[#5B3D7D] dark:text-[#D2BFEC]',
          borderBadge: 'border-[#D9CFE6] dark:border-[#4B2F6E]',
          items: filteredNodes.filter(n => n.tags && n.tags.includes(tag))
        });
      });
    } else if (groupBy === 'container') {
      const containerNodes = nodes.filter(n => n.isContainer && !n.archived);
      cols.push({
        id: 'no-container',
        title: 'General (No Area)',
        bgBadge: 'bg-[#E3E2E0] dark:bg-[#333333]',
        textBadge: 'text-[#5A5A58] dark:text-[#B8B7B5]',
        borderBadge: 'border-[#D1D0CE] dark:border-[#444444]',
        items: filteredNodes.filter(n => !isInsideAnyContainer(n))
      });

      containerNodes.forEach(c => {
        cols.push({
          id: c.id,
          title: c.text || 'Container Area',
          bgBadge: 'bg-[#DDEBF1] dark:bg-[#1A3B4D]/40',
          textBadge: 'text-[#2B5D7A] dark:text-[#99CCE3]',
          borderBadge: 'border-[#C5DDE8] dark:border-[#20495E]',
          items: filteredNodes.filter(n => getTaskContainerId(n) === c.id)
        });
      });
    }

    return cols;
  }, [groupBy, filteredNodes, activeTags, nodes]);

  // Handle Drag and Drop
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedOverColumn !== colId) {
      setDraggedOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only reset if actually leaving the column container
  };

  const handleDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedCardId;
    setDraggedCardId(null);
    setDraggedOverColumn(null);

    if (!taskId) return;
    const task = nodes.find(n => n.id === taskId);
    if (!task) return;

    if (groupBy === 'status') {
      if (colId === 'done') {
        onUpdateNode({ ...task, completed: true, stage: 'done', status: 'done', progress: 100 });
      } else if (colId === 'ideation') {
        onUpdateNode({ ...task, completed: false, stage: 'ideation', status: 'todo', progress: 0 });
      } else if (colId === 'planning') {
        onUpdateNode({ ...task, completed: false, stage: 'planning', status: 'todo', progress: 15 });
      } else if (colId === 'execution') {
        onUpdateNode({ ...task, completed: false, stage: 'execution', status: 'progress', progress: task.progress || 50 });
      } else if (colId === 'refinement') {
        onUpdateNode({ ...task, completed: false, stage: 'refinement', status: 'waiting', progress: 75 });
      } else if (colId === 'review') {
        onUpdateNode({ ...task, completed: false, stage: 'review', status: 'progress', progress: 90 });
      }
    } else if (groupBy === 'priority') {
      onUpdateNode({ ...task, priority: colId as Priority });
    } else if (groupBy === 'category') {
      if (colId === 'uncategorized') {
        const nextTags = (task.tags || []).filter(t => !activeTags.includes(t));
        onUpdateNode({ ...task, tags: nextTags });
      } else {
        const otherTags = (task.tags || []).filter(t => !activeTags.includes(t));
        onUpdateNode({ ...task, tags: [...otherTags, colId] });
      }
    } else if (groupBy === 'container') {
      if (colId === 'no-container') {
        onUpdateNode({ ...task, parentId: null });
      } else {
        onUpdateNode({ ...task, parentId: colId });
      }
    }
  };

  // Quick Task Creation in Column
  const handleCreateTaskInColumn = (colId: string) => {
    if (!newTaskNameInColumn.trim()) {
      setActiveAddInColumn(null);
      return;
    }

    const taskText = newTaskNameInColumn.trim();
    let initialPriority: Priority = 'medium';
    let initialTags: string[] = [];
    let initialParentId: string | null = null;
    let extraFields: Partial<TaskNode> = {};

    if (groupBy === 'status') {
      if (colId === 'ideation') {
        extraFields = { stage: 'ideation', status: 'todo', progress: 0, health: 'on_track' };
      } else if (colId === 'planning') {
        extraFields = { stage: 'planning', status: 'todo', progress: 15, health: 'on_track' };
      } else if (colId === 'execution') {
        extraFields = { stage: 'execution', status: 'progress', progress: 50, health: 'on_track' };
      } else if (colId === 'refinement') {
        extraFields = { stage: 'refinement', status: 'waiting', progress: 75, health: 'at_risk' };
      } else if (colId === 'review') {
        extraFields = { stage: 'review', status: 'progress', progress: 90, health: 'on_track' };
      } else if (colId === 'done') {
        extraFields = { stage: 'done', status: 'done', progress: 100, completed: true };
      }
    } else if (groupBy === 'priority') {
      initialPriority = (colId as Priority) || 'medium';
    } else if (groupBy === 'category' && colId !== 'uncategorized') {
      initialTags = [colId];
    } else if (groupBy === 'container' && colId !== 'no-container') {
      initialParentId = colId;
    }

    onCreateTask(taskText, initialTags, initialPriority, initialParentId, undefined, extraFields);
    setNewTaskNameInColumn('');
    setActiveAddInColumn(null);
  };

  // Render individual Notion Board Card
  const renderCard = (node: TaskNode) => {
    const isSelected = node.id === selectedNodeId || selectedNodeIds.includes(node.id);
    const isDragging = draggedCardId === node.id;
    const taskIcon = getTaskPageIcon(node);
    const cleanTitle = cleanTaskTitle(node.text);

    // Compute Health
    const health = node.health || (node.completed ? 'on_track' : isNodeOverdue(node, nodes) ? 'off_track' : node.priority === 'urgent' ? 'at_risk' : 'on_track');
    
    // Priority badge representation
    const priorityLabel = node.priority === 'urgent' ? '⚡ Urgent' : node.priority === 'high' ? '🔥 High' : node.priority === 'low' ? '💤 Low' : node.priority === 'none' ? 'None' : '⏳ Medium';
    const priorityBadgeStyle = node.priority === 'urgent' || node.priority === 'high'
      ? 'bg-[#FAECE7] text-[#A8382B] dark:bg-[#5C231B]/40 dark:text-[#F7A89E]'
      : node.priority === 'low'
      ? 'bg-[#DDEBF1] text-[#2B5D7A] dark:bg-[#1A3B4D]/40 dark:text-[#99CCE3]'
      : node.priority === 'none'
      ? 'bg-[#E3E2E0] text-[#5A5A58] dark:bg-[#333] dark:text-[#B8B7B5]'
      : 'bg-[#FDF3D7] text-[#8F6B10] dark:bg-[#4D3800]/40 dark:text-[#F5D98B]';

    // Health badge representation
    const healthLabel = health === 'off_track' ? 'Off Track' : health === 'at_risk' ? 'At Risk' : 'On Track';
    const healthBadgeStyle = health === 'off_track'
      ? 'bg-[#FAECE7] text-[#A8382B] dark:bg-[#5C231B]/40 dark:text-[#F7A89E]'
      : health === 'at_risk'
      ? 'bg-[#FDF3D7] text-[#8F6B10] dark:bg-[#4D3800]/40 dark:text-[#F5D98B]'
      : 'bg-[#DDEDE0] text-[#2B6E44] dark:bg-[#1C472A]/40 dark:text-[#A3D9B1]';

    // Assignee
    const assignee = node.assignee || (node.id.charCodeAt(0) % 2 === 0 ? 'Mr.Pugo' : 'Gillde');

    // Due Date
    const formattedDate = formatNotionDate(node.dueDate);

    // Budget or Metrics
    const budget = node.budget || (node.estimatedTime ? `$${node.estimatedTime * 150}` : node.text.length > 20 ? `$40,000` : node.text.length > 10 ? `$841` : `$9,647`);
    const progressPercent = node.progress !== undefined ? node.progress : node.completed ? 100 : node.stage === 'review' ? 90 : node.stage === 'refinement' ? 75 : node.stage === 'execution' ? 50 : 25;

    // Subtasks count
    const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle && !n.archived);
    const completedSubtasksCount = subtasks.filter(s => s.completed).length;

    return (
      <div
        key={node.id}
        id={`kanban-card-${node.id}`}
        draggable
        onDragStart={(e) => handleDragStart(e, node.id)}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            onToggleSelectNode && onToggleSelectNode(node.id);
          } else {
            onSelectNode(node.id, e);
            if (onFocusedTaskIdChange) onFocusedTaskIdChange(node.id);
          }
        }}
        className={`group select-none bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] rounded-md p-3.5 shadow-2xs hover:shadow-xs hover:border-[#D3D3D0] dark:hover:border-[#484848] transition-all cursor-grab active:cursor-grabbing relative flex flex-col gap-2.5 ${
          isDragging ? 'opacity-30 scale-95' : 'opacity-100 scale-100'
        } ${
          isSelected ? 'ring-2 ring-[#2383E2] border-transparent shadow-sm' : ''
        } ${
          node.completed ? 'opacity-75 bg-[#FBFAF9] dark:bg-[#1E1E1E]' : ''
        }`}
      >
        {/* Top line: Page Icon + Title + Hover OPEN button */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {/* Notion Task Page Icon */}
            <span className="text-[13px] leading-tight select-none shrink-0 mt-0.5 text-slate-700 dark:text-slate-300">
              {taskIcon}
            </span>

            {/* Task Name */}
            <span className={`text-[14px] font-normal leading-snug text-[#37352F] dark:text-[#E6E6E5] break-words flex-1 ${
              node.completed ? 'line-through text-[#9B9A97] dark:text-[#7C7B79]' : ''
            }`}>
              {cleanTitle}
            </span>
          </div>

          {/* Hover Open Button in Notion style */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(node.id, e);
              if (onFocusedTaskIdChange) onFocusedTaskIdChange(node.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#333] hover:text-[#37352F] dark:hover:text-[#FFF] shrink-0 uppercase tracking-wider flex items-center gap-1 cursor-pointer"
            title="Open in sidebar"
          >
            <span>OPEN</span>
          </button>
        </div>

        {/* Priority Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11.5px] font-normal tracking-tight ${priorityBadgeStyle}`}>
            {priorityLabel}
          </span>

          {/* Category/Tags badges */}
          {node.tags && node.tags.length > 0 && node.tags.slice(0, 2).map(tag => (
            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-normal bg-[#EAE4F2] text-[#5B3D7D] dark:bg-[#382352]/40 dark:text-[#D2BFEC]">
              #{tag}
            </span>
          ))}
        </div>

        {/* Assignee / Persona Line */}
        <div className="flex items-center gap-1.5 text-[12.5px] text-[#37352F] dark:text-[#D3D3D0]">
          <div className="w-4 h-4 rounded-full bg-[#E3E2E0] dark:bg-[#444] text-[#37352F] dark:text-[#EEE] text-[9px] font-medium flex items-center justify-center shrink-0">
            {assignee.charAt(0)}
          </div>
          <span className="font-normal truncate">{assignee}</span>
        </div>

        {/* Project Health Badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11.5px] font-normal tracking-tight ${healthBadgeStyle}`}>
            {healthLabel}
          </span>

          {/* Overdue alert */}
          {isNodeOverdue(node, nodes) && (
            <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              <span>Overdue</span>
            </span>
          )}
        </div>

        {/* Due Date */}
        {formattedDate && (
          <div className="flex items-center gap-1.5 text-[12.5px] text-[#787774] dark:text-[#9B9A97]">
            <span>{formattedDate}</span>
          </div>
        )}

        {/* Budget / Progress bar */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#F1F1EF] dark:border-[#333]/60">
          <span className="text-[12px] font-normal text-[#37352F] dark:text-[#D3D3D0] tracking-tight">
            {budget}
          </span>

          <div className="flex items-center gap-2 flex-1 max-w-[100px]">
            <div className="h-1.5 flex-1 bg-[#EAEAEA] dark:bg-[#3B3B3B] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  health === 'off_track' ? 'bg-[#EB5757]' : health === 'at_risk' ? 'bg-[#F2994A]' : 'bg-[#27AE60]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10.5px] text-[#9B9A97] dark:text-[#787774] font-mono">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Subtasks / Pomodoro / Chat metrics */}
        {(subtasks.length > 0 || node.files.length > 0 || (node.comments && node.comments.length > 0) || activePomodoroNodeId === node.id) && (
          <div className="flex items-center gap-2 pt-0.5 text-[11px] text-[#9B9A97] dark:text-[#787774] flex-wrap">
            {subtasks.length > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#27AE60]" />
                <span>{completedSubtasksCount}/{subtasks.length}</span>
              </span>
            )}

            {node.files.length > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                <span>{node.files.length}</span>
              </span>
            )}

            {node.comments && node.comments.length > 0 && (
              <span className="flex items-center gap-1 text-[#2383E2]">
                <MessageSquare className="w-3 h-3" />
                <span>{node.comments.length}</span>
              </span>
            )}

            {activePomodoroNodeId === node.id && (
              <span className="flex items-center gap-1 text-rose-500 font-medium animate-pulse">
                <span>🍅 Active</span>
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#D3D3D0] overflow-hidden select-none font-sans">
      {/* NOTION KANBAN COLUMNS BOARD */}
      <div 
        id="kanban-columns-container" 
        className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-white dark:bg-[#191919] p-6"
        onWheel={(e) => {
          if (e.deltaY !== 0 && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
            const target = e.target as HTMLElement;
            const scrollableColumn = target.closest('[id^="kanban-column-cards-"]');
            if (scrollableColumn) {
              const hasVerticalOverflow = scrollableColumn.scrollHeight > scrollableColumn.clientHeight;
              if (hasVerticalOverflow) return;
            }
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        <div className="flex gap-4 h-full items-stretch pb-2">
          {columns.map(col => {
            const isAddActive = activeAddInColumn === col.id;
            const isDraggedOver = draggedOverColumn === col.id;

            return (
              <div
                key={col.id}
                id={`kanban-column-root-${col.id}`}
                data-column-id={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`w-64 sm:w-72 shrink-0 flex flex-col h-full rounded-lg transition-colors duration-150 ${
                  isDraggedOver 
                    ? 'bg-[#F2F7FA] dark:bg-[#1F2933] ring-2 ring-[#2383E2]/40' 
                    : 'bg-transparent'
                }`}
              >
                {/* Column Header: Pastel Badge + Count + '+' Button */}
                <div className="flex items-center justify-between px-1 py-1.5 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Notion pastel status badge */}
                    <span className={`px-2 py-0.5 rounded text-[12px] font-normal tracking-tight border ${col.bgBadge} ${col.textBadge} ${col.borderBadge} truncate`}>
                      {col.title}
                    </span>

                    {/* Counter */}
                    <span className="text-[12px] text-[#9B9A97] dark:text-[#787774] font-normal">
                      {col.items.length}
                    </span>
                  </div>

                  {/* Header '+' and '...' actions */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAddInColumn(col.id);
                        setNewTaskNameInColumn('');
                        setTimeout(() => {
                          const el = document.getElementById(`kanban-add-input-${col.id}`);
                          if (el) el.focus();
                        }, 50);
                      }}
                      className="p-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2F2F2F] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] transition-colors cursor-pointer"
                      title="Add task to column"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2F2F2F] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] transition-colors cursor-pointer"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Vertical scrollable cards container */}
                <div
                  id={`kanban-column-cards-${col.id}`}
                  className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[50px] scrollbar-thin"
                >
                  {col.items.map(node => renderCard(node))}

                  {/* Inline Add input if active */}
                  {isAddActive && (
                    <div className="bg-white dark:bg-[#252525] border border-[#2383E2] rounded-md p-3 shadow-sm flex flex-col gap-2">
                      <input
                        id={`kanban-add-input-${col.id}`}
                        type="text"
                        placeholder="Type a task name..."
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
                        className="w-full bg-transparent text-[13.5px] text-[#37352F] dark:text-[#FFF] outline-none placeholder-[#9B9A97]"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAddInColumn(null);
                            setNewTaskNameInColumn('');
                          }}
                          className="px-2 py-0.5 text-[11.5px] text-[#787774] hover:bg-[#EFEFED] rounded transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateTaskInColumn(col.id)}
                          className="px-2.5 py-0.5 text-[11.5px] bg-[#2383E2] hover:bg-[#1D70C2] text-white rounded font-medium transition-colors cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notion "+ New" Button at the bottom of the column */}
                  {!isAddActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAddInColumn(col.id);
                        setNewTaskNameInColumn('');
                        setTimeout(() => {
                          const el = document.getElementById(`kanban-add-input-${col.id}`);
                          if (el) el.focus();
                        }, 50);
                      }}
                      className="w-full py-1.5 px-2 flex items-center gap-1.5 text-[13px] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] hover:bg-[#F0F0EE] dark:hover:bg-[#252525] rounded transition-colors cursor-pointer select-none"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* "+ Add a group" Column at the end */}
          <div className="w-64 sm:w-72 shrink-0 flex flex-col pt-1">
            <button
              type="button"
              onClick={() => {
                const name = prompt('Name for new group / tag:');
                if (name && name.trim()) {
                  onCreateTagCategory(name.trim(), '#6366f1');
                }
              }}
              className="py-1.5 px-3 flex items-center gap-2 text-[13px] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] hover:bg-[#F0F0EE] dark:hover:bg-[#252525] rounded transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add a group</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
