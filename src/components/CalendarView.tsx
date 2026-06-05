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
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string) => void;
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
  const [activeDayAddInput, setActiveDayAddInput] = useState<string | null>(null); // ISO string 'YYYY-MM-DD'
  const [newDayTaskText, setNewDayTaskText] = useState('');

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

  const getPriorityColor = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-400';
      case 'high': return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400';
      case 'medium': return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/40 dark:text-indigo-400';
      case 'low': return 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300';
      default: return 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/60 dark:border-slate-800 dark:text-slate-300';
    }
  };

  const handleAddDayTaskSubmit = (dateStr: string) => {
    if (!newDayTaskText.trim()) return;
    if (onCreateTask) {
      // Create node with specified due date
      onCreateTask(newDayTaskText.trim(), [], dateStr);
    } else {
      // Fallback
      const fallbackNode: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text: newDayTaskText.trim(),
        x: 0,
        y: 0,
        parentId: null,
        priority: 'none',
        tags: [],
        notes: '',
        completed: false,
        files: [],
        dueDate: dateStr
      };
      // Emulate insert trigger internally (this shouldn't occur as app exports onCreateTask)
      onUpdateNode(fallbackNode);
    }
    setNewDayTaskText('');
    setActiveDayAddInput(null);
  };

  return (
    <div id="calendar-workspace-view" className="flex flex-col lg:flex-row w-full h-[calc(100vh-130px)] bg-slate-50/30 dark:bg-slate-950/10 overflow-hidden font-sans">
      {/* Calendar Grid Section */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden min-w-0">
        
        {/* Calendar Navigation and Title Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5 shrink-0 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                {MONTH_NAMES_RU[month]} {year}
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Всего запланировано: <span className="font-bold text-slate-600 dark:text-slate-300">{scheduledTasks.length}</span> задач
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={setToday}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-175 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              Сегодня
            </button>
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/50 dark:border-slate-700/50">
              <button
                onClick={prevMonth}
                className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer"
                title="Предыдущий месяц"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextMonth}
                className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer"
                title="Следующий месяц"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Weekly Header row */}
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 px-1 text-center font-bold text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {WEEKDAYS_RU.map(day => (
            <div key={day} className="py-1 uppercase tracking-wider">{day}</div>
          ))}
        </div>

        {/* Calendar Grid Row Slots */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-1 md:gap-2 overflow-y-auto max-h-full pr-1 custom-scrollbar">
          {calendarSlots.map((slot, index) => {
            const dayTasks = scheduledTasks.filter(task => task.dueDate === slot.dateString);
            const isInactiveMonth = slot.monthOffset !== 0;

            return (
              <div
                key={`${slot.dateString}-${index}`}
                className={`min-h-[75px] md:min-h-[105px] border rounded-2xl p-2 flex flex-col justify-between transition-all duration-200 group relative bg-white dark:bg-slate-900 ${
                  slot.isToday 
                    ? 'border-indigo-400 ring-2 ring-indigo-500/10' 
                    : 'border-slate-150 dark:border-slate-800'
                } ${isInactiveMonth ? 'opacity-35 dark:opacity-25 bg-slate-50/20 dark:bg-slate-950/5' : ''}`}
              >
                {/* Date header with task limit badge */}
                <div className="flex items-center justify-between mb-1.5 shrink-0 select-none">
                  <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    slot.isToday 
                      ? 'bg-indigo-600 text-white font-mono' 
                      : 'text-slate-500 dark:text-slate-400 font-mono'
                  }`}>
                    {slot.dayNumber}
                  </span>
                  
                  {/* Inline plus click trigger */}
                  <button
                    onClick={() => {
                      setActiveDayAddInput(activeDayAddInput === slot.dateString ? null : slot.dateString);
                      setNewDayTaskText('');
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-md transition-all cursor-pointer"
                    title="Создать задачу на этот день"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Task cells container list */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar max-h-[135px]">
                  {dayTasks.map(task => (
                    <div
                      key={task.id}
                      onClick={() => onSelectNode(task.id)}
                      className={`group/task border text-[10px] leading-tight p-1.5 rounded-xl flex items-start gap-1 cursor-pointer transition-all hover:scale-[1.015] active:scale-98 relative ${getPriorityColor(task.priority)}`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateNode({
                            ...task,
                            completed: !task.completed
                          });
                        }}
                        className={`text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded transition-transform duration-100 shrink-0 ${
                          task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                        }`}
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                        ) : (
                          <Circle className="w-3 h-3 shrink-0" />
                        )}
                      </button>
                      <span className={`truncate flex-1 font-medium ${task.completed ? 'line-through opacity-55' : ''}`}>
                        {task.text}
                      </span>
                    </div>
                  ))}

                  {/* Inline text entry container */}
                  {activeDayAddInput === slot.dateString && (
                    <div 
                      className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/50 mt-1"
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
                        className="w-full text-[10px] p-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded border border-slate-200 dark:border-slate-705 focus:outline-none focus:border-indigo-500"
                      />
                      <div className="flex gap-1 mt-1 justify-end">
                        <button
                          onClick={() => setActiveDayAddInput(null)}
                          className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => handleAddDayTaskSubmit(slot.dateString)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer"
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
      </div>

      {/* Unscheduled Right deck drawer sidebar */}
      <div className="w-full lg:w-80 bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col p-4 md:p-5 shrink-0 lg:h-full overflow-hidden">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <span className="text-sm">📥</span>
          <div>
            <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Планирование (Без даты)
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-400">
              Нажмите распределить, чтобы дать дату
            </p>
          </div>
          <span className="ml-auto bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            {unscheduledTasks.length}
          </span>
        </div>

        {/* Unscheduled List container */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar max-h-[300px] lg:max-h-none">
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
                className="group border border-slate-150 dark:border-slate-800/80 p-2.5 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-850 rounded-xl shadow-xs transition-all flex flex-col gap-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700"
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
