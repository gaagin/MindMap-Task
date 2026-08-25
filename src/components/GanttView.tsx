import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Filter,
  MoreHorizontal,
  Calendar as CalendarIcon,
  CheckCircle2, 
  Circle, 
  AlignLeft,
  X,
  Share2,
  Check,
  Star,
  Minimize2,
  Maximize2,
  Table as TableIcon,
  Kanban as KanbanIcon,
  List as ListIcon,
  Clock,
  Sparkles,
  Paperclip,
  Smile,
  User,
  LayoutGrid
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

// Emoji palette for Notion document icons
const NOTION_EMOJIS = [
  '🎃', '❄️', '⛸️', '🦃', '🎿', '🏃', '🥕', '🍪', '💫', '🛏️',
  '✍️', '📝', '🤝', '🚂', '🏗️', '🛢️', '👩‍💻', '☕', '💡', '🚀',
  '🎨', '📊', '📌', '🎯', '⚡', '✨', '🔥', '📚', '📎', '🥑'
];

const NOTION_ASSIGNEES = [
  { id: '1', name: 'Alex', color: '#E3E2E0', svg: '👤' },
  { id: '2', name: 'Elena', color: '#FDECC8', svg: '👩' },
  { id: '3', name: 'Dmitry', color: '#DBEDDB', svg: '👨‍💻' },
  { id: '4', name: 'Sarah', color: '#D3E5EF', svg: '👩‍🔬' },
  { id: '5', name: 'Mike', color: '#F5E0E9', svg: '🧑‍🎨' },
];

const NOTION_STATUS_TAGS = [
  { id: 'posted', label: 'Posted', bg: 'bg-[#E3E2E0]', text: 'text-[#32302C]', darkBg: 'dark:bg-[#32302C]', darkText: 'dark:text-[#E3E2E0]' },
  { id: 'ready', label: 'Ready to post', bg: 'bg-[#DBEDDB]', text: 'text-[#1C3829]', darkBg: 'dark:bg-[#1C3829]', darkText: 'dark:text-[#DBEDDB]' },
  { id: 'proofreading', label: 'Needs proofreading', bg: 'bg-[#FFE2DD]', text: 'text-[#5D1715]', darkBg: 'dark:bg-[#5D1715]', darkText: 'dark:text-[#FFE2DD]' },
  { id: 'draft_done', label: 'First Draft Complete', bg: 'bg-[#E8DEEE]', text: 'text-[#412454]', darkBg: 'dark:bg-[#412454]', darkText: 'dark:text-[#E8DEEE]' },
  { id: 'in_progress', label: 'In Progress', bg: 'bg-[#F1F0EF]', text: 'text-[#5A5A5A]', darkBg: 'dark:bg-[#2F2F2F]', darkText: 'dark:text-[#D4D4D4]' },
  { id: 'up_next', label: 'Up Next', bg: 'bg-[#FDECC8]', text: 'text-[#402C1B]', darkBg: 'dark:bg-[#402C1B]', darkText: 'dark:text-[#FDECC8]' },
  { id: 'idea', label: 'Idea', bg: 'bg-[#D3E5EF]', text: 'text-[#183347]', darkBg: 'dark:bg-[#183347]', darkText: 'dark:text-[#D3E5EF]' },
];

const MONTHS_FULL_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTHS_FULL_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

interface ActiveDrag {
  taskId: string;
  type: 'move' | 'resize-start' | 'resize-end';
  initialStart: number;
  initialEnd: number;
  currentStart: number;
  currentEnd: number;
}

interface GanttViewProps {
  nodes: TaskNode[];
  allNodes?: TaskNode[];
  setViewMode?: (mode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower') => void;
  tagCategories?: TagCategory[];
  activeProjectId?: string;
  selectedNodeId?: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  focusedTaskId?: string | null;
  onFocusedTaskIdChange?: (id: string | null) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  onUpdateProjectIcon?: (icon: string) => void;
  onOpenSidebar?: () => void;
}

export default function GanttView({
  nodes,
  allNodes,
  setViewMode,
  tagCategories = [],
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onFullScreenChange,
  focusedTaskId,
  onFocusedTaskIdChange,
  projectName = 'Blog Posts',
  projectIcon = '✍️',
  onUpdateProjectName,
  onUpdateProjectIcon,
  onOpenSidebar
}: GanttViewProps) {
  // Scale selector dropdown options
  const [showScaleDropdown, setShowScaleDropdown] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Timeline Scale: 'Minutes' | 'Hours' | 'Days' | 'Weeks' | 'Bi-weeks' | 'Months' | 'Quarters'
  const [scaleMode, setScaleMode] = useState<'Minutes' | 'Hours' | 'Days' | 'Weeks' | 'Bi-weeks' | 'Months' | 'Quarters'>('Days');

  // Properties visibility toggle
  const [visibleProps, setVisibleProps] = useState({
    tag: true,
    priority: true,
    assignee: true,
    dates: true,
    tableSidebar: false
  });

  // Task inline editing/popover
  const [activeTaskEmojiPickerId, setActiveTaskEmojiPickerId] = useState<string | null>(null);
  const [activeTaskTagPickerId, setActiveTaskTagPickerId] = useState<string | null>(null);
  const [activePriorityPickerTaskId, setActivePriorityPickerTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [newInlineTaskText, setNewInlineTaskText] = useState('');
  const [showNewTaskInline, setShowNewTaskInline] = useState(false);
  const [showUnscheduledDrawer, setShowUnscheduledDrawer] = useState(false);

  // Local date helpers to avoid UTC timezone shifts
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatLocalTime = (d: Date) => {
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  const parseLocalDate = (s: string) => {
    const parts = s.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(s);
  };

  // Real today
  const realToday = useMemo(() => new Date(), []);
  const realTodayStr = useMemo(() => formatLocalDate(new Date()), []);

  // Timeline Base Date Configuration
  const [baseDate, setBaseDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 10);
    return today;
  });

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Column width & unit count based on scale
  const colWidth = useMemo(() => {
    switch (scaleMode) {
      case 'Minutes': return 52;
      case 'Hours': return 56;
      case 'Days': return 54;
      case 'Weeks': return 68;
      case 'Bi-weeks': return 78;
      case 'Months': return 84;
      case 'Quarters': return 100;
      default: return 54;
    }
  }, [scaleMode]);

  // Generate timeline columns according to the selected scale mode
  const timelineColumns = useMemo(() => {
    interface ColData {
      id: string;
      label: string;
      subLabel?: string;
      startDate: Date;
      endDate: Date;
      isCurrent: boolean;
      isWeekend?: boolean;
      parentGroupKey: string;
      parentGroupTitle: string;
    }
    const cols: ColData[] = [];

    if (scaleMode === 'Minutes') {
      // 15-minute steps across 36 columns (9 hours total)
      const totalSteps = 36;
      const ref = new Date(baseDate);
      const minRemainder = ref.getMinutes() % 15;
      ref.setMinutes(ref.getMinutes() - minRemainder, 0, 0);

      for (let i = 0; i < totalSteps; i++) {
        const stepStart = new Date(ref.getTime() + i * 15 * 60 * 1000);
        const stepEnd = new Date(stepStart.getTime() + 15 * 60 * 1000 - 1);
        const isCurrent = realToday >= stepStart && realToday <= stepEnd;
        const hoursStr = String(stepStart.getHours()).padStart(2, '0');
        const minsStr = String(stepStart.getMinutes()).padStart(2, '0');
        const dayNumber = stepStart.getDate();
        const monthName = MONTHS_FULL_EN[stepStart.getMonth()];
        const year = stepStart.getFullYear();

        cols.push({
          id: `min-${stepStart.getTime()}`,
          label: `${hoursStr}:${minsStr}`,
          startDate: stepStart,
          endDate: stepEnd,
          isCurrent,
          parentGroupKey: `${year}-${stepStart.getMonth()}-${dayNumber}`,
          parentGroupTitle: `${dayNumber} ${monthName} ${year}`
        });
      }
    } else if (scaleMode === 'Hours') {
      // 1-hour steps across 36 columns (36 hours)
      const totalHours = 36;
      const ref = new Date(baseDate);
      ref.setMinutes(0, 0, 0);

      for (let i = 0; i < totalHours; i++) {
        const hStart = new Date(ref.getTime() + i * 60 * 60 * 1000);
        const hEnd = new Date(hStart.getTime() + 60 * 60 * 1000 - 1);
        const isCurrent = realToday >= hStart && realToday <= hEnd;
        const hoursStr = String(hStart.getHours()).padStart(2, '0');
        const dayNumber = hStart.getDate();
        const monthName = MONTHS_FULL_EN[hStart.getMonth()];
        const year = hStart.getFullYear();

        cols.push({
          id: `hour-${hStart.getTime()}`,
          label: `${hoursStr}:00`,
          startDate: hStart,
          endDate: hEnd,
          isCurrent,
          parentGroupKey: `${year}-${hStart.getMonth()}-${dayNumber}`,
          parentGroupTitle: `${dayNumber} ${monthName} ${year}`
        });
      }
    } else if (scaleMode === 'Days') {
      const totalDays = 35;
      const ref = new Date(baseDate);
      ref.setHours(0, 0, 0, 0);

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(ref);
        d.setDate(ref.getDate() + i);
        const dEnd = new Date(d);
        dEnd.setHours(23, 59, 59, 999);
        const dStr = d.toISOString().split('T')[0];
        const dow = d.getDay();
        const monthName = MONTHS_FULL_EN[d.getMonth()];
        const year = d.getFullYear();

        cols.push({
          id: `day-${dStr}`,
          label: `${d.getDate()}`,
          startDate: d,
          endDate: dEnd,
          isCurrent: dStr === realTodayStr,
          isWeekend: dow === 0 || dow === 6,
          parentGroupKey: `${year}-${d.getMonth()}`,
          parentGroupTitle: `${monthName} ${year}`
        });
      }
    } else if (scaleMode === 'Weeks') {
      const totalWeeks = 24;
      const ref = new Date(baseDate);
      ref.setHours(0, 0, 0, 0);
      // Align to Monday of the week
      const dow = (ref.getDay() + 6) % 7;
      ref.setDate(ref.getDate() - dow);

      for (let i = 0; i < totalWeeks; i++) {
        const wStart = new Date(ref);
        wStart.setDate(ref.getDate() + i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const isCurrent = realToday >= wStart && realToday <= wEnd;
        const monthName = MONTHS_FULL_EN[wStart.getMonth()];
        const year = wStart.getFullYear();

        cols.push({
          id: `week-${wStart.toISOString().split('T')[0]}`,
          label: `${wStart.getDate()}`,
          subLabel: MONTHS_FULL_EN[wStart.getMonth()].slice(0, 3),
          startDate: wStart,
          endDate: wEnd,
          isCurrent,
          parentGroupKey: `${year}-${wStart.getMonth()}`,
          parentGroupTitle: `${monthName} ${year}`
        });
      }
    } else if (scaleMode === 'Bi-weeks') {
      const totalBiWeeks = 20;
      const ref = new Date(baseDate);
      ref.setHours(0, 0, 0, 0);
      const dow = (ref.getDay() + 6) % 7;
      ref.setDate(ref.getDate() - dow);

      for (let i = 0; i < totalBiWeeks; i++) {
        const bwStart = new Date(ref);
        bwStart.setDate(ref.getDate() + i * 14);
        const bwEnd = new Date(bwStart);
        bwEnd.setDate(bwStart.getDate() + 13);
        bwEnd.setHours(23, 59, 59, 999);

        const isCurrent = realToday >= bwStart && realToday <= bwEnd;
        const monthName = MONTHS_FULL_EN[bwStart.getMonth()];
        const year = bwStart.getFullYear();

        cols.push({
          id: `biweek-${bwStart.toISOString().split('T')[0]}`,
          label: `${MONTHS_FULL_EN[bwStart.getMonth()].slice(0, 3)} ${bwStart.getDate()}`,
          startDate: bwStart,
          endDate: bwEnd,
          isCurrent,
          parentGroupKey: `${year}-${bwStart.getMonth()}`,
          parentGroupTitle: `${monthName} ${year}`
        });
      }
    } else if (scaleMode === 'Months') {
      const totalMonths = 24;
      const ref = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);

      for (let i = 0; i < totalMonths; i++) {
        const mStart = new Date(ref.getFullYear(), ref.getMonth() + i, 1, 0, 0, 0, 0);
        const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0, 23, 59, 59, 999);
        const isCurrent = realToday >= mStart && realToday <= mEnd;
        const year = mStart.getFullYear();

        cols.push({
          id: `month-${year}-${mStart.getMonth()}`,
          label: MONTHS_FULL_EN[mStart.getMonth()].slice(0, 3),
          startDate: mStart,
          endDate: mEnd,
          isCurrent,
          parentGroupKey: `${year}`,
          parentGroupTitle: `${year}`
        });
      }
    } else if (scaleMode === 'Quarters') {
      const totalQuarters = 16;
      const curQ = Math.floor(baseDate.getMonth() / 3);
      const ref = new Date(baseDate.getFullYear(), curQ * 3, 1, 0, 0, 0, 0);

      for (let i = 0; i < totalQuarters; i++) {
        const qStart = new Date(ref.getFullYear(), ref.getMonth() + i * 3, 1, 0, 0, 0, 0);
        const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0, 23, 59, 59, 999);
        const isCurrent = realToday >= qStart && realToday <= qEnd;
        const qNum = Math.floor(qStart.getMonth() / 3) + 1;
        const year = qStart.getFullYear();

        cols.push({
          id: `quarter-${year}-Q${qNum}`,
          label: `Q${qNum}`,
          startDate: qStart,
          endDate: qEnd,
          isCurrent,
          parentGroupKey: `${year}`,
          parentGroupTitle: `${year}`
        });
      }
    }

    return cols;
  }, [scaleMode, baseDate, realToday, realTodayStr]);

  // Distinct parent groups in current timeline for the header
  const headerGroups = useMemo(() => {
    const groups: { title: string; startIndex: number; count: number }[] = [];
    timelineColumns.forEach((col, index) => {
      const last = groups[groups.length - 1];
      if (!last || last.title !== col.parentGroupTitle) {
        groups.push({
          title: col.parentGroupTitle,
          startIndex: index,
          count: 1
        });
      } else {
        last.count += 1;
      }
    });
    return groups;
  }, [timelineColumns]);

  // Full timeline pixel width and date bounds
  const totalTimelinePxWidth = useMemo(() => {
    return timelineColumns.length * colWidth;
  }, [timelineColumns.length, colWidth]);

  const timelineStartMs = useMemo(() => {
    return timelineColumns[0]?.startDate.getTime() || 0;
  }, [timelineColumns]);

  const timelineEndMs = useMemo(() => {
    return timelineColumns[timelineColumns.length - 1]?.endDate.getTime() || 0;
  }, [timelineColumns]);

  // Today position in px
  const todayPosPx = useMemo(() => {
    if (!timelineStartMs || !timelineEndMs || timelineEndMs === timelineStartMs) return null;
    const nowMs = realToday.getTime();
    if (nowMs < timelineStartMs || nowMs > timelineEndMs) return null;
    const fraction = (nowMs - timelineStartMs) / (timelineEndMs - timelineStartMs);
    return fraction * totalTimelinePxWidth;
  }, [realToday, timelineStartMs, timelineEndMs, totalTimelinePxWidth]);

  // Filter tasks
  const allTasks = useMemo(() => {
    return (nodes || []).filter(n => !n.isContainer && !n.isWorkflowRectangle);
  }, [nodes]);

  // Tasks that have dates assigned (startDate or dueDate)
  const scheduledTasks = useMemo(() => {
    return allTasks.filter(n => Boolean(n.startDate || n.dueDate));
  }, [allTasks]);

  // Tasks without dates (Unscheduled / Без даты)
  const unscheduledTasks = useMemo(() => {
    return allTasks.filter(n => !n.startDate && !n.dueDate);
  }, [allTasks]);

  // Icon for task
  const getTaskEmoji = (task: TaskNode) => {
    if (task.icon) return task.icon;
    const match = task.text.match(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+/u);
    if (match) return match[0];
    return '📌';
  };

  // Helper to get clean title without emoji prefix
  const getCleanTitle = (text: string) => {
    return text.replace(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u, '').trim() || text;
  };

  // Helper to determine real status tag for task (No fake random data)
  const getTaskTag = (task: TaskNode) => {
    if (task.completed || task.status === 'done') {
      return { id: 'done', label: 'Готово', bg: 'bg-[#DBEDDB]', text: 'text-[#1C3829]', darkBg: 'dark:bg-[#1C3829]', darkText: 'dark:text-[#DBEDDB]' };
    }
    if (task.status === 'progress') {
      return { id: 'progress', label: 'В процессе', bg: 'bg-[#D3E5EF]', text: 'text-[#183347]', darkBg: 'dark:bg-[#183347]', darkText: 'dark:text-[#D3E5EF]' };
    }
    if (task.status === 'waiting') {
      return { id: 'waiting', label: 'Ожидание', bg: 'bg-[#FDECC8]', text: 'text-[#402C1B]', darkBg: 'dark:bg-[#402C1B]', darkText: 'dark:text-[#FDECC8]' };
    }
    if (task.status === 'todo') {
      return { id: 'todo', label: 'К выполнению', bg: 'bg-[#F1F0EF]', text: 'text-[#5A5A5A]', darkBg: 'dark:bg-[#2F2F2F]', darkText: 'dark:text-[#D4D4D4]' };
    }
    if (task.tags && task.tags.length > 0) {
      return { id: 'tag', label: task.tags[0], bg: 'bg-[#E8DEEE]', text: 'text-[#412454]', darkBg: 'dark:bg-[#412454]', darkText: 'dark:text-[#E8DEEE]' };
    }
    if (task.priority === 'urgent') {
      return { id: 'urgent', label: 'Срочно', bg: 'bg-[#FFE2DD]', text: 'text-[#5D1715]', darkBg: 'dark:bg-[#5D1715]', darkText: 'dark:text-[#FFE2DD]' };
    }
    if (task.priority === 'high') {
      return { id: 'high', label: 'Высокий', bg: 'bg-[#FFE2DD]', text: 'text-[#5D1715]', darkBg: 'dark:bg-[#5D1715]', darkText: 'dark:text-[#FFE2DD]' };
    }
    return null;
  };

  // Pre-calculate date range and px position for each task bar
  const getTaskRange = (task: TaskNode) => {
    let startStr = task.startDate;
    let endStr = task.dueDate;

    if (!startStr && !endStr) {
      startStr = realTodayStr;
      endStr = realTodayStr;
    } else if (startStr && !endStr) {
      endStr = startStr;
    } else if (!startStr && endStr) {
      startStr = endStr;
    }

    const sDate = parseLocalDate(startStr!);
    const eDate = parseLocalDate(endStr!);

    if (scaleMode === 'Minutes' || scaleMode === 'Hours') {
      if (task.startTime) {
        const [h, m] = task.startTime.split(':').map(Number);
        sDate.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
      } else {
        sDate.setHours(0, 0, 0, 0);
      }

      if (task.dueTime) {
        const [h, m] = task.dueTime.split(':').map(Number);
        eDate.setHours(isNaN(h) ? 23 : h, isNaN(m) ? 59 : m, 59, 999);
      } else if (task.startTime && !task.dueDate) {
        const [h, m] = task.startTime.split(':').map(Number);
        eDate.setHours(isNaN(h) ? 1 : h + 1, isNaN(m) ? 0 : m, 0, 0);
      } else {
        eDate.setHours(23, 59, 59, 999);
      }
    } else {
      sDate.setHours(0, 0, 0, 0);
      eDate.setHours(23, 59, 59, 999);
    }

    const sMs = sDate.getTime();
    const eMs = eDate.getTime();

    const totalMs = timelineEndMs - timelineStartMs;
    const startPx = totalMs > 0 ? ((sMs - timelineStartMs) / totalMs) * totalTimelinePxWidth : 0;
    const endPx = totalMs > 0 ? ((eMs - timelineStartMs) / totalMs) * totalTimelinePxWidth : 100;

    const isOffscreenLeft = eMs < timelineStartMs;
    const isOffscreenRight = sMs > timelineEndMs;

    // Minimum bar width: at least 14px so handles are grab-able and block is visible
    const computedWidth = Math.max(14, endPx - startPx);

    return {
      startMs: sMs,
      endMs: eMs,
      startPx,
      endPx,
      computedLeft: startPx,
      computedWidth,
      isOffscreenLeft,
      isOffscreenRight,
      startStr: formatLocalDate(sDate),
      endStr: formatLocalDate(eDate)
    };
  };

  // Drag-to-move and drag-to-resize handlers
  const [activeDrag, setActiveDrag] = useState<{
    taskId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    initialStartMs: number;
    initialEndMs: number;
    currentStartMs: number;
    currentEndMs: number;
  } | null>(null);

  const activeDragRef = useRef<{
    taskId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    initialStartMs: number;
    initialEndMs: number;
    currentStartMs: number;
    currentEndMs: number;
    startX: number;
  } | null>(null);
  const dragHasMovedRef = useRef(false);

  const handleBarMouseDown = (
    e: React.MouseEvent,
    taskId: string,
    type: 'move' | 'resize-start' | 'resize-end',
    startMs: number,
    endMs: number
  ) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;

    // Do not start drag if user clicked an interactive child element (button, input, emoji trigger, popover)
    if (type === 'move' && target.closest('button, input, [data-interactive="true"], [data-popover="true"], [data-popover-trigger="true"]')) {
      return;
    }

    e.stopPropagation();
    if (type === 'resize-start' || type === 'resize-end') {
      e.preventDefault();
    }

    dragHasMovedRef.current = false;
    const dragData = {
      taskId,
      type,
      initialStartMs: startMs,
      initialEndMs: endMs,
      currentStartMs: startMs,
      currentEndMs: endMs,
      startX: e.clientX
    };

    activeDragRef.current = dragData;
    setActiveDrag({
      taskId,
      type,
      initialStartMs: startMs,
      initialEndMs: endMs,
      currentStartMs: startMs,
      currentEndMs: endMs
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const info = activeDragRef.current;
      if (!info) return;

      const dx = e.clientX - info.startX;
      if (!dragHasMovedRef.current && Math.abs(dx) > 3) {
        dragHasMovedRef.current = true;
      }

      if (dragHasMovedRef.current) {
        e.preventDefault();
        const totalMs = timelineEndMs - timelineStartMs;
        const msPerPx = totalTimelinePxWidth > 0 ? totalMs / totalTimelinePxWidth : 86400000;
        const deltaMsRaw = dx * msPerPx;

        // Snap step according to scale mode
        const snapMs = scaleMode === 'Minutes' 
          ? 15 * 60 * 1000 
          : scaleMode === 'Hours' 
            ? 60 * 60 * 1000 
            : 86400000;
        const deltaMs = Math.round(deltaMsRaw / snapMs) * snapMs;

        let newStartMs = info.initialStartMs;
        let newEndMs = info.initialEndMs;

        if (info.type === 'move') {
          const duration = info.initialEndMs - info.initialStartMs;
          newStartMs = info.initialStartMs + deltaMs;
          newEndMs = newStartMs + duration;
        } else if (info.type === 'resize-start') {
          newStartMs = Math.min(info.initialEndMs - snapMs, info.initialStartMs + deltaMs);
        } else if (info.type === 'resize-end') {
          newEndMs = Math.max(info.initialStartMs + snapMs, info.initialEndMs + deltaMs);
        }

        info.currentStartMs = newStartMs;
        info.currentEndMs = newEndMs;

        setActiveDrag({
          taskId: info.taskId,
          type: info.type,
          initialStartMs: info.initialStartMs,
          initialEndMs: info.initialEndMs,
          currentStartMs: newStartMs,
          currentEndMs: newEndMs
        });
      }
    };

    const handleMouseUp = () => {
      const info = activeDragRef.current;
      const didMove = dragHasMovedRef.current;
      activeDragRef.current = null;
      dragHasMovedRef.current = false;
      setActiveDrag(null);

      if (info && didMove) {
        const task = allTasks.find(t => t.id === info.taskId);
        if (task) {
          const sDate = new Date(info.currentStartMs);
          const eDate = new Date(info.currentEndMs);

          const updateObj: Partial<TaskNode> = {
            startDate: formatLocalDate(sDate),
            dueDate: formatLocalDate(eDate)
          };

          if (scaleMode === 'Minutes' || scaleMode === 'Hours') {
            updateObj.startTime = formatLocalTime(sDate);
            updateObj.dueTime = formatLocalTime(eDate);
          }

          onUpdateNode({
            ...task,
            ...updateObj
          });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [timelineStartMs, timelineEndMs, totalTimelinePxWidth, scaleMode, allTasks, onUpdateNode]);

  // Navigate timeline with proportional step according to current scale
  const shiftTimeline = (direction: -1 | 1) => {
    setBaseDate(prev => {
      const n = new Date(prev);
      if (scaleMode === 'Minutes') {
        n.setTime(n.getTime() + direction * 2 * 60 * 60 * 1000);
      } else if (scaleMode === 'Hours') {
        n.setTime(n.getTime() + direction * 12 * 60 * 60 * 1000);
      } else if (scaleMode === 'Days') {
        n.setDate(n.getDate() + direction * 7);
      } else if (scaleMode === 'Weeks') {
        n.setDate(n.getDate() + direction * 28);
      } else if (scaleMode === 'Bi-weeks') {
        n.setDate(n.getDate() + direction * 56);
      } else if (scaleMode === 'Months') {
        n.setMonth(n.getMonth() + direction * 6);
      } else if (scaleMode === 'Quarters') {
        n.setFullYear(n.getFullYear() + direction * 1);
      }
      return n;
    });
  };

  const handleScaleChange = (mode: 'Minutes' | 'Hours' | 'Days' | 'Weeks' | 'Bi-weeks' | 'Months' | 'Quarters') => {
    setScaleMode(mode);
    setShowScaleDropdown(false);
    const today = new Date();
    if (mode === 'Minutes') {
      today.setMinutes(today.getMinutes() - 45);
      today.setSeconds(0, 0);
    } else if (mode === 'Hours') {
      today.setHours(today.getHours() - 6);
      today.setMinutes(0, 0, 0);
    } else if (mode === 'Days') {
      today.setDate(today.getDate() - 10);
    } else if (mode === 'Weeks') {
      today.setDate(today.getDate() - 28);
    } else if (mode === 'Bi-weeks') {
      today.setDate(today.getDate() - 56);
    } else if (mode === 'Months') {
      today.setMonth(today.getMonth() - 6);
    } else if (mode === 'Quarters') {
      today.setFullYear(today.getFullYear() - 1);
    }
    setBaseDate(today);
  };

  const jumpToToday = () => {
    const today = new Date();
    if (scaleMode === 'Minutes') {
      today.setMinutes(today.getMinutes() - 45);
      today.setSeconds(0, 0);
    } else if (scaleMode === 'Hours') {
      today.setHours(today.getHours() - 6);
      today.setMinutes(0, 0, 0);
    } else if (scaleMode === 'Days') {
      today.setDate(today.getDate() - 10);
    } else if (scaleMode === 'Weeks') {
      today.setDate(today.getDate() - 28);
    } else if (scaleMode === 'Bi-weeks') {
      today.setDate(today.getDate() - 56);
    } else if (scaleMode === 'Months') {
      today.setMonth(today.getMonth() - 6);
    } else if (scaleMode === 'Quarters') {
      today.setFullYear(today.getFullYear() - 1);
    }
    setBaseDate(today);
  };

  const handleCreateNewTask = (customText?: string) => {
    const text = customText || newInlineTaskText.trim() || 'Untitled Post';
    const todayStr = new Date().toISOString().split('T')[0];
    const end = new Date();
    end.setDate(end.getDate() + 3);
    const endStr = end.toISOString().split('T')[0];

    if (onCreateTask) {
      onCreateTask(text, ['In Progress'], endStr);
    }
    setNewInlineTaskText('');
    setShowNewTaskInline(false);
  };

  // Close open popovers when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-popover="true"]') || target.closest('[data-popover-trigger="true"]')) {
        return;
      }
      setShowScaleDropdown(false);
      setActiveTaskEmojiPickerId(null);
      setActiveTaskTagPickerId(null);
      setActivePriorityPickerTaskId(null);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);

  return (
    <div 
      id="notion-timeline-workspace"
      className={`flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#D4D4D4] font-sans h-full w-full overflow-hidden select-none ${
        isFullScreen ? 'fixed inset-0 z-[150] w-screen h-screen' : ''
      }`}
    >
      {/* TIMELINE CONTROLS SUB-HEADER (» Month Year ... [Days/Weeks/Months ⌄], < Today >) */}
      <div className="border-b border-[#EDEDEB] dark:border-[#2F2F2F] bg-white dark:bg-[#191919] flex items-center justify-between px-4 sm:px-12 py-1.5 shrink-0 text-[13px] relative z-40">
        
        {/* Left: Parent Group Indicators (Month Year or Year) */}
        <div className="flex items-center gap-6 overflow-hidden">
          {headerGroups.map((g, idx) => (
            <div key={`${g.title}-${idx}`} className="flex items-center gap-1.5 font-medium text-[#37352F] dark:text-[#EBEBEB] shrink-0">
              {idx === 0 && <span className="text-[#9B9A97] font-bold">»</span>}
              <span>{g.title}</span>
            </div>
          ))}
        </div>

        {/* Right: Scale Dropdown ([Quarters ⌄] / Days) and < Today > navigation */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Unscheduled Tasks Button */}
          {unscheduledTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUnscheduledDrawer(!showUnscheduledDrawer)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
                showUnscheduledDrawer
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 ring-1 ring-amber-400/40'
                  : 'bg-[#F7F7F5] dark:bg-[#252525] text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#EBEBEB] border-[#EDEDEB] dark:border-[#383838]'
              }`}
              title="Задачи без даты (нажмите, чтобы открыть)"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Без даты ({unscheduledTasks.length})</span>
            </button>
          )}

          {/* Scale selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowScaleDropdown(!showScaleDropdown);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-[#EFEFED] dark:hover:bg-[#2B2B2B] text-[#37352F] dark:text-[#EBEBEB] border border-[#EDEDEB] dark:border-[#383838] bg-[#F7F7F5] dark:bg-[#252525] cursor-pointer transition-colors text-[12.5px] font-medium"
            >
              <span>{scaleMode}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#9B9A97]" />
            </button>

            {showScaleDropdown && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg py-1 w-36 text-[12.5px]"
              >
                {(['Minutes', 'Hours', 'Days', 'Weeks', 'Bi-weeks', 'Months', 'Quarters'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => handleScaleChange(mode)}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[#F1F1EF] dark:hover:bg-[#303030] cursor-pointer ${
                      scaleMode === mode ? 'font-semibold text-[#2383E2]' : ''
                    }`}
                  >
                    <span>{mode}</span>
                    {scaleMode === mode && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* < Today > navigation block */}
          <div className="flex items-center text-[#787774] dark:text-[#9B9A97] bg-[#F7F7F5] dark:bg-[#252525] rounded p-0.5 border border-[#EDEDEB] dark:border-[#383838]">
            <button
              onClick={() => shiftTimeline(-1)}
              className="p-1 hover:bg-white dark:hover:bg-[#303030] rounded cursor-pointer transition-colors"
              title="Назад во времени"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={jumpToToday}
              className="px-2 py-0.5 text-[12px] font-medium text-[#37352F] dark:text-[#EBEBEB] hover:bg-white dark:hover:bg-[#303030] rounded cursor-pointer transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => shiftTimeline(1)}
              className="p-1 hover:bg-white dark:hover:bg-[#303030] rounded cursor-pointer transition-colors"
              title="Вперед во времени"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>

      {/* 5. MAIN TIMELINE CANVAS BODY (Notion Timeview Grid & Cards) */}
      <div 
        ref={timelineContainerRef}
        className="flex-1 flex overflow-hidden relative bg-white dark:bg-[#191919]"
      >
        
        {/* Optional Left Table Sidebar (When enabled in Properties) */}
        {visibleProps.tableSidebar && (
          <div className="w-64 sm:w-72 border-r border-[#EDEDEB] dark:border-[#2F2F2F] flex flex-col shrink-0 bg-white dark:bg-[#191919] z-10">
            <div className="h-8 px-4 flex items-center justify-between border-b border-[#EDEDEB] dark:border-[#2F2F2F] text-[11.5px] font-semibold text-[#9B9A97] uppercase tracking-wider">
              <span>Title</span>
              <span>Status</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#F1F1EF] dark:divide-[#252525]">
              {scheduledTasks.map(task => {
                const emoji = getTaskEmoji(task);
                const tag = getTaskTag(task);
                const clean = getCleanTitle(task.text);
                return (
                  <div
                    key={`sidebar-${task.id}`}
                    onClick={(e) => onSelectNode(task.id, e)}
                    className="h-10 px-4 flex items-center justify-between gap-2 hover:bg-[#F7F7F5] dark:hover:bg-[#222222] cursor-pointer text-[13px]"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <span>{emoji}</span>
                      <span className="truncate text-[#37352F] dark:text-[#EBEBEB]">{clean}</span>
                    </div>
                    {tag && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 font-medium ${tag.bg} ${tag.text} ${tag.darkBg} ${tag.darkText}`}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Timeline Grid Container */}
        <div 
          ref={timelineScrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative"
        >
          <div 
            style={{ width: `${Math.max(1000, totalTimelinePxWidth)}px` }}
            className="min-h-full flex flex-col relative"
          >
            
            {/* Timeline Header Row (Date tick units: Day numbers, Week starts, Months, or Quarters) */}
            <div className="h-8 border-b border-[#EDEDEB] dark:border-[#2F2F2F] flex sticky top-0 bg-white/95 dark:bg-[#191919]/95 backdrop-blur-xs z-30 select-none">
              {timelineColumns.map((col) => {
                return (
                  <div
                    key={col.id}
                    style={{ width: `${colWidth}px` }}
                    className={`h-full border-r border-[#EDEDEB]/50 dark:border-[#2F2F2F]/50 flex items-center justify-center relative shrink-0 ${
                      col.isWeekend ? 'bg-[#FAFAF9]/40 dark:bg-[#1C1C1C]/40' : ''
                    }`}
                  >
                    {col.isCurrent ? (
                      <div className="px-1.5 py-0.5 min-w-[20px] h-5 rounded-full bg-[#EB5757] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                        {col.label}
                      </div>
                    ) : (
                      <span className="text-[12px] font-normal text-[#9B9A97] dark:text-[#7A7A7A] truncate px-0.5">
                        {col.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical Columns Grid */}
            <div className="absolute inset-0 pointer-events-none flex z-0">
              {timelineColumns.map((col) => (
                <div
                  key={`grid-${col.id}`}
                  style={{ width: `${colWidth}px` }}
                  className={`h-full border-r border-[#EDEDEB]/30 dark:border-[#2F2F2F]/30 shrink-0 relative ${
                    col.isWeekend ? 'bg-[#FAFAF9]/20 dark:bg-[#1C1C1C]/20' : ''
                  }`}
                />
              ))}
            </div>

            {/* Vertical Red Line for Today */}
            {todayPosPx !== null && (
              <div 
                style={{ left: `${todayPosPx}px` }}
                className="absolute top-8 bottom-0 w-px bg-[#EB5757] z-20 pointer-events-none"
              />
            )}

            {/* Parent Group Vertical Dividers */}
            <div className="absolute inset-0 pointer-events-none flex z-0">
              {headerGroups.map((g, idx) => (
                <div
                  key={`group-divider-${g.title}-${idx}`}
                  style={{ 
                    left: `${g.startIndex * colWidth}px`,
                    width: `${g.count * colWidth}px`
                  }}
                  className="absolute top-0 bottom-0 border-l border-[#D9D9D7] dark:border-[#383838]"
                />
              ))}
            </div>

            {/* TIMELINE ROWS (Card items) */}
            <div className="flex-1 py-3 flex flex-col gap-2 relative z-10">
              
              {scheduledTasks.length === 0 ? (
                <div className="py-20 text-center text-[#9B9A97] px-4 max-w-md mx-auto select-none">
                  <Clock className="w-8 h-8 mx-auto text-[#9B9A97]/60 mb-2" />
                  <p className="text-sm font-medium text-[#37352F] dark:text-[#EBEBEB]">Нет задач с датами на таймлайне</p>
                  <p className="text-xs text-[#787774] dark:text-[#9B9A97] mt-1">
                    {unscheduledTasks.length > 0
                      ? `В проекте ${unscheduledTasks.length} задач(и) без дат. Нажмите «Без даты» вверху, чтобы распределить их.`
                      : 'Задайте дату начала или срок выполнения в карточке задачи.'}
                  </p>
                  <button 
                    onClick={() => handleCreateNewTask()}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2383E2] text-white text-xs font-semibold hover:bg-[#1f73c6] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Создать задачу на сегодня</span>
                  </button>
                </div>
              ) : (
                scheduledTasks.map((task) => {
                  const range = getTaskRange(task);
                  const isSelected = selectedNodeId === task.id;
                  const isBeingDragged = activeDrag && activeDrag.taskId === task.id;
                  const emoji = getTaskEmoji(task);
                  const tag = getTaskTag(task);
                  const cleanTitle = getCleanTitle(task.text);

                  let cardLeftPx = range.computedLeft;
                  let cardWidthPx = range.computedWidth;

                  if (isBeingDragged) {
                    const totalMs = timelineEndMs - timelineStartMs;
                    if (totalMs > 0) {
                      const dStartPx = ((activeDrag.currentStartMs - timelineStartMs) / totalMs) * totalTimelinePxWidth;
                      const dEndPx = ((activeDrag.currentEndMs - timelineStartMs) / totalMs) * totalTimelinePxWidth;
                      cardLeftPx = dStartPx;
                      cardWidthPx = Math.max(14, dEndPx - dStartPx);
                    }
                  }

                  // Layout calculations for fitting content inside vs outside the task box
                  const canFitEmojiInside = cardWidthPx >= 28;
                  const titleNeededWidth = cleanTitle.length * 7.5;
                  const hasTag = Boolean(visibleProps.tag && tag);
                  const tagNeededWidth = hasTag ? 85 : 0;
                  const hasPriority = Boolean(visibleProps.priority && task.priority && task.priority !== 'none');
                  const priorityNeededWidth = hasPriority ? 30 : 0;

                  // Title fits inside only if the bar is wide enough to show it clearly
                  const canFitTitleInside = cardWidthPx >= Math.max(90, (canFitEmojiInside ? 26 : 0) + titleNeededWidth + 24);
                  // Tags/Status fit inside only if both title and tags fit comfortably inside
                  const canFitTagsInside = canFitTitleInside && (cardWidthPx >= (canFitEmojiInside ? 26 : 0) + titleNeededWidth + tagNeededWidth + priorityNeededWidth + 30);

                  const showEmojiInside = canFitEmojiInside;
                  const showEmojiOutside = !canFitEmojiInside;

                  const showTitleInside = canFitTitleInside;
                  const showTitleOutside = !canFitTitleInside;

                  const showTagInside = canFitTagsInside && hasTag;
                  const showTagOutside = !canFitTagsInside && hasTag;

                  const showPriorityInside = canFitTagsInside && hasPriority;
                  const showPriorityOutside = !canFitTagsInside && hasPriority;

                  const hasOutsideContent = showEmojiOutside || showTitleOutside || showTagOutside || showPriorityOutside;

                  return (
                    <div
                      key={`timeline-row-${task.id}`}
                      className="h-9 relative flex items-center group/row"
                    >
                      {/* Left Pinned Overhang Pill (when task starts before visible area matching screenshot `[← 🎃]` & `[← ❄️]`) */}
                      {range.isOffscreenLeft && !isBeingDragged && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            shiftTimeline(-1);
                          }}
                          className="sticky left-2 z-20 flex items-center gap-1.5 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333333] shadow-xs px-2 py-1 rounded text-[12px] font-medium text-[#37352F] dark:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#303030] cursor-pointer"
                          title="Пост начался раньше — нажмите чтобы прокрутить назад"
                        >
                          <span className="text-[#9B9A97] text-[11px]">←</span>
                          <span>{emoji}</span>
                          <span className="truncate max-w-[120px]">{cleanTitle}</span>
                        </div>
                      )}

                      {/* Floating Card Item strictly sized to assigned time span */}
                      <div
                        onClick={(e) => onSelectNode(task.id, e)}
                        onMouseDown={(e) => handleBarMouseDown(e, task.id, 'move', range.startMs, range.endMs)}
                        style={{
                          left: `${cardLeftPx}px`,
                          width: `${cardWidthPx}px`
                        }}
                        className={`absolute h-8.5 rounded-md border shadow-xs flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none transition-all ${
                          cardWidthPx < 32 ? 'px-1 justify-center' : 'px-2'
                        } ${
                          isBeingDragged 
                            ? 'ring-2 ring-[#2383E2] shadow-md z-30 scale-[1.01] bg-white dark:bg-[#252525]' 
                            : isSelected
                              ? 'bg-blue-50/70 dark:bg-blue-950/40 border-[#2383E2] ring-1 ring-[#2383E2]'
                              : task.completed
                                ? 'bg-[#FAFAF9] dark:bg-[#202020] border-[#E9E9E7] dark:border-[#2F2F2F] opacity-75'
                                : 'bg-[#F7F7F5]/90 hover:bg-white dark:bg-[#222222] border-[#E9E9E7] dark:border-[#2F2F2F] hover:border-[#D0D0CE] dark:hover:border-[#3F3F3F]'
                        }`}
                        title={`${cleanTitle}\nПериод: ${range.startStr} - ${range.endStr}${tag ? `\nСтатус: ${tag.label}` : ''}`}
                      >
                        {/* Left Resize Handle */}
                        <div
                          onMouseDown={(e) => handleBarMouseDown(e, task.id, 'resize-start', range.startMs, range.endMs)}
                          className="absolute left-0 top-0 bottom-0 w-3 hover:bg-[#2383E2]/50 active:bg-[#2383E2] cursor-ew-resize rounded-l group-hover/row:opacity-100 opacity-0 transition-opacity z-30"
                          title="Изменить дату начала"
                        />

                        {/* Card Content inside bar: Emoji Icon + Title (if fits) */}
                        <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                          {/* Task Emoji Icon inside */}
                          {showEmojiInside && (
                            <div className="relative shrink-0" data-interactive="true">
                              <span 
                                data-popover-trigger="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveTaskEmojiPickerId(activeTaskEmojiPickerId === task.id ? null : task.id);
                                  setActiveTaskTagPickerId(null);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="text-[14px] cursor-pointer hover:scale-125 transition-transform shrink-0 inline-block"
                                title="Сменить иконку"
                              >
                                {emoji}
                              </span>

                              {activeTaskEmojiPickerId === task.id && (
                                <div 
                                  data-popover="true"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="absolute left-0 top-full mt-1.5 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-xl p-2 w-52 grid grid-cols-5 gap-1.5"
                                >
                                  {NOTION_EMOJIS.map(em => (
                                    <button
                                      key={em}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateNode({ ...task, icon: em });
                                        setActiveTaskEmojiPickerId(null);
                                      }}
                                      className="text-base p-1.5 rounded hover:bg-[#F1F1EF] dark:hover:bg-[#333333] cursor-pointer flex items-center justify-center transition-transform hover:scale-110"
                                    >
                                      {em}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Task Clean Title inside bar */}
                          {showTitleInside && (
                            <div className="truncate min-w-0 flex-1">
                              {editingTaskId === task.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  data-interactive="true"
                                  value={editingTaskTitle}
                                  onChange={(e) => setEditingTaskTitle(e.target.value)}
                                  onBlur={() => {
                                    if (editingTaskTitle.trim()) {
                                      const emojiPrefix = task.icon ? '' : (task.text.match(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u)?.[0] || '');
                                      onUpdateNode({ ...task, text: `${emojiPrefix}${editingTaskTitle.trim()}` });
                                    }
                                    setEditingTaskId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingTaskTitle.trim()) {
                                        const emojiPrefix = task.icon ? '' : (task.text.match(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u)?.[0] || '');
                                        onUpdateNode({ ...task, text: `${emojiPrefix}${editingTaskTitle.trim()}` });
                                      }
                                      setEditingTaskId(null);
                                    }
                                    if (e.key === 'Escape') setEditingTaskId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="w-full bg-white dark:bg-[#191919] border border-[#2383e2] rounded px-1 text-[13px] text-[#37352F] dark:text-[#EBEBEB] focus:outline-none"
                                />
                              ) : (
                                <span 
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTaskId(task.id);
                                    setEditingTaskTitle(cleanTitle);
                                  }}
                                  className={`text-[13px] font-medium text-[#37352F] dark:text-[#EBEBEB] group-hover/row:underline underline-offset-2 truncate block transition-colors cursor-text ${
                                    task.completed ? 'line-through opacity-60' : ''
                                  }`}
                                  title="Двойной клик — переименовать"
                                >
                                  {cleanTitle}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Status Tag Pill inside bar */}
                        {showTagInside && tag && (
                          <div className="relative shrink-0 ml-1" data-interactive="true">
                            <button
                              type="button"
                              data-popover-trigger="true"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTaskTagPickerId(activeTaskTagPickerId === task.id ? null : task.id);
                                setActiveTaskEmojiPickerId(null);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-transform hover:scale-105 cursor-pointer whitespace-nowrap ${tag.bg} ${tag.text} ${tag.darkBg} ${tag.darkText}`}
                              title="Сменить статус"
                            >
                              {tag.label}
                            </button>

                            {activeTaskTagPickerId === task.id && (
                              <div 
                                data-popover="true"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg p-1.5 w-44 flex flex-col gap-1 text-[12px]"
                              >
                                {NOTION_STATUS_TAGS.map(t => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const isDone = t.id === 'posted' || t.id === 'ready';
                                      onUpdateNode({
                                        ...task,
                                        status: t.id === 'posted' || t.id === 'ready' ? 'done' : t.id === 'in_progress' ? 'progress' : t.id === 'up_next' ? 'waiting' : 'todo',
                                        tags: [t.label],
                                        completed: isDone
                                      });
                                      setActiveTaskTagPickerId(null);
                                    }}
                                    className={`px-2 py-1 rounded text-left font-medium ${t.bg} ${t.text} ${t.darkBg} ${t.darkText} hover:opacity-85 flex items-center justify-between cursor-pointer`}
                                  >
                                    <span>{t.label}</span>
                                    {tag.label === t.label && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Priority Pill inside bar */}
                        {showPriorityInside && task.priority && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                            {task.priority === 'urgent' ? 'P1' : task.priority === 'high' ? 'P2' : task.priority === 'medium' ? 'P3' : 'P4'}
                          </span>
                        )}

                        {/* Right Resize Handle */}
                        <div
                          onMouseDown={(e) => handleBarMouseDown(e, task.id, 'resize-end', range.startMs, range.endMs)}
                          className="absolute right-0 top-0 bottom-0 w-3 hover:bg-[#2383E2]/50 active:bg-[#2383E2] cursor-ew-resize rounded-r group-hover/row:opacity-100 opacity-0 transition-opacity z-30"
                          title="Изменить дату окончания"
                        />
                      </div>

                      {/* Outside Content: Title, Status Tags & Priority placed to the right of the bar */}
                      {hasOutsideContent && (
                        <div
                          style={{
                            left: `${cardLeftPx + cardWidthPx + 8}px`
                          }}
                          className="absolute h-8.5 flex items-center gap-2 z-10 whitespace-nowrap select-none"
                        >
                          {/* Emoji Outside (if too narrow to fit in bar) */}
                          {showEmojiOutside && (
                            <div className="relative shrink-0" data-interactive="true">
                              <span 
                                data-popover-trigger="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveTaskEmojiPickerId(activeTaskEmojiPickerId === task.id ? null : task.id);
                                  setActiveTaskTagPickerId(null);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="text-[14px] cursor-pointer hover:scale-125 transition-transform inline-block"
                                title="Сменить иконку"
                              >
                                {emoji}
                              </span>
                              {activeTaskEmojiPickerId === task.id && (
                                <div 
                                  data-popover="true"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="absolute left-0 top-full mt-1.5 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-xl p-2 w-52 grid grid-cols-5 gap-1.5"
                                >
                                  {NOTION_EMOJIS.map(em => (
                                    <button
                                      key={em}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateNode({ ...task, icon: em });
                                        setActiveTaskEmojiPickerId(null);
                                      }}
                                      className="text-base p-1.5 rounded hover:bg-[#F1F1EF] dark:hover:bg-[#333333] cursor-pointer flex items-center justify-center transition-transform hover:scale-110"
                                    >
                                      {em}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Title Outside */}
                          {showTitleOutside && (
                            <div className="flex items-center">
                              {editingTaskId === task.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  data-interactive="true"
                                  value={editingTaskTitle}
                                  onChange={(e) => setEditingTaskTitle(e.target.value)}
                                  onBlur={() => {
                                    if (editingTaskTitle.trim()) {
                                      const emojiPrefix = task.icon ? '' : (task.text.match(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u)?.[0] || '');
                                      onUpdateNode({ ...task, text: `${emojiPrefix}${editingTaskTitle.trim()}` });
                                    }
                                    setEditingTaskId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingTaskTitle.trim()) {
                                        const emojiPrefix = task.icon ? '' : (task.text.match(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u)?.[0] || '');
                                        onUpdateNode({ ...task, text: `${emojiPrefix}${editingTaskTitle.trim()}` });
                                      }
                                      setEditingTaskId(null);
                                    }
                                    if (e.key === 'Escape') setEditingTaskId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="bg-white dark:bg-[#191919] border border-[#2383e2] rounded px-1.5 py-0.5 text-[13px] text-[#37352F] dark:text-[#EBEBEB] focus:outline-none min-w-[140px]"
                                />
                              ) : (
                                <span 
                                  onClick={(e) => onSelectNode(task.id, e)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTaskId(task.id);
                                    setEditingTaskTitle(cleanTitle);
                                  }}
                                  className={`text-[13px] font-medium text-[#37352F] dark:text-[#EBEBEB] hover:text-[#2383E2] hover:underline underline-offset-2 cursor-pointer transition-colors ${
                                    task.completed ? 'line-through opacity-60' : ''
                                  }`}
                                  title="Дважды кликните, чтобы переименовать"
                                >
                                  {cleanTitle}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Status Tag Outside */}
                          {showTagOutside && tag && (
                            <div className="relative shrink-0" data-interactive="true">
                              <button
                                type="button"
                                data-popover-trigger="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveTaskTagPickerId(activeTaskTagPickerId === task.id ? null : task.id);
                                  setActiveTaskEmojiPickerId(null);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`text-[11px] font-medium px-2 py-0.5 rounded transition-transform hover:scale-105 cursor-pointer whitespace-nowrap ${tag.bg} ${tag.text} ${tag.darkBg} ${tag.darkText}`}
                                title="Сменить статус"
                              >
                                {tag.label}
                              </button>

                              {activeTaskTagPickerId === task.id && (
                                <div 
                                  data-popover="true"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg p-1.5 w-44 flex flex-col gap-1 text-[12px]"
                                >
                                  {NOTION_STATUS_TAGS.map(t => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const isDone = t.id === 'posted' || t.id === 'ready';
                                        onUpdateNode({
                                          ...task,
                                          status: t.id === 'posted' || t.id === 'ready' ? 'done' : t.id === 'in_progress' ? 'progress' : t.id === 'up_next' ? 'waiting' : 'todo',
                                          tags: [t.label],
                                          completed: isDone
                                        });
                                        setActiveTaskTagPickerId(null);
                                      }}
                                      className={`px-2 py-1 rounded text-left font-medium ${t.bg} ${t.text} ${t.darkBg} ${t.darkText} hover:opacity-85 flex items-center justify-between cursor-pointer`}
                                    >
                                      <span>{t.label}</span>
                                      {tag.label === t.label && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Priority Outside */}
                          {showPriorityOutside && task.priority && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                              {task.priority === 'urgent' ? 'P1' : task.priority === 'high' ? 'P2' : task.priority === 'medium' ? 'P3' : 'P4'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Bottom "+ New" row matching screenshot */}
              <div className="h-8 flex items-center px-2 mt-1">
                {showNewTaskInline ? (
                  <div className="flex items-center gap-2 bg-white dark:bg-[#222222] border border-[#2383E2] rounded-md px-3 py-1 shadow-xs">
                    <span>📝</span>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Название нового поста... (Enter)"
                      value={newInlineTaskText}
                      onChange={(e) => setNewInlineTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateNewTask();
                        if (e.key === 'Escape') setShowNewTaskInline(false);
                      }}
                      className="text-[13px] bg-transparent text-[#37352F] dark:text-[#EBEBEB] focus:outline-none w-56"
                    />
                    <button
                      onClick={() => handleCreateNewTask()}
                      className="text-xs bg-[#2383E2] text-white px-2 py-0.5 rounded font-medium cursor-pointer"
                    >
                      Создать
                    </button>
                    <button
                      onClick={() => setShowNewTaskInline(false)}
                      className="text-xs text-[#9B9A97] hover:text-[#37352F] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewTaskInline(true)}
                    className="flex items-center gap-1.5 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] text-[13px] px-2 py-1 rounded hover:bg-[#F7F7F5] dark:hover:bg-[#252525] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New</span>
                  </button>
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Unscheduled Tasks Drawer Slideover Panel */}
        {showUnscheduledDrawer && (
          <div className="w-80 border-l border-[#EDEDEB] dark:border-[#2F2F2F] bg-white dark:bg-[#1C1C1C] flex flex-col shrink-0 z-40 shadow-xl">
            <div className="p-3 border-b border-[#EDEDEB] dark:border-[#2F2F2F] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-[13px] text-[#37352F] dark:text-[#EBEBEB]">Задачи без даты ({unscheduledTasks.length})</span>
              </div>
              <button
                onClick={() => setShowUnscheduledDrawer(false)}
                className="p-1 hover:bg-[#F1F1EF] dark:hover:bg-[#2B2B2B] rounded text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#EBEBEB] cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {unscheduledTasks.length === 0 ? (
                <div className="py-12 text-center text-[#9B9A97] text-xs">
                  Все задачи распределены по датам!
                </div>
              ) : (
                unscheduledTasks.map(task => {
                  const emoji = getTaskEmoji(task);
                  const clean = getCleanTitle(task.text);
                  return (
                    <div 
                      key={`unscheduled-${task.id}`}
                      className="p-2.5 rounded-lg border border-[#EDEDEB] dark:border-[#2E2E2E] bg-[#FAFAF9] dark:bg-[#232323] hover:border-[#2383E2]/50 transition-all flex flex-col gap-2 group"
                    >
                      <div 
                        onClick={(e) => onSelectNode(task.id, e)}
                        className="flex items-start gap-2 cursor-pointer"
                      >
                        <span className="text-base shrink-0">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#37352F] dark:text-[#EBEBEB] truncate">{clean}</p>
                          {task.notes && (
                            <p className="text-[11px] text-[#787774] dark:text-[#9B9A97] truncate mt-0.5">{task.notes}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1 border-t border-[#EDEDEB]/60 dark:border-[#2E2E2E]">
                        <button
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            onUpdateNode({
                              ...task,
                              startDate: today,
                              dueDate: today
                            });
                          }}
                          className="flex-1 py-1 px-2 rounded bg-white dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#383838] hover:bg-[#2383E2] hover:text-white dark:hover:bg-[#2383E2] text-[#37352F] dark:text-[#D4D4D4] text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          + Сегодня
                        </button>
                        <button
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            const tStr = tomorrow.toISOString().split('T')[0];
                            onUpdateNode({
                              ...task,
                              startDate: tStr,
                              dueDate: tStr
                            });
                          }}
                          className="flex-1 py-1 px-2 rounded bg-white dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#383838] hover:bg-[#2383E2] hover:text-white dark:hover:bg-[#2383E2] text-[#37352F] dark:text-[#D4D4D4] text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          + Завтра
                        </button>
                        <button
                          onClick={(e) => onSelectNode(task.id, e)}
                          className="py-1 px-2 rounded bg-white dark:bg-[#2A2A2A] border border-[#EDEDEB] dark:border-[#383838] hover:bg-[#F1F1EF] dark:hover:bg-[#333333] text-[#787774] dark:text-[#9B9A97] text-[11px] font-medium transition-colors cursor-pointer"
                          title="Открыть задачу и выбрать дату"
                        >
                          Выбрать
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
