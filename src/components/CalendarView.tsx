import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Loader2, 
  Calendar as CalendarIcon, 
  Clock,
  Sparkles,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  Kanban as KanbanIcon,
  GanttChart,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  ChevronUp,
  Check
} from 'lucide-react';
import { TaskNode, TagCategory, Priority, ViewMode } from '../types';

interface CalendarViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string, dueTime?: string, priority?: Priority, startTime?: string) => void;
  setViewMode?: (mode: ViewMode) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  onFocusedTaskIdChange?: (id: string | null) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
}

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTH_NAMES_GENITIVE_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const WEEKDAYS_SHORT_RU = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const WEEKDAYS_FULL_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

// Notion page icon resolver
function getTaskPageIcon(task: TaskNode): string {
  if (task.icon) return task.icon;
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
  const match = task.text.match(emojiRegex);
  if (match) return match[0];
  
  if (task.isContainer) return '📁';
  const lower = task.text.toLowerCase();
  if (lower.includes('видео') || lower.includes('video') || lower.includes('съемк')) return '🎬';
  if (lower.includes('фото') || lower.includes('дизайн') || lower.includes('design')) return '🖼️';
  if (lower.includes('текст') || lower.includes('статья') || lower.includes('пост') || lower.includes('doc')) return '📝';
  if (lower.includes('звонок') || lower.includes('встреч') || lower.includes('meet') || lower.includes('call') || lower.includes('созвон')) return '📞';
  if (lower.includes('отчет') || lower.includes('анализ') || lower.includes('report')) return '📊';
  if (lower.includes('сайт') || lower.includes('web') || lower.includes('landing')) return '🌐';
  if (lower.includes('план') || lower.includes('plan') || lower.includes('спринт')) return '📌';
  if (task.priority === 'urgent') return '⚡';
  return '📄';
}

function cleanTaskTitle(text: string): string {
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u;
  return text.replace(emojiRegex, '');
}

const HOUR_HEIGHT = 60; // 60px per hour -> 1px = 1 minute

export default function CalendarView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  setViewMode,
  onFullScreenChange,
  onFocusedTaskIdChange,
  projectName = 'Календарь проекта',
  projectIcon = '📅',
  onUpdateProjectName
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [calendarSubMode, setCalendarSubMode] = useState<'month' | 'week' | 'day'>('day');
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setIsViewDropdownOpen(false);
      }
    };
    if (isViewDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isViewDropdownOpen]);

  // Real-time live clock for current time line indicator
  const [nowDate, setNowDate] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      setNowDate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const realTodayStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;

  // Quick Modal New Task
  const [isQuickCreateModalOpen, setIsQuickCreateModalOpen] = useState(false);
  const [quickModalText, setQuickModalText] = useState('');
  const [quickModalDate, setQuickModalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quickModalStartTime, setQuickModalStartTime] = useState('');
  const [quickModalDueTime, setQuickModalDueTime] = useState('');
  const [quickModalPriority, setQuickModalPriority] = useState<Priority>('medium');

  // All-day section collapsible state
  const [isAllDayExpanded, setIsAllDayExpanded] = useState(true);

  // Unscheduled tasks sidebar state
  const [isUnscheduledExpanded, setIsUnscheduledExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('notion_calendar_sidebar_expanded');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  useEffect(() => {
    try {
      localStorage.setItem('notion_calendar_sidebar_expanded', String(isUnscheduledExpanded));
    } catch {}
  }, [isUnscheduledExpanded]);

  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');

  // Drag and drop states
  const [draggedOverDate, setDraggedOverDate] = useState<string | null>(null);
  const [draggedOverUnscheduled, setDraggedOverUnscheduled] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Time Resizing states for hourly grid
  const [resizingTask, setResizingTask] = useState<{
    taskId: string;
    type: 'top' | 'bottom';
    initialY: number;
    initialStartMin: number;
    initialEndMin: number;
  } | null>(null);

  const [resizeOverride, setResizeOverride] = useState<{
    taskId: string;
    startMin: number;
    endMin: number;
  } | null>(null);

  const [hoveringResizeHandle, setHoveringResizeHandle] = useState(false);

  // Drag-to-create time slot selection state
  const [slotSelection, setSlotSelection] = useState<{
    dateStr: string;
    startMin: number;
    currentMin: number;
    isCreating: boolean;
  } | null>(null);

  useEffect(() => {
    if (onFullScreenChange) {
      onFullScreenChange(isFullScreen);
    }
  }, [isFullScreen, onFullScreenChange]);

  // Keyboard navigation (Notion Calendar shortcuts: T=Today, W=Week, D=Day, M=Month, N/C=New)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if (e.key === 'Escape') {
        if (isFullScreen) setIsFullScreen(false);
        if (isQuickCreateModalOpen) setIsQuickCreateModalOpen(false);
        if (slotSelection) setSlotSelection(null);
      } else if (e.key.toLowerCase() === 't') {
        setCurrentDate(new Date());
      } else if (e.key.toLowerCase() === 'w') {
        setCalendarSubMode('week');
      } else if (e.key.toLowerCase() === 'd') {
        setCalendarSubMode('day');
      } else if (e.key.toLowerCase() === 'm') {
        setCalendarSubMode('month');
      } else if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setQuickModalDate(currentDateStr);
        setQuickModalStartTime('');
        setQuickModalDueTime('');
        setIsQuickCreateModalOpen(true);
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, isQuickCreateModalOpen, slotSelection, calendarSubMode, currentDate]);

  const formatTaskTime = (task: TaskNode) => {
    if (task.startTime && task.dueTime && task.startTime !== task.dueTime) {
      return `${task.startTime} – ${task.dueTime}`;
    }
    return task.startTime || task.dueTime || '';
  };

  const getTaskDurationString = (startMin: number, endMin: number): string => {
    const diff = Math.max(15, endMin - startMin);
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours > 0 && mins > 0) return `${hours} ч ${mins} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${mins} мин`;
  };

  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  };

  const minutesToTime = (mins: number): string => {
    const clamped = Math.max(0, Math.min(1439, mins));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  interface TimedTaskBlock {
    task: TaskNode;
    top: number;
    height: number;
    startMin: number;
    endMin: number;
    left?: string;
    width?: string;
  }

  // Calculate overlapping columns for Notion Calendar timeline layout
  const computeBlocksForTasks = (timedTasks: TaskNode[]): TimedTaskBlock[] => {
    const blocks: TimedTaskBlock[] = timedTasks.map(task => {
      if (resizeOverride && resizeOverride.taskId === task.id) {
        const startMin = resizeOverride.startMin;
        const endMin = resizeOverride.endMin;
        const top = (startMin / 60) * HOUR_HEIGHT;
        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
        return { task, top, height, startMin, endMin };
      }

      const startStr = task.startTime || task.dueTime || "09:00";
      let endStr = task.dueTime || task.startTime || "10:00";
      
      let startMin = timeToMinutes(startStr);
      let endMin = timeToMinutes(endStr);
      
      if (task.startTime && !task.dueTime) {
        endMin = startMin + 60;
      } else if (task.dueTime && !task.startTime) {
        startMin = Math.max(0, endMin - 60);
      } else if (endMin <= startMin) {
        endMin = startMin + 45;
      }
      
      const top = (startMin / 60) * HOUR_HEIGHT;
      const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT);
      
      return { task, top, height, startMin, endMin };
    });

    // Group overlapping tasks
    const groups: TimedTaskBlock[][] = [];
    blocks.forEach(block => {
      let placed = false;
      for (const group of groups) {
        const overlaps = group.some(gBlock => 
          block.startMin < gBlock.endMin && block.endMin > gBlock.startMin
        );
        if (overlaps) {
          group.push(block);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push([block]);
      }
    });

    // Assign column indices and widths
    groups.forEach(group => {
      group.sort((a, b) => a.startMin - b.startMin);
      const columns: TimedTaskBlock[][] = [];
      group.forEach(block => {
        let colIdx = 0;
        while (colIdx < columns.length) {
          const lastInCol = columns[colIdx][columns[colIdx].length - 1];
          if (block.startMin >= lastInCol.endMin) {
            break;
          }
          colIdx++;
        }
        if (colIdx === columns.length) {
          columns.push([block]);
        } else {
          columns[colIdx].push(block);
        }
        (block as any).colIdx = colIdx;
      });
      
      const totalCols = columns.length;
      group.forEach(block => {
        const colIdx = (block as any).colIdx;
        block.width = `calc(${100 / totalCols}% - 3px)`;
        block.left = `calc(${(colIdx * 100) / totalCols}% + 1.5px)`;
      });
    });

    return blocks;
  };

  // Scroll to current hour (or 08:00) on initial render or mode change
  useEffect(() => {
    const scrollToHour = Math.max(6, nowDate.getHours() - 1);
    const scrollPos = scrollToHour * HOUR_HEIGHT;
    
    const weeklyScroll = document.getElementById('notion-calendar-week-scroll');
    if (weeklyScroll) {
      weeklyScroll.scrollTop = scrollPos;
    }
    const dailyScroll = document.getElementById('notion-calendar-day-scroll');
    if (dailyScroll) {
      dailyScroll.scrollTop = scrollPos;
    }
  }, [calendarSubMode]);

  // Resize handler for time blocks
  const handleResizeStart = (
    e: React.MouseEvent | React.TouchEvent,
    taskId: string,
    type: 'top' | 'bottom',
    startMin: number,
    endMin: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setResizingTask({
      taskId,
      type,
      initialY: clientY,
      initialStartMin: startMin,
      initialEndMin: endMin
    });
    setResizeOverride({
      taskId,
      startMin,
      endMin
    });
  };

  useEffect(() => {
    if (!resizingTask) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateResize(e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      updateResize(e.touches[0].clientY);
    };

    const updateResize = (clientY: number) => {
      const deltaY = clientY - resizingTask.initialY;
      const deltaMinutes = Math.round(deltaY / 15) * 15;

      if (resizingTask.type === 'top') {
        let newStartMin = resizingTask.initialStartMin + deltaMinutes;
        newStartMin = Math.max(0, Math.min(newStartMin, resizingTask.initialEndMin - 15));
        setResizeOverride({
          taskId: resizingTask.taskId,
          startMin: newStartMin,
          endMin: resizingTask.initialEndMin
        });
      } else {
        let newEndMin = resizingTask.initialEndMin + deltaMinutes;
        newEndMin = Math.max(resizingTask.initialStartMin + 15, Math.min(newEndMin, 1440));
        setResizeOverride({
          taskId: resizingTask.taskId,
          startMin: resizingTask.initialStartMin,
          endMin: newEndMin
        });
      }
    };

    const finishResize = () => {
      if (resizeOverride) {
        const task = nodes.find(n => n.id === resizeOverride.taskId);
        if (task) {
          const startTimeStr = minutesToTime(resizeOverride.startMin);
          const dueTimeStr = minutesToTime(resizeOverride.endMin);
          onUpdateNode({
            ...task,
            startTime: startTimeStr,
            dueTime: dueTimeStr
          });
        }
      }
      setResizingTask(null);
      setResizeOverride(null);
      setHoveringResizeHandle(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', finishResize);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', finishResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', finishResize);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', finishResize);
    };
  }, [resizingTask, resizeOverride, nodes, onUpdateNode]);

  // Notion Calendar Event Card Styling based on priority & completion
  const getNotionCardStyles = (task: TaskNode) => {
    if (task.completed) {
      return {
        card: 'bg-[#F2F2F0] dark:bg-[#262626] text-[#787774] dark:text-[#888888] border border-[#E3E2E0] dark:border-[#383838] opacity-75',
        accentBar: 'bg-[#9B9A97] dark:bg-[#666666]',
        tagBg: 'bg-[#E3E2E0] dark:bg-[#333333] text-[#787774] dark:text-[#9B9A97]'
      };
    }
    switch (task.priority) {
      case 'urgent':
        return {
          card: 'bg-[#FDF2F0] text-[#B83227] dark:bg-[#3D1E1B] dark:text-[#FF8D80] border border-[#F9CDC7] dark:border-[#5C2B26] hover:brightness-97 dark:hover:brightness-110',
          accentBar: 'bg-[#EB5757] dark:bg-[#FF6B5B]',
          tagBg: 'bg-[#F9CDC7] dark:bg-[#5C2B26] text-[#B83227] dark:text-[#FF8D80]'
        };
      case 'high':
        return {
          card: 'bg-[#FFF7EC] text-[#C26500] dark:bg-[#3D2813] dark:text-[#FFB566] border border-[#FEE3BF] dark:border-[#5E3C1B] hover:brightness-97 dark:hover:brightness-110',
          accentBar: 'bg-[#F2994A] dark:bg-[#FFA347]',
          tagBg: 'bg-[#FEE3BF] dark:bg-[#5E3C1B] text-[#C26500] dark:text-[#FFB566]'
        };
      case 'medium':
        return {
          card: 'bg-[#F5F8FF] text-[#1E56B3] dark:bg-[#14233C] dark:text-[#8CB8FF] border border-[#D5E3FC] dark:border-[#1E3A66] hover:brightness-97 dark:hover:brightness-110',
          accentBar: 'bg-[#2F80ED] dark:bg-[#4794FF]',
          tagBg: 'bg-[#D5E3FC] dark:bg-[#1E3A66] text-[#1E56B3] dark:text-[#8CB8FF]'
        };
      case 'low':
        return {
          card: 'bg-[#F2FAF4] text-[#1E743A] dark:bg-[#132A1C] dark:text-[#86D49F] border border-[#CEEAD6] dark:border-[#1F452C] hover:brightness-97 dark:hover:brightness-110',
          accentBar: 'bg-[#27AE60] dark:bg-[#2ECC71]',
          tagBg: 'bg-[#CEEAD6] dark:bg-[#1F452C] text-[#1E743A] dark:text-[#86D49F]'
        };
      case 'none':
      default:
        return {
          card: 'bg-[#F7F7F5] text-[#37352F] dark:bg-[#262626] dark:text-[#E0E0E0] border border-[#E6E6E4] dark:border-[#383838] hover:bg-[#EFEFED] dark:hover:bg-[#2D2D2D]',
          accentBar: 'bg-[#2383E2] dark:bg-[#3D94E8]',
          tagBg: 'bg-[#EAEAE8] dark:bg-[#333333] text-[#555] dark:text-[#AAA]'
        };
    }
  };

  const getPriorityBadgeColor = (p?: Priority) => {
    switch (p) {
      case 'urgent': return 'bg-[#FDF2F0] text-[#B83227] dark:bg-[#3D1E1B] dark:text-[#FF8D80]';
      case 'high': return 'bg-[#FFF7EC] text-[#C26500] dark:bg-[#3D2813] dark:text-[#FFB566]';
      case 'medium': return 'bg-[#F5F8FF] text-[#1E56B3] dark:bg-[#14233C] dark:text-[#8CB8FF]';
      case 'low': return 'bg-[#F2FAF4] text-[#1E743A] dark:bg-[#132A1C] dark:text-[#86D49F]';
      default: return 'bg-[#F1F1EF] text-[#787774] dark:bg-[#262626] dark:text-[#9B9A97]';
    }
  };

  // Node filtering
  const projectTasks = useMemo(() => {
    const seenMirrorGroupIds = new Set<string>();
    return nodes.filter(n => {
      if (n.isContainer || n.isWorkflowRectangle || n.archived || n.isNotTask) {
        return false;
      }
      if (n.mirrorGroupId) {
        if (seenMirrorGroupIds.has(n.mirrorGroupId)) return false;
        seenMirrorGroupIds.add(n.mirrorGroupId);
      }
      return true;
    });
  }, [nodes]);

  const scheduledTasks = useMemo(() => {
    return projectTasks.filter(n => !!n.dueDate);
  }, [projectTasks]);

  const rawUnscheduledTasks = projectTasks.filter(n => !n.dueDate);
  const unscheduledTasks = sidebarSearchQuery
    ? rawUnscheduledTasks.filter(t => t.text.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
    : rawUnscheduledTasks;

  // Drag and drop handlers
  const handleTaskDrop = (taskId: string, targetDate: string | null) => {
    setDraggedOverDate(null);
    setDraggedOverUnscheduled(false);
    setDraggingTaskId(null);
    if (!taskId) return;
    const task = nodes.find(n => n.id === taskId);
    if (task) {
      onUpdateNode({
        ...task,
        dueDate: targetDate || undefined
      });
    }
  };

  const getTaskDurationMinutes = (task: TaskNode): number => {
    const startStr = task.startTime || task.dueTime;
    const endStr = task.dueTime || task.startTime;
    if (!startStr || !endStr) return 60;
    const startMin = timeToMinutes(startStr);
    const endMin = timeToMinutes(endStr);
    const diff = endMin - startMin;
    return diff > 0 ? diff : 60;
  };

  const getUpdatedTimesForDrop = (task: TaskNode, startMin: number): { startTime: string; dueTime: string } => {
    const duration = getTaskDurationMinutes(task);
    const newEndMin = Math.min(1440, startMin + duration);
    return {
      startTime: minutesToTime(startMin),
      dueTime: minutesToTime(newEndMin)
    };
  };

  // Date navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => {
    const rawDay = new Date(y, m, 1).getDay();
    return (rawDay + 6) % 7; // Monday-first
  };

  const daysInCurrentMonth = getDaysInMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);
  const startingDayOfWeek = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setMonth(nextDate.getMonth() - 1);
      return nextDate;
    });
  };

  const nextMonth = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setMonth(nextDate.getMonth() + 1);
      return nextDate;
    });
  };

  const prevWeek = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setDate(nextDate.getDate() - 7);
      return nextDate;
    });
  };

  const nextWeek = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setDate(nextDate.getDate() + 7);
      return nextDate;
    });
  };

  const prevDay = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setDate(nextDate.getDate() - 1);
      return nextDate;
    });
  };

  const nextDay = () => {
    setCurrentDate(prev => {
      const nextDate = new Date(prev);
      nextDate.setDate(nextDate.getDate() + 1);
      return nextDate;
    });
  };

  const handlePrev = () => {
    if (calendarSubMode === 'month') prevMonth();
    else if (calendarSubMode === 'week') prevWeek();
    else prevDay();
  };

  const handleNext = () => {
    if (calendarSubMode === 'month') nextMonth();
    else if (calendarSubMode === 'week') nextWeek();
    else nextDay();
  };

  const setToday = () => {
    setCurrentDate(new Date());
  };

  // Month grid slot generator (42 cells)
  const calendarSlots: {
    dayNumber: number;
    monthOffset: -1 | 0 | 1;
    dateString: string;
    isToday: boolean;
  }[] = [];

  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayVal = daysInPrevMonth - i;
    const prevMonthIdx = month === 0 ? 11 : month - 1;
    const prevYearIdx = month === 0 ? year - 1 : year;
    const dateStr = `${prevYearIdx}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;
    calendarSlots.push({
      dayNumber: dayVal,
      monthOffset: -1,
      dateString: dateStr,
      isToday: false
    });
  }

  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarSlots.push({
      dayNumber: d,
      monthOffset: 0,
      dateString: dateStr,
      isToday: dateStr === realTodayStr
    });
  }

  const remainingSlots = 42 - calendarSlots.length;
  for (let d = 1; d <= remainingSlots; d++) {
    const nextMonthIdx = month === 11 ? 0 : month + 1;
    const nextYearIdx = month === 11 ? year + 1 : year;
    const dateStr = `${nextYearIdx}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarSlots.push({
      dayNumber: d,
      monthOffset: 1,
      dateString: dateStr,
      isToday: false
    });
  }

  // Week slots generator (Monday - Sunday)
  const startOfWeek = (() => {
    const d = new Date(currentDate);
    const dayValue = d.getDay();
    const diff = d.getDate() - dayValue + (dayValue === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  })();

  const weeklySlots = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      date: d,
      dateString: dateStr,
      dayNumber: d.getDate(),
      isToday: dateStr === realTodayStr,
      dayName: WEEKDAYS_SHORT_RU[i],
      dayNameFull: WEEKDAYS_FULL_RU[i]
    };
  });

  const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

  const HOURS_24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  const handleQuickModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickModalText.trim()) return;
    if (onCreateTask) {
      onCreateTask(
        quickModalText.trim(),
        [],
        quickModalDate || undefined,
        quickModalDueTime || undefined,
        quickModalPriority || 'none',
        quickModalStartTime || undefined
      );
    } else {
      const fallbackNode: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text: quickModalText.trim(),
        x: 0,
        y: 0,
        parentId: null,
        priority: quickModalPriority,
        tags: [],
        notes: '',
        completed: false,
        files: [],
        dueDate: quickModalDate || undefined,
        startTime: quickModalStartTime || undefined,
        dueTime: quickModalDueTime || undefined
      };
      onUpdateNode(fallbackNode);
    }
    setQuickModalText('');
    setQuickModalStartTime('');
    setQuickModalDueTime('');
    setQuickModalPriority('medium');
    setIsQuickCreateModalOpen(false);
  };

  const getHeaderTitle = () => {
    if (calendarSubMode === 'month') {
      return `${MONTH_NAMES_RU[month]} ${year}`;
    } else if (calendarSubMode === 'week') {
      const mon = weeklySlots[0].date;
      const sun = weeklySlots[6].date;
      if (mon.getMonth() === sun.getMonth()) {
        return `${mon.getDate()} – ${sun.getDate()} ${MONTH_NAMES_GENITIVE_RU[mon.getMonth()]} ${year}`;
      } else {
        return `${mon.getDate()} ${MONTH_NAMES_GENITIVE_RU[mon.getMonth()].substring(0, 3)} – ${sun.getDate()} ${MONTH_NAMES_GENITIVE_RU[sun.getMonth()].substring(0, 3)} ${year}`;
      }
    } else {
      const dayIndex = (currentDate.getDay() + 6) % 7;
      return `${currentDate.getDate()} ${MONTH_NAMES_GENITIVE_RU[currentDate.getMonth()]} ${year}, ${WEEKDAYS_FULL_RU[dayIndex]}`;
    }
  };

  const VIEW_MODE_OPTIONS: { id: 'day' | 'week' | 'month'; label: string; shortcut: string }[] = [
    { id: 'day', label: 'День', shortcut: 'D' },
    { id: 'week', label: 'Неделя', shortcut: 'W' },
    { id: 'month', label: 'Месяц', shortcut: 'M' },
  ];

  const currentModeLabel = VIEW_MODE_OPTIONS.find(o => o.id === calendarSubMode)?.label || 'Неделя';

  return (
    <div 
      id="calendar-workspace-view" 
      className={`relative w-full h-full flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#E0E0E0] overflow-hidden select-none font-sans ${
        isFullScreen ? 'fixed inset-0 z-[150] w-screen h-screen' : ''
      }`}
    >
      {/* CALENDAR HEADER & TIME PERIOD CONTROL */}
      <div className="shrink-0 px-3 sm:px-5 py-2 bg-white dark:bg-[#191919] flex items-center justify-between gap-2 sm:gap-4 border-b border-[#EDEDEB] dark:border-[#2D2D2D]">
        
        {/* Left: Navigation arrows, Today button & Formatted Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#FFF] rounded transition-colors cursor-pointer"
              title="Назад (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1 hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] text-[#787774] hover:text-[#37352F] dark:text-[#9B9A97] dark:hover:text-[#FFF] rounded transition-colors cursor-pointer"
              title="Вперед (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Today Button with Notion styling */}
          <button
            type="button"
            onClick={setToday}
            className="shrink-0 px-2 sm:px-2.5 py-1 text-xs font-medium text-[#37352F] dark:text-[#D4D4D4] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] rounded-md border border-[#EDEDEB] dark:border-[#333] transition-colors cursor-pointer flex items-center gap-1 shadow-3xs"
            title="Перейти к сегодняшнему дню (T)"
          >
            <span>Сегодня</span>
            <span className="hidden sm:inline-block text-[10px] text-[#9B9A97] font-mono ml-0.5">T</span>
          </button>

          {/* Formatted Period Heading */}
          <h2 className="text-xs sm:text-base font-semibold text-[#111] dark:text-[#FFF] tracking-tight truncate min-w-0 ml-0.5 sm:ml-1">
            {getHeaderTitle()}
          </h2>
        </div>

        {/* Right: Dropdown for Day | Week | Month */}
        <div className="relative shrink-0" ref={viewDropdownRef}>
          <button
            type="button"
            onClick={() => setIsViewDropdownOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-[#EDEDEB] dark:border-[#333] bg-[#F7F7F5] dark:bg-[#252525] text-[#37352F] dark:text-[#E0E0E0] hover:bg-[#EFEFED] dark:hover:bg-[#2D2D2D] transition-colors cursor-pointer shadow-3xs ${
              isViewDropdownOpen ? 'ring-1.5 ring-[#2383E2]/50 border-[#2383E2]' : ''
            }`}
            title="Выбрать масштаб календаря (День, Неделя, Месяц)"
          >
            <span>{currentModeLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-[#787774] dark:text-[#9B9A97] transition-transform duration-150 ${isViewDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu Popup */}
          {isViewDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-36 py-1 bg-white dark:bg-[#202020] rounded-lg shadow-lg border border-[#EDEDEB] dark:border-[#333] z-[60]">
              {VIEW_MODE_OPTIONS.map(opt => {
                const isSelected = calendarSubMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setCalendarSubMode(opt.id);
                      setIsViewDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#F2F2F0] dark:bg-[#2A2A2A] text-[#111] dark:text-[#FFF] font-semibold'
                        : 'text-[#37352F] dark:text-[#CCCCCC] hover:bg-[#F7F7F5] dark:hover:bg-[#262626]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 flex items-center justify-center">
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                      </span>
                      <span>{opt.label}</span>
                    </div>
                    <span className="text-[10px] text-[#9B9A97] dark:text-[#777] font-mono px-1 py-0.5 rounded bg-[#EFEFED] dark:bg-[#333]">
                      {opt.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. MAIN WORKSPACE BODY (NOTION CALENDAR TIMELINE + SIDEBAR) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-white dark:bg-[#191919]">
        
        {/* ============================================================ */}
        {/* A. WEEKLY VIEW (AUTHENTIC NOTION CALENDAR) */}
        {/* ============================================================ */}
        {calendarSubMode === 'week' && (
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white dark:bg-[#191919]">
            
            {/* Weekdays Sticky Header + All-Day Section */}
            <div className="shrink-0 flex flex-col border-b border-[#EDEDEB] dark:border-[#2D2D2D] bg-white dark:bg-[#191919] z-10">
              
              {/* Day Header Row */}
              <div className="flex items-stretch border-b border-[#EDEDEB] dark:border-[#2D2D2D]">
                {/* Time Gutter Header (Time Zone indicator) */}
                <div className="w-14 sm:w-16 shrink-0 border-r border-[#EDEDEB] dark:border-[#2D2D2D] flex items-center justify-center p-2 text-[10px] font-mono text-[#9B9A97]">
                  24h
                </div>

                {/* 7 Day Header Columns */}
                <div className="flex-1 grid grid-cols-7 min-w-[700px]">
                  {weeklySlots.map((slot) => {
                    const isToday = slot.isToday;
                    return (
                      <div 
                        key={slot.dateString}
                        onClick={() => {
                          setCurrentDate(slot.date);
                          setCalendarSubMode('day');
                        }}
                        className={`py-2 px-2 border-r border-[#EDEDEB] dark:border-[#2D2D2D] last:border-r-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors group ${
                          isToday ? 'bg-[#2383E2]/5 dark:bg-[#2383E2]/10' : 'hover:bg-[#F7F7F5] dark:hover:bg-[#202020]'
                        }`}
                        title="Нажмите, чтобы открыть дневной вид"
                      >
                        <span className={`text-[11px] font-medium uppercase tracking-wider ${
                          isToday ? 'text-[#2383E2] font-semibold' : 'text-[#787774] dark:text-[#9B9A97]'
                        }`}>
                          {slot.dayName}
                        </span>

                        {/* Notion Calendar Date Circle */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                          isToday 
                            ? 'bg-[#2383E2] text-white shadow-2xs' 
                            : 'text-[#111] dark:text-[#FFF] group-hover:bg-[#EDEDEB] dark:group-hover:bg-[#333]'
                        }`}>
                          {slot.dayNumber}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pinned All-Day Tasks Row ("Весь день") */}
              <div className="flex items-stretch min-h-[36px] bg-[#FAF9F7] dark:bg-[#1B1B1B]">
                {/* All-Day Label */}
                <div 
                  onClick={() => setIsAllDayExpanded(!isAllDayExpanded)}
                  className="w-14 sm:w-16 shrink-0 border-r border-[#EDEDEB] dark:border-[#2D2D2D] flex items-center justify-between px-2 text-[10px] text-[#787774] dark:text-[#9B9A97] cursor-pointer hover:bg-[#EFEFED] dark:hover:bg-[#252525] transition-colors select-none"
                  title="Свернуть / развернуть задачи на весь день"
                >
                  <span className="font-medium truncate">Весь день</span>
                  {isAllDayExpanded ? <ChevronUp className="w-2.5 h-2.5 opacity-60" /> : <ChevronDown className="w-2.5 h-2.5 opacity-60" />}
                </div>

                {/* 7 Columns for All-day tasks */}
                <div className="flex-1 grid grid-cols-7 min-w-[700px]">
                  {weeklySlots.map((slot) => {
                    const allDayTasks = scheduledTasks.filter(t => t.dueDate === slot.dateString && !t.startTime && !t.dueTime);
                    const isDragOver = draggedOverDate === `allday-${slot.dateString}`;

                    return (
                      <div
                        key={slot.dateString}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverDate(`allday-${slot.dateString}`)}
                        onDragLeave={() => {
                          if (draggedOverDate === `allday-${slot.dateString}`) setDraggedOverDate(null);
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          const taskId = e.dataTransfer.getData('text/plain');
                          if (taskId) {
                            const task = nodes.find(n => n.id === taskId);
                            if (task) {
                              onUpdateNode({
                                ...task,
                                dueDate: slot.dateString,
                                startTime: undefined,
                                dueTime: undefined
                              });
                            }
                          }
                          setDraggedOverDate(null);
                        }}
                        className={`p-1 border-r border-[#EDEDEB] dark:border-[#2D2D2D] last:border-r-0 flex flex-col gap-1 min-h-[36px] transition-colors relative group ${
                          isDragOver ? 'bg-[#2383E2]/15 dark:bg-[#2383E2]/25' : ''
                        }`}
                      >
                        {isAllDayExpanded && (
                          <div className="flex flex-col gap-1">
                            {allDayTasks.map(task => {
                              const cardStyles = getNotionCardStyles(task);
                              const isTaskSelected = task.id === selectedNodeId;

                              return (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData('text/plain', task.id);
                                    setDraggingTaskId(task.id);
                                  }}
                                  onDragEnd={() => setDraggingTaskId(null)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectNode(task.id, e);
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[11px] leading-tight flex items-center gap-1.5 transition-all shadow-3xs cursor-grab active:cursor-grabbing border ${cardStyles.card} ${
                                    isTaskSelected ? 'ring-1.5 ring-[#2383E2]' : ''
                                  }`}
                                  title={task.text}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateNode({ ...task, completed: !task.completed });
                                    }}
                                    className="shrink-0 hover:opacity-80"
                                  >
                                    {task.completed ? (
                                      <CheckCircle2 className="w-3 h-3 text-[#27AE60]" />
                                    ) : (
                                      <Circle className="w-3 h-3 text-[#9B9A97]" />
                                    )}
                                  </button>
                                  <span className="text-[10px] shrink-0">{getTaskPageIcon(task)}</span>
                                  <span className={`truncate flex-1 font-normal ${task.completed ? 'line-through opacity-55' : ''}`}>
                                    {cleanTaskTitle(task.text)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Quick Add all-day task on hover */}
                        <button
                          onClick={() => {
                            setQuickModalDate(slot.dateString);
                            setQuickModalStartTime('');
                            setQuickModalDueTime('');
                            setIsQuickCreateModalOpen(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-[#2383E2] hover:bg-[#2383E2]/10 py-0.5 px-1 rounded flex items-center justify-center transition-opacity"
                          title="Добавить задачу на весь день"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 24-Hour Vertical Scrollable Timeline Grid */}
            <div 
              id="notion-calendar-week-scroll" 
              className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar relative bg-white dark:bg-[#191919]"
            >
              <div className="flex relative h-[1440px] min-w-[760px]">
                
                {/* Time Gutter Column (00:00 - 23:00) */}
                <div className="w-14 sm:w-16 shrink-0 border-r border-[#EDEDEB] dark:border-[#2D2D2D] bg-[#FAFAF9]/60 dark:bg-[#1C1C1C]/60 select-none z-10 sticky left-0">
                  {HOURS_24.map((hour, h) => (
                    <div 
                      key={hour} 
                      className="h-[60px] relative text-right pr-2 text-[10px] font-mono text-[#9B9A97] dark:text-[#777]"
                    >
                      <span className="relative -top-2 bg-white dark:bg-[#191919] px-0.5 rounded">
                        {hour}
                      </span>
                    </div>
                  ))}

                  {/* Real-time Indicator Badge in Gutter for Today */}
                  {weeklySlots.some(s => s.isToday) && (
                    <div 
                      className="absolute right-0 translate-x-1/2 -translate-y-1/2 bg-[#EB5757] text-white text-[9px] font-mono px-1 py-0.5 rounded shadow-sm z-30 pointer-events-none flex items-center"
                      style={{ top: `${nowMinutes}px` }}
                    >
                      {String(nowDate.getHours()).padStart(2, '0')}:{String(nowDate.getMinutes()).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* 7 Columns for Days */}
                <div className="flex-1 grid grid-cols-7 relative">
                  {weeklySlots.map((slot) => {
                    const isToday = slot.isToday;
                    const dayTasks = scheduledTasks.filter(t => t.dueDate === slot.dateString);
                    const timedTasks = dayTasks.filter(t => t.startTime || t.dueTime);
                    const timedBlocks = computeBlocksForTasks(timedTasks);
                    const isDragOver = draggedOverDate === slot.dateString;

                    return (
                      <div
                        key={slot.dateString}
                        data-slot-date={slot.dateString}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverDate(slot.dateString)}
                        onDragLeave={() => {
                          if (draggedOverDate === slot.dateString) setDraggedOverDate(null);
                        }}
                        onDrop={(e) => {
                          const taskId = e.dataTransfer.getData('text/plain');
                          if (taskId) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const dropY = e.clientY - rect.top;
                            const totalMinutes = Math.max(0, Math.min(1439, Math.floor(dropY)));
                            const snappedMinutes = Math.round(totalMinutes / 15) * 15;
                            const taskToDrop = nodes.find(t => t.id === taskId);
                            if (taskToDrop) {
                              const { startTime, dueTime } = getUpdatedTimesForDrop(taskToDrop, snappedMinutes);
                              onUpdateNode({
                                ...taskToDrop,
                                dueDate: slot.dateString,
                                startTime,
                                dueTime
                              });
                            }
                          }
                          setDraggedOverDate(null);
                        }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('[draggable="true"]') || target.closest('button')) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickY = e.clientY - rect.top;
                          const totalMinutes = Math.max(0, Math.min(1439, Math.floor(clickY)));
                          const snappedMinutes = Math.round(totalMinutes / 15) * 15;
                          const startTimeStr = minutesToTime(snappedMinutes);
                          const dueTimeStr = minutesToTime(Math.min(1439, snappedMinutes + 60));
                          
                          setQuickModalDate(slot.dateString);
                          setQuickModalStartTime(startTimeStr);
                          setQuickModalDueTime(dueTimeStr);
                          setIsQuickCreateModalOpen(true);
                        }}
                        className={`h-[1440px] relative border-r border-[#EDEDEB] dark:border-[#2D2D2D] last:border-r-0 transition-colors cursor-pointer group ${
                          isToday ? 'bg-[#2383E2]/[0.02] dark:bg-[#2383E2]/[0.04]' : 'bg-white dark:bg-[#191919]'
                        } ${isDragOver ? 'bg-[#2383E2]/10 dark:bg-[#2383E2]/20' : ''}`}
                      >
                        {/* Horizontal Gridlines: Solid for Full Hour, Dotted for Half Hour */}
                        {Array.from({ length: 24 }).map((_, h) => (
                          <React.Fragment key={h}>
                            {/* Full Hour line */}
                            <div 
                              className="absolute left-0 right-0 border-b border-[#EDEDEB] dark:border-[#2D2D2D] pointer-events-none" 
                              style={{ top: `${h * HOUR_HEIGHT}px`, height: '0px' }} 
                            />
                            {/* Half Hour line */}
                            <div 
                              className="absolute left-0 right-0 border-b border-dashed border-[#EDEDEB]/50 dark:border-[#2D2D2D]/50 pointer-events-none" 
                              style={{ top: `${h * HOUR_HEIGHT + 30}px`, height: '0px' }} 
                            />
                          </React.Fragment>
                        ))}

                        {/* Real-time Indicator Line across today column */}
                        {isToday && (
                          <div 
                            className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                            style={{ top: `${nowMinutes}px` }}
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-[#EB5757] -ml-1.5 ring-2 ring-white dark:ring-[#191919] shadow-sm" />
                            <div className="flex-1 h-[2px] bg-[#EB5757] shadow-2xs" />
                          </div>
                        )}

                        {/* Timed Event Blocks */}
                        {timedBlocks.map(({ task, top, height, left, width, startMin, endMin }) => {
                          const cardStyles = getNotionCardStyles(task);
                          const isTaskSelected = task.id === selectedNodeId;
                          const isCurrentlyResizing = resizingTask?.taskId === task.id;

                          return (
                            <div
                              key={task.id}
                              draggable={!hoveringResizeHandle && !isCurrentlyResizing}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData('text/plain', task.id);
                                setDraggingTaskId(task.id);
                              }}
                              onDragEnd={() => setDraggingTaskId(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(task.id, e);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                              }}
                              className={`absolute rounded-md p-1.5 text-xs flex flex-col justify-between overflow-hidden shadow-2xs cursor-grab active:cursor-grabbing border transition-all ${
                                cardStyles.card
                              } ${isTaskSelected ? 'ring-2 ring-[#2383E2] z-30' : 'z-10'} ${
                                draggingTaskId === task.id ? 'opacity-30 border-dashed' : ''
                              }`}
                              style={{
                                top: `${top}px`,
                                height: `${Math.max(26, height)}px`,
                                left: left || '1.5px',
                                width: width || 'calc(100% - 3px)',
                              }}
                              title={`${task.text} (${formatTaskTime(task)})`}
                            >
                              {/* Left Notion Accent Stripe */}
                              <div className={`absolute top-0 bottom-0 left-0 w-[3.5px] ${cardStyles.accentBar}`} />

                              {/* Top resize handle */}
                              <div
                                onMouseDown={(e) => handleResizeStart(e, task.id, 'top', startMin, endMin)}
                                onTouchStart={(e) => handleResizeStart(e, task.id, 'top', startMin, endMin)}
                                onMouseEnter={() => setHoveringResizeHandle(true)}
                                onMouseLeave={() => setHoveringResizeHandle(false)}
                                className="absolute top-0 left-0 right-0 h-2.5 cursor-ns-resize z-30 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                              />

                              {/* Bottom resize handle */}
                              <div
                                onMouseDown={(e) => handleResizeStart(e, task.id, 'bottom', startMin, endMin)}
                                onTouchStart={(e) => handleResizeStart(e, task.id, 'bottom', startMin, endMin)}
                                onMouseEnter={() => setHoveringResizeHandle(true)}
                                onMouseLeave={() => setHoveringResizeHandle(false)}
                                className="absolute bottom-0 left-0 right-0 h-2.5 cursor-ns-resize z-30 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                              />

                              {/* Card Content */}
                              <div className="pl-1.5 flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-start gap-1 font-medium leading-tight">
                                  <span className="text-[11px] shrink-0">{getTaskPageIcon(task)}</span>
                                  <span className={`truncate text-[11.5px] ${task.completed ? 'line-through opacity-60' : ''}`}>
                                    {cleanTaskTitle(task.text)}
                                  </span>
                                </div>

                                {height >= 38 && (
                                  <div className="flex items-center gap-1.5 text-[9.5px] font-mono opacity-80 pl-0.5">
                                    <span>{formatTaskTime(task)}</span>
                                    {height >= 56 && (
                                      <span className="opacity-65">({getTaskDurationString(startMin, endMin)})</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Live Resizing Tooltip */}
                              {isCurrentlyResizing && (
                                <div className="absolute top-1 right-1 bg-black/80 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow z-40">
                                  {minutesToTime(startMin)} – {minutesToTime(endMin)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* B. DAILY VIEW (AUTHENTIC NOTION CALENDAR SINGLE DAY) */}
        {/* ============================================================ */}
        {/* B. DAY VIEW (HOURLY TIMELINE) */}
        {/* ============================================================ */}
        {calendarSubMode === 'day' && (
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white dark:bg-[#191919]">
            
            {/* All-Day Tasks Row for Day View */}
            <div className="shrink-0 flex flex-col border-b border-[#EDEDEB] dark:border-[#2D2D2D] bg-white dark:bg-[#191919] z-20 px-4 sm:px-6 py-2.5">
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDraggedOverDate(`allday-${currentDateStr}`)}
                onDragLeave={() => {
                  if (draggedOverDate === `allday-${currentDateStr}`) setDraggedOverDate(null);
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  const taskId = e.dataTransfer.getData('text/plain');
                  if (taskId) {
                    const task = nodes.find(n => n.id === taskId);
                    if (task) {
                      onUpdateNode({
                        ...task,
                        dueDate: currentDateStr,
                        startTime: undefined,
                        dueTime: undefined
                      });
                    }
                  }
                  setDraggedOverDate(null);
                }}
                className={`p-2 rounded-lg border transition-all ${
                  draggedOverDate === `allday-${currentDateStr}`
                    ? 'bg-[#2383E2]/15 border-[#2383E2]'
                    : 'bg-[#FAFAF9] dark:bg-[#202020] border-[#EDEDEB] dark:border-[#2D2D2D]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase tracking-wider flex items-center gap-1.5">
                    <span>📌</span> Задачи на весь день
                  </span>
                  <button
                    onClick={() => {
                      setQuickModalDate(currentDateStr);
                      setQuickModalStartTime('');
                      setQuickModalDueTime('');
                      setIsQuickCreateModalOpen(true);
                    }}
                    className="text-xs text-[#2383E2] hover:underline font-medium"
                  >
                    + Добавить
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {scheduledTasks.filter(t => t.dueDate === currentDateStr && !t.startTime && !t.dueTime).map(task => {
                    const cardStyles = getNotionCardStyles(task);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData('text/plain', task.id);
                          setDraggingTaskId(task.id);
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onClick={(e) => onSelectNode(task.id, e)}
                        className={`px-2 py-1 rounded-md text-xs flex items-center gap-1.5 shadow-3xs cursor-grab active:cursor-grabbing border ${cardStyles.card}`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateNode({ ...task, completed: !task.completed });
                          }}
                        >
                          {task.completed ? <CheckCircle2 className="w-3 h-3 text-[#27AE60]" /> : <Circle className="w-3 h-3 text-[#9B9A97]" />}
                        </button>
                        <span>{getTaskPageIcon(task)}</span>
                        <span className={task.completed ? 'line-through opacity-55' : ''}>{cleanTaskTitle(task.text)}</span>
                      </div>
                    );
                  })}
                  {scheduledTasks.filter(t => t.dueDate === currentDateStr && !t.startTime && !t.dueTime).length === 0 && (
                    <span className="text-xs text-[#9B9A97] py-0.5">Нет задач на весь день</span>
                  )}
                </div>
              </div>
            </div>

            {/* Day 24-Hour Scrollable Grid */}
            <div 
              id="notion-calendar-day-scroll" 
              className="flex-1 overflow-y-auto custom-scrollbar relative bg-white dark:bg-[#191919]"
            >
              <div className="flex relative h-[1440px] max-w-4xl mx-auto w-full">
                
                {/* Time Gutter Column */}
                <div className="w-16 sm:w-20 shrink-0 border-r border-[#EDEDEB] dark:border-[#2D2D2D] bg-[#FAFAF9]/60 dark:bg-[#1C1C1C]/60 select-none z-10 sticky left-0">
                  {HOURS_24.map((hour) => (
                    <div key={hour} className="h-[60px] relative text-right pr-3 text-[11px] font-mono text-[#9B9A97] dark:text-[#777]">
                      <span className="relative -top-2.5 bg-white dark:bg-[#191919] px-0.5 rounded">
                        {hour}
                      </span>
                    </div>
                  ))}

                  {/* Live Now Indicator for today in Day View */}
                  {currentDateStr === realTodayStr && (
                    <div 
                      className="absolute right-0 translate-x-1/2 -translate-y-1/2 bg-[#EB5757] text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-sm z-30 pointer-events-none flex items-center"
                      style={{ top: `${nowMinutes}px` }}
                    >
                      {String(nowDate.getHours()).padStart(2, '0')}:{String(nowDate.getMinutes()).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {/* Day Canvas Column */}
                {(() => {
                  const dayTasks = scheduledTasks.filter(t => t.dueDate === currentDateStr);
                  const timedTasks = dayTasks.filter(t => t.startTime || t.dueTime);
                  const timedBlocks = computeBlocksForTasks(timedTasks);
                  const isDragOver = draggedOverDate === currentDateStr;
                  const isToday = currentDateStr === realTodayStr;

                  return (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDraggedOverDate(currentDateStr)}
                      onDragLeave={() => {
                        if (draggedOverDate === currentDateStr) setDraggedOverDate(null);
                      }}
                      onDrop={(e) => {
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const dropY = e.clientY - rect.top;
                          const totalMinutes = Math.max(0, Math.min(1439, Math.floor(dropY)));
                          const snappedMinutes = Math.round(totalMinutes / 15) * 15;
                          const taskToDrop = nodes.find(t => t.id === taskId);
                          if (taskToDrop) {
                            const { startTime, dueTime } = getUpdatedTimesForDrop(taskToDrop, snappedMinutes);
                            onUpdateNode({
                              ...taskToDrop,
                              dueDate: currentDateStr,
                              startTime,
                              dueTime
                            });
                          }
                        }
                        setDraggedOverDate(null);
                      }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[draggable="true"]') || target.closest('button')) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickY = e.clientY - rect.top;
                        const totalMinutes = Math.max(0, Math.min(1439, Math.floor(clickY)));
                        const snappedMinutes = Math.round(totalMinutes / 15) * 15;
                        const startTimeStr = minutesToTime(snappedMinutes);
                        const dueTimeStr = minutesToTime(Math.min(1439, snappedMinutes + 60));
                        
                        setQuickModalDate(currentDateStr);
                        setQuickModalStartTime(startTimeStr);
                        setQuickModalDueTime(dueTimeStr);
                        setIsQuickCreateModalOpen(true);
                      }}
                      className={`flex-1 h-[1440px] relative border-r border-[#EDEDEB] dark:border-[#2D2D2D] transition-colors cursor-pointer group ${
                        isToday ? 'bg-[#2383E2]/[0.02] dark:bg-[#2383E2]/[0.04]' : 'bg-white dark:bg-[#191919]'
                      } ${isDragOver ? 'bg-[#2383E2]/10 dark:bg-[#2383E2]/20' : ''}`}
                    >
                      {/* Gridlines */}
                      {Array.from({ length: 24 }).map((_, h) => (
                        <React.Fragment key={h}>
                          <div 
                            className="absolute left-0 right-0 border-b border-[#EDEDEB] dark:border-[#2D2D2D] pointer-events-none" 
                            style={{ top: `${h * HOUR_HEIGHT}px`, height: '0px' }} 
                          />
                          <div 
                            className="absolute left-0 right-0 border-b border-dashed border-[#EDEDEB]/50 dark:border-[#2D2D2D]/50 pointer-events-none" 
                            style={{ top: `${h * HOUR_HEIGHT + 30}px`, height: '0px' }} 
                          />
                        </React.Fragment>
                      ))}

                      {/* Real-time Indicator Line in Day View */}
                      {isToday && (
                        <div 
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{ top: `${nowMinutes}px` }}
                        >
                          <div className="w-3 h-3 rounded-full bg-[#EB5757] -ml-1.5 ring-2 ring-white dark:ring-[#191919] shadow-sm" />
                          <div className="flex-1 h-[2px] bg-[#EB5757] shadow-2xs" />
                        </div>
                      )}

                      {/* Timed Task Blocks */}
                      {timedBlocks.map(({ task, top, height, left, width, startMin, endMin }) => {
                        const cardStyles = getNotionCardStyles(task);
                        const isTaskSelected = task.id === selectedNodeId;
                        const isCurrentlyResizing = resizingTask?.taskId === task.id;

                        return (
                          <div
                            key={task.id}
                            draggable={!hoveringResizeHandle && !isCurrentlyResizing}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', task.id);
                              setDraggingTaskId(task.id);
                            }}
                            onDragEnd={() => setDraggingTaskId(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(task.id, e);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                            }}
                            className={`absolute rounded-lg p-2.5 text-xs flex flex-col justify-between overflow-hidden shadow-2xs cursor-grab active:cursor-grabbing border transition-all ${
                              cardStyles.card
                            } ${isTaskSelected ? 'ring-2 ring-[#2383E2] z-30' : 'z-10'} ${
                              draggingTaskId === task.id ? 'opacity-30 border-dashed' : ''
                            }`}
                            style={{
                              top: `${top}px`,
                              height: `${Math.max(32, height)}px`,
                              left: left || '4px',
                              width: width || 'calc(100% - 8px)',
                            }}
                            title={`${task.text} (${formatTaskTime(task)})`}
                          >
                            <div className={`absolute top-0 bottom-0 left-0 w-[4px] ${cardStyles.accentBar}`} />

                            {/* Resize Handles */}
                            <div
                              onMouseDown={(e) => handleResizeStart(e, task.id, 'top', startMin, endMin)}
                              onTouchStart={(e) => handleResizeStart(e, task.id, 'top', startMin, endMin)}
                              onMouseEnter={() => setHoveringResizeHandle(true)}
                              onMouseLeave={() => setHoveringResizeHandle(false)}
                              className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-30 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                            />
                            <div
                              onMouseDown={(e) => handleResizeStart(e, task.id, 'bottom', startMin, endMin)}
                              onTouchStart={(e) => handleResizeStart(e, task.id, 'bottom', startMin, endMin)}
                              onMouseEnter={() => setHoveringResizeHandle(true)}
                              onMouseLeave={() => setHoveringResizeHandle(false)}
                              className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-30 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                            />

                            <div className="pl-2 flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-1.5 font-medium">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateNode({ ...task, completed: !task.completed });
                                  }}
                                >
                                  {task.completed ? <CheckCircle2 className="w-3.5 h-3.5 text-[#27AE60]" /> : <Circle className="w-3.5 h-3.5 text-[#9B9A97]" />}
                                </button>
                                <span className="text-sm shrink-0">{getTaskPageIcon(task)}</span>
                                <span className={`truncate text-[13px] ${task.completed ? 'line-through opacity-60' : ''}`}>
                                  {cleanTaskTitle(task.text)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[10.5px] font-mono opacity-85 pl-5">
                                <span>{formatTaskTime(task)}</span>
                                <span className="opacity-60">•</span>
                                <span className="opacity-75">{getTaskDurationString(startMin, endMin)}</span>
                              </div>
                            </div>

                            {isCurrentlyResizing && (
                              <div className="absolute top-1.5 right-1.5 bg-black/80 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow z-40">
                                {minutesToTime(startMin)} – {minutesToTime(endMin)} ({getTaskDurationString(startMin, endMin)})
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* C. MONTH VIEW */}
        {/* ============================================================ */}
        {calendarSubMode === 'month' && (
          <div className="flex-1 flex flex-col min-w-[760px] h-full overflow-auto custom-scrollbar">
            {/* Weekdays Header Row */}
            <div className="grid grid-cols-7 border-b border-[#EDEDEB] dark:border-[#2D2D2D] bg-[#FAFAF9] dark:bg-[#1E1E1E] text-xs font-medium text-[#787774] dark:text-[#9B9A97] select-none sticky top-0 z-20">
              {WEEKDAYS_SHORT_RU.map((day, idx) => (
                <div key={day} className="py-2 px-3 border-r border-[#EDEDEB] dark:border-[#2D2D2D] last:border-r-0 flex items-center justify-between">
                  <span>{day}</span>
                  <span className="text-[10px] text-[#9B9A97] hidden sm:inline">{WEEKDAYS_FULL_RU[idx]}</span>
                </div>
              ))}
            </div>

            {/* 42 Monthly Grid Cells */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr border-b border-[#EDEDEB] dark:border-[#2D2D2D]">
              {calendarSlots.map((slot, sIdx) => {
                const dayTasks = scheduledTasks.filter(task => task.dueDate === slot.dateString);
                const isInactiveMonth = slot.monthOffset !== 0;
                const isDragOver = draggedOverDate === slot.dateString;

                return (
                  <div
                    key={`${slot.dateString}-${sIdx}`}
                    data-date={slot.dateString}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={() => setDraggedOverDate(slot.dateString)}
                    onDragLeave={() => {
                      if (draggedOverDate === slot.dateString) setDraggedOverDate(null);
                    }}
                    onDrop={(e) => {
                      const taskId = e.dataTransfer.getData('text/plain');
                      handleTaskDrop(taskId, slot.dateString);
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[draggable="true"]') || target.closest('button')) return;
                      setQuickModalDate(slot.dateString);
                      setQuickModalStartTime('');
                      setQuickModalDueTime('');
                      setIsQuickCreateModalOpen(true);
                    }}
                    className={`min-h-[110px] sm:min-h-[130px] p-1.5 border-b border-r border-[#EDEDEB] dark:border-[#2D2D2D] last:border-r-0 flex flex-col justify-between transition-colors group relative cursor-pointer ${
                      isInactiveMonth 
                        ? 'bg-[#FBFBFA] dark:bg-[#161616]' 
                        : 'bg-white dark:bg-[#191919]'
                    } ${
                      isDragOver ? 'bg-[#2383E2]/10 dark:bg-[#2383E2]/20' : ''
                    } hover:bg-[#F7F7F5] dark:hover:bg-[#202020]`}
                  >
                    {/* Cell Top Header */}
                    <div className="flex items-center justify-between mb-1 select-none">
                      {slot.isToday ? (
                        <span className="w-5 h-5 rounded-full bg-[#2383E2] text-white flex items-center justify-center font-semibold text-[11px] shadow-3xs">
                          {slot.dayNumber}
                        </span>
                      ) : (
                        <span className={`text-[12px] font-normal px-1 rounded ${
                          isInactiveMonth ? 'text-[#B8B7B5] dark:text-[#555]' : 'text-[#37352F] dark:text-[#D4D4D4]'
                        }`}>
                          {slot.dayNumber}
                        </span>
                      )}

                      {/* Quick '+' button on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickModalDate(slot.dateString);
                          setQuickModalStartTime('');
                          setQuickModalDueTime('');
                          setIsQuickCreateModalOpen(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#787774] hover:text-[#37352F] hover:bg-[#EAEAE8] dark:hover:bg-[#2E2E2E] transition-all cursor-pointer"
                        title="Создать задачу"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Day Tasks List */}
                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[110px] sm:max-h-[140px] custom-scrollbar pointer-events-auto">
                      {dayTasks.map(task => {
                        const cardStyles = getNotionCardStyles(task);
                        const isTaskSelected = task.id === selectedNodeId;

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', task.id);
                              setDraggingTaskId(task.id);
                            }}
                            onDragEnd={() => setDraggingTaskId(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(task.id, e);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                            }}
                            className={`task-item px-1.5 py-1 rounded text-[11px] leading-tight flex items-center gap-1.5 transition-all shadow-3xs cursor-grab active:cursor-grabbing border ${cardStyles.card} ${
                              isTaskSelected ? 'ring-1.5 ring-[#2383E2]' : ''
                            } ${draggingTaskId === task.id ? 'opacity-40 border-dashed' : ''}`}
                            title={`${task.text} ${task.startTime || task.dueTime ? `(${formatTaskTime(task)})` : ''}`}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateNode({ ...task, completed: !task.completed });
                              }}
                              className="text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] transition-colors shrink-0"
                            >
                              {task.completed ? (
                                <CheckCircle2 className="w-3 h-3 text-[#27AE60]" />
                              ) : (
                                <Circle className="w-3 h-3" />
                              )}
                            </button>

                            <span className="text-[11px] shrink-0">{getTaskPageIcon(task)}</span>
                            
                            <span className={`truncate flex-1 font-normal ${task.completed ? 'line-through opacity-55' : ''}`}>
                              {cleanTaskTitle(task.text)}
                            </span>

                            {(task.startTime || task.dueTime) && (
                              <span className="text-[9px] font-mono text-[#787774] dark:text-[#9B9A97] shrink-0">
                                {task.startTime || task.dueTime}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* D. NOTION CALENDAR SIDEBAR (MINI MONTH CALENDAR + UNSCHEDULED) */}
        {/* ============================================================ */}
        <div className={`shrink-0 border-t lg:border-t-0 lg:border-l border-[#EDEDEB] dark:border-[#2D2D2D] bg-[#FAFAF9] dark:bg-[#1C1C1C] flex flex-col transition-all duration-200 ${
          isUnscheduledExpanded 
            ? 'h-[300px] lg:h-full lg:w-72 p-3.5' 
            : 'h-[44px] lg:h-full lg:w-12 p-2 lg:items-center'
        }`}>
          
          {/* Header Toggle */}
          <div 
            onClick={() => setIsUnscheduledExpanded(!isUnscheduledExpanded)}
            className="flex items-center justify-between w-full cursor-pointer select-none mb-2.5 hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] p-1 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">📅</span>
              {isUnscheduledExpanded && (
                <h3 className="text-xs font-semibold text-[#111] dark:text-[#FFF] truncate">
                  Навигация & Задачи
                </h3>
              )}
            </div>

            {isUnscheduledExpanded && (
              <span className="text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] px-1.5 py-0.5 rounded bg-[#EDEDEB] dark:bg-[#2D2D2D]">
                {unscheduledTasks.length} без даты
              </span>
            )}
          </div>

          {isUnscheduledExpanded && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar gap-3">
              
              {/* Mini Month Picker Calendar in Notion Calendar style */}
              <div className="p-2 bg-white dark:bg-[#222222] border border-[#EDEDEB] dark:border-[#333] rounded-lg shadow-3xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#111] dark:text-[#FFF]">
                    {MONTH_NAMES_RU[month]} {year}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={prevMonth}
                      className="p-1 hover:bg-[#F0F0EE] dark:hover:bg-[#2D2D2D] rounded text-[#787774]"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={nextMonth}
                      className="p-1 hover:bg-[#F0F0EE] dark:hover:bg-[#2D2D2D] rounded text-[#787774]"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 text-center text-[10px] text-[#9B9A97] mb-1 font-medium">
                  {WEEKDAYS_SHORT_RU.map(d => (
                    <div key={d}>{d[0]}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
                  {calendarSlots.slice(0, 35).map((slot, i) => {
                    const isSelected = slot.dateString === currentDateStr;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const [y, m, d] = slot.dateString.split('-').map(Number);
                          setCurrentDate(new Date(y, m - 1, d));
                        }}
                        className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center transition-colors ${
                          slot.isToday
                            ? 'bg-[#2383E2] text-white font-semibold'
                            : isSelected
                            ? 'bg-[#EDEDEB] dark:bg-[#383838] font-semibold text-[#111] dark:text-[#FFF]'
                            : slot.monthOffset !== 0
                            ? 'text-[#C4C3C0] dark:text-[#555]'
                            : 'text-[#37352F] dark:text-[#D4D4D4] hover:bg-[#F2F2F0] dark:hover:bg-[#2D2D2D]'
                        }`}
                      >
                        {slot.dayNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Unscheduled Tasks Section */}
              <div className="flex-1 flex flex-col min-h-[140px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase tracking-wider flex items-center gap-1">
                    <span>📥</span> Без даты ({unscheduledTasks.length})
                  </span>
                </div>

                {/* Search input */}
                <div className="relative mb-2">
                  <Search className="w-3 h-3 text-[#9B9A97] absolute left-2 top-2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={sidebarSearchQuery}
                    onChange={(e) => setSidebarSearchQuery(e.target.value)}
                    className="w-full text-xs pl-7 pr-2 py-1 bg-white dark:bg-[#222222] border border-[#EDEDEB] dark:border-[#333] rounded-md text-[#37352F] dark:text-[#FFF] outline-none placeholder-[#9B9A97]"
                  />
                </div>

                {/* Unscheduled Task Items Dropzone */}
                <div
                  data-unscheduled-drop-zone="true"
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setDraggedOverUnscheduled(true)}
                  onDragLeave={() => setDraggedOverUnscheduled(false)}
                  onDrop={(e) => {
                    const taskId = e.dataTransfer.getData('text/plain');
                    handleTaskDrop(taskId, null);
                  }}
                  className={`flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5 rounded-md ${
                    draggedOverUnscheduled ? 'bg-[#2383E2]/10 border-2 border-dashed border-[#2383E2]' : ''
                  }`}
                >
                  {unscheduledTasks.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#9B9A97]">
                      <p>Все задачи распределены!</p>
                      <p className="text-[10px] text-[#B8B7B5] mt-1">Перетащите сюда, чтобы убрать срок</p>
                    </div>
                  ) : (
                    unscheduledTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', task.id);
                          setDraggingTaskId(task.id);
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                        onClick={(e) => onSelectNode(task.id, e)}
                        className="p-2 bg-white dark:bg-[#222222] border border-[#EDEDEB] dark:border-[#333] hover:border-[#D3D3D0] rounded-md shadow-3xs flex flex-col gap-1 cursor-grab active:cursor-grabbing transition-all group"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start gap-1.5 flex-1 min-w-0">
                            <span className="text-xs shrink-0">{getTaskPageIcon(task)}</span>
                            <span className="text-xs font-medium text-[#37352F] dark:text-[#FFF] truncate">
                              {cleanTaskTitle(task.text)}
                            </span>
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNode(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[#9B9A97] hover:text-rose-500 p-0.5 rounded transition-all"
                            title="Удалить"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#F1F1EF] dark:border-[#333]/50">
                          <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-normal ${getPriorityBadgeColor(task.priority)}`}>
                            {task.priority || 'medium'}
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateNode({ ...task, dueDate: realTodayStr });
                            }}
                            className="text-[10px] text-[#2383E2] hover:underline flex items-center gap-0.5"
                          >
                            На сегодня <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>

      {/* 4. QUICK NEW TASK NOTION MODAL */}
      {isQuickCreateModalOpen && (
        <div 
          onClick={() => setIsQuickCreateModalOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-[200] flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#202020] border border-[#EDEDEB] dark:border-[#333] shadow-2xl rounded-xl w-full max-w-md p-5 flex flex-col gap-4 text-[#37352F] dark:text-[#D4D4D4]"
          >
            <div className="flex items-center justify-between border-b border-[#EDEDEB] dark:border-[#2D2D2D] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📅</span>
                <h3 className="font-semibold text-base text-[#111] dark:text-[#FFF]">
                  Новое событие в Notion Calendar
                </h3>
              </div>
              <button
                onClick={() => setIsQuickCreateModalOpen(false)}
                className="text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#FFF] p-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickModalSubmit} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] mb-1">
                  Название
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Что планируется?"
                  value={quickModalText}
                  onChange={(e) => setQuickModalText(e.target.value)}
                  className="w-full text-sm p-2 bg-[#F7F7F5] dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#333] rounded-md outline-none focus:border-[#2383E2] text-[#111] dark:text-[#FFF]"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] mb-1">
                    Дата
                  </label>
                  <input
                    type="date"
                    value={quickModalDate}
                    onChange={(e) => setQuickModalDate(e.target.value)}
                    className="w-full p-1.5 bg-[#F7F7F5] dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#333] rounded-md outline-none text-[#37352F] dark:text-[#FFF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] mb-1">
                    Начало
                  </label>
                  <input
                    type="time"
                    value={quickModalStartTime}
                    onChange={(e) => setQuickModalStartTime(e.target.value)}
                    className="w-full p-1.5 bg-[#F7F7F5] dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#333] rounded-md outline-none text-[#37352F] dark:text-[#FFF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] mb-1">
                    Конец
                  </label>
                  <input
                    type="time"
                    value={quickModalDueTime}
                    onChange={(e) => setQuickModalDueTime(e.target.value)}
                    className="w-full p-1.5 bg-[#F7F7F5] dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#333] rounded-md outline-none text-[#37352F] dark:text-[#FFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#787774] dark:text-[#9B9A97] mb-1">
                  Приоритет
                </label>
                <select
                  value={quickModalPriority}
                  onChange={(e) => setQuickModalPriority(e.target.value as Priority)}
                  className="w-full p-1.5 bg-[#F7F7F5] dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#333] rounded-md outline-none text-[#37352F] dark:text-[#FFF]"
                >
                  <option value="urgent">⚡ Urgent (Срочно)</option>
                  <option value="high">🔥 High (Высокий)</option>
                  <option value="medium">⏳ Medium (Средний)</option>
                  <option value="low">💤 Low (Низкий)</option>
                  <option value="none">None (Без приоритета)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#EDEDEB] dark:border-[#2D2D2D] mt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#787774] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] rounded-md font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#2383E2] hover:bg-[#1D74C6] text-white rounded-md font-medium shadow-3xs"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
