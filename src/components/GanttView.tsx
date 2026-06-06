import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Folder, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Sparkles,
  AlignLeft,
  Settings,
  MoreHorizontal,
  Calendar
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface GanttViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], dueDate?: string) => void;
}

export default function GanttView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask
}: GanttViewProps) {
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

  // Filter tasks belonging to project
  const tasks = nodes.filter(n => !n.isContainer);

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
      case 'low': return 'bg-slate-500/15 border-slate-450 hover:bg-slate-500/20';
      default: return 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 hover:bg-slate-200';
    }
  };

  const getPriorityTextClass = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'text-rose-600 dark:text-rose-450 font-bold';
      case 'high': return 'text-amber-600 dark:text-amber-450 font-bold';
      case 'medium': return 'text-indigo-600 dark:text-indigo-450 font-bold';
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
      // Only dueDate exists -> assume 3 days duration leading up to dueDate
      if (endIdx === -1) {
        return null;
      }
      startIdx = Math.max(0, endIdx - 2);
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

  return (
    <div id="gantt-chart-workspace" className="flex flex-col w-full h-[calc(100vh-130px)] bg-[#FAFBFD] dark:bg-slate-950/20 font-sans overflow-hidden">
      
      {/* Timeline Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <Clock className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
            Линейный график Ганнта (Календарный Срок)
          </h2>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-mono font-bold text-slate-500 dark:text-slate-400">
            {timelineDays[0].dateString} — {timelineDays[27].dateString}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={jumpToToday}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-175 dark:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer border border-slate-200/60 dark:border-slate-800 px-3"
          >
            К сегодня
          </button>
          
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-205 dark:border-slate-755">
            <button
              onClick={() => shiftDays(-7)}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer"
              title="-1 неделя"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] px-1 font-extrabold text-slate-400 block sm:hidden">Неделя</span>
            <button
              onClick={() => shiftDays(7)}
              className="p-1 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer"
              title="+1 неделя"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setActiveInlineAddInput(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Новая задача</span>
          </button>
        </div>
      </div>

      {/* Primary Gantt Content - Left tasks pane & Right timeline grid */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* Left lists table pane */}
        <div className="w-64 max-w-xs md:w-80 border-r border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex flex-col shrink-0">
          <div className="h-10 px-4 flex items-center bg-slate-50/70 dark:bg-slate-900/90 border-b border-slate-150 dark:border-slate-850 shrink-0 font-bold text-[10.5px] uppercase tracking-wider text-slate-400 select-none">
            Название задачи ({tasks.length})
          </div>
          
          {/* Scrollable Tasks Table Column */}
          <div 
            ref={leftScrollRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850/60 custom-scrollbar pr-0.5 select-none"
          >
            {activeInlineAddInput && (
              <div className="p-3 bg-slate-50 dark:bg-slate-850/40 border-b border-indigo-100 dark:border-indigo-950">
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
                  className="w-full text-xs p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-205 dark:border-slate-755 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex gap-1.5 justify-end mt-2">
                  <button
                    onClick={() => setActiveInlineAddInput(false)}
                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleInlineTaskCreate}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    Создать
                  </button>
                </div>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <p className="text-xs text-slate-400">Нет доступных задач.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => onSelectNode(task.id)}
                  className={`h-11 px-3.5 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors border-l-4 ${
                    selectedNodeId === task.id 
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-500' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateNode({
                          ...task,
                          completed: !task.completed
                        });
                      }}
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded transition-transform shrink-0"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </button>
                    <span className={`text-xs font-extrabold truncate text-slate-750 dark:text-slate-200 ${
                      task.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : ''
                    }`}>
                      {task.text}
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
                      <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-1 rounded-md font-bold">
                        {task.progress}%
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right timeline scale pane */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-100/30 dark:bg-slate-950/20">
          
          {/* Sizing scale container relative size matching column ranges */}
          <div className="min-w-[1120px] h-full flex flex-col relative">
            
            {/* Timeline Header scale columns */}
            <div className="h-10 flex border-b border-slate-150 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900 relative overflow-y-scroll custom-scrollbar">
              {timelineDays.map((day, i) => {
                const isFirstDayOffset = i % 7 === 0;
                
                return (
                  <div
                    key={day.dateString}
                    className={`flex-1 flex flex-col items-center justify-center border-r border-slate-150 dark:border-slate-850 h-full select-none ${
                      day.isWeekend ? 'bg-slate-100/40 dark:bg-slate-950/15' : ''
                    } ${day.isToday ? 'bg-amber-500/10' : ''}`}
                  >
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      {WEEKDAYS_RU[(day.date.getDay() + 6) % 7]}
                    </span>
                    <span className={`text-[10px] font-extrabold leading-none mt-0.5 ${
                      day.isToday 
                        ? 'bg-amber-500 text-white rounded-md px-1 py-0.5 font-mono' 
                        : 'text-slate-600 dark:text-slate-450 font-mono'
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
              className="flex-1 overflow-y-scroll divide-y divide-slate-100 dark:divide-slate-850/60 custom-scrollbar relative"
            >
              
              {/* Vertical dotted grid guidelines rendering background */}
              <div className="absolute inset-0 pointer-events-none flex">
                {timelineDays.map(day => (
                  <div
                    key={`guideline-${day.dateString}`}
                    className={`flex-1 h-full border-r border-slate-150/40 dark:border-slate-850/40 ${
                      day.isWeekend ? 'bg-slate-100/10 dark:bg-slate-950/5' : ''
                    } ${day.isToday ? 'border-r-amber-400/50 bg-amber-500/2' : ''}`}
                  />
                ))}
              </div>

              {/* Loop and render task rows */}
              {tasks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 col-span-28"></div>
              ) : (
                tasks.map(task => {
                  const range = getTaskRangeColIndices(task);
                  const isSelected = selectedNodeId === task.id;

                  return (
                    <div
                      key={`row-${task.id}`}
                      className={`h-11 flex relative items-center transition-colors group ${
                        isSelected ? 'bg-indigo-50/10 dark:bg-indigo-950/10' : ''
                      }`}
                    >
                      {/* Gantt Bar spanning multiple days based on dueDate */}
                      {range ? (
                        <div
                          onClick={() => onSelectNode(task.id)}
                          style={{
                            left: `${(range.start / 28) * 100}%`,
                            width: `${(range.span / 28) * 100}%`
                          }}
                          className={`absolute h-7 border rounded-xl shadow-xs transition-all duration-150 p-1 flex flex-col justify-center cursor-pointer select-none overflow-hidden z-10 ${getPriorityColorBorder(task.priority)} ${
                            isSelected ? 'ring-2 ring-indigo-500/30' : ''
                          }`}
                          title={`Задача: ${task.text}\nСрок: ${task.dueDate}`}
                        >
                          {/* Inner task text bar indicator details */}
                          <div className="flex items-center justify-between gap-1 overflow-hidden w-full px-1">
                            <span className="text-[10px] font-extrabold truncate text-slate-750 dark:text-slate-200">
                              {task.text}
                            </span>
                            {task.progress !== undefined && task.progress > 0 && (
                              <span className="text-[8.5px] font-mono font-bold text-indigo-500 shrink-0">
                                {task.progress}%
                              </span>
                            )}
                          </div>

                          {/* Linear progress fill visualization inside the bar bottom */}
                          {task.progress !== undefined && task.progress > 0 && (
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
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
                          <div className="absolute right-0 text-[10px] bg-slate-50 dark:bg-slate-900 border text-slate-400 dark:text-slate-500 py-1 px-2.5 rounded-full z-10 shadow-xs mr-4 hover:text-indigo-500 transition-colors">
                            Срок: {task.dueDate} (Вне диапазона)
                          </div>
                        ) : (
                          <div 
                            onClick={() => onSelectNode(task.id)}
                            className="absolute left-4 h-7 border-2 border-dashed border-slate-201 dark:border-slate-800 bg-transparent text-slate-400 dark:text-slate-500 hover:border-slate-350 dark:hover:border-slate-700 hover:text-slate-650 transition-all py-1 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer z-10 font-bold text-[9.5px]"
                          >
                            <Calendar className="w-3 h-3 text-indigo-500" /> Срок не назначен
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Legend guide bar footer */}
            <div className="h-6 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-end px-4 gap-4 font-mono text-[9px] text-slate-400 select-none shrink-0 uppercase tracking-widest">
              <span>Сетка: 28 дней</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-rose-500 rounded" /> Срочно</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-amber-500 rounded" /> Высокий</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 bg-indigo-500 rounded" /> Средний</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
