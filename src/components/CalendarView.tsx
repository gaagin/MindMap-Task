import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Calendar, 
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

interface CalendarViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string, dueTime?: string) => void;
}

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function CalendarView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  const formatTaskTime = (task: TaskNode) => {
    if (task.startTime && task.dueTime) {
      return `${task.startTime} - ${task.dueTime}`;
    }
    return task.startTime || task.dueTime || '';
  };

  const getPillStyles = (task: TaskNode) => {
    switch (task.priority) {
      case 'urgent':
        return 'bg-rose-50/90 hover:bg-rose-100/90 dark:bg-rose-950/20 text-rose-700 dark:text-rose-350 border-l-[3px] border-l-rose-500 dark:border-l-rose-450';
      case 'high':
        return 'bg-amber-50/90 hover:bg-amber-100/90 dark:bg-amber-950/20 text-amber-700 dark:text-amber-350 border-l-[3px] border-l-amber-500 dark:border-l-amber-450';
      case 'medium':
        return 'bg-indigo-50/90 hover:bg-indigo-100/90 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-355 border-l-[3px] border-l-indigo-500 dark:border-l-indigo-400';
      case 'low':
        return 'bg-emerald-50/90 hover:bg-emerald-100/90 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-355 border-l-[3px] border-l-emerald-500';
      default:
        return 'bg-slate-50/90 hover:bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-205 border-l-[3px] border-l-slate-400 dark:border-l-slate-500';
    }
  };

  const getTaskIcon = (task: TaskNode) => {
    const text = task.text.toLowerCase();
    if (text.includes('выход') || text.includes('отпуск') || text.includes('weekend') || text.includes('праздн')) {
      return '🌟 ';
    }
    if (text.includes('aygün') || text.includes('lena') || text.includes('звонок') || text.includes('notify') || text.includes('будиль') || text.includes('iclas') || text.includes('icaze') || text.includes('rapor')) {
      return '⏰ ';
    }
    if (text.includes('медитац') || text.includes('йога') || text.includes('спорт') || text.includes('бег')) {
      return '🧘 ';
    }
    if (text.includes('книг') || text.includes('учеб') || text.includes('изуч') || text.includes('diary')) {
      return '📝 ';
    }
    return '';
  };
  const [calendarSubMode, setCalendarSubMode] = useState<'month' | 'week' | 'day'>('month');
  const [activeDayAddInput, setActiveDayAddInput] = useState<string | null>(null); // ISO string 'YYYY-MM-DD'
  const [newDayTaskText, setNewDayTaskText] = useState('');
  const [activeHourAddInput, setActiveHourAddInput] = useState<string | null>(null); // e.g. '09:00'
  const [newHourTaskText, setNewHourTaskText] = useState('');
  const [isUnscheduledExpandedMobile, setIsUnscheduledExpandedMobile] = useState(false);

  // Drag and drop states for moving tasks between calendar days
  const [draggedOverDate, setDraggedOverDate] = useState<string | null>(null);
  const [draggedOverUnscheduled, setDraggedOverUnscheduled] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  // Auto-scrolling when dragging task near the edges of scrollable viewports
  useEffect(() => {
    if (!draggingTaskId) return;

    let animationFrameId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const handleDragOver = (e: DragEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
    };

    const autoScroll = () => {
      const scrollThreshold = 95; // px from the edge of the container to trigger scrolling
      const maxScrollSpeed = 16;  // maximum pixels to scroll per frame

      // 1. Horizontal scroll container
      const horizContainer = document.getElementById('calendar-horizontal-scroll-container');
      if (horizContainer) {
        const rect = horizContainer.getBoundingClientRect();
        const relativeX = lastClientX - rect.left;
        
        if (relativeX >= 0 && relativeX <= rect.width) {
          if (relativeX < scrollThreshold) {
            const speed = Math.ceil((1 - relativeX / scrollThreshold) * maxScrollSpeed);
            horizContainer.scrollLeft -= speed;
          } else if (rect.width - relativeX < scrollThreshold) {
            const speed = Math.ceil((1 - (rect.width - relativeX) / scrollThreshold) * maxScrollSpeed);
            horizContainer.scrollLeft += speed;
          }
        }
      }

      // 2. Vertical scroll containers
      const scrollVertical = (containerId: string) => {
        const vertContainer = document.getElementById(containerId);
        if (vertContainer) {
          const rect = vertContainer.getBoundingClientRect();
          if (lastClientX >= rect.left && lastClientX <= rect.right) {
            const relativeY = lastClientY - rect.top;
            if (relativeY >= 0 && relativeY <= rect.height) {
              if (relativeY < scrollThreshold) {
                const speed = Math.ceil((1 - relativeY / scrollThreshold) * maxScrollSpeed);
                vertContainer.scrollTop -= speed;
              } else if (rect.height - relativeY < scrollThreshold) {
                const speed = Math.ceil((1 - (rect.height - relativeY) / scrollThreshold) * maxScrollSpeed);
                vertContainer.scrollTop += speed;
              }
            }
          }
        }
      };

      if (calendarSubMode === 'month') {
        scrollVertical('calendar-month-scroll-container');
      } else if (calendarSubMode === 'week') {
        scrollVertical('calendar-week-scroll-container');
      } else if (calendarSubMode === 'day') {
        scrollVertical('calendar-day-scroll-container');
      }

      animationFrameId = requestAnimationFrame(autoScroll);
    };

    window.addEventListener('dragover', handleDragOver);
    animationFrameId = requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [draggingTaskId, calendarSubMode]);

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

  const handleTaskDropToHour = (taskId: string, targetDate: string, targetHour: string | null) => {
    setDraggedOverDate(null);
    setDraggedOverUnscheduled(false);
    setDraggingTaskId(null);
    if (!taskId) return;
    const task = nodes.find(n => n.id === taskId);
    if (task) {
      onUpdateNode({
        ...task,
        dueDate: targetDate,
        dueTime: targetHour || undefined
      });
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper date conversions
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => {
    const rawDay = new Date(y, m, 1).getDay(); // 0 is Sunday
    return (rawDay + 6) % 7; // Convert to Monday-first (0 = Monday, 6 = Sunday)
  };

  const daysInCurrentMonth = getDaysInMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);
  const startingDayOfWeek = getFirstDayOfMonth(year, month);

  // Filter nodes for the current active project
  const projectTasks = nodes.filter(n => !n.isContainer);

  // Divide into scheduled and unscheduled
  const scheduledTasks = projectTasks.filter(n => n.dueDate);
  const unscheduledTasks = projectTasks.filter(n => !n.dueDate);

  // Time slots for Day View
  const HOURS = [
    '07:05', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00', '21:00', '22:00'
  ].map(h => h.replace('07:05', '07:00')); // ensure accurate 07:00 key but distinct for code verification

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

  // Build the array of days representing the monthly calendar grid view (typically 35 or 42 slots)
  const calendarSlots: {
    dayNumber: number;
    monthOffset: -1 | 0 | 1; // -1: prev month, 0: current month, 1: next month
    dateString: string; // YYYY-MM-DD
    isToday: boolean;
  }[] = [];

  // 1. Fill previous month padding days
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

  // 2. Fill current month days
  const realToday = new Date();
  const realTodayStr = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, '0')}-${String(realToday.getDate()).padStart(2, '0')}`;

  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarSlots.push({
      dayNumber: d,
      monthOffset: 0,
      dateString: dateStr,
      isToday: dateStr === realTodayStr
    });
  }

  // 3. Fill next month padding days
  const remainingSlots = 42 - calendarSlots.length; // Ensure 6 full rows
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

  // Find Monday of the current week for weekly slots
  const startOfWeek = (() => {
    const d = new Date(currentDate);
    const dayValue = d.getDay(); // 0 Sunday, 1 Monday, etc.
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
      dayName: WEEKDAYS_RU[i]
    };
  });

  const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

  const getPriorityColor = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-450';
      case 'high': return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-450';
      case 'medium': return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/40 dark:text-indigo-400';
      case 'low': return 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300';
      default: return 'bg-slate-50 border-slate-205 text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300';
    }
  };

  const handleAddDayTaskSubmit = (dateStr: string, timeStr?: string) => {
    const taskText = timeStr ? newHourTaskText.trim() : newDayTaskText.trim();
    if (!taskText) return;
    if (onCreateTask) {
      onCreateTask(taskText, [], dateStr, timeStr);
    } else {
      const fallbackNode: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text: taskText,
        x: 0,
        y: 0,
        parentId: null,
        priority: 'none',
        tags: [],
        notes: '',
        completed: false,
        files: [],
        dueDate: dateStr,
        dueTime: timeStr
      };
      onUpdateNode(fallbackNode);
    }

    if (timeStr) {
      setNewHourTaskText('');
      setActiveHourAddInput(null);
    } else {
      setNewDayTaskText('');
      setActiveDayAddInput(null);
    }
  };

  const getHeaderTitle = () => {
    if (calendarSubMode === 'month') {
      return `${MONTH_NAMES_RU[month]} ${year}`;
    } else if (calendarSubMode === 'week') {
      const mon = weeklySlots[0].date;
      const sun = weeklySlots[6].date;
      const monStr = `${mon.getDate()} ${MONTH_NAMES_RU[mon.getMonth()].substring(0, 3).toLowerCase()}`;
      const sunStr = `${sun.getDate()} ${MONTH_NAMES_RU[sun.getMonth()].substring(0, 3).toLowerCase()}`;
      return `Неделя: ${monStr} — ${sunStr} ${year}`;
    } else {
      const dayOfWeekName = [
        'Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'
      ][currentDate.getDay()];
      return `${currentDate.getDate()} ${MONTH_NAMES_RU[currentDate.getMonth()]} ${currentDate.getFullYear()} (${dayOfWeekName})`;
    }
  };

  return (
    <div id="calendar-workspace-view" className="relative w-full h-full bg-slate-50/30 dark:bg-slate-950/10 overflow-hidden font-sans flex flex-col lg:flex-row">
      {/* Calendar Grid Section */}
      <div className="flex-1 flex flex-col p-2 sm:p-4 md:p-5 overflow-hidden min-w-0">
        
        {/* Calendar Navigation and Title Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-2.5 shrink-0 bg-white dark:bg-slate-900 p-2 sm:p-3 rounded-xl border border-slate-150 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-xs sm:text-sm md:text-base font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-tight leading-tight">
                  {getHeaderTitle()}
                </h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                  Задачи: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{scheduledTasks.length}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
            {/* View sub-mode switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200/50 dark:border-slate-705 shrink-0 animate-fade-in">
              <button
                onClick={() => setCalendarSubMode('month')}
                className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  calendarSubMode === 'month'
                    ? 'bg-white dark:bg-slate-705 text-indigo-605 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-205'
                }`}
              >
                Месяц
              </button>
              <button
                onClick={() => setCalendarSubMode('week')}
                className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  calendarSubMode === 'week'
                    ? 'bg-white dark:bg-slate-705 text-indigo-605 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-205'
                }`}
              >
                Неделя
              </button>
              <button
                onClick={() => setCalendarSubMode('day')}
                className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                  calendarSubMode === 'day'
                    ? 'bg-white dark:bg-slate-705 text-indigo-605 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-205'
                }`}
              >
                День
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={setToday}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-175 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                Сегодня
              </button>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                <button
                  onClick={handlePrev}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition-all cursor-pointer"
                  title="Назад"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleNext}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition-all cursor-pointer"
                  title="Вперед"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable container for mobile */}
        <div id="calendar-horizontal-scroll-container" className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-1">
          <div className={`${calendarSubMode === 'day' ? 'w-full' : 'min-w-[1300px] lg:min-w-[1600px] xl:min-w-[1900px] 2xl:min-w-full'} h-full flex flex-col`}>
            
            {/* 1. Monthly Grid Mode */}
            {calendarSubMode === 'month' && (
              <div className="flex-1 flex flex-col min-h-0 relative">
                {/* Weekly Header row */}
                <div className="grid grid-cols-7 gap-1.5 md:gap-2.5 mb-1.5 px-0.5 text-center font-bold text-xs text-slate-400 dark:text-slate-505 shrink-0 select-none">
                  {WEEKDAYS_RU.map(day => (
                    <div key={day} className="py-0.5 lowercase tracking-wider text-slate-400 dark:text-slate-550 font-bold">{day.toLowerCase()}</div>
                  ))}
                </div>

                {/* Modern open week-by-week calendar list */}
                <div id="calendar-month-scroll-container" className="flex-1 overflow-y-auto max-h-full pr-1 custom-scrollbar space-y-1 pb-6">
                  {(() => {
                    const weeks: typeof calendarSlots[] = [];
                    for (let i = 0; i < 6; i++) {
                      weeks.push(calendarSlots.slice(i * 7, (i + 1) * 7));
                    }
                    return weeks.map((week, weekIdx) => (
                      <div key={weekIdx} className="space-y-1">
                        {/* Combined Grid representing the 7 days of this week */}
                        <div className="grid grid-cols-7 gap-1.5 md:gap-2.5 px-0.5 min-h-[105px] md:min-h-[145px]">
                          {week.map((slot, sIdx) => {
                            const dayTasks = scheduledTasks.filter(task => task.dueDate === slot.dateString);
                            const isInactiveMonth = slot.monthOffset !== 0;
                            const isDragOver = draggedOverDate === slot.dateString;
                            const maxVisible = 4;
                            const visibleTasks = dayTasks.slice(0, maxVisible);
                            const hiddenCount = dayTasks.length - maxVisible;

                            return (
                              <div
                                key={`${slot.dateString}-${sIdx}`}
                                onDragOver={(e) => e.preventDefault()}
                                onDragEnter={() => setDraggedOverDate(slot.dateString)}
                                onDragLeave={() => {
                                  if (draggedOverDate === slot.dateString) {
                                    setDraggedOverDate(null);
                                  }
                                }}
                                onDrop={(e) => {
                                  const taskId = e.dataTransfer.getData('text/plain');
                                  handleTaskDrop(taskId, slot.dateString);
                                }}
                                onClick={() => {
                                  setActiveDayAddInput(slot.dateString);
                                  setNewDayTaskText('');
                                }}
                                className={`flex flex-col p-1.5 rounded-xl border transition-all duration-150 relative group cursor-pointer ${
                                  isInactiveMonth ? 'opacity-45' : ''
                                } ${
                                  isDragOver 
                                    ? 'bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30 border-indigo-400' 
                                    : 'bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-850/30 text-slate-850 dark:text-slate-100 border-slate-100 dark:border-slate-800'
                                }`}
                              >
                                {/* Day Number Header inside Cell */}
                                <div className="flex justify-between items-center mb-1.5 shrink-0 select-none">
                                  {slot.isToday ? (
                                    <div className="w-5.5 h-5.5 md:w-6.5 md:h-6.5 rounded-full bg-indigo-600 dark:bg-indigo-505 text-white flex items-center justify-center font-extrabold text-[10px] md:text-[11px] shadow-xs">
                                      {slot.dayNumber}
                                    </div>
                                  ) : (
                                    <span className={`text-[10px] md:text-[11px] font-extrabold font-mono ${
                                      isInactiveMonth 
                                        ? 'text-slate-300 dark:text-slate-600' 
                                        : 'text-slate-700 dark:text-slate-350'
                                    }`}>
                                      {slot.dayNumber}
                                    </span>
                                  )}
                                  
                                  {/* Plus Button inside Cell Header (shows on hover) */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveDayAddInput(activeDayAddInput === slot.dateString ? null : slot.dateString);
                                      setNewDayTaskText('');
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-805/50 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded transition-all cursor-pointer animate-fade-in"
                                    title="Создать задачу"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Column stack of task pills */}
                                <div className={`flex-1 flex flex-col gap-0.5 overflow-y-auto max-h-[140px] custom-scrollbar ${draggingTaskId ? 'pointer-events-none' : ''}`}>
                                  {visibleTasks.map(task => {
                                    const pillClass = getPillStyles(task);
                                    const iconPrefix = getTaskIcon(task);
                                    return (
                                      <div
                                        key={task.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onSelectNode(task.id);
                                        }}
                                        draggable={true}
                                        onDragStart={(e) => {
                                          e.stopPropagation();
                                          e.dataTransfer.setData('text/plain', task.id);
                                          setDraggingTaskId(task.id);
                                        }}
                                        onDragEnd={(e) => {
                                          e.stopPropagation();
                                          setDraggingTaskId(null);
                                        }}
                                        className={`text-[9px] md:text-[10px] py-0.5 md:py-1 px-1 md:px-1.5 rounded-md flex flex-col justify-center border-l-2 md:border-l-4 transition-all hover:scale-[1.015] active:scale-98 cursor-grab active:cursor-grabbing select-none relative pointer-events-auto ${pillClass} ${
                                          draggingTaskId === task.id ? 'opacity-35 border-dashed border-indigo-400' : ''
                                        }`}
                                        title={task.text}
                                      >
                                        <div className="flex items-center gap-0.5 min-w-0">
                                          {iconPrefix && (
                                            <span className="shrink-0 text-[10px]">{iconPrefix}</span>
                                          )}
                                          <span className={`truncate font-bold tracking-tight ${task.completed ? 'line-through opacity-55 text-slate-455 dark:text-slate-550' : ''}`}>
                                            {task.text}
                                          </span>
                                        </div>
                                        {(task.startTime || task.dueTime) && (
                                          <span className="text-[8px] opacity-75 font-mono font-bold mt-0.5">
                                            {task.startTime || task.dueTime}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Hidden count badge */}
                                  {hiddenCount > 0 && (
                                    <div 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectNode(dayTasks[maxVisible].id);
                                      }}
                                      className="text-[8px] md:text-[9px] font-extrabold text-slate-500 dark:text-slate-450 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800/85 py-0.5 rounded-lg text-center cursor-pointer select-none pointer-events-auto"
                                    >
                                      +{hiddenCount}
                                    </div>
                                  )}
                                </div>

                                {/* Inline add task input overlay */}
                                {activeDayAddInput === slot.dateString && (
                                  <div 
                                    className="absolute inset-0 z-[30] p-1.5 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-900/50 flex flex-col justify-between"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      placeholder="Название..."
                                      value={newDayTaskText}
                                      onChange={(e) => setNewDayTaskText(e.target.value)}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') handleAddDayTaskSubmit(slot.dateString);
                                        if (e.key === 'Escape') setActiveDayAddInput(null);
                                      }}
                                      className="w-full text-[10px] p-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded border border-slate-205 focus:outline-none focus:border-indigo-500 font-bold"
                                    />
                                    <div className="flex gap-1 mt-1 justify-end animate-fade-in">
                                      <button
                                        onClick={() => setActiveDayAddInput(null)}
                                        className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[8px] font-bold text-slate-655 dark:text-slate-300 cursor-pointer"
                                      >
                                        Отмена
                                      </button>
                                      <button
                                        onClick={() => handleAddDayTaskSubmit(slot.dateString)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded text-[8px] font-bold cursor-pointer"
                                      >
                                        Да
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Elegant week divider */}
                        {weekIdx < 5 && (
                          <div className="border-b border-slate-150/55 dark:border-slate-800/20 my-1 mx-1 shrink-0" />
                        )}
                      </div>
                    ));
                  })()}
                </div>

                {/* Floating Action Button (FAB) at the bottom right */}
                <button
                  onClick={() => {
                    const todayStr = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, '0')}-${String(realToday.getDate()).padStart(2, '0')}`;
                    setActiveDayAddInput(todayStr);
                    setNewDayTaskText('');
                  }}
                  className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-indigo-500/20 transition-all cursor-pointer z-[40]"
                  title="Добавить задачу на сегодня"
                >
                  <Plus className="w-7 h-7" />
                </button>
              </div>
            )}

            {/* 2. Weekly Layout Mode */}
            {calendarSubMode === 'week' && (
              <div id="calendar-week-scroll-container" className="flex-1 grid grid-cols-7 gap-3 h-full overflow-y-auto pr-1 custom-scrollbar">
                {weeklySlots.map((slot) => {
                  const dayTasks = scheduledTasks.filter(task => task.dueDate === slot.dateString);
                  const isDragOver = draggedOverDate === slot.dateString;

                  return (
                    <div
                      key={slot.dateString}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDraggedOverDate(slot.dateString)}
                      onDragLeave={() => {
                        if (draggedOverDate === slot.dateString) {
                          setDraggedOverDate(null);
                        }
                      }}
                      onDrop={(e) => {
                        const taskId = e.dataTransfer.getData('text/plain');
                        handleTaskDrop(taskId, slot.dateString);
                      }}
                      onClick={() => {
                        setActiveDayAddInput(slot.dateString);
                        setNewDayTaskText('');
                      }}
                      className={`min-h-[440px] border rounded-2xl p-3 flex flex-col justify-start transition-all duration-200 group relative bg-white dark:bg-slate-900 cursor-pointer ${
                        slot.isToday 
                          ? 'border-indigo-400 ring-2 ring-indigo-500/10' 
                          : 'border-slate-150 dark:border-slate-800'
                      } ${
                        isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-500 scale-[1.01]' : ''
                      }`}
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between mb-3 shrink-0 select-none pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-505 tracking-wider">
                            {slot.dayName}
                          </span>
                          <span className={`text-base font-extrabold ${
                            slot.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-205'
                          }`}>
                            {slot.dayNumber}
                          </span>
                        </div>

                        {/* Inline plus button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDayAddInput(activeDayAddInput === slot.dateString ? null : slot.dateString);
                            setNewDayTaskText('');
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-md transition-all cursor-pointer"
                          title="Создать задачу"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Day Tasks List */}
                      <div className={`flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar ${draggingTaskId ? 'pointer-events-none' : ''}`}>
                        {dayTasks.map(task => (
                          <div
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNode(task.id);
                            }}
                            draggable={true}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', task.id);
                              setDraggingTaskId(task.id);
                            }}
                            onDragEnd={(e) => {
                              e.stopPropagation();
                              setDraggingTaskId(null);
                            }}
                            className={`group/task border text-[11px] leading-snug p-2 rounded-xl flex items-start gap-1.5 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.015] active:scale-98 relative ${getPriorityColor(task.priority)} ${
                              draggingTaskId === task.id ? 'opacity-40 border-dashed border-indigo-300' : ''
                            }`}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateNode({
                                  ...task,
                                  completed: !task.completed
                                });
                              }}
                              className={`text-slate-400 hover:text-indigo-650 p-0.5 rounded transition-transform duration-100 shrink-0 ${
                                task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                              }`}
                            >
                              {task.completed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <Circle className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </button>
                            <div className="flex-1 flex flex-col min-w-0">
                              <span className={`truncate font-semibold ${task.completed ? 'line-through opacity-55' : 'text-slate-850 dark:text-slate-100'}`}>
                                {task.text}
                              </span>
                              {(task.startTime || task.dueTime) && (
                                <div className="flex items-center gap-1 text-[9px] text-indigo-600 dark:text-indigo-400 mt-0.5 font-bold font-mono">
                                  <span>🕒 {formatTaskTime(task)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Inline custom task input */}
                        {activeDayAddInput === slot.dateString && (
                          <div 
                            className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              autoFocus
                              placeholder="Новая задача..."
                              value={newDayTaskText}
                              onChange={(e) => setNewDayTaskText(e.target.value)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') handleAddDayTaskSubmit(slot.dateString);
                                if (e.key === 'Escape') setActiveDayAddInput(null);
                              }}
                              className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg border border-slate-205 focus:outline-none focus:border-indigo-500"
                            />
                            <div className="flex gap-1 mt-1.5 justify-end">
                              <button
                                onClick={() => setActiveDayAddInput(null)}
                                className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                              >
                                Отмена
                              </button>
                              <button
                                onClick={() => handleAddDayTaskSubmit(slot.dateString)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer"
                              >
                                Ок
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. Daily Hourly Layout Mode */}
            {calendarSubMode === 'day' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-150 dark:border-slate-800 p-4 shadow-xs font-sans">
                {/* All day tasks card - Click to add */}
                <div 
                  onClick={() => {
                    setActiveDayAddInput(currentDateStr);
                    setNewDayTaskText('');
                  }}
                  className="mb-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/45 dark:bg-slate-950/20 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-900 hover:bg-indigo-50/5 dark:hover:bg-indigo-950/5 transition-all group/allday"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-550 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <span>📌</span> Задача на весь день
                    </span>
                    <span className="text-[11px] text-slate-400 group-hover/allday:text-indigo-600 dark:group-hover/allday:text-indigo-400 font-bold transition-all">
                      Кликните, чтобы добавить
                    </span>
                  </div>

                  {/* Inline list of all-day tasks */}
                  {(() => {
                    const allDayTasks = scheduledTasks.filter(t => t.dueDate === currentDateStr && !t.dueTime);
                    if (allDayTasks.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          {allDayTasks.map(task => (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(task.id);
                              }}
                              className={`group/alldaytask border text-[11px] leading-none py-1.5 px-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.015] active:scale-98 relative ${getPriorityColor(task.priority)}`}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateNode({
                                    ...task,
                                    completed: !task.completed
                                  });
                                }}
                                className={`text-slate-400 hover:text-indigo-650 p-0.5 rounded transition-transform shrink-0 ${
                                  task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                                }`}
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </button>
                              <span className={`font-semibold truncate max-w-[150px] ${task.completed ? 'line-through opacity-55' : 'text-slate-800 dark:text-slate-205'}`}>
                                {task.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Inline add for All Day tasks */}
                  {activeDayAddInput === currentDateStr && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2.5 max-w-sm p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md"
                    >
                      <input
                        type="text"
                        autoFocus
                        placeholder="Какую задачу запланировать на этот день?"
                        value={newDayTaskText}
                        onChange={(e) => setNewDayTaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddDayTaskSubmit(currentDateStr);
                          if (e.key === 'Escape') setActiveDayAddInput(null);
                        }}
                        className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-205 focus:outline-none focus:border-indigo-500 font-medium"
                      />
                      <div className="flex gap-1.5 mt-2 justify-end">
                        <button
                          onClick={() => setActiveDayAddInput(null)}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-705 px-2.5 py-0.5 rounded-lg text-[10px] font-bold"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => handleAddDayTaskSubmit(currentDateStr)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-bold"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable Hourly Timeline list */}
                <div id="calendar-day-scroll-container" className="flex-1 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar animate-fade-in">
                  {HOURS.map((hour) => {
                    const isDragOver = draggedOverDate === `hour-${hour}`;

                    return (
                      <div 
                        key={hour}
                        onClick={() => {
                          setActiveHourAddInput(hour);
                          setNewHourTaskText('');
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverDate(`hour-${hour}`)}
                        onDragLeave={() => {
                          if (draggedOverDate === `hour-${hour}`) {
                            setDraggedOverDate(null);
                          }
                        }}
                        onDrop={(e) => {
                          const taskId = e.dataTransfer.getData('text/plain');
                          if (taskId) {
                            handleTaskDropToHour(taskId, currentDateStr, hour);
                          }
                        }}
                        className={`flex items-stretch border-b border-dashed border-slate-100 dark:border-slate-800 min-h-[58px] transition-all duration-150 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/20 group/row ${
                          isDragOver ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        {/* Hour column */}
                        <div className="w-16 flex items-center justify-center shrink-0 border-r border-slate-100 dark:border-slate-800 pr-3 text-right">
                          <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-505">
                            {hour}
                          </span>
                        </div>

                        {/* Content area */}
                        <div className="flex-1 flex flex-wrap gap-2 items-center px-4 py-1.5 relative">
                          {/* Render hour tasks or inline box */}
                          {(() => {
                            const hourTasks = scheduledTasks.filter(task => task.dueDate === currentDateStr && (task.dueTime === hour || task.startTime === hour));
                            if (hourTasks.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-2 items-center flex-1" onClick={(e) => e.stopPropagation()}>
                                  {hourTasks.map(task => (
                                    <div
                                      key={task.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectNode(task.id);
                                      }}
                                      draggable={true}
                                      onDragStart={(e) => {
                                        e.stopPropagation();
                                        e.dataTransfer.setData('text/plain', task.id);
                                        setDraggingTaskId(task.id);
                                      }}
                                      onDragEnd={(e) => {
                                        e.stopPropagation();
                                        setDraggingTaskId(null);
                                      }}
                                      className={`group/task border text-[11px] leading-snug py-1 px-2.5 rounded-xl flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.015] active:scale-98 relative shadow-xs shrink-0 max-w-[240px] ${getPriorityColor(task.priority)} ${
                                        draggingTaskId === task.id ? 'opacity-40 border-dashed border-indigo-300' : ''
                                      }`}
                                    >
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateNode({
                                            ...task,
                                            completed: !task.completed
                                          });
                                        }}
                                        className="text-slate-400 hover:text-indigo-650 p-0.5 rounded transition-transform shrink-0"
                                      >
                                        {task.completed ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                        ) : (
                                          <Circle className="w-3.5 h-3.5 shrink-0" />
                                        )}
                                      </button>
                                      <span className={`font-semibold truncate flex-1 ${task.completed ? 'line-through opacity-55' : 'text-slate-800 dark:text-slate-100'}`}>
                                        {task.text}
                                      </span>
                                      {/* Quick cross to remove hour */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateNode({
                                            ...task,
                                            dueTime: undefined,
                                            startTime: undefined
                                          });
                                        }}
                                        className="opacity-0 group-hover/task:opacity-100 ml-1 hover:text-rose-500 text-[10px] font-bold bg-slate-100/40 dark:bg-slate-800/20 px-1 rounded cursor-pointer"
                                        title="Убрать время"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                  {/* Plus icon to add another task */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveHourAddInput(hour);
                                      setNewHourTaskText('');
                                    }}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-450 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded transition-all cursor-pointer"
                                    title="Добавить еще задачу"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            }

                            if (activeHourAddInput === hour) {
                              return (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 px-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/45 flex items-center gap-2 max-w-sm flex-1"
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder={`Задача на ${hour}...`}
                                    value={newHourTaskText}
                                    onChange={(e) => setNewHourTaskText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddDayTaskSubmit(currentDateStr, hour);
                                      if (e.key === 'Escape') setActiveHourAddInput(null);
                                    }}
                                    className="flex-1 text-xs px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-205 focus:outline-none focus:border-indigo-500 font-medium"
                                  />
                                  <button
                                    onClick={() => handleAddDayTaskSubmit(currentDateStr, hour)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold cursor-pointer"
                                  >
                                    Ок
                                  </button>
                                  <button
                                    onClick={() => setActiveHourAddInput(null)}
                                    className="text-slate-455 hover:text-slate-600 text-[10px]"
                                  >
                                    Отмена
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div className="text-[11px] text-slate-300 dark:text-slate-705 italic group-hover/row:text-indigo-400/80 transition-colors">
                                Кликните, чтобы добавить задачу на {hour}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Unscheduled Right deck drawer sidebar */}
      <div className={`w-full lg:w-80 bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col p-3 md:p-5 shrink-0 lg:h-full overflow-hidden transition-all duration-300 ${
        isUnscheduledExpandedMobile ? 'h-[280px] lg:h-full' : 'h-[56px] lg:h-full'
      }`}>
        <div 
          onClick={() => setIsUnscheduledExpandedMobile(!isUnscheduledExpandedMobile)}
          className="flex items-center gap-2 mb-3 shrink-0 cursor-pointer lg:pointer-events-none select-none hover:bg-slate-50 dark:hover:bg-slate-800/40 lg:hover:bg-transparent p-1 px-2 lg:p-0 rounded-xl transition-colors"
        >
          <span className="text-sm shrink-0">📥</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate">
              Планирование (Без даты)
            </h3>
            <p className="text-[9px] text-slate-400 dark:text-slate-400 truncate">
              {isUnscheduledExpandedMobile ? 'Нажмите, чтобы убрать список' : 'Нажмите, чтобы распределить по датам'}
            </p>
          </div>
          <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0">
            {unscheduledTasks.length}
          </span>
          {/* Collapse/Expand indicator for mobile */}
          <span className="text-slate-400 text-[10px] lg:hidden font-bold select-none px-1">
            {isUnscheduledExpandedMobile ? '▼' : '▲'}
          </span>
        </div>

        {/* Unscheduled List container */}
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setDraggedOverUnscheduled(true)}
          onDragLeave={() => setDraggedOverUnscheduled(false)}
          onDrop={(e) => {
            const taskId = e.dataTransfer.getData('text/plain');
            handleTaskDrop(taskId, null);
          }}
          className={`overflow-y-auto space-y-2 pr-1 custom-scrollbar transition-all duration-200 p-1 rounded-xl ${
            isUnscheduledExpandedMobile ? 'flex-1 flex flex-col' : 'hidden lg:flex lg:flex-col lg:flex-1'
          } ${
            draggedOverUnscheduled 
              ? 'bg-indigo-55/40 border-2 border-dashed border-indigo-400 dark:bg-indigo-950/20' 
              : 'border border-transparent'
          }`}
        >
          {unscheduledTasks.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center p-4">
              <span className="text-xl mb-1.5 text-slate-400">✨</span>
              <p className="font-bold text-xs text-slate-600 dark:text-slate-350">Все даты назначены!</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[180px] mt-1 leading-snug">
                Новые задачи без даты появятся здесь для быстрого контроля.
              </p>
            </div>
          ) : (
            unscheduledTasks.map(task => (
              <div
                key={task.id}
                onClick={() => onSelectNode(task.id)}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', task.id);
                  setDraggingTaskId(task.id);
                }}
                onDragEnd={() => setDraggingTaskId(null)}
                className={`group border border-slate-150 dark:border-slate-800/80 p-2.5 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-850 rounded-xl shadow-xs transition-all flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-700 ${
                  draggingTaskId === task.id ? 'opacity-40 border-dashed border-indigo-400' : ''
                }`}
              >
                <div className="flex items-start gap-1.5 justify-between">
                  {/* Title */}
                  <span className={`text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight flex-1 ${
                    task.completed ? 'line-through opacity-55' : ''
                  }`}>
                    {task.text}
                  </span>
                  
                  {/* Delete button wrapper */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode(task.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Date setup picker */}
                <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Clock className="w-3 h-3 text-slate-400" />
                  <input
                    type="date"
                    value={task.dueDate || ''}
                    title="Назначить срок"
                    onChange={(e) => {
                      onUpdateNode({
                        ...task,
                        dueDate: e.target.value
                      });
                    }}
                    className="flex-1 text-[10px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-lg focus:outline-none"
                  />
                  
                  <button
                    onClick={() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      onUpdateNode({
                        ...task,
                        dueDate: todayStr
                      });
                    }}
                    title="Назначить на сегодня"
                    className="p-1 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white rounded-lg text-indigo-600 dark:text-indigo-400 transition-colors text-[9px] font-extrabold flex items-center gap-0.5 cursor-pointer shrink-0"
                  >
                    Сегодня <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
