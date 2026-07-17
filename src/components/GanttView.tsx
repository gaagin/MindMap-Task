import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Folder, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  Circle, 
  Sparkles,
  AlignLeft,
  Settings,
  MoreHorizontal,
  Calendar,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  CornerDownRight,
  X
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface TreeTaskItem {
  task: TaskNode;
  depth: number;
  parent: TaskNode | null;
}

interface ActiveDrag {
  taskId: string;
  type: 'move' | 'resize-start' | 'resize-end';
  initialStart: number;
  initialEnd: number;
  currentStart: number;
  currentEnd: number;
}

function buildTaskTree(allTasks: TaskNode[], sortMode: string, collapsedTaskIds?: Set<string>): TreeTaskItem[] {
  const taskMap = new Map<string, TaskNode>();
  allTasks.forEach(t => taskMap.set(t.id, t));

  const roots = allTasks.filter(t => !t.parentId || !taskMap.has(t.parentId));

  const getSortDateValue = (t: TaskNode) => {
    if (sortMode === 'startDate') {
      return t.startDate || t.dueDate || '9999-12-31';
    } else if (sortMode === 'dueDate') {
      return t.dueDate || t.startDate || '9999-12-31';
    }
    return t.y !== undefined ? String(t.y).padStart(6, '0') : t.text;
  };

  const sortCompare = (a: TaskNode, b: TaskNode) => {
    const valA = getSortDateValue(a);
    const valB = getSortDateValue(b);
    if (valA < valB) return -1;
    if (valA > valB) return 1;
    return a.text.localeCompare(b.text);
  };

  if (sortMode === 'flatStartDate' || sortMode === 'flatDueDate') {
    const sortedTasks = [...allTasks].sort((a, b) => {
      const d1 = sortMode === 'flatStartDate' ? (a.startDate || a.dueDate || '9999-12-31') : (a.dueDate || a.startDate || '9999-12-31');
      const d2 = sortMode === 'flatStartDate' ? (b.startDate || b.dueDate || '9999-12-31') : (b.dueDate || b.startDate || '9999-12-31');
      if (d1 !== d2) return d1.localeCompare(d2);
      return a.text.localeCompare(b.text);
    });

    return sortedTasks.map(t => {
      const parent = t.parentId ? taskMap.get(t.parentId) || null : null;
      return {
        task: t,
        depth: parent ? 1 : 0,
        parent
      };
    });
  }

  if (sortMode === 'startDate' || sortMode === 'dueDate') {
    roots.sort(sortCompare);
  } else {
    roots.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  }

  const result: TreeTaskItem[] = [];
  const visited = new Set<string>();
  const skippedIds = new Set<string>();

  const traverse = (node: TaskNode, depth: number, parent: TaskNode | null) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    result.push({ task: node, depth, parent });
    
    if (collapsedTaskIds && collapsedTaskIds.has(node.id)) {
      const collectDescendants = (nId: string) => {
        const children = allTasks.filter(t => t.parentId === nId);
        children.forEach(c => {
          skippedIds.add(c.id);
          collectDescendants(c.id);
        });
      };
      collectDescendants(node.id);
      return;
    }

    const children = allTasks.filter(t => t.parentId === node.id);
    if (sortMode === 'startDate' || sortMode === 'dueDate') {
      children.sort(sortCompare);
    } else {
      children.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    }

    children.forEach(child => {
      traverse(child, depth + 1, node);
    });
  };

  roots.forEach(root => {
    traverse(root, 0, null);
  });

  const processedIds = new Set(result.map(item => item.task.id));
  const orphans = allTasks.filter(t => !processedIds.has(t.id) && !skippedIds.has(t.id));
  if (orphans.length > 0) {
    if (sortMode === 'startDate' || sortMode === 'dueDate') {
      orphans.sort(sortCompare);
    }
    orphans.forEach(o => {
      if (!processedIds.has(o.id) && !skippedIds.has(o.id)) {
        traverse(o, 0, null);
      }
    });
  }

  return result;
}

interface GanttViewProps {
  nodes: TaskNode[];
  allNodes?: TaskNode[];
  setViewMode?: (mode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower') => void;
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  focusedTaskId?: string | null;
  onFocusedTaskIdChange?: (id: string | null) => void;
}

export default function GanttView({
  nodes,
  allNodes,
  setViewMode,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onFullScreenChange,
  focusedTaskId,
  onFocusedTaskIdChange
}: GanttViewProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sortMode, setSortMode] = useState<'hierarchy' | 'startDate' | 'dueDate' | 'flatStartDate' | 'flatDueDate'>('hierarchy');
  const [zoomTaskId, setZoomTaskId] = useState<string | null>(null);

  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => {
    const parentIds = new Set<string>();
    nodes.forEach(node => {
      if (node.parentId && !node.isContainer && !node.isWorkflowRectangle) {
        parentIds.add(node.parentId);
      }
    });
    return parentIds;
  });

  const toggleCollapse = (taskId: string) => {
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // States and refs for interactive drag-to-move and drag-to-resize
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const activeDragRef = useRef<(ActiveDrag & { colWidth: number; startX: number }) | null>(null);
  const dragHasMovedRef = useRef(false);
  const dragStartMousePosRef = useRef({ x: 0, y: 0 });

  // State for dragging unscheduled tasks from task list to timeline
  const [taskNameDrag, setTaskNameDrag] = useState<{
    taskId: string;
    taskText: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  const [hoveredDateIndex, setHoveredDateIndex] = useState<number | null>(null);

  const currentZoomTaskId = focusedTaskId !== undefined ? focusedTaskId : zoomTaskId;

  const handleZoomTaskIdChange = (id: string | null) => {
    if (onFocusedTaskIdChange) {
      onFocusedTaskIdChange(id);
    } else {
      setZoomTaskId(id);
    }
  };

  const triggerDoubleClickAction = (taskId: string) => {
    const nodesList = allNodes || nodes;
    const hasSubtasks = nodesList.some(
      n => n.parentId === taskId && !n.isNotTask && !n.isContainer && !n.isWorkflowRectangle
    );

    if (hasSubtasks) {
      handleZoomTaskIdChange(taskId);
    } else {
      if (setViewMode) {
        setViewMode('canvas');
      }
      handleZoomTaskIdChange(taskId);
    }
  };

  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTaskClick = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragHasMovedRef.current) {
      return;
    }
    const isMobile = window.innerWidth < 1024;

    if (isMobile) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
        triggerDoubleClickAction(taskId);
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          onSelectNode(taskId, e);
          clickTimeoutRef.current = null;
        }, 250);
      }
    } else {
      onSelectNode(taskId, e);
    }
  };

  const handleTaskDoubleClick = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isMobile = window.innerWidth < 1024;
    if (!isMobile) {
      triggerDoubleClickAction(taskId);
    }
  };

  const handleTaskNameMouseDown = (e: React.MouseEvent, taskId: string, taskText: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setTaskNameDrag({
      taskId,
      taskText,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: false
    });
    setHoveredDateIndex(null);
  };

  const handleTaskNameTouchStart = (e: React.TouchEvent, taskId: string, taskText: string) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    const touch = e.touches[0];
    setTaskNameDrag({
      taskId,
      taskText,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      isDragging: false
    });
    setHoveredDateIndex(null);
  };

  useEffect(() => {
    setZoomTaskId(null);
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, [activeProjectId]);

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

  // Collapsible state for left task list panel (saves state to localStorage)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('gantt_left_panel_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleLeftPanel = () => {
    setIsLeftPanelCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gantt_left_panel_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Timeline zoom/scale configuration
  // Show 28 days around "Today" to give a highly optimized view density
  const [baseDate, setBaseDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 5); // start 5 days ago
    return today;
  });

  const [activeInlineAddInput, setActiveInlineAddInput] = useState(false);
  const [newInlineTaskText, setNewInlineTaskText] = useState('');

  // Symmetrical scroll synchronization refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingLeft = useRef(false);
  const isScrollingRight = useRef(false);

  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollingRight.current) return;
    isScrollingLeft.current = true;
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    setTimeout(() => {
      isScrollingLeft.current = false;
    }, 50);
  };

  const handleRightScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollingLeft.current) return;
    isScrollingRight.current = true;
    if (leftScrollRef.current) {
      leftScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    setTimeout(() => {
      isScrollingRight.current = false;
    }, 50);
  };

  // Generate 28 continuous days for the timeline
  const timelineDays: { date: Date; dateString: string; isToday: boolean; isWeekend: boolean }[] = [];
  const referenceDate = new Date(baseDate);

  const realToday = new Date();
  const realTodayStr = realToday.toISOString().split('T')[0];

  for (let i = 0; i < 28; i++) {
    const day = new Date(referenceDate);
    day.setDate(referenceDate.getDate() + i);
    const dateStr = day.toISOString().split('T')[0];
    const dayOfWeek = day.getDay(); // 0 is Sunday, 6 is Saturday
    timelineDays.push({
      date: day,
      dateString: dateStr,
      isToday: dateStr === realTodayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    });
  }

  // Dynamically compute/override parent task start dates based on user request:
  // "Если в подзадачах не установлена дата начала то для родительской задачи датой начала выбирается срок выполнения самой ранней подзадачи"
  const processedNodes = React.useMemo(() => {
    return nodes.map(node => {
      // Only apply to tasks (exclude containers, workflow nodes)
      if (node.isContainer || node.isWorkflowRectangle) {
        return node;
      }
      
      const subtasks = nodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle);
      if (subtasks.length > 0) {
        const hasSubtaskStartDate = subtasks.some(s => s.startDate);
        if (!hasSubtaskStartDate) {
          const subtaskDueDates = subtasks
            .map(s => s.dueDate)
            .filter((d): d is string => !!d);
            
          if (subtaskDueDates.length > 0) {
            const earliestDueDate = subtaskDueDates.reduce((earliest, current) => 
              current < earliest ? current : earliest
            );
            
            return {
              ...node,
              startDate: earliestDueDate
            };
          }
        }
      }
      return node;
    });
  }, [nodes]);

  // Filter tasks belonging to project and apply zoom filter if currentZoomTaskId is active
  const tasks = React.useMemo(() => {
    const allProjectTasks = processedNodes.filter(n => !n.isContainer && !n.isWorkflowRectangle);
    if (!currentZoomTaskId) {
      return allProjectTasks;
    }

    const zoomedTask = allProjectTasks.find(t => t.id === currentZoomTaskId);
    if (!zoomedTask) {
      return allProjectTasks;
    }

    const descendants = new Set<string>();
    const collectDescendants = (parentId: string) => {
      allProjectTasks.forEach(t => {
        if (t.parentId === parentId && !descendants.has(t.id)) {
          descendants.add(t.id);
          collectDescendants(t.id);
        }
      });
    };
    collectDescendants(currentZoomTaskId);

    return allProjectTasks.filter(t => t.id === currentZoomTaskId || descendants.has(t.id));
  }, [processedNodes, currentZoomTaskId]);

  // Build tree structures and hierarchical order for list rendering
  const orderedTreeItems = React.useMemo(() => {
    return buildTaskTree(tasks, sortMode, collapsedTaskIds);
  }, [tasks, sortMode, collapsedTaskIds]);

  useEffect(() => {
    if (!taskNameDrag) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setTaskNameDrag(prev => {
        if (!prev) return null;
        const dx = e.clientX - prev.startX;
        const dy = e.clientY - prev.startY;
        const isDraggingNow = prev.isDragging || Math.abs(dx) > 6 || Math.abs(dy) > 6;
        return {
          ...prev,
          currentX: e.clientX,
          currentY: e.clientY,
          isDragging: isDraggingNow
        };
      });

      if (rightScrollRef.current) {
        const rect = rightScrollRef.current.getBoundingClientRect();
        const scrollLeft = rightScrollRef.current.scrollLeft;
        const relativeX = e.clientX - rect.left + scrollLeft;
        const colWidth = 90;
        const colIndex = Math.floor(relativeX / colWidth);
        const clampedColIndex = Math.max(0, Math.min(27, colIndex));
        setHoveredDateIndex(clampedColIndex);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (taskNameDrag.isDragging && hoveredDateIndex !== null) {
        const targetDate = timelineDays[hoveredDateIndex].dateString;
        const taskToUpdate = tasks.find(t => t.id === taskNameDrag.taskId);
        if (taskToUpdate) {
          onUpdateNode({
            ...taskToUpdate,
            startDate: targetDate,
            dueDate: targetDate
          });
        }
      }
      setTaskNameDrag(null);
      setHoveredDateIndex(null);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      setTaskNameDrag(prev => {
        if (!prev) return null;
        const dx = touch.clientX - prev.startX;
        const dy = touch.clientY - prev.startY;
        const isDraggingNow = prev.isDragging || Math.abs(dx) > 6 || Math.abs(dy) > 6;
        return {
          ...prev,
          currentX: touch.clientX,
          currentY: touch.clientY,
          isDragging: isDraggingNow
        };
      });

      if (rightScrollRef.current) {
        const rect = rightScrollRef.current.getBoundingClientRect();
        const scrollLeft = rightScrollRef.current.scrollLeft;
        const relativeX = touch.clientX - rect.left + scrollLeft;
        const colWidth = 90;
        const colIndex = Math.floor(relativeX / colWidth);
        const clampedColIndex = Math.max(0, Math.min(27, colIndex));
        setHoveredDateIndex(clampedColIndex);
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (taskNameDrag.isDragging && hoveredDateIndex !== null) {
        const targetDate = timelineDays[hoveredDateIndex].dateString;
        const taskToUpdate = tasks.find(t => t.id === taskNameDrag.taskId);
        if (taskToUpdate) {
          onUpdateNode({
            ...taskToUpdate,
            startDate: targetDate,
            dueDate: targetDate
          });
        }
      }
      setTaskNameDrag(null);
      setHoveredDateIndex(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [taskNameDrag, hoveredDateIndex, timelineDays, tasks, onUpdateNode]);

  const handleBarMouseDown = (
    e: React.MouseEvent,
    taskId: string,
    type: 'move' | 'resize-start' | 'resize-end',
    startIdx: number,
    endIdx: number
  ) => {
    if (e.button !== 0) return;
    
    e.stopPropagation();
    e.preventDefault();

    dragHasMovedRef.current = false;
    dragStartMousePosRef.current = { x: e.clientX, y: e.clientY };

    const rowEl = (e.currentTarget as HTMLElement).closest('[data-row-container]');
    const gridWidth = rowEl?.getBoundingClientRect().width || 2520;
    const colWidth = gridWidth / 28;

    const dragInfo = {
      taskId,
      type,
      initialStart: startIdx,
      initialEnd: endIdx,
      currentStart: startIdx,
      currentEnd: endIdx,
      colWidth,
      startX: e.clientX
    };

    activeDragRef.current = dragInfo;
    setActiveDrag({
      taskId,
      type,
      initialStart: startIdx,
      initialEnd: endIdx,
      currentStart: startIdx,
      currentEnd: endIdx
    });
  };

  const handleBarTouchStart = (
    e: React.TouchEvent,
    taskId: string,
    type: 'move' | 'resize-start' | 'resize-end',
    startIdx: number,
    endIdx: number
  ) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    dragHasMovedRef.current = false;
    dragStartMousePosRef.current = { x: touch.clientX, y: touch.clientY };

    const rowEl = (e.currentTarget as HTMLElement).closest('[data-row-container]');
    const gridWidth = rowEl?.getBoundingClientRect().width || 2520;
    const colWidth = gridWidth / 28;

    const dragInfo = {
      taskId,
      type,
      initialStart: startIdx,
      initialEnd: endIdx,
      currentStart: startIdx,
      currentEnd: endIdx,
      colWidth,
      startX: touch.clientX
    };

    activeDragRef.current = dragInfo;
    setActiveDrag({
      taskId,
      type,
      initialStart: startIdx,
      initialEnd: endIdx,
      currentStart: startIdx,
      currentEnd: endIdx
    });
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleGlobalMove = (clientX: number) => {
      const drag = activeDragRef.current;
      if (!drag) return;

      const dx = clientX - drag.startX;
      
      if (!dragHasMovedRef.current) {
        const dist = Math.abs(dx);
        if (dist > 3) {
          dragHasMovedRef.current = true;
        }
      }

      if (dragHasMovedRef.current) {
        const dayDiff = Math.round(dx / drag.colWidth);
        let newStart = drag.initialStart;
        let newEnd = drag.initialEnd;

        if (drag.type === 'move') {
          const span = drag.initialEnd - drag.initialStart;
          newStart = drag.initialStart + dayDiff;
          newEnd = drag.initialEnd + dayDiff;

          if (newStart < 0) {
            newStart = 0;
            newEnd = span;
          } else if (newEnd > 27) {
            newEnd = 27;
            newStart = 27 - span;
          }
        } else if (drag.type === 'resize-start') {
          newStart = drag.initialStart + dayDiff;
          newStart = Math.max(0, Math.min(drag.initialEnd, newStart));
        } else if (drag.type === 'resize-end') {
          newEnd = drag.initialEnd + dayDiff;
          newEnd = Math.max(drag.initialStart, Math.min(27, newEnd));
        }

        setActiveDrag(prev => {
          if (!prev) return null;
          if (prev.currentStart === newStart && prev.currentEnd === newEnd) return prev;
          return {
            ...prev,
            currentStart: newStart,
            currentEnd: newEnd
          };
        });
      }
    };

    const handleGlobalEnd = (clientX: number) => {
      const drag = activeDragRef.current;
      activeDragRef.current = null;
      setActiveDrag(null);

      if (drag && dragHasMovedRef.current) {
        const dx = clientX - drag.startX;
        const dayDiff = Math.round(dx / drag.colWidth);
        let finalStart = drag.initialStart;
        let finalEnd = drag.initialEnd;

        if (drag.type === 'move') {
          const span = drag.initialEnd - drag.initialStart;
          finalStart = drag.initialStart + dayDiff;
          finalEnd = drag.initialEnd + dayDiff;

          if (finalStart < 0) {
            finalStart = 0;
            finalEnd = span;
          } else if (finalEnd > 27) {
            finalEnd = 27;
            finalStart = 27 - span;
          }
        } else if (drag.type === 'resize-start') {
          finalStart = drag.initialStart + dayDiff;
          finalStart = Math.max(0, Math.min(drag.initialEnd, finalStart));
        } else if (drag.type === 'resize-end') {
          finalEnd = drag.initialEnd + dayDiff;
          finalEnd = Math.max(drag.initialStart, Math.min(27, finalEnd));
        }

        const taskToUpdate = tasks.find(t => t.id === drag.taskId);
        if (taskToUpdate) {
          const newStartDate = timelineDays[finalStart].dateString;
          const newDueDate = timelineDays[finalEnd].dateString;

          onUpdateNode({
            ...taskToUpdate,
            startDate: newStartDate,
            dueDate: newDueDate
          });
        }

        setTimeout(() => {
          dragHasMovedRef.current = false;
        }, 50);
      } else {
        dragHasMovedRef.current = false;
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleGlobalMove(e.clientX);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      handleGlobalEnd(e.clientX);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        handleGlobalMove(e.touches[0].clientX);
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      const clientX = e.changedTouches.length > 0 ? e.changedTouches[0].clientX : (activeDragRef.current?.startX || 0);
      handleGlobalEnd(clientX);
    };

    if (activeDrag.type === 'move') {
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = 'ew-resize';
    }

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [activeDrag, timelineDays, tasks, onUpdateNode]);

  const shiftDays = (count: number) => {
    setBaseDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + count);
      return next;
    });
  };

  const jumpToToday = () => {
    const today = new Date();
    today.setDate(today.getDate() - 5);
    setBaseDate(today);
  };

  const getPriorityColorBorder = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'bg-rose-500/10 border-rose-500 hover:bg-rose-500/20';
      case 'high': return 'bg-amber-500/10 border-amber-500 hover:bg-amber-500/20';
      case 'medium': return 'bg-indigo-500/10 border-indigo-500 hover:bg-indigo-500/20';
      case 'low': return 'bg-slate-500/15 border-slate-400 hover:bg-slate-500/20';
      default: return 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 hover:bg-slate-200';
    }
  };

  const getPriorityTextClass = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'text-rose-600 dark:text-rose-400 font-medium';
      case 'high': return 'text-amber-600 dark:text-amber-400 font-medium';
      case 'medium': return 'text-indigo-600 dark:text-indigo-400 font-medium';
      default: return 'text-slate-500 dark:text-slate-400';
    }
  };

  // Pre-calculate dates span positions for each task bar
  const getTaskRangeColIndices = (task: TaskNode) => {
    if (!task.startDate && !task.dueDate) return null;
    
    let startIdx = -1;
    let endIdx = -1;

    if (task.startDate) {
      startIdx = timelineDays.findIndex(d => d.dateString === task.startDate);
    }
    if (task.dueDate) {
      endIdx = timelineDays.findIndex(d => d.dateString === task.dueDate);
    }

    // If both dates are provided
    if (task.startDate && task.dueDate) {
      const startMs = new Date(task.startDate).getTime();
      const endMs = new Date(task.dueDate).getTime();
      
      if (startMs <= endMs) {
        if (startIdx === -1) {
          const firstDayMs = timelineDays[0].date.getTime();
          if (startMs < firstDayMs) {
            startIdx = 0; // Starts before range
          } else {
            return null; // Starts after range
          }
        }
        if (endIdx === -1) {
          const lastDayMs = timelineDays[27].date.getTime();
          if (endMs > lastDayMs) {
            endIdx = 27; // Ends after range
          } else {
            return null; // Ends before range
          }
        }
      } else {
        // Swap if misconfigured
        const temp = startIdx;
        startIdx = endIdx;
        endIdx = temp;
      }
    } else if (task.startDate) {
      // Only startDate exists -> assume 3 days duration
      if (startIdx === -1) {
        const startMs = new Date(task.startDate).getTime();
        const firstDayMs = timelineDays[0].date.getTime();
        if (startMs < firstDayMs) return null;
        return null;
      }
      endIdx = Math.min(27, startIdx + 2);
    } else if (task.dueDate) {
      // Only dueDate exists -> assume 1 day duration
      if (endIdx === -1) {
        return null;
      }
      startIdx = endIdx;
    }

    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      return {
        start: startIdx,
        end: endIdx,
        span: endIdx - startIdx + 1,
      };
    }
    
    return null;
  };

  const handleInlineTaskCreate = () => {
    if (!newInlineTaskText.trim()) return;
    if (onCreateTask) {
      // Create new task with no date to start with, or today's date
      const todayStr = new Date().toISOString().split('T')[0];
      onCreateTask(newInlineTaskText.trim(), [], todayStr);
    }
    setNewInlineTaskText('');
    setActiveInlineAddInput(false);
  };

  const formatCompactDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0].slice(2)}`;
    }
    return dateStr;
  };

  return (
    <div 
      id="gantt-chart-workspace" 
      className={`flex flex-col bg-[#FAFBFD] dark:bg-slate-900 font-sans overflow-hidden transition-all duration-200 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'w-full h-full dark:bg-slate-950/20'
      }`}
    >
      
      {/* Timeline Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-2 px-3 sm:p-2.5 sm:px-4 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 w-full sm:w-auto">
          <button
            onClick={toggleLeftPanel}
            aria-label={isLeftPanelCollapsed ? "Развернуть список задач" : "Свернуть список задач"}
            className={`p-1 rounded-lg border transition-all cursor-pointer ${
              isLeftPanelCollapsed 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/50 dark:border-indigo-800/50 dark:text-indigo-400 font-medium' 
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300'
            }`}
            title={isLeftPanelCollapsed ? "Показать список задач" : "Скрыть список задач"}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>



          <span className="text-[10px] bg-slate-150 dark:bg-slate-800 px-2 py-0.5 rounded-full font-mono font-medium text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
            {formatCompactDate(timelineDays[0].dateString)} — {formatCompactDate(timelineDays[27].dateString)}
          </span>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-lg px-2 py-0.5 select-none">
            <ArrowUpDown className="w-3 h-3 text-slate-450 dark:text-slate-500 shrink-0" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="bg-transparent text-[10.5px] font-medium text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="hierarchy" className="dark:bg-slate-900">Иерархия (по холсту)</option>
              <option value="startDate" className="dark:bg-slate-900">Иерархия (по дате начала)</option>
              <option value="dueDate" className="dark:bg-slate-900">Иерархия (по сроку)</option>
              <option value="flatStartDate" className="dark:bg-slate-900">Хронологически (списком)</option>
              <option value="flatDueDate" className="dark:bg-slate-900">По сроку (списком)</option>
            </select>
          </div>

          {currentZoomTaskId && (
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-900/50 rounded-lg px-2 py-0.5 select-none">
              {(() => {
                const focusedTask = processedNodes.find(t => t.id === currentZoomTaskId);
                if (focusedTask && focusedTask.parentId) {
                  return (
                    <button
                      onClick={() => handleZoomTaskIdChange(focusedTask.parentId)}
                      className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 rounded text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200 cursor-pointer flex items-center justify-center border border-indigo-200/30 dark:border-indigo-800/30 mr-0.5"
                      title="Назад к родительской задаче"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  );
                }
                return null;
              })()}
              <span className="text-[10.5px] font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-[150px]" title={processedNodes.find(t => t.id === currentZoomTaskId)?.text}>
                Фокус: {processedNodes.find(t => t.id === currentZoomTaskId)?.text || 'Задача'}
              </span>
              <button
                onClick={() => handleZoomTaskIdChange(null)}
                className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer flex items-center justify-center"
                title="Показать весь проект"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={jumpToToday}
            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium transition-all cursor-pointer border border-slate-200/60 dark:border-slate-800"
          >
            К сегодня
          </button>
          
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => shiftDays(-7)}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition-all cursor-pointer"
              title="-1 неделя"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] px-1 font-medium text-slate-400 block sm:hidden">Неделя</span>
            <button
              onClick={() => shiftDays(7)}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition-all cursor-pointer"
              title="+1 неделя"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setActiveInlineAddInput(true)}
            className="p-1 px-2.5 sm:px-3 sm:py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] sm:text-xs font-medium shadow-xs transition-all cursor-pointer flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Новая задача</span>
          </button>

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={`p-1 px-2.5 sm:px-3 sm:py-1 border rounded-lg text-[11px] sm:text-xs font-medium shadow-xs transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              isFullScreen
                ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400'
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-300'
            }`}
            title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
          >
            {isFullScreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Свернуть</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>На весь экран</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Primary Gantt Content - Left tasks pane & Right timeline grid */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* Left lists table pane */}
        <div 
          className={`transition-all duration-300 overflow-hidden flex flex-col shrink-0 ${
            isLeftPanelCollapsed 
              ? 'w-0 border-r-0' 
              : 'w-64 max-w-xs md:w-80 border-r border-slate-200 dark:border-slate-800'
          } bg-white dark:bg-slate-900/40`}
        >
          <div className="h-10 px-4 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 shrink-0 select-none">
            <span className="font-medium text-[10.5px] uppercase tracking-wider text-slate-400">
              Название задачи ({tasks.length})
            </span>
            <button
              onClick={toggleLeftPanel}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded transition-colors cursor-pointer"
              title="Свернуть список задач"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {/* Scrollable Tasks Table Column */}
          <div 
            ref={leftScrollRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar select-none"
          >
            <div className="min-w-[280px] sm:min-w-[340px] divide-y divide-slate-100 dark:divide-slate-800/60 pr-0.5">
              {activeInlineAddInput && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-b border-indigo-100 dark:border-indigo-950">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Новая задача... (Enter)"
                    value={newInlineTaskText}
                    onChange={(e) => setNewInlineTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInlineTaskCreate();
                      if (e.key === 'Escape') setActiveInlineAddInput(false);
                    }}
                    className="w-full text-xs p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex gap-1.5 justify-end mt-2">
                    <button
                      onClick={() => setActiveInlineAddInput(false)}
                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-medium cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleInlineTaskCreate}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-medium cursor-pointer"
                    >
                      Создать
                    </button>
                  </div>
                </div>
              )}

              {orderedTreeItems.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <p className="text-xs text-slate-400">Нет доступных задач.</p>
                </div>
              ) : (
                orderedTreeItems.map(({ task, depth, parent }) => {
                  const isSubtask = depth > 0;
                  return (
                    <div
                      key={task.id}
                      data-task-id={task.id}
                      onClick={(e) => handleTaskClick(task.id, e)}
                      onDoubleClick={(e) => handleTaskDoubleClick(task.id, e)}
                      className={`h-11 px-3.5 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors border-l-4 ${
                        selectedNodeId === task.id 
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-500' 
                          : task.completed
                            ? 'bg-emerald-50/5 dark:bg-emerald-950/5 border-transparent opacity-80'
                            : 'border-transparent'
                      }`}
                      style={{ paddingLeft: `${14 + depth * 14}px` }}
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {isSubtask && (
                          <CornerDownRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        )}
                        {(() => {
                          const hasSubtasks = tasks.some(t => t.parentId === task.id);
                          if (hasSubtasks) {
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCollapse(task.id);
                                }}
                                className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                                title={collapsedTaskIds.has(task.id) ? "Развернуть подзадачи" : "Свернуть подзадачи"}
                              >
                                {collapsedTaskIds.has(task.id) ? (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            );
                          } else {
                            return <div className="w-[18px] h-[18px] shrink-0" />;
                          }
                        })()}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode({
                              ...task,
                              completed: !task.completed
                            });
                          }}
                          className="text-slate-400 hover:text-emerald-650 dark:hover:text-emerald-400 p-0.5 rounded transition-transform shrink-0"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : activePomodoroNodeId === task.id ? (
                            <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
                              <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                            </span>
                          ) : (
                            <Circle className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                        <span className={`text-xs truncate text-slate-700 dark:text-slate-200 ${
                          depth === 0 ? 'font-medium' : 'font-medium text-slate-600 dark:text-slate-300'
                        } ${
                          task.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : ''
                        } flex items-center gap-1.5 min-w-0 ${
                          (!task.startDate && !task.dueDate) ? 'cursor-grab active:cursor-grabbing hover:text-indigo-650 dark:hover:text-indigo-400 select-none' : ''
                        }`}
                        title={(!task.startDate && !task.dueDate) ? `${task.text} (Зажмите и перетащите вправо, чтобы задать дату)` : task.text}
                        onMouseDown={(e) => {
                          if (!task.startDate && !task.dueDate) {
                            handleTaskNameMouseDown(e, task.id, task.text);
                          }
                        }}
                        onTouchStart={(e) => {
                          if (!task.startDate && !task.dueDate) {
                            handleTaskNameTouchStart(e, task.id, task.text);
                          }
                        }}
                        >
                          {(!task.startDate && !task.dueDate) && (
                            <Calendar className="w-3 h-3 text-indigo-550 shrink-0 select-none group-hover:text-indigo-650 transition-colors animate-pulse-subtle" />
                          )}
                          <span className="truncate">{task.text}</span>
                          {parent && (sortMode === 'flatStartDate' || sortMode === 'flatDueDate') && (
                            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 rounded-sm font-normal shrink-0 truncate max-w-[80px]" title={`Подзадача для: ${parent.text}`}>
                              ← {parent.text}
                            </span>
                          )}
                          {task.externalLink && (
                            <a
                              href={task.externalLink.startsWith('http') ? task.externalLink : `https://${task.externalLink}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                              title={`Открыть внешнюю ссылку: ${task.externalLink}`}
                            >
                              <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                            </a>
                          )}
                          {activePomodoroNodeId === task.id && (
                            <span className="shrink-0 text-[10px] animate-pulse">🍅</span>
                          )}
                        </span>
                      </div>

                      {/* Short detail indicators */}
                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[9px]">
                        {task.dueDate && (
                          <span className="text-slate-400 dark:text-slate-500">
                            {task.dueDate.substring(8, 10)}.{task.dueDate.substring(5, 7)}
                          </span>
                        )}
                        {task.progress !== undefined && task.progress > 0 && (
                          <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-1 rounded-md font-medium">
                            {task.progress}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right timeline scale pane */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-100/30 dark:bg-slate-950/20 relative">
          
          {isLeftPanelCollapsed && (
            <button
              onClick={toggleLeftPanel}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-lg hover:shadow-xl rounded-xl w-8 h-12 flex items-center justify-center z-50 cursor-pointer text-indigo-600 dark:text-indigo-400 transition-all group scale-95 hover:scale-100 animate-pulse-subtle"
              title="Развернуть список задач"
            >
              <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Sizing scale container relative size matching column ranges */}
          <div className="min-w-[2520px] h-full flex flex-col relative">
            
            {/* Timeline Header scale columns */}
            <div className="h-10 flex border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900 relative overflow-y-scroll custom-scrollbar">
              {timelineDays.map((day, i) => {
                const isFirstDayOffset = i % 7 === 0;
                
                return (
                  <div
                    key={day.dateString}
                    className={`flex-1 flex flex-col items-center justify-center border-r border-slate-200 dark:border-slate-800 h-full select-none ${
                      day.isWeekend ? 'bg-slate-100/40 dark:bg-slate-950/15' : ''
                    } ${day.isToday ? 'bg-amber-500/10' : ''}`}
                  >
                    <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                      {WEEKDAYS_RU[(day.date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-[10px] font-medium leading-none mt-0.5 ${
                      day.isToday 
                        ? 'bg-amber-500 text-white rounded-md px-1 py-0.5 font-mono' 
                        : 'text-slate-600 dark:text-slate-400 font-mono'
                    }`}>
                      {day.date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Gantt Bars Rows Scroll Panel grid line columns */}
            <div 
              ref={rightScrollRef}
              onScroll={handleRightScroll}
              className="flex-1 overflow-y-scroll divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar relative"
            >
              
              {/* Vertical dotted grid guidelines rendering background */}
              <div className="absolute inset-0 pointer-events-none flex">
                {timelineDays.map(day => (
                  <div
                    key={`guideline-${day.dateString}`}
                    className={`flex-1 h-full border-r border-slate-200/40 dark:border-slate-800/40 ${
                      day.isWeekend ? 'bg-slate-100/10 dark:bg-slate-950/5' : ''
                    } ${day.isToday ? 'border-r-amber-400/50 bg-amber-500/2' : ''}`}
                  />
                ))}
              </div>

              {/* Loop and render task rows */}
              {orderedTreeItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 col-span-28"></div>
              ) : (
                orderedTreeItems.map(({ task, depth, parent }, rowIndex) => {
                  const range = getTaskRangeColIndices(task);
                  const isSelected = selectedNodeId === task.id;
                  const isBeingDragged = activeDrag && activeDrag.taskId === task.id;
                  const isNameDragging = taskNameDrag && taskNameDrag.taskId === task.id && taskNameDrag.isDragging;
                  const displayRange = isBeingDragged && activeDrag
                    ? {
                        start: activeDrag.currentStart,
                        end: activeDrag.currentEnd,
                        span: activeDrag.currentEnd - activeDrag.currentStart + 1
                      }
                    : (isNameDragging && hoveredDateIndex !== null)
                      ? {
                          start: hoveredDateIndex,
                          end: hoveredDateIndex,
                          span: 1
                        }
                      : range;

                  // Calculate parent info if parent exists
                  const rangeParent = parent ? getTaskRangeColIndices(parent) : null;
                  const parentIndex = parent ? orderedTreeItems.findIndex(item => item.task.id === parent.id) : -1;

                  return (
                    <div
                      key={`row-${task.id}`}
                      data-row-container
                      onClick={(e) => handleTaskClick(task.id, e)}
                      onDoubleClick={(e) => handleTaskDoubleClick(task.id, e)}
                      className={`h-11 flex relative items-center transition-colors group cursor-pointer ${
                        isSelected 
                          ? 'bg-indigo-50/10 dark:bg-indigo-950/10' 
                          : isNameDragging
                            ? 'bg-indigo-500/10 dark:bg-indigo-500/5 ring-1 ring-inset ring-indigo-500/30'
                            : task.completed
                              ? 'bg-emerald-500/2 dark:bg-emerald-500/1 hover:bg-slate-100/50 dark:hover:bg-slate-900/50'
                              : 'hover:bg-slate-50/30 dark:hover:bg-slate-900/30'
                      }`}
                    >
                      {/* Subtask tree connector line */}
                      {displayRange && rangeParent && parentIndex !== -1 && (
                        <svg 
                          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0"
                          style={{ height: '44px' }}
                        >
                          {/* Dot at parent start */}
                          <circle 
                            cx={rangeParent.start * 90 + 12} 
                            cy={-((rowIndex - parentIndex) * 44) + 22} 
                            r="3" 
                            fill="#818cf8" 
                            className="opacity-70 dark:fill-indigo-400" 
                          />
                          {/* Elbow line */}
                          <path
                            d={`M ${rangeParent.start * 90 + 12} ${-((rowIndex - parentIndex) * 44) + 22} L ${rangeParent.start * 90 + 12} 22 L ${displayRange.start * 90} 22`}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                            className="opacity-50 dark:stroke-indigo-400/50"
                          />
                          {/* Arrow tip at child start */}
                          {displayRange.start * 90 > rangeParent.start * 90 + 12 ? (
                            <path 
                              d={`M ${displayRange.start * 90 - 4} 19 L ${displayRange.start * 90} 22 L ${displayRange.start * 90 - 4} 25`} 
                              fill="none" 
                              stroke="#818cf8" 
                              strokeWidth="1.5" 
                              className="opacity-70 dark:stroke-indigo-400"
                            />
                          ) : (
                            <path 
                              d={`M ${displayRange.start * 90 + 4} 19 L ${displayRange.start * 90} 22 L ${displayRange.start * 90 + 4} 25`} 
                              fill="none" 
                              stroke="#818cf8" 
                              strokeWidth="1.5" 
                              className="opacity-70 dark:stroke-indigo-400"
                            />
                          )}
                        </svg>
                      )}

                      {/* Gantt Bar spanning multiple days based on dueDate */}
                      {displayRange ? (
                        <div
                          onClick={(e) => handleTaskClick(task.id, e)}
                          onDoubleClick={(e) => handleTaskDoubleClick(task.id, e)}
                          onMouseDown={(e) => {
                            if (range) {
                              handleBarMouseDown(e, task.id, 'move', range.start, range.end);
                            }
                          }}
                          onTouchStart={(e) => {
                            if (range) {
                              handleBarTouchStart(e, task.id, 'move', range.start, range.end);
                            }
                          }}
                          style={{
                            left: `${(displayRange.start / 28) * 100}%`,
                            width: `${(displayRange.span / 28) * 100}%`
                          }}
                          className={`absolute h-7 border rounded-xl shadow-xs p-1 flex flex-col justify-center cursor-pointer select-none overflow-hidden z-10 ${
                            isBeingDragged || isNameDragging ? 'ring-2 ring-indigo-500/50 scale-[1.01] shadow-lg opacity-95' : 'transition-all duration-150'
                          } ${
                            isNameDragging ? 'bg-indigo-500/20 border-dashed border-indigo-500 animate-pulse' : ''
                          } ${
                            task.completed
                              ? 'bg-emerald-500/10 border-emerald-500/45 dark:bg-emerald-500/5 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 opacity-70'
                              : isNameDragging
                                ? 'text-indigo-700 dark:text-indigo-400 font-medium'
                                : getPriorityColorBorder(task.priority)
                          } ${
                            isSelected && !isBeingDragged ? 'ring-2 ring-indigo-500/30' : ''
                          }`}
                          title={`Задача: ${task.text}${parent ? ` (Подзадача для: ${parent.text})` : ''}\nСрок: ${task.dueDate}${task.completed ? ' (Решено)' : ''}`}
                        >
                          {/* Left Resize Handle */}
                          {!task.completed && range && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-black/15 dark:hover:bg-white/15 z-20 flex items-center justify-center group/handle"
                              onMouseDown={(e) => {
                                handleBarMouseDown(e, task.id, 'resize-start', range.start, range.end);
                              }}
                              onTouchStart={(e) => {
                                handleBarTouchStart(e, task.id, 'resize-start', range.start, range.end);
                              }}
                              title="Изменить дату начала"
                            >
                              <div className="w-1 h-3 bg-slate-400/50 dark:bg-slate-500/50 rounded-full group-hover/handle:bg-slate-600 dark:group-hover/handle:bg-slate-300 transition-colors" />
                            </div>
                          )}

                          {/* Right Resize Handle */}
                          {!task.completed && range && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-black/15 dark:hover:bg-white/15 z-20 flex items-center justify-center group/handle"
                              onMouseDown={(e) => {
                                handleBarMouseDown(e, task.id, 'resize-end', range.start, range.end);
                              }}
                              onTouchStart={(e) => {
                                handleBarTouchStart(e, task.id, 'resize-end', range.start, range.end);
                              }}
                              title="Изменить срок выполнения"
                            >
                              <div className="w-1 h-3 bg-slate-400/50 dark:bg-slate-500/50 rounded-full group-hover/handle:bg-slate-600 dark:group-hover/handle:bg-slate-300 transition-colors" />
                            </div>
                          )}

                          {/* Inner task text bar indicator details */}
                          <div className="flex items-center justify-between gap-1 overflow-hidden w-full px-3">
                            <span className={`text-[10px] font-medium truncate text-slate-700 dark:text-slate-200 flex items-center gap-1 min-w-0 ${task.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : ''}`}>
                              {task.completed && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                              {parent && <span className="text-slate-400 dark:text-slate-500 mr-1 font-sans">↳</span>}
                              {task.text}
                            </span>
                            {task.completed ? (
                              <span className="text-[8px] font-mono font-medium text-emerald-600 dark:text-emerald-400 shrink-0 bg-emerald-500/10 dark:bg-emerald-500/20 px-1 py-0.5 rounded-xs uppercase tracking-wider scale-90">
                                Решено
                              </span>
                            ) : (
                              task.progress !== undefined && task.progress > 0 && (
                                <span className="text-[8.5px] font-mono font-medium text-indigo-500 shrink-0">
                                  {task.progress}%
                                </span>
                              )
                            )}
                          </div>

                          {/* Linear progress fill visualization inside the bar bottom */}
                          {!task.completed && task.progress !== undefined && task.progress > 0 && (
                            <div className="mx-3 bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
                              <div 
                                className="bg-indigo-500 h-full rounded-full transition-all"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Unscheduled card block visually spanning off-grid side, or showing placeholder */
                        task.dueDate ? (
                          <div 
                            onClick={(e) => handleTaskClick(task.id, e)}
                            onDoubleClick={(e) => handleTaskDoubleClick(task.id, e)}
                            className={`absolute right-0 text-[10px] border py-1 px-2.5 rounded-full z-10 shadow-xs mr-4 hover:text-indigo-500 transition-all cursor-pointer flex items-center gap-1 ${
                              task.completed
                                ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 opacity-85 line-through'
                                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {task.completed && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                            Срок: {task.dueDate} (Вне диапазона) {task.completed && '• Решено'}
                          </div>
                        ) : (
                          <div 
                            onClick={(e) => handleTaskClick(task.id, e)}
                            onDoubleClick={(e) => handleTaskDoubleClick(task.id, e)}
                            className={`absolute left-4 h-7 border-2 border-dashed transition-all py-1 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer z-10 font-medium text-[9.5px] ${
                              task.completed
                                ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/2'
                                : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-600'
                            }`}
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                            )}
                            Срок не назначен {task.completed && '• Решено'}
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Legend guide bar footer */}
            <div className="h-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-end px-4 gap-4 font-mono text-[9px] text-slate-400 select-none shrink-0 uppercase tracking-widest">
              <span>Сетка: 28 дней</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-rose-500 rounded" /> Срочно</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-amber-500 rounded" /> Высокий</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-indigo-500 rounded" /> Средний</span>
            </div>
          </div>

        </div>
      </div>

      {/* Floating preview pill when dragging a task name to schedule it */}
      {taskNameDrag && taskNameDrag.isDragging && (
        <div
          className="fixed pointer-events-none z-[999] bg-indigo-600/95 dark:bg-indigo-500/95 text-white text-xs py-1.5 px-3.5 rounded-full shadow-lg font-medium backdrop-blur-xs flex items-center gap-1.5 border border-white/15 cursor-grabbing scale-105 transition-transform"
          style={{
            left: `${taskNameDrag.currentX + 15}px`,
            top: `${taskNameDrag.currentY + 15}px`,
          }}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="max-w-[150px] truncate">{taskNameDrag.taskText}</span>
          {hoveredDateIndex !== null && (
            <span className="bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded text-[9.5px] font-mono whitespace-nowrap animate-pulse">
              {(() => {
                const parts = timelineDays[hoveredDateIndex].dateString.split('-');
                return `${parts[2]}.${parts[1]}`;
              })()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
