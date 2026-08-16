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
  // Dropdown states
  const [showScaleDropdown, setShowScaleDropdown] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Timeline Scale: 'Days' (Quarters / Weeks / Months)
  const [scaleMode, setScaleMode] = useState<'Days' | 'Weeks' | 'Bi-weeks' | 'Months' | 'Quarters'>('Days');

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

  // Timeline Date Range Configuration
  // 35 days total viewport, starting 10 days before today
  const [baseDate, setBaseDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 10);
    return today;
  });

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Real today
  const realToday = new Date();
  const realTodayStr = realToday.toISOString().split('T')[0];
  const realTodayDayNumber = realToday.getDate();

  // Generate continuous timeline days (35 days)
  const totalDaysCount = 35;
  const timelineDays = useMemo(() => {
    const days: { 
      date: Date; 
      dateString: string; 
      dayNumber: number; 
      isToday: boolean; 
      isWeekend: boolean;
      monthName: string;
      year: number;
      monthIndex: number;
    }[] = [];
    const ref = new Date(baseDate);

    for (let i = 0; i < totalDaysCount; i++) {
      const d = new Date(ref);
      d.setDate(ref.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      const dow = d.getDay();
      days.push({
        date: d,
        dateString: dStr,
        dayNumber: d.getDate(),
        isToday: dStr === realTodayStr,
        isWeekend: dow === 0 || dow === 6,
        monthName: MONTHS_FULL_EN[d.getMonth()],
        year: d.getFullYear(),
        monthIndex: d.getMonth()
      });
    }
    return days;
  }, [baseDate, realTodayStr]);

  // Distinct months in current timeline for the header
  const headerMonths = useMemo(() => {
    const months: { name: string; year: number; startIndex: number; count: number }[] = [];
    timelineDays.forEach((day, index) => {
      const last = months[months.length - 1];
      if (!last || last.name !== day.monthName || last.year !== day.year) {
        months.push({
          name: day.monthName,
          year: day.year,
          startIndex: index,
          count: 1
        });
      } else {
        last.count += 1;
      }
    });
    return months;
  }, [timelineDays]);

  // Day width in px
  const dayColWidth = scaleMode === 'Days' ? 56 : 42;

  // Filter tasks
  const tasks = useMemo(() => {
    return (nodes || []).filter(n => !n.isContainer && !n.isWorkflowRectangle);
  }, [nodes]);

  // Stable emoji for task
  const getTaskEmoji = (task: TaskNode) => {
    if (task.icon) return task.icon;
    // Hash string to pick deterministic emoji
    let hash = 0;
    for (let i = 0; i < task.id.length; i++) {
      hash = (hash << 5) - hash + task.id.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % NOTION_EMOJIS.length;
    return NOTION_EMOJIS[idx];
  };

  // Helper to get clean title without emoji prefix
  const getCleanTitle = (text: string) => {
    return text.replace(/^[\p{Emoji}\u200d\uFE0F\uFE0E]+\s*/u, '').trim() || text;
  };

  // Helper to determine status tag for task
  const getTaskTag = (task: TaskNode) => {
    if (task.completed) {
      return NOTION_STATUS_TAGS[0]; // Posted
    }
    if (task.tags && task.tags.length > 0) {
      const firstTag = task.tags[0].toLowerCase();
      const match = NOTION_STATUS_TAGS.find(t => t.label.toLowerCase() === firstTag || t.id === firstTag);
      if (match) return match;
    }
    if (task.progress !== undefined && task.progress >= 80) return NOTION_STATUS_TAGS[1]; // Ready to post
    if (task.progress !== undefined && task.progress >= 40) return NOTION_STATUS_TAGS[4]; // In Progress
    if (task.priority === 'urgent' || task.priority === 'high') return NOTION_STATUS_TAGS[2]; // Needs proofreading
    
    // Hash to assign realistic Notion tag from template
    let hash = 0;
    for (let i = 0; i < task.text.length; i++) {
      hash = (hash << 5) - hash + task.text.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % NOTION_STATUS_TAGS.length;
    return NOTION_STATUS_TAGS[idx];
  };

  // Pre-calculate date range column positions for each task bar
  const getTaskRange = (task: TaskNode) => {
    let startStr = task.startDate;
    let endStr = task.dueDate;

    // If neither exists, generate deterministic offset around today so all tasks show beautifully
    if (!startStr && !endStr) {
      let hash = 0;
      for (let i = 0; i < task.id.length; i++) {
        hash = (hash << 5) - hash + task.id.charCodeAt(i);
        hash |= 0;
      }
      const offsetDays = (Math.abs(hash) % 18) - 4;
      const duration = 2 + (Math.abs(hash >> 2) % 4);
      
      const s = new Date(realToday);
      s.setDate(realToday.getDate() + offsetDays);
      startStr = s.toISOString().split('T')[0];
      
      const e = new Date(s);
      e.setDate(s.getDate() + duration);
      endStr = e.toISOString().split('T')[0];
    } else if (startStr && !endStr) {
      const s = new Date(startStr);
      const e = new Date(s);
      e.setDate(s.getDate() + 2);
      endStr = e.toISOString().split('T')[0];
    } else if (!startStr && endStr) {
      const e = new Date(endStr);
      const s = new Date(e);
      s.setDate(e.getDate() - 2);
      startStr = s.toISOString().split('T')[0];
    }

    const firstDateStr = timelineDays[0].dateString;
    const lastDateStr = timelineDays[timelineDays.length - 1].dateString;

    const startIdx = timelineDays.findIndex(d => d.dateString === startStr);
    const endIdx = timelineDays.findIndex(d => d.dateString === endStr);

    const isBeforeViewport = endStr! < firstDateStr;
    const isAfterViewport = startStr! > lastDateStr;
    const startsBeforeViewport = startStr! < firstDateStr;

    let computedStart = startIdx;
    let computedEnd = endIdx;

    if (startIdx === -1 && !isBeforeViewport && !isAfterViewport) {
      computedStart = 0;
    }
    if (endIdx === -1 && !isBeforeViewport && !isAfterViewport) {
      computedEnd = totalDaysCount - 1;
    }

    if (computedStart === -1 || computedEnd === -1 || computedStart > computedEnd) {
      return {
        start: 0,
        end: 2,
        span: 3,
        isOffscreenLeft: isBeforeViewport || startsBeforeViewport,
        isOffscreenRight: isAfterViewport
      };
    }

    return {
      start: computedStart,
      end: computedEnd,
      span: Math.max(1, computedEnd - computedStart + 1),
      isOffscreenLeft: startsBeforeViewport,
      isOffscreenRight: isAfterViewport
    };
  };

  // Drag-to-move and drag-to-resize handlers
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const activeDragRef = useRef<{ drag: ActiveDrag; startX: number; colWidth: number } | null>(null);
  const dragHasMovedRef = useRef(false);

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
    const dragData: ActiveDrag = {
      taskId,
      type,
      initialStart: startIdx,
      initialEnd: endIdx,
      currentStart: startIdx,
      currentEnd: endIdx
    };

    activeDragRef.current = {
      drag: dragData,
      startX: e.clientX,
      colWidth: dayColWidth
    };
    setActiveDrag(dragData);
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const info = activeDragRef.current;
      if (!info) return;

      const dx = e.clientX - info.startX;
      if (Math.abs(dx) > 4) {
        dragHasMovedRef.current = true;
      }

      if (dragHasMovedRef.current) {
        const dayDiff = Math.round(dx / info.colWidth);
        let newStart = info.drag.initialStart;
        let newEnd = info.drag.initialEnd;

        if (info.drag.type === 'move') {
          const span = info.drag.initialEnd - info.drag.initialStart;
          newStart = Math.max(0, Math.min(totalDaysCount - 1 - span, info.drag.initialStart + dayDiff));
          newEnd = newStart + span;
        } else if (info.drag.type === 'resize-start') {
          newStart = Math.max(0, Math.min(info.drag.initialEnd, info.drag.initialStart + dayDiff));
        } else if (info.drag.type === 'resize-end') {
          newEnd = Math.max(info.drag.initialStart, Math.min(totalDaysCount - 1, info.drag.initialEnd + dayDiff));
        }

        setActiveDrag(prev => prev ? { ...prev, currentStart: newStart, currentEnd: newEnd } : null);
      }
    };

    const handleMouseUp = () => {
      const info = activeDragRef.current;
      activeDragRef.current = null;
      setActiveDrag(null);

      if (info && dragHasMovedRef.current) {
        const task = tasks.find(t => t.id === info.drag.taskId);
        if (task) {
          const newStartStr = timelineDays[Math.max(0, Math.min(totalDaysCount - 1, activeDrag.currentStart))].dateString;
          const newEndStr = timelineDays[Math.max(0, Math.min(totalDaysCount - 1, activeDrag.currentEnd))].dateString;
          onUpdateNode({
            ...task,
            startDate: newStartStr,
            dueDate: newEndStr
          });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDrag, timelineDays, tasks, onUpdateNode, dayColWidth]);

  // Navigate timeline
  const shiftDays = (count: number) => {
    setBaseDate(prev => {
      const n = new Date(prev);
      n.setDate(n.getDate() + count);
      return n;
    });
  };

  const jumpToToday = () => {
    const today = new Date();
    today.setDate(today.getDate() - 10);
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
    const handleOutside = () => {
      setShowScaleDropdown(false);
      setActiveTaskEmojiPickerId(null);
      setActiveTaskTagPickerId(null);
      setActivePriorityPickerTaskId(null);
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  return (
    <div 
      id="notion-timeline-workspace"
      className={`flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#D4D4D4] font-sans h-full w-full overflow-hidden select-none ${
        isFullScreen ? 'fixed inset-0 z-[150] w-screen h-screen' : ''
      }`}
    >
      {/* TIMELINE CONTROLS SUB-HEADER (» November 2026 ... December, [Quarters ⌄], < Today >) */}
      <div className="border-b border-[#EDEDEB] dark:border-[#2F2F2F] bg-white dark:bg-[#191919] flex items-center justify-between px-4 sm:px-12 py-1.5 shrink-0 text-[13px] z-10">
        
        {/* Left: Month Indicators with Notion chevrons » Month Year */}
        <div className="flex items-center gap-6 overflow-hidden">
          {headerMonths.map((m, idx) => (
            <div key={`${m.name}-${m.year}`} className="flex items-center gap-1.5 font-medium text-[#37352F] dark:text-[#EBEBEB]">
              {idx === 0 && <span className="text-[#9B9A97] font-bold">»</span>}
              <span>{m.name} {m.year}</span>
            </div>
          ))}
        </div>

        {/* Right: Scale Dropdown ([Quarters ⌄] / Days) and < Today > navigation */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Scale selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowScaleDropdown(!showScaleDropdown);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2B2B2B] text-[#787774] dark:text-[#9B9A97] cursor-pointer transition-colors text-[12.5px]"
            >
              <span>{scaleMode}</span>
              <ChevronDown className="w-3 h-3 text-[#9B9A97]" />
            </button>

            {showScaleDropdown && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg py-1 w-36 text-[12.5px]"
              >
                {(['Days', 'Weeks', 'Bi-weeks', 'Months', 'Quarters'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => {
                      setScaleMode(mode);
                      setShowScaleDropdown(false);
                    }}
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
              onClick={() => shiftDays(-7)}
              className="p-1 hover:bg-white dark:hover:bg-[#303030] rounded cursor-pointer transition-colors"
              title="-1 неделя"
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
              onClick={() => shiftDays(7)}
              className="p-1 hover:bg-white dark:hover:bg-[#303030] rounded cursor-pointer transition-colors"
              title="+1 неделя"
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
              {tasks.map(task => {
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
                    <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 font-medium ${tag.bg} ${tag.text} ${tag.darkBg} ${tag.darkText}`}>
                      {tag.label}
                    </span>
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
            style={{ width: `${totalDaysCount * dayColWidth}px` }}
            className="min-h-full flex flex-col relative"
          >
            
            {/* Timeline Header Row (Date tick numbers: 1, 8, [10], 15, 22, 29...) */}
            <div className="h-8 border-b border-[#EDEDEB] dark:border-[#2F2F2F] flex sticky top-0 bg-white/95 dark:bg-[#191919]/95 backdrop-blur-xs z-30 select-none">
              {timelineDays.map((day) => {
                return (
                  <div
                    key={`header-${day.dateString}`}
                    style={{ width: `${dayColWidth}px` }}
                    className={`h-full border-r border-[#EDEDEB]/50 dark:border-[#2F2F2F]/50 flex items-center justify-center relative shrink-0 ${
                      day.isWeekend ? 'bg-[#FAFAF9]/40 dark:bg-[#1C1C1C]/40' : ''
                    }`}
                  >
                    {day.isToday ? (
                      /* Red solid circle for Today matching screenshot: e.g. 🔴 10 */
                      <div className="w-5 h-5 rounded-full bg-[#EB5757] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                        {day.dayNumber}
                      </div>
                    ) : (
                      <span className="text-[12px] font-normal text-[#9B9A97] dark:text-[#7A7A7A]">
                        {day.dayNumber}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical Red Line for Today & Grid Lines */}
            <div className="absolute inset-0 pointer-events-none flex z-0">
              {timelineDays.map((day, idx) => (
                <div
                  key={`grid-${day.dateString}`}
                  style={{ width: `${dayColWidth}px` }}
                  className={`h-full border-r border-[#EDEDEB]/30 dark:border-[#2F2F2F]/30 shrink-0 relative ${
                    day.isWeekend ? 'bg-[#FAFAF9]/20 dark:bg-[#1C1C1C]/20' : ''
                  }`}
                >
                  {/* Vertical Red Today Line */}
                  {day.isToday && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-8 bottom-0 w-px bg-[#EB5757] z-10" />
                  )}
                </div>
              ))}
            </div>

            {/* Month Vertical Dividers */}
            <div className="absolute inset-0 pointer-events-none flex z-0">
              {headerMonths.map((m) => (
                <div
                  key={`month-divider-${m.name}`}
                  style={{ 
                    left: `${m.startIndex * dayColWidth}px`,
                    width: `${m.count * dayColWidth}px`
                  }}
                  className="absolute top-0 bottom-0 border-l border-[#D9D9D7] dark:border-[#383838]"
                />
              ))}
            </div>

            {/* TIMELINE ROWS (Card items) */}
            <div className="flex-1 py-3 flex flex-col gap-2 relative z-10">
              
              {tasks.length === 0 ? (
                <div className="py-20 text-center text-[#9B9A97]">
                  <p className="text-sm">Нет задач на таймлайне.</p>
                  <button 
                    onClick={() => handleCreateNewTask()}
                    className="mt-3 text-[#2383E2] hover:underline text-xs font-medium"
                  >
                    + Добавить первый пост
                  </button>
                </div>
              ) : (
                tasks.map((task, rowIndex) => {
                  const range = getTaskRange(task);
                  const isSelected = selectedNodeId === task.id;
                  const isBeingDragged = activeDrag && activeDrag.taskId === task.id;
                  const emoji = getTaskEmoji(task);
                  const tag = getTaskTag(task);
                  const cleanTitle = getCleanTitle(task.text);

                  const displayStart = isBeingDragged ? activeDrag.currentStart : range.start;
                  const displayEnd = isBeingDragged ? activeDrag.currentEnd : range.end;
                  const displaySpan = Math.max(1, displayEnd - displayStart + 1);

                  const cardLeftPx = displayStart * dayColWidth;
                  const cardWidthPx = Math.max(210, displaySpan * dayColWidth);

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
                            shiftDays(-7);
                          }}
                          className="sticky left-2 z-20 flex items-center gap-1.5 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333333] shadow-xs px-2 py-1 rounded text-[12px] font-medium text-[#37352F] dark:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#303030] cursor-pointer"
                          title="Пост начался раньше — нажмите чтобы прокрутить назад"
                        >
                          <span className="text-[#9B9A97] text-[11px]">←</span>
                          <span>{emoji}</span>
                          <span className="truncate max-w-[120px]">{cleanTitle}</span>
                        </div>
                      )}

                      {/* Floating Card Item matching Notion screenshot */}
                      <div
                        onClick={(e) => onSelectNode(task.id, e)}
                        onMouseDown={(e) => handleBarMouseDown(e, task.id, 'move', range.start, range.end)}
                        style={{
                          left: `${cardLeftPx}px`,
                          width: `${cardWidthPx}px`
                        }}
                        className={`absolute h-8.5 rounded-md border shadow-xs px-2.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none transition-all ${
                          isBeingDragged 
                            ? 'ring-2 ring-[#2383E2] shadow-md z-30 scale-[1.01] bg-white dark:bg-[#252525]' 
                            : isSelected
                              ? 'bg-white dark:bg-[#222222] border-[#2383E2] ring-1 ring-[#2383E2]'
                              : task.completed
                                ? 'bg-[#FAFAF9] dark:bg-[#202020] border-[#E9E9E7] dark:border-[#2F2F2F] opacity-75'
                                : 'bg-white dark:bg-[#222222] border-[#E9E9E7] dark:border-[#2F2F2F] hover:border-[#D0D0CE] dark:hover:border-[#3F3F3F]'
                        }`}
                        title={`${cleanTitle}\nСтатус: ${tag.label}`}
                      >
                        
                        {/* Left Resize Handle */}
                        <div
                          onMouseDown={(e) => handleBarMouseDown(e, task.id, 'resize-start', range.start, range.end)}
                          className="absolute left-0 top-0 bottom-0 w-2 hover:bg-[#2383E2]/30 cursor-ew-resize rounded-l group-hover/row:opacity-100 opacity-0 transition-opacity z-20"
                          title="Изменить дату начала"
                        />

                        {/* Card Content: Emoji Icon + Title */}
                        <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                          
                          {/* Task Emoji Icon */}
                          <div className="relative">
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTaskEmojiPickerId(activeTaskEmojiPickerId === task.id ? null : task.id);
                              }}
                              className="text-[14px] cursor-pointer hover:scale-115 transition-transform shrink-0"
                              title="Сменить иконку"
                            >
                              {emoji}
                            </span>

                            {activeTaskEmojiPickerId === task.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-full mt-1.5 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-xl p-2 w-48 grid grid-cols-5 gap-1"
                              >
                                {NOTION_EMOJIS.slice(0, 15).map(em => (
                                  <button
                                    key={em}
                                    onClick={() => {
                                      onUpdateNode({ ...task, icon: em });
                                      setActiveTaskEmojiPickerId(null);
                                    }}
                                    className="text-base p-1 rounded hover:bg-[#F1F1EF] dark:hover:bg-[#333333] cursor-pointer flex items-center justify-center"
                                  >
                                    {em}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Task Clean Title in Notion Font */}
                          {editingTaskId === task.id ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingTaskTitle}
                              onChange={(e) => setEditingTaskTitle(e.target.value)}
                              onBlur={() => {
                                if (editingTaskTitle.trim()) {
                                  onUpdateNode({ ...task, text: editingTaskTitle.trim() });
                                }
                                setEditingTaskId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingTaskTitle.trim()) {
                                    onUpdateNode({ ...task, text: editingTaskTitle.trim() });
                                  }
                                  setEditingTaskId(null);
                                }
                                if (e.key === 'Escape') setEditingTaskId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-white dark:bg-[#191919] border border-[#2383e2] rounded px-1 text-[13px] text-[#37352F] dark:text-[#EBEBEB] focus:outline-none"
                            />
                          ) : (
                            <span 
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingTaskId(task.id);
                                setEditingTaskTitle(cleanTitle);
                              }}
                              className={`text-[13px] font-medium text-[#37352F] dark:text-[#EBEBEB] group-hover/row:underline underline-offset-2 truncate transition-colors ${
                                task.completed ? 'line-through opacity-60' : ''
                              }`}
                            >
                              {cleanTitle}
                            </span>
                          )}
                        </div>

                        {/* Status Tag Pill in Notion Pastel Color */}
                        {visibleProps.tag && (
                          <div className="relative shrink-0 ml-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTaskTagPickerId(activeTaskTagPickerId === task.id ? null : task.id);
                              }}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded transition-transform hover:scale-105 cursor-pointer whitespace-nowrap ${tag.bg} ${tag.text} ${tag.darkBg} ${tag.darkText}`}
                            >
                              {tag.label}
                            </button>

                            {activeTaskTagPickerId === task.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#383838] shadow-xl rounded-lg p-1.5 w-44 flex flex-col gap-1 text-[12px]"
                              >
                                {NOTION_STATUS_TAGS.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => {
                                      onUpdateNode({
                                        ...task,
                                        tags: [t.label],
                                        completed: t.id === 'posted'
                                      });
                                      setActiveTaskTagPickerId(null);
                                    }}
                                    className={`px-2 py-1 rounded text-left font-medium ${t.bg} ${t.text} ${t.darkBg} ${t.darkText} hover:opacity-85 flex items-center justify-between cursor-pointer`}
                                  >
                                    <span>{t.label}</span>
                                    {tag.id === t.id && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Priority Pill if enabled */}
                        {visibleProps.priority && task.priority && task.priority !== 'none' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                            {task.priority === 'urgent' ? 'P1' : task.priority === 'high' ? 'P2' : task.priority === 'medium' ? 'P3' : 'P4'}
                          </span>
                        )}

                        {/* Right Resize Handle */}
                        <div
                          onMouseDown={(e) => handleBarMouseDown(e, task.id, 'resize-end', range.start, range.end)}
                          className="absolute right-0 top-0 bottom-0 w-2 hover:bg-[#2383E2]/30 cursor-ew-resize rounded-r group-hover/row:opacity-100 opacity-0 transition-opacity z-20"
                          title="Изменить дату окончания"
                        />
                      </div>
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

      </div>

    </div>
  );
}
