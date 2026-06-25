import React, { useState, useMemo, useEffect } from 'react';
import { 
  Check, 
  Trash2, 
  Plus, 
  Calendar, 
  Flag, 
  Tag, 
  FileText, 
  Clock, 
  ChevronRight, 
  CheckCircle, 
  Circle, 
  ChevronDown, 
  Search, 
  Filter, 
  SlidersHorizontal, 
  Sparkles, 
  AlertCircle, 
  ExternalLink,
  FolderMinus,
  CheckSquare,
  ListFilter,
  CheckCircle2, 
  Loader2,
  CalendarCheck,
  GripVertical,
  Maximize2,
  Minimize2,
  Target
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';
import { generateId } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface MobileListViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, tags: string[], priority: Priority, dueDate?: string, parentId?: string | null) => void;
  onCreateTagCategory?: (name: string, color: string) => void;
  onUpdateTagCategory?: (id: string, name: string, color: string, tags: string[]) => void;
  onDeleteTagCategory?: (id: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  onFocusTaskOnCanvas?: (id: string) => void;
}

interface TaskTreeItem {
  node: TaskNode;
  children: TaskTreeItem[];
}

export default function MobileListView({
  nodes,
  tagCategories = [],
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onCreateTagCategory,
  onUpdateTagCategory,
  onDeleteTagCategory,
  onFullScreenChange,
  onFocusTaskOnCanvas,
}: MobileListViewProps) {
  // Inbox / State filters
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'today' | 'overdue'>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchIndex, setMobileSearchIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
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

  // Tags Manager modal state variables
  const [showTagsManager, setShowTagsManager] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [expandedCatIds, setExpandedCatIds] = useState<Record<string, boolean>>({});
  const [editingCategoryTagId, setEditingCategoryTagId] = useState<string | null>(null);
  const [editingCategoryTagName, setEditingCategoryTagName] = useState('');
  const [editingCategoryTagColor, setEditingCategoryTagColor] = useState('#6366f1');
  const [addingTagToCatId, setAddingTagToCatId] = useState<string | null>(null);
  const [newTagNameInput, setNewTagNameInput] = useState('');

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return nodes.filter(n => {
      const matchesText = n.text?.toLowerCase().includes(query);
      const matchesNotes = n.notes?.toLowerCase().includes(query) || false;
      const matchesTags = n.tags?.some(t => t.toLowerCase().includes(query)) || false;
      return matchesText || matchesNotes || matchesTags;
    });
  }, [nodes, searchQuery]);

  const handleNextMobileSearchMatch = () => {
    if (searchResults.length <= 1) return;
    const nextIdx = (mobileSearchIndex + 1) % searchResults.length;
    setMobileSearchIndex(nextIdx);
    const nextMatch = searchResults[nextIdx];
    onSelectNode(nextMatch.id);
    
    setTimeout(() => {
      const el = document.getElementById(`mobile-task-card-${nextMatch.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  };

  // Auto focus and scroll to first found node on mobile search query change
  useEffect(() => {
    if (searchQuery.trim() && searchResults.length > 0) {
      setMobileSearchIndex(0);
      const firstMatch = searchResults[0];
      onSelectNode(firstMatch.id);
      
      // Expand parent of selected node if collapsed, so it is visible in the tree
      const parentId = firstMatch.parentId;
      if (parentId && collapsedParents[parentId]) {
        setCollapsedParents(prev => ({ ...prev, [parentId]: false }));
      }

      setTimeout(() => {
        const el = document.getElementById(`mobile-task-card-${firstMatch.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    } else {
      setMobileSearchIndex(0);
    }
  }, [searchQuery]);
  
  // Quick task input states (TickTick experience)
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('low');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskTags, setNewTaskTags] = useState<string[]>([]);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  
  // Inline edit state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Safe confirmation states for iframes (Mobile view)
  const [confirmDeleteNodeId, setConfirmDeleteNodeId] = useState<string | null>(null);
  const [confirmDeleteSubtaskId, setConfirmDeleteSubtaskId] = useState<string | null>(null);
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  // Local state for expanded / collapsed parent tree items (TickTick style folders)
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  // Local subtask creation input states mapping parentTaskId -> input text
  const [newSubtaskTexts, setNewSubtaskTexts] = useState<Record<string, string>>({});

  // Drag and drop states
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);

  // Checks if node A is a descendant of node B
  const isDescendant = (targetId: string, ancestorId: string): boolean => {
    let current = nodes.find(n => n.id === targetId);
    while (current && current.parentId) {
      if (current.parentId === ancestorId) return true;
      current = nodes.find(n => n.id === current.parentId);
    }
    return false;
  };

  // Custom pointer drag handlers for fully-supported mobile touch drag & drop
  const activePointerId = React.useRef<number | null>(null);
  
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return; // Only drag with left click / touch
    
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}
    activePointerId.current = e.pointerId;
    setDraggedNodeId(id);
    setDragOverNodeId(null);
    
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent, id: string) => {
    if (draggedNodeId !== id) return;
    if (activePointerId.current !== e.pointerId) return;

    // Utilize elementFromPoint to find custom drag Target under the point
    const elementUnderPointer = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementUnderPointer) {
      if (dragOverNodeId !== null) {
        setDragOverNodeId(null);
      }
      return;
    }

    // Check if hovering over the de-nesting root zone
    const rootDropzone = elementUnderPointer.closest('[id="mobile-task-root-dropzone"]');
    if (rootDropzone) {
      if (dragOverNodeId !== 'background_root_zone') {
        setDragOverNodeId('background_root_zone');
      }
      return;
    }

    const cardElement = elementUnderPointer.closest('[id^="mobile-task-card-"]');
    if (cardElement) {
      const targetId = cardElement.getAttribute('id')?.replace('mobile-task-card-', '') || null;
      
      if (targetId && targetId !== id && !isDescendant(targetId, id)) {
        if (dragOverNodeId !== targetId) {
          setDragOverNodeId(targetId);
        }
      } else {
        if (dragOverNodeId !== null) {
          setDragOverNodeId(null);
        }
      }
    } else {
      if (dragOverNodeId !== null) {
        setDragOverNodeId(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent, id: string) => {
    if (draggedNodeId !== id) return;
    activePointerId.current = null;
    
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}

    const targetId = dragOverNodeId;
    
    // Clear states
    setDraggedNodeId(null);
    setDragOverNodeId(null);

    if (targetId === 'background_root_zone') {
      const draggedNode = nodes.find(n => n.id === id);
      if (draggedNode && draggedNode.parentId !== null) {
        onUpdateNode({
          ...draggedNode,
          parentId: null,
          isFloating: true,
        });
      }
    } else if (targetId && targetId !== id && !isDescendant(targetId, id)) {
      const draggedNode = nodes.find(n => n.id === id);
      if (draggedNode && draggedNode.parentId !== targetId) {
        onUpdateNode({
          ...draggedNode,
          parentId: targetId,
          isFloating: false,
        });
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent, id: string) => {
    if (draggedNodeId !== id) return;
    activePointerId.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    setDraggedNodeId(null);
    setDragOverNodeId(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedNodeId(id);
  };

  const handleDragOverCard = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedNodeId === id || isDescendant(id, draggedNodeId || '')) {
      return;
    }
    if (dragOverNodeId !== id) {
      setDragOverNodeId(id);
    }
  };

  const handleDragLeaveCard = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverNodeId(null);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverNodeId(null);
  };

  const handleDropOnCard = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverNodeId(null);
    
    const dragId = e.dataTransfer.getData('text/plain') || draggedNodeId;
    setDraggedNodeId(null);

    if (!dragId || dragId === targetId || isDescendant(targetId, dragId)) {
      return;
    }

    const draggedNode = nodes.find(n => n.id === dragId);
    if (draggedNode && draggedNode.parentId !== targetId) {
      onUpdateNode({
        ...draggedNode,
        parentId: targetId,
        isFloating: false,
      });
    }
  };

  const handleDropOnBackground = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData('text/plain') || draggedNodeId;
    setDraggedNodeId(null);
    setDragOverNodeId(null);

    if (!dragId) return;

    const draggedNode = nodes.find(n => n.id === dragId);
    if (draggedNode && draggedNode.parentId !== null) {
      onUpdateNode({
        ...draggedNode,
        parentId: null,
        isFloating: true,
      });
    }
  };

  // Priority metadata for colors and icons
  const priorities: { value: Priority; label: string; bg: string; border: string; text: string }[] = [
    { value: 'none', label: 'Без приоритета', bg: 'bg-slate-50 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400' },
    { value: 'low', label: 'Низкий', bg: 'bg-sky-50/10 dark:bg-sky-500/10', border: 'border-sky-200 dark:border-sky-800/40', text: 'text-sky-600 dark:text-sky-450' },
    { value: 'medium', label: 'Средний', bg: 'bg-amber-50/10 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-800/40', text: 'text-amber-600 dark:text-amber-450' },
    { value: 'high', label: 'Высокий', bg: 'bg-orange-50/10 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-850/40', text: 'text-orange-600 dark:text-orange-450' },
    { value: 'urgent', label: 'Срочный', bg: 'bg-rose-50/10 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-800/40', text: 'text-rose-600 dark:text-rose-450' }
  ];

  // Map priorities array to easy helper
  const priorityMap = useMemo(() => {
    return priorities.reduce((acc, p) => {
      acc[p.value] = p;
      return acc;
    }, {} as Record<Priority, typeof priorities[0]>);
  }, []);

  // Pre-calculate full children mappings for badges and nested checklists
  const { nodeChildrenCountMap, nodeChildrenCompletedCountMap, childrenByParentId } = useMemo(() => {
    const countMap: Record<string, number> = {};
    const completedMap: Record<string, number> = {};
    const byParentMap: Record<string, TaskNode[]> = {};

    nodes.forEach(n => {
      if (n.parentId) {
        countMap[n.parentId] = (countMap[n.parentId] || 0) + 1;
        if (n.completed) {
          completedMap[n.parentId] = (completedMap[n.parentId] || 0) + 1;
        }
        if (!byParentMap[n.parentId]) {
          byParentMap[n.parentId] = [];
        }
        byParentMap[n.parentId].push(n);
      }
    });

    return {
      nodeChildrenCountMap: countMap,
      nodeChildrenCompletedCountMap: completedMap,
      childrenByParentId: byParentMap
    };
  }, [nodes]);

  // Quick Task Creation handler
  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    onCreateTask(
      newTaskText.trim(),
      newTaskTags,
      newTaskPriority,
      newTaskDueDate || undefined,
      null // Level 1 main task
    );

    // Reset fields
    setNewTaskText('');
    setNewTaskPriority('low');
    setNewTaskDueDate('');
    setNewTaskTags([]);
    setShowQuickOptions(false);
  };

  // Quick Subtask Creation handler
  const handleAddSubtaskSubmit = (parentId: string, text: string) => {
    if (!text.trim()) return;
    onCreateTask(
      text.trim(),
      [], // Empty tags initially
      'none', // No priority initially
      undefined, // No due date initially
      parentId
    );
    // Erase input for this parent
    setNewSubtaskTexts(prev => ({ ...prev, [parentId]: '' }));
  };

  // Toggle node completion status locally with TickTick checklist behavior
  const handleToggleCompleted = (node: TaskNode) => {
    onUpdateNode({
      ...node,
      completed: !node.completed,
    });
  };

  const handleUpdatePriority = (node: TaskNode, priority: Priority) => {
    onUpdateNode({
      ...node,
      priority,
    });
  };

  const handleUpdateDueDate = (node: TaskNode, date: string) => {
    onUpdateNode({
      ...node,
      dueDate: date || undefined,
      dueTime: !date ? undefined : node.dueTime,
    });
  };

  const handleStartInlineEdit = (node: TaskNode) => {
    setEditingNodeId(node.id);
    setEditingText(node.text);
  };

  const handleSaveInlineEdit = (node: TaskNode) => {
    if (editingText.trim()) {
      onUpdateNode({
        ...node,
        text: editingText.trim(),
      });
    }
    setEditingNodeId(null);
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // Filter existing active user nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      // Exclude container nodes since we focus on tasks here!
      if (n.isContainer) return false;
      if (n.isWorkflowRectangle) return false;

      // Tab logic
      if (activeTab === 'active' && n.completed) return false;
      if (activeTab === 'completed' && !n.completed) return false;
      if (activeTab === 'today') {
        if (n.completed) return false;
        if (n.dueDate !== todayStr) return false;
      }
      if (activeTab === 'overdue') {
        if (n.completed) return false;
        if (!n.dueDate || n.dueDate >= todayStr) return false;
      }

      // Priority criteria
      if (priorityFilter !== 'all' && n.priority !== priorityFilter) return false;

      // Tags criteria
      if (tagFilter !== 'all' && !n.tags?.includes(tagFilter)) return false;

      // Text search criteria
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = n.text?.toLowerCase().includes(query);
        const matchesNotes = n.notes?.toLowerCase().includes(query);
        const matchesTags = n.tags?.some(t => t.toLowerCase().includes(query));
        if (!matchesText && !matchesNotes && !matchesTags) return false;
      }

      return true;
    });
  }, [nodes, activeTab, priorityFilter, tagFilter, searchQuery, todayStr]);

  // Grouping options as a clean, nested structure!
  const taskTreeRoots = useMemo(() => {
    // 1. Map of IDs -> tree items
    const itemMap = new Map<string, TaskTreeItem>();

    // Prepare sort properties for tasks (TickTick priorities and due dates)
    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
    const sortedNodes = [...filteredNodes].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      const weightA = priorityWeight[a.priority] || 0;
      const weightB = priorityWeight[b.priority] || 0;
      if (weightA !== weightB) {
        return weightB - weightA; // Higher weight first
      }
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.text.localeCompare(b.text);
    });

    sortedNodes.forEach(node => {
      itemMap.set(node.id, { node, children: [] });
    });

    const roots: TaskTreeItem[] = [];

    // 2. Nest children correctly if parent is also visible, otherwise treat as Root
    sortedNodes.forEach(node => {
      const currentItem = itemMap.get(node.id)!;
      if (node.parentId && itemMap.has(node.parentId)) {
        const parentItem = itemMap.get(node.parentId)!;
        parentItem.children.push(currentItem);
      } else {
        roots.push(currentItem);
      }
    });

    return roots;
  }, [filteredNodes]);

  // Aggregate stats (Tasks, not container nodes)
  const totalCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle).length;
  const completedCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && n.completed).length;
  const activeCount = totalCount - completedCount;
  const todayCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.completed && n.dueDate === todayStr).length;
  const overdueCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.completed && n.dueDate && n.dueDate < todayStr).length;

  // Toggle tag selection for quick input
  const handleToggleTagInNewTask = (tag: string) => {
    setNewTaskTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleParentCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedParents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Recursive element renderer for nestable tasks
  const renderTreeItem = (item: TaskTreeItem, depth: number = 0): React.ReactNode => {
    const { node, children } = item;
    const pMeta = priorityMap[node.priority] || priorityMap.none;
    const isSelected = selectedNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    const isCollapsed = !!collapsedParents[node.id];
    const allDirectChildren = childrenByParentId[node.id] || [];

    // Subtask styling offset and container card margin
    const mlClass = depth > 0 ? 'ml-3 mt-1' : 'mt-1.5';

    return (
      <div key={node.id} className={`${mlClass} flex flex-col`}>
        <div
          id={`mobile-task-card-${node.id}`}
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOverCard(e, node.id)}
          onDragLeave={handleDragLeaveCard}
          onDragEnd={handleDragEnd}
          onDrop={(e) => handleDropOnCard(e, node.id)}
          className={`border rounded-xl p-1.5 px-2.5 transition-[background-color,border-color,opacity,box-shadow] duration-150 flex flex-col gap-1 relative select-none ${
            draggedNodeId === node.id
              ? 'pointer-events-none opacity-30 border-dashed border-indigo-400 bg-slate-50 dark:bg-slate-950'
              : dragOverNodeId === node.id
                ? 'border-dashed border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30 shadow-md'
                : isSelected 
                  ? 'bg-indigo-55/10 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/40' 
                  : node.archived
                    ? 'bg-amber-50/5 border-dashed border-amber-300 dark:bg-amber-955/2 dark:border-amber-900/40 opacity-60 saturate-60'
                    : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800'
          } ${node.completed ? 'opacity-70' : ''}`}
        >
          {/* Connector guide line for nested subtasks */}
          {depth > 0 && (
            <div className="absolute left-[-16px] top-4 w-[16px].0 h-3 border-l-2 border-b-2 border-slate-250 dark:border-slate-800 rounded-bl-lg pointer-events-none" />
          )}

          {/* Visual Overlay Drop-zone Cue */}
          {dragOverNodeId === node.id && (
            <div className="absolute inset-0 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center border-2 border-indigo-500 border-dashed pointer-events-none z-10 animate-pulse">
              <span className="text-[10px] font-bold text-indigo-700 bg-white dark:text-indigo-300 dark:bg-slate-900 px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-indigo-150">
                📥 Сделать подзадачей
              </span>
            </div>
          )}

          {/* Flex Container linking Drag handle with card content */}
          <div className="flex items-start gap-1 w-full relative">
            {/* Grip handle outside the pointer-events-none area */}
            {!isEditing && (
              <div
                onPointerDown={(e) => handlePointerDown(e, node.id)}
                onPointerMove={(e) => handlePointerMove(e, node.id)}
                onPointerUp={(e) => handlePointerUp(e, node.id)}
                onPointerCancel={(e) => handlePointerCancel(e, node.id)}
                className="p-1 text-slate-350 dark:text-slate-650 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-grab active:cursor-grabbing transition-colors shrink-0 mt-0.5 select-none touch-none"
                style={{ touchAction: 'none' }}
                title="Удерживайте для перемещения"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Pointer Events Wrapper to prevent drag-flicker on inner children */}
            <div className={`flex-1 flex flex-col gap-1 min-w-0 ${draggedNodeId !== null ? 'pointer-events-none' : ''}`}>

              <div className="flex items-center gap-2 justify-between">
                {/* Tick Checkbox & title container */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Expand/Collapse Toggle if there are sub-elements in the list */}
                  {children.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => toggleParentCollapse(node.id, e)}
                      className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
                      title={isCollapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                  )}

                  {/* Checkbox button */}
                  <button
                    type="button"
                    onClick={() => handleToggleCompleted(node)}
                    className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                      node.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : activePomodoroNodeId === node.id
                          ? 'border-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse'
                          : `border-slate-300 hover:border-indigo-500 dark:border-slate-700`
                    }`}
                    title={node.completed ? 'Восстановить' : 'Завершить'}
                    style={!node.completed ? { borderColor: pMeta.value !== 'none' ? pMeta.text.replace('text-', '') : undefined } : undefined}
                  >
                    {node.completed ? (
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    ) : activePomodoroNodeId === node.id ? (
                      <Loader2 className="w-2.5 h-2.5 text-rose-500 animate-spin" />
                    ) : null}
                  </button>

                  {/* Core Text Label */}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveInlineEdit(node);
                            if (e.key === 'Escape') setEditingNodeId(null);
                          }}
                          className="w-full bg-slate-100 dark:bg-slate-800 border border-indigo-500 rounded px-1.5 py-0.5 text-[11px] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineEdit(node)}
                          className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded"
                        >
                          ОК
                        </button>
                      </div>
                    ) : (
                      <div 
                        className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 cursor-pointer pr-1.5 break-words flex items-center flex-wrap gap-1.5"
                        onClick={(e) => {
                          onSelectNode(node.id, e);
                        }}
                      >
                        <span className={node.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal font-sans' : 'font-sans'}>
                          {node.text}
                        </span>

                        {node.archived && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateNode({
                                ...node,
                                archived: false
                              });
                            }}
                            className="shrink-0 inline-flex items-center gap-1 text-[8.5px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-500/20 hover:border-amber-500/40 select-none cursor-pointer hover:scale-105 transition-all"
                            title="Нажмите, чтобы вернуть задачу из архива"
                          >
                            📦 Архив (Вернуть)
                          </button>
                        )}

                        {node.externalLink && (
                          <a
                            href={node.externalLink.startsWith('http') ? node.externalLink : `https://${node.externalLink}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center p-1 hover:bg-slate-150 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                            title={`Открыть внешнюю ссылку: ${node.externalLink}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {activePomodoroNodeId === node.id && (
                          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded-md text-[10px] font-sans font-extrabold animate-pulse ml-0.5 shrink-0 border border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" title="Запущена фокусировка Pomodoro">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                            </span>
                            <span>🍅</span>
                          </span>
                        )}

                        {/* Highly compressed inline metadata on main line to avoid extra height lines */}
                        <div className="inline-flex items-center gap-1.5 text-[9.5px] font-mono select-none">
                          {node.priority !== 'none' && (
                            <span className={`px-1 rounded-sm font-bold text-[9px] uppercase border ${pMeta.bg} ${pMeta.border} ${pMeta.text}`}>
                              {node.priority}
                            </span>
                          )}

                          {node.text.toLowerCase().includes('важн') && node.priority === 'none' && (
                            <span className="px-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[8.5px] font-bold rounded-sm uppercase">важно</span>
                          )}

                          {node.dueDate && (
                            <span className={`flex items-center gap-1 px-1 rounded-sm border ${
                              !node.completed && node.dueDate < todayStr
                                ? 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-955/20 dark:border-rose-900/30'
                                : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                            }`}>
                              <span>{node.dueDate}</span>
                            </span>
                          )}

                          {nodeChildrenCountMap[node.id] > 0 && (
                            <span className="text-indigo-600 dark:text-indigo-400 font-sans font-bold bg-slate-100 dark:bg-slate-800 px-1 rounded text-[9px]">
                              {nodeChildrenCompletedCountMap[node.id] || 0}/{nodeChildrenCountMap[node.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Micro Controls Action Panel */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartInlineEdit(node)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-55/40 dark:hover:bg-slate-800 cursor-pointer"
                    title="Редактировать текст"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirmDeleteNodeId === node.id) {
                        onDeleteNode(node.id);
                        setConfirmDeleteNodeId(null);
                      } else {
                        setConfirmDeleteNodeId(node.id);
                        setTimeout(() => setConfirmDeleteNodeId(curr => curr === node.id ? null : curr), 4000);
                      }
                    }}
                    className={`p-1 rounded-md transition-all duration-200 cursor-pointer flex items-center gap-0.5 ${
                      confirmDeleteNodeId === node.id
                        ? "text-white bg-rose-600 hover:bg-rose-700 px-1.5 text-[9px] font-bold animate-pulse"
                        : "text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/25"
                    }`}
                    title={confirmDeleteNodeId === node.id ? "Подтвердите удаление" : "Удалить задачу"}
                  >
                    {confirmDeleteNodeId === node.id ? "Удалить?" : <Trash2 className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onFocusTaskOnCanvas) {
                        onFocusTaskOnCanvas(node.id);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 rounded-md hover:bg-slate-55/40 dark:hover:bg-slate-800 cursor-pointer"
                    title="Фокусировать эту задачу на холсте"
                  >
                    <Target className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      onSelectNode(node.id === selectedNodeId ? null : node.id, e);
                    }}
                    className={`p-1 rounded-md border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-650 text-white border-transparent'
                        : 'bg-slate-5 border-slate-200 text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                    }`}
                    title={isSelected ? "Свернуть свойства" : "Свойства и список подзадач"}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Subtags listed in details line when NOT editing */}
              {(!isEditing && ((node.tags && node.tags.length > 0) || node.notes)) && (
                <div className="flex flex-wrap items-center gap-1.5 ml-6.5 text-[10px] text-slate-400 font-mono">
                  {node.tags && node.tags.map(t => (
                    <span key={t} className="px-1 bg-indigo-5/50 dark:bg-indigo-95/20 text-indigo-500 border border-indigo-100/40 text-[9px] rounded-sm font-sans">
                      #{t}
                    </span>
                  ))}
                  {node.notes && (
                    <span className="flex items-center gap-1 font-sans italic max-w-[150px] truncate text-[10px]">
                      <FileText className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{node.notes}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Inline Expanded Manager for attributes, dates, and direct child tasks checklist */}
              {isSelected && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-150 dark:border-slate-800/80 space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Приоритет:</span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(['low', 'medium', 'high', 'urgent'] as Priority[]).map((pr) => {
                          const active = node.priority === pr;
                          const label = pr === 'low' ? 'Низкий' : pr === 'medium' ? 'Средний' : pr === 'high' ? 'Высокий' : 'Срочный';
                          return (
                            <button
                              key={pr}
                              type="button"
                              onClick={() => handleUpdatePriority(node, pr)}
                              className={`px-1.5 py-0.5 text-[9.5px] font-bold rounded cursor-pointer border ${
                                active 
                                  ? 'bg-slate-900 border-transparent text-white dark:bg-white dark:text-black' 
                                  : 'bg-slate-55 mb-1 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-705 dark:text-slate-400'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Срок выполнения:</span>
                      <input
                        type="date"
                        value={node.dueDate || ''}
                        onChange={(e) => handleUpdateDueDate(node, e.target.value)}
                        className="mt-1 w-full bg-slate-55/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 text-xs text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                  </div>

                  {/* Tactile Parent Dropdown Selector for frictionless Nesting and Organization */}
                  <div className="bg-slate-100/40 dark:bg-slate-900/40 rounded-lg p-2 border border-slate-200/50 dark:border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Родительская задача (Иерархия):</span>
                    <select
                      id={`mobile-task-parent-select-${node.id}`}
                      value={node.parentId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateNode({
                          ...node,
                          parentId: val ? val : null,
                          isFloating: false
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-1 px-1.5 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">(Сделать главной задачей — нет родителя)</option>
                      {nodes
                        .filter((n) => n.id !== node.id && !n.isContainer && !n.isWorkflowRectangle && !isDescendant(n.id, node.id))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.text}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Subtask checklist with quick add input for absolute TickTick experience */}
                  <div className="pt-2.5 border-t border-slate-150 dark:border-slate-800/50">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Список подзадач:</span>
                      <span className="text-[9.5px] font-mono text-slate-500">
                        Всего подзадач: {allDirectChildren.length}
                      </span>
                    </div>

                    {allDirectChildren.length > 0 && (
                      <div className="max-h-[160px] overflow-y-auto space-y-1 mb-2 bg-slate-55/40 dark:bg-slate-850 p-2 rounded-lg divide-y divide-slate-100 dark:divide-slate-800/40">
                        {allDirectChildren.map((child) => (
                          <div key={child.id} className="flex items-center justify-between py-1 first:pt-0 last:pb-0 gap-2 text-xs">
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(child.id, e);
                              }}
                              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded duration-150 py-0.5 px-1"
                              title="Открыть свойства подзадачи"
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCompleted(child);
                                }}
                                className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                  child.completed
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : activePomodoroNodeId === child.id
                                      ? 'border-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse'
                                      : 'border-slate-300 dark:border-slate-700'
                                }`}
                              >
                                {child.completed ? (
                                  <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                ) : activePomodoroNodeId === child.id ? (
                                  <Loader2 className="w-2.5 h-2.5 text-rose-500 animate-spin" />
                                ) : null}
                              </button>
                              <span className={`truncate min-w-0 ${child.completed ? 'line-through text-slate-400 font-normal' : 'text-slate-700 dark:text-slate-300 font-medium'}`}>
                                {child.text}
                              </span>
                              {child.dueDate && (
                                <span className={`shrink-0 flex items-center gap-1 text-[9px] px-1 py-0.5 rounded-sm border ${
                                  !child.completed && child.dueDate < todayStr
                                    ? 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-955/20 dark:border-rose-900/30'
                                    : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                                }`}>
                                  <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span>{child.dueDate}{child.dueTime ? ` ${child.dueTime}` : ''}</span>
                                </span>
                              )}
                              {child.externalLink && (
                                <a
                                  href={child.externalLink.startsWith('http') ? child.externalLink : `https://${child.externalLink}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                                  title={`Открыть внешнюю ссылку: ${child.externalLink}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-indigo-505" />
                                </a>
                              )}
                            </div>
                            <button
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (confirmDeleteSubtaskId === child.id) {
                                   onDeleteNode(child.id);
                                   setConfirmDeleteSubtaskId(null);
                                 } else {
                                   setConfirmDeleteSubtaskId(child.id);
                                   setTimeout(() => setConfirmDeleteSubtaskId(curr => curr === child.id ? null : curr), 4000);
                                 }
                               }}
                               className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Subtask inline quick add text box */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const subVal = newSubtaskTexts[node.id] || '';
                        if (!subVal.trim()) return;
                        handleAddSubtaskSubmit(node.id, subVal);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={newSubtaskTexts[node.id] || ''}
                        onChange={(e) => setNewSubtaskTexts(prev => ({ ...prev, [node.id]: e.target.value }))}
                        placeholder="Добавить новую подзадачу..."
                        className="flex-1 bg-slate-55 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={!(newSubtaskTexts[node.id] || '').trim()}
                        className="px-3 py-1 bg-indigo-600 disabled:opacity-40 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer transition-all"
                      >
                        Добавить
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div> {/* End pointer-events-none wrapper */}
          </div> {/* End tactile flex container */}
        </div>

        {/* Display child items list recursively */}
        {children.length > 0 && !isCollapsed && (
          <div className="space-y-1">
            {children.map(childItem => renderTreeItem(childItem, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      id="mobile-ticktick-view" 
      className={`flex flex-col bg-slate-50 dark:bg-slate-950 transition-all duration-200 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'w-full h-full'
      }`}
    >
      
      {/* Super Compact Mobile-Adapted Dashboard Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 shrink-0 transition-all">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest whitespace-nowrap pl-1 shrink-0">
            Задачи
          </h2>
          <div className="text-[10px] text-slate-400 font-mono flex items-center justify-end gap-x-2 gap-y-0.5 pr-1 flex-1 flex-wrap min-w-0">
            <span className="whitespace-nowrap">Актив.: <strong className="font-bold text-slate-700 dark:text-slate-200">{activeCount}</strong></span>
            <span className="whitespace-nowrap">Проср.: <strong className="font-bold text-rose-500">{overdueCount}</strong></span>
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className={`p-1 rounded-sm border cursor-pointer select-none transition-all outline-none flex items-center justify-center shrink-0 ${
                isFullScreen 
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400' 
                  : 'bg-slate-50 hover:bg-slate-105 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
              title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Tab Selection Row like TickTick */}
        <div className="flex gap-1.5 mt-1.5 overflow-x-auto pb-0.5 scrollbar-none select-none">
          {[
            { id: 'active', label: 'В работе', count: activeCount },
            { id: 'today', label: 'Сегодня', count: todayCount, icon: Clock },
            { id: 'overdue', label: 'Просрочено', count: overdueCount },
            { id: 'completed', label: 'Готово', count: completedCount },
            { id: 'all', label: 'Все', count: totalCount }
          ].map((tab) => {
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  onSelectNode(null);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all ${
                  isTabActive 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'bg-slate-100 text-slate-600 hover:text-slate-950 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.icon && <tab.icon className="w-3 h-3" />}
                <span>{tab.label}</span>
                <span className={`px-1 rounded-sm text-[9px] ${isTabActive ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced filters & text search block (Highly compressed with toggling selects) */}
      <div className="p-2 bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800/80 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="absolute left-2 top-2.5 text-slate-400 pointer-events-none">
                <Search className="w-3 h-3" />
              </span>
              <input
                id="mobile-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию или тегам..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-6 pr-14 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                  {searchResults.length > 0 && (
                    <span className="text-[10px] text-slate-400/80 font-mono font-medium select-none pointer-events-none">
                      {mobileSearchIndex + 1}/{searchResults.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold w-4 h-4 flex items-center justify-center rounded-full"
                    title="Очистить поиск"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {searchResults.length > 1 && (
              <button
                type="button"
                onClick={handleNextMobileSearchMatch}
                className="p-1 px-1.5 rounded-lg border bg-indigo-50 border-indigo-200 dark:bg-indigo-950/45 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold cursor-pointer shrink-0 transition-all flex items-center gap-0.5 shadow-xs"
                title="Перейти к следующей задаче"
              >
                <span>След.</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(f => !f)}
            className={`p-1 px-1.5 rounded-lg border flex items-center gap-1 cursor-pointer transition-all text-xs font-semibold ${
              showFilters || priorityFilter !== 'all' || tagFilter !== 'all'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900/40 dark:text-indigo-400'
                : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500 hover:text-slate-700'
            }`}
            title="Фильтры по приоритетам и тегам"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Фильтры</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTagsManager(true)}
            className="p-1 px-1.5 rounded-lg border bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer transition-all text-xs font-semibold shrink-0"
            title="Управление тегами и категориями"
          >
            <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Теги</span>
          </button>
        </div>

        {/* Dropdowns visible only when toggled */}
        {(showFilters || priorityFilter !== 'all' || tagFilter !== 'all') && (
          <div className="grid grid-cols-2 gap-2 pb-0.5 pt-0.5 animate-fadeIn">
            {/* Priority options selector */}
            <div className="relative">
              <span className="absolute left-2 top-2 text-slate-400 pointer-events-none">
                <Flag className="w-3 h-3" />
              </span>
              <select
                id="mobile-priority-select"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-6 pr-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Все приоритеты</option>
                <option value="urgent">Срочно 🔥</option>
                <option value="high">Высокий 🔴</option>
                <option value="medium">Средний 🟡</option>
                <option value="low">Низкий 🔵</option>
              </select>
            </div>

            {/* Tag choice selector */}
            <div className="relative">
              <span className="absolute left-2 top-2 text-slate-400 pointer-events-none">
                <Tag className="w-3 h-3" />
              </span>
              <select
                id="mobile-tag-select"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-6 pr-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Все теги</option>
                {tagCategories.flatMap(c => c.tags || []).map(tag => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main interactive Tasks container */}
      <div 
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 relative"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={handleDropOnBackground}
      >
        {/* Help tooltip and Touch de-nesting dropzone when dragging a task */}
        {draggedNodeId !== null && (
          <div 
            id="mobile-task-root-dropzone"
            className={`sticky top-1 mx-auto text-center w-full max-w-md p-3 border-2 border-dashed rounded-xl transition-all duration-150 z-20 shadow-md ${
              dragOverNodeId === 'background_root_zone'
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold scale-[1.01]'
                : 'border-slate-300 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400'
            }`}
            style={{ touchAction: 'none' }}
          >
            <span className="text-[10px] font-bold tracking-wide uppercase flex items-center justify-center gap-1.5 select-none">
              📂 Перетащите сюда, чтобы сделать задачу главной
            </span>
          </div>
        )}

        {taskTreeRoots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-slate-400 h-full">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-850 rounded-full flex items-center justify-center mb-3">
              <CheckSquare className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Список пуст</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Нет задач соответствующих фильтрам. Добавьте первую задачу с помощью простой мобильной панели ниже!
            </p>
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {taskTreeRoots.map(item => renderTreeItem(item, 0))}
          </div>
        )}
      </div>

      {/* Modern Quick Task Creator - Fixed Mobile Pane at the bottom (TickTick essence!) */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 shadow-lg select-none">
        <form onSubmit={handleAddTaskSubmit} className="space-y-0.5">
          <div className="flex items-center gap-2">
            <input
              id="mobile-quick-task-text"
              type="text"
              value={newTaskText}
              onChange={(e) => {
                setNewTaskText(e.target.value);
                if (e.target.value.trim() && !showQuickOptions) {
                  setShowQuickOptions(true);
                }
              }}
              onFocus={() => setShowQuickOptions(true)}
              placeholder="Новая главная задача..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            
            <button
              type="button"
              onClick={() => setShowQuickOptions(!showQuickOptions)}
              className={`p-2.5 rounded-xl transition-all cursor-pointer border shrink-0 flex items-center justify-center ${
                showQuickOptions 
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-450' 
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
              }`}
              title={showQuickOptions ? "Скрыть настройки" : "Дополнительные параметры"}
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>

            <button
              id="mobile-quick-task-submit"
              type="submit"
              disabled={!newTaskText.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-all shadow-xs cursor-pointer shrink-0 flex items-center justify-center"
              title="Добавить"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Context Options panel (Priority, Date, Tags selection) - COLLAPSIBLE via Framer Motion */}
          <AnimatePresence initial={false}>
            {showQuickOptions && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-1 xs:flex-row xs:items-center xs:justify-between border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    
                    {/* Priority Select inside input frame */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-150 dark:border-slate-700 max-w-[130px] shrink-0 min-w-0">
                      <Flag className="w-3.5 h-3.5 text-indigo-505 shrink-0" />
                      <select
                        id="mobile-quick-priority"
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                        className="bg-transparent border-none text-[11px] font-bold text-slate-600 dark:text-slate-350 focus:outline-none cursor-pointer w-full"
                      >
                        <option value="low">Низкий 🔵</option>
                        <option value="medium">Средний 🟡</option>
                        <option value="high">Высокий 🔴</option>
                        <option value="urgent">Срочно 🔥</option>
                      </select>
                    </div>

                    {/* Date Select inside input frame */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-150 dark:border-slate-700 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-emerald-555 shrink-0" />
                      <input
                        id="mobile-quick-date"
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="bg-transparent border-none text-[11px] text-slate-600 dark:text-slate-350 focus:outline-none focus:ring-0 w-[110px]"
                      />
                    </div>

                  </div>

                  {/* Quick tags selection selector */}
                  {tagCategories.length > 0 && (
                    <div className="flex gap-1 max-w-[200px] overflow-x-auto pb-0.5 scrollbar-none select-none">
                      {tagCategories.flatMap(c => c.tags || []).slice(0, 5).map(tag => {
                        const isSelected = newTaskTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleTagInNewTask(tag)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap cursor-pointer border transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-transparent text-white'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* Tags & Categories Manager bottom overlay sheet */}
      {showTagsManager && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fadeIn">
          <div 
            className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs" 
            onClick={() => setShowTagsManager(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl p-4 flex flex-col max-h-[85vh] z-10 animate-slideUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">
                  Теги и категории
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTagsManager(false)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Готово
              </button>
            </div>

            {/* Scrollable area */}
            <div className="flex-1 overflow-y-auto space-y-4 pb-8 pr-1">
              
              {/* Add New Category quick section */}
              <div className="bg-slate-50 dark:bg-slate-850/60 border border-slate-100 dark:border-slate-800/60 rounded-xl p-3">
                {!showAddCatForm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCatForm(true);
                      setNewCatName('');
                      setNewCatColor('#6366f1');
                    }}
                    className="w-full py-2 border border-dashed border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50/30 rounded-lg text-indigo-100 dark:text-indigo-400 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-505" />
                    <span className="text-indigo-650 dark:text-indigo-400 font-bold">Создать категорию тегов</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">Новая категория</span>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Название (например: Этап, Приоритет)..."
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                    />

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">Цвет</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          '#ef4444', '#f59e0b', '#10b981', '#14b8a6', 
                          '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
                        ].map(hex => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setNewCatColor(hex)}
                            style={{ backgroundColor: hex }}
                            className={`w-5 h-5 rounded-full transition-all cursor-pointer ${
                              newCatColor === hex ? 'scale-125 ring-2 ring-indigo-550' : 'hover:scale-110'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddCatForm(false)}
                        className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-705 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (newCatName.trim() && onCreateTagCategory) {
                            onCreateTagCategory(newCatName.trim(), newCatColor);
                            setNewCatName('');
                            setShowAddCatForm(false);
                          }
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Создать
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tag Categories List */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider block">Существующие категории</span>
                {tagCategories.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    Категории тегов отсутствуют
                  </div>
                ) : (
                  tagCategories.map(cat => {
                    const isEditing = editingCategoryTagId === cat.id;
                    const isAddingTag = addingTagToCatId === cat.id;
                    const isExpanded = !expandedCatIds[cat.id]; // default expanded

                    return (
                      <div
                        key={cat.id}
                        className="border border-slate-150 dark:border-slate-800/80 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-2"
                      >
                        {/* Title block */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingCategoryTagName}
                              onChange={(e) => setEditingCategoryTagName(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-bold"
                            />
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {[
                                '#ef4444', '#f59e0b', '#10b981', '#14b8a6', 
                                '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
                              ].map(hex => (
                                <button
                                  key={hex}
                                  type="button"
                                  onClick={() => setEditingCategoryTagColor(hex)}
                                  style={{ backgroundColor: hex }}
                                  className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                                    editingCategoryTagColor === hex ? 'scale-125 ring-2 ring-indigo-500' : 'hover:scale-110'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingCategoryTagId(null)}
                                className="px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-700 bg-slate-50 dark:bg-slate-800 rounded"
                              >
                                Отмена
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingCategoryTagName.trim() && onUpdateTagCategory) {
                                    onUpdateTagCategory(cat.id, editingCategoryTagName.trim(), editingCategoryTagColor, cat.tags || []);
                                    setEditingCategoryTagId(null);
                                  }
                                }}
                                className="px-2 py-0.5 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold"
                              >
                                Сохранить
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div 
                              className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none py-1 flex-1"
                              onClick={() => {
                                setExpandedCatIds(prev => ({ ...prev, [cat.id]: !prev[cat.id] }));
                              }}
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">{cat.name}</span>
                              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCategoryTagId(cat.id);
                                  setEditingCategoryTagName(cat.name);
                                  setEditingCategoryTagColor(cat.color);
                                }}
                                className="text-[10px] py-1 px-1.5 font-bold text-indigo-650 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-850 rounded transition-colors"
                              >
                                Изм.
                              </button>
                              {onDeleteTagCategory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirmDeleteCatId === cat.id) {
                                      onDeleteTagCategory(cat.id);
                                      setConfirmDeleteCatId(null);
                                    } else {
                                      setConfirmDeleteCatId(cat.id);
                                      setTimeout(() => setConfirmDeleteCatId(curr => curr === cat.id ? null : curr), 4000);
                                    }
                                  }}
                                  className={`text-[10px] py-1 px-1.5 rounded transition-all cursor-pointer font-bold ${
                                    confirmDeleteCatId === cat.id
                                      ? "text-white bg-rose-600 px-2 animate-pulse"
                                      : "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20"
                                  }`}
                                  title={confirmDeleteCatId === cat.id ? "Нажмите еще раз для подтверждения" : "Удалить категорию"}
                                >
                                  {confirmDeleteCatId === cat.id ? "Удалить?" : "Удал."}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Expandable tags body */}
                        {isExpanded && !isEditing && (
                          <div className="space-y-2 pt-1 border-t border-slate-50 dark:border-slate-800/50">
                            {/* Tags bubble list */}
                            <div className="flex flex-wrap gap-1">
                              {(cat.tags || []).length === 0 ? (
                                <span className="text-[10px] text-slate-400 italic">Теги отсутствуют</span>
                              ) : (
                                (cat.tags || []).map(t => (
                                  <div
                                    key={t}
                                    className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded px-2 py-0.5 text-[10px] font-sans text-slate-600 dark:text-slate-350"
                                  >
                                    <span>#{t}</span>
                                    {onUpdateTagCategory && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const filtered = (cat.tags || []).filter(item => item !== t);
                                          onUpdateTagCategory(cat.id, cat.name, cat.color, filtered);
                                        }}
                                        className="text-slate-400 hover:text-rose-500 font-bold ml-1 text-xs shrink-0 w-3 h-3 flex items-center justify-center cursor-pointer"
                                        title="Удалить тег"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Add inline tag form */}
                            {onUpdateTagCategory && (
                              <div className="pt-1 select-none">
                                {isAddingTag ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <input
                                      type="text"
                                      placeholder="Новый тег (без пробелов)..."
                                      value={newTagNameInput}
                                      onChange={(e) => setNewTagNameInput(e.target.value.replace(/\s+/g, '-'))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const tagText = newTagNameInput.trim().replace(/#/g, '');
                                          if (tagText) {
                                            const updated = Array.from(new Set([...(cat.tags || []), tagText]));
                                            onUpdateTagCategory(cat.id, cat.name, cat.color, updated);
                                          }
                                          setNewTagNameInput('');
                                          setAddingTagToCatId(null);
                                        }
                                        if (e.key === 'Escape') {
                                          setAddingTagToCatId(null);
                                        }
                                      }}
                                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] focus:ring-1 focus:ring-indigo-500 focus:outline-none flex-1 font-sans text-slate-850 dark:text-slate-100"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setAddingTagToCatId(null)}
                                      className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-500"
                                    >
                                      Отмена
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const tagText = newTagNameInput.trim().replace(/#/g, '');
                                        if (tagText) {
                                          const updated = Array.from(new Set([...(cat.tags || []), tagText]));
                                          onUpdateTagCategory(cat.id, cat.name, cat.color, updated);
                                        }
                                        setNewTagNameInput('');
                                        setAddingTagToCatId(null);
                                      }}
                                      className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white font-bold rounded"
                                    >
                                      ОК
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingTagToCatId(cat.id);
                                      setNewTagNameInput('');
                                    }}
                                    className="text-[10px] font-bold text-indigo-650 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Plus className="w-2.5 h-2.5" /> Добавить тег
                                  </button>
                                )}
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
