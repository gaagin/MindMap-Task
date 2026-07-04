import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Loader2, 
  Calendar, 
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Search,
  Link as LinkIcon,
  Filter,
  PieChart,
  CreditCard,
  Mail,
  ListTodo,
  TrendingUp,
  PlusCircle,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

interface CalendarViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string, dueTime?: string) => void;
  setViewMode?: (mode: 'canvas' | 'kanban' | 'mobile-list' | 'calendar' | 'gantt' | 'table' | 'eisenhower') => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
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
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  setViewMode,
  onFullScreenChange
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
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
  
  const formatTaskTime = (task: TaskNode) => {
    if (task.startTime && task.dueTime) {
      return `${task.startTime} - ${task.dueTime}`;
    }
    return task.startTime || task.dueTime || '';
  };

  const getPillStyles = (task: TaskNode) => {
    switch (task.priority) {
      case 'urgent':
        return 'bg-[#FEF2F2] hover:bg-[#FEE2E2] dark:bg-rose-950/30 text-[#991B1B] dark:text-rose-300 border-l-[3.5px] border-[#EF4444]';
      case 'high':
      case 'medium':
        return 'bg-[#FFF7ED] hover:bg-[#FFEDD5] dark:bg-amber-950/30 text-[#C2410C] dark:text-amber-350 border-l-[3.5px] border-[#F97316]';
      case 'low':
      case 'none':
      default:
        return 'bg-[#E6FDF5] hover:bg-[#D1FAE5] dark:bg-emerald-950/25 text-[#047857] dark:text-emerald-300 border-l-[3.5px] border-[#10B981]';
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
  const [layoutType, setLayoutType] = useState<'grid' | 'list'>('grid');
  const [showFilter, setShowFilter] = useState(false);
  const [calendarSearchQuery, setCalendarSearchQuery] = useState('');
  
  const [activeDayAddInput, setActiveDayAddInput] = useState<string | null>(null); // ISO string 'YYYY-MM-DD'

  const HOUR_HEIGHT = 60;

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
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
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

  const computeBlocksForTasks = (timedTasks: TaskNode[]): TimedTaskBlock[] => {
    const blocks: TimedTaskBlock[] = timedTasks.map(task => {
      const startStr = task.startTime || task.dueTime || "09:00";
      let endStr = task.dueTime || task.startTime || "10:00";
      
      if (task.startTime && !task.dueTime) {
        const startMin = timeToMinutes(task.startTime);
        endStr = minutesToTime(startMin + 60);
      }
      if (task.dueTime && !task.startTime) {
        const endMin = timeToMinutes(task.dueTime);
        const startMin = Math.max(0, endMin - 60);
        return {
          task,
          top: (startMin / 60) * HOUR_HEIGHT,
          height: HOUR_HEIGHT,
          startMin,
          endMin
        };
      }
      
      let startMin = timeToMinutes(startStr);
      let endMin = timeToMinutes(endStr);
      
      if (endMin <= startMin) {
        endMin = startMin + 60;
      }
      
      const top = (startMin / 60) * HOUR_HEIGHT;
      const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
      
      return {
        task,
        top,
        height,
        startMin,
        endMin
      };
    });

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
        block.width = `${100 / totalCols}%`;
        block.left = `${(colIdx * 100) / totalCols}%`;
      });
    });

    return blocks;
  };

  useEffect(() => {
    if (layoutType === 'grid') {
      const dailyScroll = document.getElementById('daily-time-blocking-scroll');
      if (dailyScroll) {
        dailyScroll.scrollTop = 7 * HOUR_HEIGHT; // Scroll to 07:00
      }
      const weeklyScroll = document.getElementById('weekly-time-blocking-scroll');
      if (weeklyScroll) {
        weeklyScroll.scrollTop = 7 * HOUR_HEIGHT; // Scroll to 07:00
      }
    }
  }, [calendarSubMode, layoutType]);
  const [newDayTaskText, setNewDayTaskText] = useState('');
  const [activeHourAddInput, setActiveHourAddInput] = useState<string | null>(null); // e.g. '09:00'
  const [newHourTaskText, setNewHourTaskText] = useState('');
  const [isUnscheduledExpandedMobile, setIsUnscheduledExpandedMobile] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_calendar_unscheduled_expanded');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  useEffect(() => {
    try {
      localStorage.setItem('task_mindmap_calendar_unscheduled_expanded', String(isUnscheduledExpandedMobile));
    } catch {}
  }, [isUnscheduledExpandedMobile]);

  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');

  // Drag and drop states for moving tasks between calendar days
  const [draggedOverDate, setDraggedOverDate] = useState<string | null>(null);
  const [draggedOverUnscheduled, setDraggedOverUnscheduled] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const touchStartPos = React.useRef<{ x: number; y: number; dateString: string | null } | null>(null);
  const touchHasMoved = React.useRef<boolean>(false);

  // Auto-scrolling when dragging task near the edges of scrollable viewports
  useEffect(() => {
    if (!draggingTaskId) return;

    let animationFrameId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;
    let currentHoveredDate: string | null = null;
    let currentHoveredUnscheduled = false;

    const handleDragOver = (e: DragEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      lastClientX = touch.clientX;
      lastClientY = touch.clientY;

      if (touchStartPos.current) {
        const dx = touch.clientX - touchStartPos.current.x;
        const dy = touch.clientY - touchStartPos.current.y;
        if (Math.hypot(dx, dy) > 8) {
          touchHasMoved.current = true;
        }
      }

      const targetElem = document.elementFromPoint(touch.clientX, touch.clientY);
      if (targetElem) {
        // 1. Is it dragged over the unscheduled list?
        const isUnscheduledZone = targetElem.closest('[data-unscheduled-drop-zone="true"]');
        if (isUnscheduledZone) {
          if (currentHoveredDate !== null) {
            currentHoveredDate = null;
            setDraggedOverDate(null);
          }
          if (!currentHoveredUnscheduled) {
            currentHoveredUnscheduled = true;
            setDraggedOverUnscheduled(true);
          }
        } else {
          if (currentHoveredUnscheduled) {
            currentHoveredUnscheduled = false;
            setDraggedOverUnscheduled(false);
          }

          // 2. Is it dragged over a calendar day slot?
          const dayCard = targetElem.closest('[data-date]');
          const targetDate = dayCard ? dayCard.getAttribute('data-date') : null;
          if (targetDate !== currentHoveredDate) {
            currentHoveredDate = targetDate;
            setDraggedOverDate(targetDate);
          }
        }
      } else {
        if (currentHoveredDate !== null) {
          currentHoveredDate = null;
          setDraggedOverDate(null);
        }
        if (currentHoveredUnscheduled) {
          currentHoveredUnscheduled = false;
          setDraggedOverUnscheduled(false);
        }
      }

      // Restrict document default rubber-band scrolling on touch devices while elements are actively being dragged
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const targetId = draggingTaskId;
      const startInfo = touchStartPos.current;
      const hasMoved = touchHasMoved.current;

      setDraggingTaskId(null);
      setDraggedOverDate(null);
      setDraggedOverUnscheduled(false);
      touchStartPos.current = null;
      touchHasMoved.current = false;

      if (targetId) {
        if (!hasMoved) {
          // If touch didn't move much, treat it as a standard click (select the task)
          onSelectNode(targetId, e);
          return;
        }

        if (currentHoveredUnscheduled) {
          handleTaskDrop(targetId, null);
        } else {
          // Default to start date if dropped off-screen/off-grid to prevent accidental unscheduling
          const targetDate = currentHoveredDate !== null ? currentHoveredDate : (startInfo ? startInfo.dateString : null);
          handleTaskDrop(targetId, targetDate);
        }
      }
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
        scrollVertical('calendar-horizontal-scroll-container');
      } else if (calendarSubMode === 'week') {
        scrollVertical('calendar-week-scroll-container');
      } else if (calendarSubMode === 'day') {
        scrollVertical('calendar-day-scroll-container');
      }

      animationFrameId = requestAnimationFrame(autoScroll);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    
    animationFrameId = requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
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
  const projectTasks = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle);

  // Divide into scheduled and unscheduled
  const scheduledTasks = projectTasks.filter(n => n.dueDate);
  const rawUnscheduledTasks = projectTasks.filter(n => !n.dueDate);
  const unscheduledTasks = sidebarSearchQuery
    ? rawUnscheduledTasks.filter(t => t.text.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
    : rawUnscheduledTasks;

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
      case 'urgent': return 'bg-[#FEF2F2] border-[#FEE2E2] text-[#991B1B] dark:bg-rose-950/30 dark:border-rose-900/45 dark:text-rose-450';
      case 'high': return 'bg-[#FFF7ED] border-[#FFEDD5] text-[#C2410C] dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-450';
      case 'medium': return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/45 dark:text-indigo-400';
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
      ];
      return `${currentDate.getDate()} ${MONTH_NAMES_RU[currentDate.getMonth()]} ${year}, ${dayOfWeekName[currentDate.getDay()]}`;
    }
  };

  return (
    <div 
      id="calendar-workspace-view" 
      className={`relative bg-[#F8FAFC] dark:bg-slate-950 overflow-hidden font-sans flex flex-col lg:flex-row shadow-inner transition-all duration-200 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'w-full h-full'
      }`}
    >
      {/* Calendar Grid Section */}
      <div className="flex-1 flex flex-col p-1.5 sm:p-2 overflow-hidden min-w-0">
        
        {/* The beautiful thick bordered custom container card */}
        <div className="flex-1 bg-white dark:bg-slate-900 border-[2px] sm:border-[2.5px] border-[#1E293B] dark:border-slate-800 rounded-[16px] sm:rounded-[20px] p-2 sm:p-3 shadow-sm flex flex-col h-full overflow-hidden">
          
          {/* Calendar Navigation and Title Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 mb-1.5 shrink-0 bg-transparent">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg border-[1.5px] border-[#1E293B] bg-indigo-50/35 text-[#1E293B] dark:border-slate-700 dark:bg-indigo-950/20 dark:text-slate-350 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <h2 className="text-sm sm:text-base font-black text-[#1E293B] dark:text-slate-100 uppercase tracking-tight leading-none font-sans">
                    {getHeaderTitle()}
                  </h2>
                  <span className="text-[10px] bg-indigo-50/35 dark:bg-indigo-950/20 text-[#1E293B] dark:text-slate-300 font-bold px-1.5 py-0.5 rounded-md border border-slate-200/50 dark:border-slate-755 leading-none shrink-0">
                    Событий: <span className="text-[#4F46E5] dark:text-indigo-400 font-extrabold">{scheduledTasks.length}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 justify-end">
              {/* Switch tabs */}
              <div className="flex bg-slate-100/95 dark:bg-slate-800/80 rounded-lg p-0.5 border border-slate-200/60 dark:border-slate-705 shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setCalendarSubMode('month')}
                  className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                    calendarSubMode === 'month'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-3xs border border-slate-200/30'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Месяц
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarSubMode('week')}
                  className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                    calendarSubMode === 'week'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-3xs border border-slate-200/30'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Неделя
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarSubMode('day')}
                  className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                    calendarSubMode === 'day'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-3xs border border-slate-200/30'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  День
                </button>
              </div>

              {/* Switch layout type for Day/Week modes */}
              {(calendarSubMode === 'day' || calendarSubMode === 'week') && (
                <div className="flex bg-slate-100/95 dark:bg-slate-800/80 rounded-lg p-0.5 border border-slate-200/60 dark:border-slate-705 shrink-0 select-none animate-fade-in">
                  <button
                    type="button"
                    onClick={() => setLayoutType('grid')}
                    className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                      layoutType === 'grid'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-3xs border border-slate-200/30'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Блочный вид
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutType('list')}
                    className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                      layoutType === 'list'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-3xs border border-slate-200/30'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Список
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={setToday}
                className="px-2 py-0.5 bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-[10px] font-black rounded-lg transition-all cursor-pointer shadow-3xs active:scale-[0.98]"
              >
                Сегодня
              </button>

              <button
                type="button"
                onClick={() => setShowFilter(!showFilter)}
                className={`px-2 py-0.5 text-[10px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
                  showFilter 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-850 dark:text-indigo-405' 
                    : 'bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700 text-slate-705 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Filter className="w-3 h-3 text-current" />
                фильтр
              </button>

              <div className="flex items-center bg-slate-100/90 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 rounded-md transition-all cursor-pointer"
                  title="Назад"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 rounded-md transition-all cursor-pointer"
                  title="Вперед"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Full Screen Toggle Button */}
              <button
                type="button"
                onClick={() => setIsFullScreen(!isFullScreen)}
                className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 border shrink-0 ${
                  isFullScreen 
                    ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-850 dark:text-amber-400' 
                    : 'bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700 text-[#1E293B] dark:text-slate-100 border-slate-200/60 dark:border-slate-700'
                }`}
                title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
              >
                {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline-block font-bold">{isFullScreen ? 'Свернуть' : 'На весь экран'}</span>
              </button>
            </div>
          </div>

          {/* Separator */}
          <div className="border-b-[1.5px] border-slate-200 dark:border-slate-850 mb-1.5 shrink-0" />

          {/* Dynamic Search / Filtering Input when showFilter is active */}
          {showFilter && (
            <div className="w-full max-w-md mx-auto mb-2 animate-fade-in px-2 shrink-0">
              <input
                type="text"
                placeholder="Поиск по задачам..."
                value={calendarSearchQuery}
                onChange={(e) => setCalendarSearchQuery(e.target.value)}
                className="w-full text-xs p-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-gray-100 rounded-lg border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-slate-400 font-medium font-sans shadow-3xs"
              />
            </div>
          )}

          {/* Scrollable Container Window */}
          <div id="calendar-horizontal-scroll-container" className="flex-1 overflow-auto custom-scrollbar pb-1">
            <div className={`${calendarSubMode === 'day' ? 'w-full' : 'min-w-[850px] lg:min-w-full'} h-full flex flex-col`}>
              
              {/* Active Sub Tab Controller */}
              <>

                {/* 1. Monthly Grid Mode */}
                {calendarSubMode === 'month' && (
                  <div className="flex-1 flex flex-col min-h-[720px] lg:min-h-[840px] relative">
                    {/* Integrated weekday headers inside slots themselves, forming hmbee design */}
                    <div className="grid grid-cols-7 border-t border-l border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs h-full flex-1">
                      {calendarSlots.map((slot, sIdx) => {
                        const dayTasks = scheduledTasks.filter(task => {
                          if (task.dueDate !== slot.dateString) return false;
                          if (calendarSearchQuery) {
                            return task.text.toLowerCase().includes(calendarSearchQuery.toLowerCase());
                          }
                          return true;
                        });
                        const isInactiveMonth = slot.monthOffset !== 0;
                        const isDragOver = draggedOverDate === slot.dateString;
                        
                        // First row appends week labels natively like "25, Пн"
                        // Consecutive rows render only numbers like "1", "2"
                          const cellHeaderLabel = sIdx < 7 
                            ? `${slot.dayNumber}, ${WEEKDAYS_RU[sIdx]}`
                            : `${slot.dayNumber}`;

                          return (
                            <div
                              key={`${slot.dateString}-${sIdx}`}
                              data-date={slot.dateString}
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
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('.task-item')) {
                                  return;
                                }
                                setActiveDayAddInput(slot.dateString);
                                setNewDayTaskText('');
                              }}
                              className={`flex flex-col p-1.5 select-none min-h-[120px] sm:min-h-[140px] md:min-h-[160px] lg:min-h-[180px] h-full flex-1 hover:bg-slate-50/50 dark:hover:bg-slate-850/30 border-b border-r border-[#1E293B] dark:border-slate-800 transition-all cursor-pointer relative ${
                                isInactiveMonth ? 'bg-slate-50/30 opacity-40 text-slate-400 dark:bg-slate-900/10' : 'bg-white dark:bg-slate-900'
                              } ${
                                slot.isToday ? 'bg-blue-50/15 dark:bg-blue-955/20 border-b-2 border-indigo-505' : ''
                              } ${
                                isDragOver ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                              }`}
                            >
                              {/* Cell Header with Label & plus logo */}
                              <div className="flex justify-between items-center mb-1 shrink-0 select-none">
                                <span className={`text-[10px] sm:text-[10.5px] font-extrabold ${
                                  slot.isToday
                                    ? 'text-blue-600 dark:text-blue-400 underline decoration-2'
                                    : isInactiveMonth
                                    ? 'text-slate-300 dark:text-slate-650'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}>
                                  {cellHeaderLabel}
                                </span>
                                
                                <span className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 rounded text-[9px] font-bold">
                                  +
                                </span>
                              </div>

                              {/* Cell Content Space */}
                              <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto max-h-[120px] sm:max-h-[150px] md:max-h-[180px] lg:max-h-[200px] custom-scrollbar pointer-events-auto">
                                {dayTasks.map(task => {
                                  return (
                                    <div
                                      key={task.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectNode(task.id, e);
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
                                      onTouchStart={(e) => {
                                        e.stopPropagation();
                                        const touch = e.touches[0];
                                        touchStartPos.current = { x: touch.clientX, y: touch.clientY, dateString: slot.dateString };
                                        touchHasMoved.current = false;
                                        setDraggingTaskId(task.id);
                                      }}
                                      className={`task-item text-[9.5px] rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all truncate leading-tight flex items-center gap-1 cursor-grab active:cursor-grabbing select-none pointer-events-auto shrink-0 ${
                                        task.completed ? 'opacity-40 line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'
                                      } ${
                                        draggingTaskId === task.id ? 'opacity-30 border-dashed border-indigo-350' : ''
                                      }`}
                                      title={task.text}
                                    >
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                                        task.priority === 'urgent' ? 'bg-rose-500' :
                                        task.priority === 'high' ? 'bg-amber-500' :
                                        task.priority === 'medium' ? 'bg-indigo-500' : 'bg-slate-400'
                                      }`}></span>
                                      <span className="truncate text-[10px] font-semibold">{task.text}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Active Day Add Overlay */}
                              {activeDayAddInput === slot.dateString && (
                                <div 
                                  className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 p-1 flex flex-col justify-between z-10 rounded-lg border border-indigo-500 animate-fade-in"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Новая задача..."
                                    value={newDayTaskText}
                                    onChange={(e) => setNewDayTaskText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddDayTaskSubmit(slot.dateString);
                                      if (e.key === 'Escape') setActiveDayAddInput(null);
                                    }}
                                    className="w-full text-[10px] p-1 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                  />
                                  <div className="flex gap-1 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setActiveDayAddInput(null)}
                                      className="px-1.5 py-0.5 bg-slate-250 hover:bg-slate-300 rounded text-[9px] font-bold text-slate-600 cursor-pointer"
                                    >
                                      отмена
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAddDayTaskSubmit(slot.dateString)}
                                      className="px-1.5 py-0.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded text-[9px] font-bold cursor-pointer"
                                    >
                                      ок
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>

              {/* 2. Weekly Layout Mode */}
              {calendarSubMode === 'week' && (
                layoutType === 'list' ? (
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
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('.task-item')) {
                              return;
                            }
                            setActiveDayAddInput(slot.dateString);
                            setNewDayTaskText('');
                          }}
                          className={`min-h-[440px] border rounded-2xl p-3 flex flex-col justify-start transition-all duration-200 group relative bg-white dark:bg-slate-900 cursor-pointer ${
                            slot.isToday 
                              ? 'border-indigo-400 ring-2 ring-indigo-500/10' 
                              : 'border-slate-150 dark:border-slate-800'
                          } ${
                            isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-505 scale-[1.01]' : ''
                          }`}
                        >
                          {/* Day Header */}
                          <div className="flex items-center justify-between mb-3 shrink-0 select-none pb-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-505 tracking-wider">
                                {slot.dayName}
                              </span>
                              <span className={`text-base font-extrabold ${
                                slot.isToday ? 'text-indigo-650 dark:text-indigo-400' : 'text-slate-705 dark:text-slate-205'
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
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-650 dark:text-slate-400 dark:hover:text-indigo-400 rounded-md transition-all cursor-pointer"
                              title="Создать задачу"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Day Tasks List */}
                          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                            {dayTasks.map(task => (
                              <div
                                key={task.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(task.id, e);
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
                                className={`task-item group/task border text-[11px] leading-snug p-2 rounded-xl flex items-start gap-1.5 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.015] active:scale-98 relative ${getPriorityColor(task.priority)} ${
                                  draggingTaskId === task.id ? 'opacity-40 border-dashed border-indigo-350' : ''
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
                                  ) : activePomodoroNodeId === task.id ? (
                                    <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
                                      <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                                    </span>
                                  ) : (
                                    <Circle className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                </button>
                                <div className="flex-1 flex flex-col min-w-0">
                                  <span className={`truncate font-semibold ${task.completed ? 'line-through opacity-55' : 'text-slate-850 dark:text-slate-100'}`}>
                                    {task.text}
                                  </span>
                                  {(task.startTime || task.dueTime) && (
                                    <div className="flex items-center gap-1 text-[9px] text-indigo-650 dark:text-indigo-400 mt-0.5 font-bold font-mono">
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
                                    Да
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div id="weekly-time-blocking-scroll" className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-150 dark:border-slate-805 p-4 shadow-xs font-sans">
                    {/* Sticky Day Headers */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2 mb-1 shrink-0 select-none">
                      <div className="w-12 shrink-0"></div>
                      <div className="flex-1 grid grid-cols-7 gap-1">
                        {weeklySlots.map((slot) => (
                          <div key={slot.dateString} className="flex flex-col items-center py-1">
                            <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-550 tracking-wider">
                              {slot.dayName}
                            </span>
                            <span className={`text-xs font-extrabold flex items-center justify-center w-6 h-6 rounded-full ${
                              slot.isToday 
                                ? 'bg-indigo-600 text-white shadow-3xs' 
                                : 'text-slate-700 dark:text-slate-200'
                            }`}>
                              {slot.dayNumber}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Scrollable area */}
                    <div className="flex-1 overflow-y-auto relative custom-scrollbar flex min-h-0" style={{ height: '480px' }}>
                      {/* Hour markers background and labels */}
                      <div className="w-12 shrink-0 flex flex-col relative select-none">
                        {Array.from({ length: 24 }).map((_, h) => (
                          <div key={h} className="h-[60px] border-b border-slate-100/35 dark:border-slate-800/25 flex justify-end pr-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono font-semibold pt-1">
                            {String(h).padStart(2, '0')}:00
                          </div>
                        ))}
                      </div>

                      {/* 7 columns for days */}
                      <div className="flex-1 grid grid-cols-7 gap-1 relative border-l border-slate-150 dark:border-slate-800">
                        {weeklySlots.map((slot) => {
                          const dayTasks = scheduledTasks.filter(task => task.dueDate === slot.dateString);
                          const timedTasks = dayTasks.filter(task => task.startTime || task.dueTime);
                          const timedBlocks = computeBlocksForTasks(timedTasks);
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
                                if (taskId) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const dropY = e.clientY - rect.top;
                                  const hourVal = Math.max(0, Math.min(23, Math.floor(dropY / 60)));
                                  const timeStr = `${String(hourVal).padStart(2, '0')}:00`;
                                  
                                  const taskToDrop = scheduledTasks.find(t => t.id === taskId);
                                  if (taskToDrop) {
                                    onUpdateNode({
                                      ...taskToDrop,
                                      dueDate: slot.dateString,
                                      startTime: timeStr,
                                      dueTime: undefined
                                    });
                                  }
                                }
                                setDraggedOverDate(null);
                              }}
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.closest('[draggable="true"]') || target.closest('button')) {
                                  return;
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickY = e.clientY - rect.top;
                                const hourVal = Math.max(0, Math.min(23, Math.floor(clickY / 60)));
                                const timeStr = `${String(hourVal).padStart(2, '0')}:00`;
                                setActiveHourAddInput(`${slot.dateString}-${timeStr}`);
                                setNewHourTaskText('');
                              }}
                              className={`h-[1440px] relative border-r border-slate-100 dark:border-slate-800 transition-colors duration-150 cursor-pointer ${
                                slot.isToday ? 'bg-indigo-50/5 dark:bg-indigo-950/5' : ''
                              } ${
                                isDragOver ? 'bg-indigo-50/25 dark:bg-indigo-950/15' : ''
                              }`}
                            >
                              {/* Horizontal hour helper lines */}
                              {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="absolute left-0 right-0 border-b border-slate-100/70 dark:border-slate-800/30" style={{ top: `${h * 60}px`, height: '60px' }}></div>
                              ))}

                              {/* Timed task blocks */}
                              {timedBlocks.map(({ task, top, height, left, width }) => (
                                <div
                                  key={task.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectNode(task.id, e);
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
                                  className={`absolute rounded-xl p-1.5 border text-[10px] leading-tight cursor-grab active:cursor-grabbing transition-all hover:brightness-95 hover:shadow-xs group/task flex flex-col justify-between overflow-hidden shadow-3xs ${getPillStyles(task)} ${
                                    draggingTaskId === task.id ? 'opacity-30 border-dashed border-indigo-300' : ''
                                  }`}
                                  style={{
                                    top: `${top}px`,
                                    height: `${Math.max(26, height)}px`,
                                    left: left || '0%',
                                    width: width || '100%',
                                    zIndex: 10
                                  }}
                                  title={`${task.text} (${formatTaskTime(task)})`}
                                >
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-start gap-1 font-semibold truncate leading-tight">
                                      <span>{getTaskIcon(task)}</span>
                                      <span className={task.completed ? 'line-through opacity-55' : ''}>{task.text}</span>
                                    </div>
                                    {height >= 40 && (
                                      <span className="text-[8px] font-mono font-bold mt-0.5 opacity-80">
                                        {formatTaskTime(task)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between mt-1 shrink-0">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateNode({
                                          ...task,
                                          completed: !task.completed
                                        });
                                      }}
                                      className="text-slate-400 hover:text-indigo-650 transition-colors p-0.5 rounded"
                                    >
                                      {task.completed ? (
                                        <CheckCircle2 className="w-3 h-3 text-indigo-500" />
                                      ) : (
                                        <Circle className="w-3 h-3" />
                                      )}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateNode({
                                          ...task,
                                          startTime: undefined,
                                          dueTime: undefined
                                        });
                                      }}
                                      className="opacity-0 group-hover/task:opacity-100 hover:text-rose-500 text-[8px] px-1 bg-white/40 dark:bg-slate-800/40 rounded transition-opacity"
                                      title="Убрать время"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}

                              {/* Inline add input overlay */}
                              {activeHourAddInput && activeHourAddInput.startsWith(`${slot.dateString}-`) && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-xl p-2 shadow-lg z-20 w-[120px]"
                                  style={{
                                    top: `${Math.max(10, Math.min(1300, parseInt(activeHourAddInput.split('-')[3].split(':')[0], 10) * 60))}px`,
                                    left: '50%',
                                    transform: 'translateX(-50%)'
                                  }}
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Задача..."
                                    value={newHourTaskText}
                                    onChange={(e) => setNewHourTaskText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const hourStr = activeHourAddInput.split('-')[3];
                                        handleAddDayTaskSubmit(slot.dateString, hourStr);
                                        setActiveHourAddInput(null);
                                      }
                                      if (e.key === 'Escape') setActiveHourAddInput(null);
                                    }}
                                    className="w-full text-[10px] p-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded border border-slate-200 outline-none focus:border-indigo-500 font-medium"
                                  />
                                  <div className="flex gap-1 mt-1.5 justify-end">
                                    <button
                                      onClick={() => setActiveHourAddInput(null)}
                                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[8px] px-1 py-0.5 rounded font-bold"
                                    >
                                      Отмена
                                    </button>
                                    <button
                                      onClick={() => {
                                        const hourStr = activeHourAddInput.split('-')[3];
                                        handleAddDayTaskSubmit(slot.dateString, hourStr);
                                        setActiveHourAddInput(null);
                                      }}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[8px] px-1 py-0.5 rounded font-bold"
                                    >
                                      Ок
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* 3. Daily Hourly Layout Mode */}
              {calendarSubMode === 'day' && (
                layoutType === 'list' ? (
                  <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-150 dark:border-slate-805 p-4 shadow-xs font-sans">
                    {/* All day tasks card - Click to add */}
                    <div 
                      onClick={() => {
                        setActiveDayAddInput(currentDateStr);
                        setNewDayTaskText('');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDraggedOverDate(`allday-${currentDateStr}`)}
                      onDragLeave={() => {
                        if (draggedOverDate === `allday-${currentDateStr}`) {
                          setDraggedOverDate(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) {
                          handleTaskDropToHour(taskId, currentDateStr, null);
                        }
                      }}
                      className={`mb-4 p-4 rounded-2xl border transition-all group/allday cursor-pointer ${
                        draggedOverDate === `allday-${currentDateStr}`
                          ? 'bg-indigo-55/40 border-2 border-dashed border-indigo-400 dark:bg-indigo-950/20'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50/45 dark:bg-slate-950/20 hover:border-indigo-300 dark:hover:border-indigo-900 hover:bg-indigo-50/5 dark:hover:bg-indigo-950/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-550 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <span>📌</span> Задача на весь день
                        </span>
                        <span className="text-[11px] text-slate-400 group-hover/allday:text-indigo-650 dark:group-hover/allday:text-indigo-400 font-bold transition-all">
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
                                      onSelectNode(task.id, e);
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
                                  className={`group/alldaytask border text-[11px] leading-none py-1.5 px-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.015] active:scale-98 relative cursor-grab active:cursor-grabbing ${getPriorityColor(task.priority)} ${
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
                                    className={`text-slate-400 hover:text-indigo-650 p-0.5 rounded transition-transform shrink-0 ${
                                      task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                                    }`}
                                  >
                                    {task.completed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ) : activePomodoroNodeId === task.id ? (
                                      <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
                                        <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                                      </span>
                                    ) : (
                                      <Circle className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                  </button>
                                  <div className="flex flex-col min-w-0 font-sans">
                                    <span className={`font-semibold truncate max-w-[150px] ${task.completed ? 'line-through opacity-55' : 'text-slate-800 dark:text-slate-205'}`}>
                                      {task.text}
                                    </span>
                                    <span className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5 flex items-center gap-0.5">
                                      📅 {task.dueDate ? task.dueDate.split('-').reverse().join('.') : ''}
                                    </span>
                                  </div>
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
                            className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                          />
                          <div className="flex gap-1.5 mt-2 justify-end">
                            <button
                              onClick={() => setActiveDayAddInput(null)}
                              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 px-2.5 py-0.5 rounded-lg text-[10px] font-bold"
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
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.closest('[draggable="true"]') || target.closest('button') || target.closest('.task-item')) {
                                return;
                              }
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
                            className={`flex items-stretch border-b border-dashed border-slate-100 dark:border-slate-800 min-h-[58px] transition-all duration-150 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group/row ${
                              isDragOver ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                            }`}
                          >
                            {/* Hour column */}
                            <div className="w-16 flex items-center justify-center shrink-0 border-r border-slate-100 dark:border-slate-800 pr-3 text-right">
                              <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                                {hour}
                              </span>
                            </div>

                            {/* Content area */}
                            <div className="flex-1 flex flex-wrap gap-2 items-center px-4 py-1.5 relative">
                              {/* Render hour tasks or inline box */}
                              {(() => {
                                const hourTasks = scheduledTasks.filter(task => {
                                  if (task.dueDate !== currentDateStr) return false;
                                  const timeStr = task.dueTime || task.startTime;
                                  if (!timeStr) return false;
                                  
                                  const parts = timeStr.split(':');
                                  if (parts.length === 0) return false;
                                  const taskHourVal = parseInt(parts[0], 10);
                                  if (isNaN(taskHourVal)) return false;
                                  
                                  const rowHourVal = parseInt(hour.split(':')[0], 10);
                                  if (isNaN(rowHourVal)) return false;

                                  if (rowHourVal === 7) {
                                    return taskHourVal <= 7;
                                  }
                                  if (rowHourVal === 22) {
                                    return taskHourVal >= 22;
                                  }
                                  return taskHourVal === rowHourVal;
                                });
                                if (hourTasks.length > 0) {
                                  return (
                                    <div className="flex flex-wrap gap-2 items-center flex-1" onClick={(e) => e.stopPropagation()}>
                                      {hourTasks.map(task => (
                                        <div
                                          key={task.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectNode(task.id, e);
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
                                          className={`group/task border text-[11px] leading-snug py-1.5 px-2.5 rounded-xl flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.015] active:scale-98 relative shadow-xs shrink-0 max-w-[240px] ${getPriorityColor(task.priority)} ${
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
                                            ) : activePomodoroNodeId === task.id ? (
                                              <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
                                                <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                                              </span>
                                            ) : (
                                              <Circle className="w-3.5 h-3.5 shrink-0" />
                                            )}
                                          </button>
                                          <div className="flex flex-col min-w-0 flex-1">
                                            <span className={`font-semibold truncate ${task.completed ? 'line-through opacity-55' : 'text-slate-800 dark:text-slate-100'}`}>
                                              {task.text}
                                            </span>
                                            <span className="text-[8.5px] font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5 flex items-center gap-1">
                                              <span>🕒 {task.dueTime || task.startTime}</span>
                                              {task.dueDate && <span className="text-slate-400">({task.dueDate.split('-').reverse().slice(0, 2).join('.')})</span>}
                                            </span>
                                          </div>
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
                                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded transition-all cursor-pointer"
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
                                        className="flex-1 text-xs px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                                      />
                                      <button
                                        onClick={() => handleAddDayTaskSubmit(currentDateStr, hour)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold cursor-pointer"
                                      >
                                        Ок
                                      </button>
                                      <button
                                        onClick={() => setActiveHourAddInput(null)}
                                        className="text-slate-400 hover:text-slate-600 text-[10px]"
                                      >
                                        Отмена
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="text-[11px] text-slate-300 dark:text-slate-700 italic group-hover/row:text-indigo-400 transition-colors">
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
                ) : (
                  <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-150 dark:border-slate-805 p-4 shadow-xs font-sans">
                    {/* All day tasks card */}
                    <div 
                      onClick={() => {
                        setActiveDayAddInput(currentDateStr);
                        setNewDayTaskText('');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDraggedOverDate(`allday-${currentDateStr}`)}
                      onDragLeave={() => {
                        if (draggedOverDate === `allday-${currentDateStr}`) {
                          setDraggedOverDate(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) {
                          handleTaskDropToHour(taskId, currentDateStr, null);
                        }
                      }}
                      className={`mb-4 p-4 rounded-2xl border transition-all group/allday cursor-pointer ${
                        draggedOverDate === `allday-${currentDateStr}`
                          ? 'bg-indigo-55/40 border-2 border-dashed border-indigo-400 dark:bg-indigo-950/20'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50/45 dark:bg-slate-950/20 hover:border-indigo-300 dark:hover:border-indigo-900 hover:bg-indigo-50/5 dark:hover:bg-indigo-950/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-550 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <span>📌</span> Задача на весь день
                        </span>
                        <span className="text-[11px] text-slate-400 group-hover/allday:text-indigo-650 dark:group-hover/allday:text-indigo-400 font-bold transition-all">
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
                                      onSelectNode(task.id, e);
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
                                  className={`group/alldaytask border text-[11px] leading-none py-1.5 px-3 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.015] active:scale-98 relative cursor-grab active:cursor-grabbing ${getPriorityColor(task.priority)} ${
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
                                    className={`text-slate-400 hover:text-indigo-650 p-0.5 rounded transition-transform shrink-0 ${
                                      task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                                    }`}
                                  >
                                    {task.completed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ) : activePomodoroNodeId === task.id ? (
                                      <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-rose-400 opacity-75"></span>
                                        <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                                      </span>
                                    ) : (
                                      <Circle className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                  </button>
                                  <div className="flex flex-col min-w-0">
                                    <span className={`font-semibold truncate max-w-[150px] ${task.completed ? 'line-through opacity-55' : 'text-slate-800 dark:text-slate-205'}`}>
                                      {task.text}
                                    </span>
                                  </div>
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
                            className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                          />
                          <div className="flex gap-1.5 mt-2 justify-end">
                            <button
                              onClick={() => setActiveDayAddInput(null)}
                              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 px-2.5 py-0.5 rounded-lg text-[10px] font-bold"
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

                    {/* Scrollable Time blocking timeline */}
                    <div id="daily-time-blocking-scroll" className="flex-1 overflow-y-auto relative custom-scrollbar flex min-h-0" style={{ minHeight: '300px' }}>
                      {/* Hour indicators labels */}
                      <div className="w-16 shrink-0 flex flex-col relative select-none pr-3">
                        {Array.from({ length: 24 }).map((_, h) => (
                          <div key={h} className="h-[60px] border-b border-slate-100/35 dark:border-slate-800/25 flex justify-end text-[10px] text-slate-400 dark:text-slate-500 font-mono font-semibold pt-1">
                            {String(h).padStart(2, '0')}:00
                          </div>
                        ))}
                      </div>

                      {/* Content column with time blocks */}
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => setDraggedOverDate(currentDateStr)}
                        onDragLeave={() => {
                          if (draggedOverDate === currentDateStr) {
                            setDraggedOverDate(null);
                          }
                        }}
                        onDrop={(e) => {
                          const taskId = e.dataTransfer.getData('text/plain');
                          if (taskId) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const dropY = e.clientY - rect.top;
                            const hourVal = Math.max(0, Math.min(23, Math.floor(dropY / 60)));
                            const timeStr = `${String(hourVal).padStart(2, '0')}:00`;
                            
                            const taskToDrop = scheduledTasks.find(t => t.id === taskId);
                            if (taskToDrop) {
                              onUpdateNode({
                                ...taskToDrop,
                                dueDate: currentDateStr,
                                startTime: timeStr,
                                dueTime: undefined
                              });
                            }
                          }
                          setDraggedOverDate(null);
                        }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('[draggable="true"]') || target.closest('button')) {
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickY = e.clientY - rect.top;
                          const hourVal = Math.max(0, Math.min(23, Math.floor(clickY / 60)));
                          const timeStr = `${String(hourVal).padStart(2, '0')}:00`;
                          setActiveHourAddInput(timeStr);
                          setNewHourTaskText('');
                        }}
                        className={`flex-1 h-[1440px] relative border-l border-slate-150 dark:border-slate-800 transition-colors cursor-pointer ${
                          draggedOverDate === currentDateStr ? 'bg-indigo-50/15 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        {/* Horizontal guide lines */}
                        {Array.from({ length: 24 }).map((_, h) => (
                          <div key={h} className="absolute left-0 right-0 border-b border-slate-100/70 dark:border-slate-800/30" style={{ top: `${h * 60}px`, height: '60px' }}></div>
                        ))}

                        {/* Rendering blocks */}
                        {(() => {
                          const dayTimedTasks = scheduledTasks.filter(task => task.dueDate === currentDateStr && (task.startTime || task.dueTime));
                          const timedBlocks = computeBlocksForTasks(dayTimedTasks);

                          return timedBlocks.map(({ task, top, height, left, width }) => (
                            <div
                              key={task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(task.id, e);
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
                              className={`absolute rounded-2xl p-3 border text-xs leading-snug cursor-grab active:cursor-grabbing transition-all hover:brightness-95 hover:shadow-xs group/task flex flex-col justify-between overflow-hidden shadow-2xs ${getPillStyles(task)} ${
                                draggingTaskId === task.id ? 'opacity-30 border-dashed border-indigo-300' : ''
                              }`}
                              style={{
                                top: `${top}px`,
                                height: `${Math.max(34, height)}px`,
                                left: left || '0%',
                                width: width || '100%',
                                zIndex: 10
                              }}
                              title={`${task.text} (${formatTaskTime(task)})`}
                            >
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 font-bold truncate text-slate-850 dark:text-slate-100">
                                  <span className="text-sm shrink-0">{getTaskIcon(task)}</span>
                                  <span className={task.completed ? 'line-through opacity-55' : ''}>{task.text}</span>
                                </div>
                                {height >= 45 && (
                                  <span className="text-[10px] font-mono font-bold mt-1 text-indigo-650 dark:text-indigo-350">
                                    🕒 {formatTaskTime(task)}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between mt-2 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateNode({
                                      ...task,
                                      completed: !task.completed
                                    });
                                  }}
                                  className="text-slate-400 hover:text-indigo-650 transition-colors p-1 bg-white/50 dark:bg-slate-800/30 rounded-lg"
                                >
                                  {task.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                                  ) : (
                                    <Circle className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateNode({
                                      ...task,
                                      startTime: undefined,
                                      dueTime: undefined
                                    });
                                  }}
                                  className="opacity-0 group-hover/task:opacity-100 hover:text-rose-500 text-[10px] font-extrabold px-2 py-0.5 bg-white/60 dark:bg-slate-800/50 rounded-lg transition-opacity"
                                  title="Убрать время"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ));
                        })()}

                        {/* Quick create prompt overlay */}
                        {activeHourAddInput && !activeHourAddInput.includes('-') && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-3 shadow-xl z-20 w-[180px] sm:w-[220px]"
                            style={{
                              top: `${Math.max(10, Math.min(1300, parseInt(activeHourAddInput.split(':')[0], 10) * 60))}px`,
                              left: '50%',
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Добавить на {activeHourAddInput}</span>
                            <input
                              type="text"
                              autoFocus
                              placeholder="Название задачи..."
                              value={newHourTaskText}
                              onChange={(e) => setNewHourTaskText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddDayTaskSubmit(currentDateStr, activeHourAddInput);
                                  setActiveHourAddInput(null);
                                }
                                if (e.key === 'Escape') setActiveHourAddInput(null);
                              }}
                              className="w-full text-xs p-1.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg border border-slate-200 outline-none focus:border-indigo-500 font-medium"
                            />
                            <div className="flex gap-1.5 mt-2 justify-end">
                              <button
                                onClick={() => setActiveHourAddInput(null)}
                                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[10px] px-2 py-1 rounded-lg font-bold"
                              >
                                Отмена
                              </button>
                              <button
                                onClick={() => {
                                  handleAddDayTaskSubmit(currentDateStr, activeHourAddInput);
                                  setActiveHourAddInput(null);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] px-2.5 py-1 rounded-lg font-bold"
                              >
                                Ок
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}

            </div>
          </div>
        </div>

      </div>

      {/* Unscheduled Right deck drawer sidebar */}
      <div className={`w-full bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col p-3 md:p-5 shrink-0 transition-all duration-300 ${
        isUnscheduledExpandedMobile 
          ? 'h-[280px] lg:h-full lg:w-80' 
          : 'h-[56px] lg:h-full lg:w-16 lg:px-3 lg:py-5 lg:items-center'
      }`}>
          <div 
            onClick={() => setIsUnscheduledExpandedMobile(!isUnscheduledExpandedMobile)}
            className={`flex items-center gap-2 mb-3 shrink-0 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/40 p-1 px-2 rounded-xl transition-colors ${
              isUnscheduledExpandedMobile ? 'w-full flex-row' : 'flex-row lg:flex-col lg:gap-3 lg:mb-5'
            }`}
          >
            <span className="text-sm shrink-0"><span>📥</span></span>
            <div className={`min-w-0 flex-1 ${isUnscheduledExpandedMobile ? 'block' : 'block lg:hidden'}`}>
              <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate">
                Планирование (Без даты)
              </h3>
              <p className="text-[9px] text-slate-400 dark:text-slate-400 truncate">
                {isUnscheduledExpandedMobile ? 'Нажмите, чтобы убрать список' : 'Нажмите, чтобы распределить по датам'}
              </p>
            </div>
            <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0">
              {unscheduledTasks.length}
            </span>
            {/* Collapse/Expand indicator for both mobile and desktop */}
            <span className="text-slate-400 text-[10px] font-bold select-none px-1">
              {isUnscheduledExpandedMobile ? (
                <>
                  <span className="hidden lg:inline">▶</span>
                  <span className="lg:hidden">▼</span>
                </>
              ) : (
                <>
                  <span className="hidden lg:inline">◀</span>
                  <span className="lg:hidden">▲</span>
                </>
              )}
            </span>
          </div>

          {/* Vertical rotated text for desktop when collapsed */}
          {!isUnscheduledExpandedMobile && (
            <span className="hidden lg:block text-[9.5px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 py-4 select-none animate-fade-in">
              Планирование
            </span>
          )}

          {/* Quick search input inside unscheduled sidebar of calendar */}
          <div className={`relative mb-3.5 shrink-0 animate-fade-in ${isUnscheduledExpandedMobile ? 'block' : 'hidden'}`}>
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по архивам"
              value={sidebarSearchQuery}
              onChange={(e) => setSidebarSearchQuery(e.target.value)}
              className="w-full text-[11px] font-semibold bg-slate-50 hover:bg-slate-100/70 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-205 pl-9 pr-3 py-2 rounded-xl border border-slate-200/65 dark:border-slate-800/80 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>

          {/* Unscheduled List container */}
          <div 
            data-unscheduled-drop-zone="true"
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDraggedOverUnscheduled(true)}
            onDragLeave={() => setDraggedOverUnscheduled(false)}
            onDrop={(e) => {
              const taskId = e.dataTransfer.getData('text/plain');
              handleTaskDrop(taskId, null);
            }}
            className={`overflow-y-auto space-y-2 pr-1 custom-scrollbar transition-all duration-200 p-1 rounded-xl ${
              isUnscheduledExpandedMobile ? 'flex-1 flex flex-col animate-fade-in' : 'hidden'
            } ${
              draggedOverUnscheduled 
                ? 'bg-indigo-50/40 border-2 border-dashed border-indigo-400 dark:bg-indigo-950/20' 
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
                  onClick={(e) => onSelectNode(task.id, e)}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    setDraggingTaskId(task.id);
                  }}
                  onDragEnd={() => setDraggingTaskId(null)}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    const touch = e.touches[0];
                    touchStartPos.current = { x: touch.clientX, y: touch.clientY, dateString: null };
                    touchHasMoved.current = false;
                    setDraggingTaskId(task.id);
                  }}
                  className={`group border border-slate-200 dark:border-slate-800/80 p-2.5 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800 rounded-xl shadow-xs transition-all flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-slate-300 dark:hover:border-slate-700 ${
                    draggingTaskId === task.id ? 'opacity-40 border-dashed border-indigo-400' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5 justify-between">
                    {/* Title */}
                    <span className={`text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight flex-1 flex items-center flex-wrap gap-1 ${
                      task.completed ? 'line-through opacity-55' : ''
                    }`}>
                      <span>{task.text}</span>
                      {task.externalLink && (
                        <a
                          href={task.externalLink.startsWith('http') ? task.externalLink : `https://${task.externalLink}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-500 dark:text-indigo-400 rounded transition-colors shrink-0"
                          title={`Открыть внешнюю ссылку: ${task.externalLink}`}
                        >
                          <LinkIcon className="w-3 h-3 text-indigo-500" />
                        </a>
                      )}
                      {activePomodoroNodeId === task.id && (
                        <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded-md text-[9px] font-sans font-extrabold animate-pulse ml-0.5 shrink-0 border border-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]" title="Запущена фокусировка Pomodoro">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                          </span>
                          <span>🍅</span>
                        </span>
                      )}
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
                        const newDueDate = e.target.value;
                        onUpdateNode({
                          ...task,
                          dueDate: newDueDate || undefined,
                          dueTime: !newDueDate ? undefined : task.dueTime
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
