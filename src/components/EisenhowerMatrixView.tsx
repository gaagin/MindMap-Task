import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  X, 
  Calendar, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  AlertTriangle,
  Flame,
  Clock,
  ArrowRight,
  Sparkles,
  Link as LinkIcon,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';

interface EisenhowerMatrixProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], priority?: Priority, parentId?: string | null) => void;
  selectedNodeIds?: string[];
  searchQuery?: string;
}

interface QuadrantConfig {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  borderColor: string;
  hoverBorderColor: string;
  bgColor: string;
  textColor: string;
  iconBg: string;
  priorities: Priority[];
  targetPriority: Priority; // Priority assigned when dropped here
}

export default function EisenhowerMatrixView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  selectedNodeIds = [],
  searchQuery = '',
}: EisenhowerMatrixProps) {
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'active' | 'completed'>('active');
  const [mobileLayout, setMobileLayout] = useState<'stack' | 'grid2x2'>('stack');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedOverQuadrant, setDraggedOverQuadrant] = useState<string | null>(null);
  const [touchDrag, setTouchDrag] = useState<{
    taskId: string;
    text: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const [newInlineInput, setNewInlineInput] = useState<Record<string, string>>({});
  const [showMatrixHelp, setShowMatrixHelp] = useState(false);

  // Filter out containers and workflow wrappers
  const filteredTasks = useMemo(() => {
    return nodes.filter(n => {
      if (n.isContainer || n.isWorkflowRectangle) return false;
      
      // Filter out archived tasks unless matching search query
      const isSearchActive = !!searchQuery.trim();
      if (n.archived) {
        if (!isSearchActive) return false;
        const q = searchQuery.toLowerCase();
        return n.text.toLowerCase().includes(q) || n.notes?.toLowerCase().includes(q);
      }

      // Filter by search query
      if (isSearchActive) {
        const q = searchQuery.toLowerCase();
        const textMatch = n.text.toLowerCase().includes(q);
        const tagMatch = n.tags?.some(t => t.toLowerCase().includes(q)) || false;
        const notesMatch = n.notes?.toLowerCase().includes(q) || false;
        if (!textMatch && !tagMatch && !notesMatch) return false;
      }

      // Filter by completion status
      if (filterCompleted === 'active' && n.completed) return false;
      if (filterCompleted === 'completed' && !n.completed) return false;

      return true;
    });
  }, [nodes, searchQuery, filterCompleted]);

  // Quadrants configuration matching Eisenhower model rules
  const quadrants: QuadrantConfig[] = [
    {
      id: "q1",
      title: "Важно и срочно",
      subtitle: "Сделай немедленно",
      description: "Критические задачи, требующие немедленной реакции. Дедлайны, кризисы.",
      color: "rose",
      borderColor: "border-rose-400 dark:border-rose-900/40",
      hoverBorderColor: "hover:border-rose-500 hover:ring-rose-500/20",
      bgColor: "bg-rose-50/15 dark:bg-rose-955/5",
      textColor: "text-rose-700 dark:text-rose-400",
      iconBg: "bg-rose-100/50 dark:bg-rose-900/30",
      priorities: ["urgent"],
      targetPriority: "urgent"
    },
    {
      id: "q2",
      title: "Важно, но несрочно",
      subtitle: "Запланируй время",
      description: "Стратегические цели, личностный рост, профилактика. Задачи развивают.",
      color: "amber",
      borderColor: "border-amber-400 dark:border-amber-900/40",
      hoverBorderColor: "hover:border-amber-500 hover:ring-amber-500/20",
      bgColor: "bg-amber-50/15 dark:bg-amber-955/5",
      textColor: "text-amber-700 dark:text-amber-400",
      iconBg: "bg-amber-100/50 dark:bg-amber-900/30",
      priorities: ["high"],
      targetPriority: "high"
    },
    {
      id: "q3",
      title: "Срочно, но неважно",
      subtitle: "Делегируй кому-то",
      description: "Внезапные звонки, встречи, мелкие хлопоты. Сделать быстро или передать.",
      color: "blue",
      borderColor: "border-blue-400 dark:border-blue-900/40",
      hoverBorderColor: "hover:border-blue-500 hover:ring-blue-500/20",
      bgColor: "bg-blue-50/15 dark:bg-blue-955/5",
      textColor: "text-blue-700 dark:text-blue-400",
      iconBg: "bg-blue-100/50 dark:bg-blue-900/30",
      priorities: ["medium"],
      targetPriority: "medium"
    },
    {
      id: "q4",
      title: "Неважно и несрочно",
      subtitle: "Удали или отложи",
      description: "Пожиратели времени, развлечения, мелкая рутина. Минимизировать влияние.",
      color: "slate",
      borderColor: "border-slate-300 dark:border-slate-800",
      hoverBorderColor: "hover:border-slate-450 hover:ring-slate-500/10",
      bgColor: "bg-slate-50/20 dark:bg-slate-900/5",
      textColor: "text-slate-600 dark:text-slate-400",
      iconBg: "bg-slate-100 dark:bg-slate-800",
      priorities: ["low", "none"],
      targetPriority: "low"
    }
  ];

  // Group tasks by quadrant priority list
  const getTasksForQuadrant = (quad: QuadrantConfig) => {
    return filteredTasks.filter(task => {
      // If task has priority that belongs to this quadrant list
      if (task.priority) {
        return quad.priorities.includes(task.priority);
      }
      // If task has no priority ('none'), it counts as low / none (Quadrant IV)
      return quad.priorities.includes('none');
    });
  };

  // Drag and drop mechanics
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedCardId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, quadId: string) => {
    e.preventDefault();
    if (draggedOverQuadrant !== quadId) {
      setDraggedOverQuadrant(quadId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetQuadrantId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedCardId;
    setDraggedOverQuadrant(null);
    setDraggedCardId(null);

    if (!taskId) return;

    const task = nodes.find(n => n.id === taskId);
    if (!task) return;

    const targetQuad = quadrants.find(q => q.id === targetQuadrantId);
    if (!targetQuad) return;

    onUpdateNode({
      ...task,
      priority: targetQuad.targetPriority,
      updatedAt: new Date().toISOString()
    });
  };

  // Touch drag-and-drop for mobile devices (tap, hold and drag)
  const handleTouchStart = (e: React.TouchEvent, taskId: string, text: string) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    
    setTouchDrag({
      taskId,
      text,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    
    setDraggedCardId(taskId);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDrag) return;
    const touch = e.touches[0];
    
    // Smooth scrolling prevention when dragging active tasks on mobile/touch interfaces
    if (e.cancelable) {
      e.preventDefault();
    }

    setTouchDrag(prev => prev ? {
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY
    } : null);

    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element) {
      const quadContainer = element.closest('[data-quadrant-id]');
      if (quadContainer) {
        const quadId = quadContainer.getAttribute('data-quadrant-id');
        if (quadId && draggedOverQuadrant !== quadId) {
          setDraggedOverQuadrant(quadId);
        }
      } else {
        const isSelfProxy = element.closest('.touch-drag-proxy');
        if (!isSelfProxy) {
          setDraggedOverQuadrant(null);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchDrag) return;

    const targetQuadrantId = draggedOverQuadrant;
    setTouchDrag(null);
    setDraggedOverQuadrant(null);
    setDraggedCardId(null);

    if (!targetQuadrantId) return;

    const task = nodes.find(n => n.id === touchDrag.taskId);
    if (!task) return;

    const targetQuad = quadrants.find(q => q.id === targetQuadrantId);
    if (!targetQuad) return;

    onUpdateNode({
      ...task,
      priority: targetQuad.targetPriority,
      updatedAt: new Date().toISOString()
    });
  };

  // Quick inline add
  const handleInlineAdd = (quad: QuadrantConfig, e: React.FormEvent) => {
    e.preventDefault();
    const text = newInlineInput[quad.id]?.trim();
    if (!text) return;

    if (onCreateTask) {
      onCreateTask(text, [], quad.targetPriority, null);
    } else {
      const fallback: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text,
        x: 0,
        y: 0,
        parentId: null,
        priority: quad.targetPriority,
        tags: [],
        notes: '',
        completed: false,
        files: [],
        updatedAt: new Date().toISOString()
      };
      onUpdateNode(fallback);
    }

    setNewInlineInput(prev => ({ ...prev, [quad.id]: '' }));
  };

  const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dateStr);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime();
    } catch {
      return false;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div id="eisenhower-matrix-container" className="flex flex-col w-full h-full bg-[#FAFBFD] dark:bg-slate-950/20 font-sans overflow-hidden">
      
      {/* View Header bar */}
      <div className="flex flex-row items-center justify-between gap-2 py-1 px-3 md:py-1.5 md:px-4 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800 shrink-0 min-h-[38px]">
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center justify-center p-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1 leading-tight">
              Матрица Эйзенхауэра
              <button 
                type="button"
                onClick={() => setShowMatrixHelp(!showMatrixHelp)}
                className="text-slate-400 hover:text-indigo-505 cursor-pointer transition-colors selector-matrix-help"
                title="О методе Эйзенхауэра"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </h1>
            <p className="hidden md:block text-[9.5px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium leading-none">
              Сортировка по важности и срочности. Перетаскивайте задачи для изменения приоритетов.
            </p>
          </div>
        </div>

        {/* Filters and Layout options */}
        <div className="flex flex-row items-center gap-1.5 shrink-0 self-center">
          {/* Mobile layout switcher - show only on screens smaller than md */}
          <div className="flex md:hidden items-center gap-0.5 p-0.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200/60 dark:border-slate-800 text-[10px] shrink-0">
            <button
              type="button"
              onClick={() => setMobileLayout('stack')}
              className={`px-1.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                mobileLayout === 'stack' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-450 shadow-sm' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700'
              }`}
            >
              Стек
            </button>
            <button
              type="button"
              onClick={() => setMobileLayout('grid2x2')}
              className={`px-1.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                mobileLayout === 'grid2x2' 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-450 shadow-sm' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700'
              }`}
              title="Таблица 2 на 2"
            >
              Сетка
            </button>
          </div>

          <div className="flex items-center gap-0.5 p-0.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200/60 dark:border-slate-800 text-[10px] shrink-0">
            {(['all', 'active', 'completed'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterCompleted(f)}
                className={`px-1.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                  filterCompleted === f 
                    ? 'bg-white dark:bg-slate-700 text-indigo-650 dark:text-indigo-400 shadow-sm border border-slate-200/40 dark:border-slate-605/30' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                {f === 'active' ? 'Актив' : f === 'completed' ? 'Вып' : 'Все'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Eisenhower Matrix Description Help Panel */}
      <AnimatePresence>
        {showMatrixHelp && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-indigo-50/40 dark:bg-indigo-950/10 border-b border-indigo-100/30 dark:border-indigo-900/20 p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed overflow-hidden shrink-0 font-medium"
          >
            <div className="max-w-4xl mx-auto flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">О Матрице Эйзенхауэра</p>
                <p className="mb-2">
                  Это один из самых популярных методов тайм-менеджмента, который помогает распределить дела по приоритетам на основе двух критериев: 
                  <strong className="text-slate-800 dark:text-slate-100">важности</strong> и <strong className="text-slate-800 dark:text-slate-100">срочности</strong>.
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 list-disc pl-4 mt-1 font-semibold">
                  <li><span className="text-rose-650 dark:text-rose-400 font-extrabold">I. Срочно и важно (Do!)</span> — выполнить самостоятельно как можно скорее.</li>
                  <li><span className="text-amber-655 dark:text-amber-400 font-extrabold">II. Несрочно, но важно (Schedule)</span> — основа успеха. Самые важные цели, планируйте их.</li>
                  <li><span className="text-blue-650 dark:text-blue-400 font-extrabold">III. Срочно, но неважно (Delegate)</span> — делегируйте, автоматизируйте или сократите.</li>
                  <li><span className="text-slate-505 dark:text-slate-400 font-extrabold">IV. Неважно и несрочно (Eliminate)</span> — исключите из списка или отложите.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2x2 Quadrant Grid Canvas Space */}
      <div className="flex-grow p-1.5 md:p-3 overflow-y-auto custom-scrollbar flex flex-col h-full min-h-0">
        
        {/* Main 2x2 Grid with Axis Headers on Larger Screens */}
        <div className="flex-grow flex flex-col md:grid md:grid-cols-[auto_1fr] md:grid-rows-[auto_1fr] gap-x-4 gap-y-2 h-full min-h-0">
          
          {/* Top-Left Corner (Empty for grid alignment) */}
          <div className="hidden md:block w-8"></div>

          {/* Column Headers (X Axis - Срочность) */}
          <div className="hidden md:grid grid-cols-2 gap-4 text-center pb-2 select-none">
            <div className="text-[10px] font-black tracking-widest text-rose-600 dark:text-rose-400 bg-rose-50/20 dark:bg-rose-950/15 py-1.5 px-3 rounded-lg border border-rose-100/30 dark:border-rose-900/10 uppercase">
              ⚡ СРОЧНО
            </div>
            <div className="text-[10px] font-black tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50/20 dark:bg-amber-950/15 py-1.5 px-3 rounded-lg border border-amber-100/30 dark:border-amber-900/10 uppercase">
              ⏳ НЕ СРОЧНО
            </div>
          </div>

          {/* Row Labels (Y Axis - Важность) */}
          <div className="hidden md:flex flex-col justify-between w-8 select-none py-6">
            <div className="flex items-center justify-center p-2 rounded-xl border border-indigo-100/20 dark:border-indigo-950/30 bg-indigo-50/10 dark:bg-indigo-950/10 font-black text-[10px] text-indigo-500 tracking-widest uppercase [writing-mode:vertical-lr] rotate-180 h-[45%] text-center">
              ⭐ ВАЖНО
            </div>
            <div className="flex items-center justify-center p-2 rounded-xl border border-dashed border-slate-200/50 dark:border-slate-800/40 bg-slate-50/30 dark:bg-slate-900/20 font-black text-[10px] text-slate-400 dark:text-slate-500 tracking-widest uppercase [writing-mode:vertical-lr] rotate-180 h-[45%] text-center">
              💤 НЕ ВАЖНО
            </div>
          </div>

          {/* 2x2 Cards Grid */}
          <div className={`grid ${
            mobileLayout === 'grid2x2' 
              ? 'grid-cols-2 grid-rows-2 gap-2 md:gap-4' 
              : 'grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-4'
          } h-full relative`}>
            {quadrants.map(quad => {
              const quadTasks = getTasksForQuadrant(quad);
              const isOver = draggedOverQuadrant === quad.id;
              const isCompact = mobileLayout === 'grid2x2';
              
              return (
                <div
                  key={quad.id}
                  data-quadrant-id={quad.id}
                  onDragOver={(e) => handleDragOver(e, quad.id)}
                  onDragLeave={() => setDraggedOverQuadrant(null)}
                  onDrop={(e) => handleDrop(e, quad.id)}
                  className={`flex flex-col rounded-2xl border-2 p-2 md:p-3 transition-all ${
                    isCompact 
                      ? 'h-full min-h-0' 
                      : 'h-[240px] md:h-full md:min-h-0'
                  } bg-white dark:bg-slate-900 ${quad.bgColor} ${
                    isOver 
                      ? `${quad.borderColor} ring-4 ring-offset-0 ring-indigo-500/15 scale-[0.995] shadow-inner`
                      : `${quad.borderColor} shadow-[0_2px_8px_rgba(15,23,42,0.01)]`
                  }`}
                >
                  {/* Header inside quadrant card */}
                  <div className="flex items-start justify-between gap-1 border-b border-slate-100 dark:border-slate-800 pb-1.5 shrink-0">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className={`inline-flex items-center justify-center text-[9px] md:text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${quad.textColor} ${quad.iconBg}`}>
                        {quad.id === 'q1' ? 'I' : quad.id === 'q2' ? 'II' : quad.id === 'q3' ? 'III' : 'IV'}
                      </span>
                      <h2 className="text-[10.5px] md:text-[13px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                        {isCompact ? quad.title.split(' ')[0] : quad.title}
                      </h2>
                    </div>
                    {/* Task count */}
                    <span className={`px-1.5 py-0.5 text-[9px] md:text-[10.5px] font-extrabold rounded-full ${quad.textColor} ${quad.iconBg}`}>
                      {quadTasks.length}
                    </span>
                  </div>

                  {/* Task list box */}
                  <div className="flex-grow overflow-y-auto py-2 custom-scrollbar space-y-1.5 select-none">
                    {quadTasks.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-2 text-center border border-dashed border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50/10">
                        <span className="text-slate-300 dark:text-slate-700 text-sm mb-0.5">📥</span>
                        {!isCompact && <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Пусто</p>}
                      </div>
                    ) : (
                      quadTasks.map(task => {
                        const isSelected = selectedNodeId === task.id;
                        const isTaskOverdue = isOverdue(task.dueDate);
                        
                        return (
                          <div
                            key={task.id}
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onTouchStart={(e) => handleTouchStart(e, task.id, task.text)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onClick={(e) => onSelectNode(task.id, e)}
                            className={`p-1.5 md:p-3 rounded-xl border transition-all text-[11px] md:text-xs cursor-grab active:cursor-grabbing relative flex flex-col gap-1.5 ${
                              isSelected 
                                ? 'border-indigo-505 bg-indigo-50/10 dark:bg-indigo-950/20 ring-2 ring-indigo-500/15 shadow-sm scale-[1.01]' 
                                : 'border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-910 hover:shadow-xs'
                            } ${task.completed ? 'opacity-60 saturate-50' : ''} ${
                              touchDrag?.taskId === task.id ? 'touch-none opacity-40 select-none' : ''
                            }`}
                          >
                            {isCompact ? (
                              /* Super Compact Layout: Only the name of the card as requested! */
                              <div className="flex flex-col w-full min-w-0">
                                <div className="flex items-center justify-between gap-1 w-full min-w-0">
                                  <span className={`font-semibold md:font-bold text-slate-800 dark:text-slate-100 truncate flex-grow block ${
                                    task.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                                  }`}>
                                    {task.text}
                                  </span>
                                  {task.completed && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  )}
                                </div>
                                {isSelected && (
                                  <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 dark:border-slate-800 pt-1.5 animate-fadeIn">
                                    <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-550 shrink-0">В квадрант:</span>
                                    <div className="flex gap-0.5">
                                      {(['q1', 'q2', 'q3', 'q4'] as const).map(qId => {
                                        const q = quadrants.find(item => item.id === qId)!;
                                        const isCurrent = (task.priority === q.targetPriority) || (qId === 'q4' && (!task.priority || task.priority === 'none'));
                                        return (
                                          <button
                                            key={qId}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onUpdateNode({
                                                ...task,
                                                priority: q.targetPriority,
                                                updatedAt: new Date().toISOString()
                                              });
                                            }}
                                            className={`w-4 h-4 text-[8px] font-black flex items-center justify-center rounded transition-all cursor-pointer ${
                                              isCurrent 
                                                ? 'bg-indigo-600 text-white font-extrabold scale-105' 
                                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'
                                            }`}
                                          >
                                            {qId === 'q1' ? 'I' : qId === 'q2' ? 'II' : qId === 'q3' ? 'III' : 'IV'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Full Elegant Layout */
                              <>
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateNode({
                                        ...task,
                                        completed: !task.completed,
                                        updatedAt: new Date().toISOString()
                                      });
                                    }}
                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0 mt-0.5 cursor-pointer"
                                  >
                                    {task.completed ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    ) : activePomodoroNodeId === task.id ? (
                                      <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
                                    ) : (
                                      <Circle className="w-4 h-4" />
                                    )}
                                  </button>

                                  <div className="flex-1 min-w-0">
                                    <p className={`font-bold text-slate-800 dark:text-slate-100 leading-snug break-words ${
                                      task.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                                    }`}>
                                      {task.text}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectNode(task.id);
                                    }}
                                    className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 cursor-pointer"
                                    title="Подробнее"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Sub details */}
                                {(task.dueDate || (task.tags && task.tags.length > 0) || task.pomodoroTotalTime) && (
                                  <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40 text-[9px] font-bold">
                                    {task.dueDate && (
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${
                                        isTaskOverdue && !task.completed
                                          ? 'bg-rose-50/70 dark:bg-rose-950/20 text-rose-600 border-rose-100 dark:border-rose-900/30 font-black'
                                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-100 dark:border-slate-800'
                                      }`}>
                                        <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                        <span>{formatDate(task.dueDate)}</span>
                                      </span>
                                    )}

                                    {task.pomodoroTotalTime ? (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-rose-100/30 bg-rose-50/10 text-rose-500">
                                        🍅 {Math.round(task.pomodoroTotalTime / 60)}м
                                      </span>
                                    ) : null}

                                    {task.tags && task.tags.slice(0, 2).map(tag => (
                                      <span key={tag} className="px-1 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-500 rounded text-[8px]">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Quick Quadrant Buttons inside standard/full task cards when clicked */}
                                {isSelected && (
                                  <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 dark:border-slate-800 pt-1.5 animate-fadeIn">
                                    <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-550 shrink-0 font-sans">В квадрант:</span>
                                    <div className="flex gap-1">
                                      {(['q1', 'q2', 'q3', 'q4'] as const).map(qId => {
                                        const q = quadrants.find(item => item.id === qId)!;
                                        const isCurrent = (task.priority === q.targetPriority) || (qId === 'q4' && (!task.priority || task.priority === 'none'));
                                        return (
                                          <button
                                            key={qId}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onUpdateNode({
                                                ...task,
                                                priority: q.targetPriority,
                                                updatedAt: new Date().toISOString()
                                              });
                                            }}
                                            className={`w-5 h-5 text-[9.5px] font-black flex items-center justify-center rounded transition-all cursor-pointer ${
                                              isCurrent 
                                                ? 'bg-indigo-650 dark:bg-indigo-600 text-white font-extrabold scale-105' 
                                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'
                                            }`}
                                          >
                                            {qId === 'q1' ? 'I' : qId === 'q2' ? 'II' : qId === 'q3' ? 'III' : 'IV'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Inline quick-add form */}
                  <form
                    onSubmit={(e) => handleInlineAdd(quad, e)}
                    className="mt-1.5 flex items-center gap-1 shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800"
                  >
                    <input
                      type="text"
                      placeholder={isCompact ? "+" : "Добавить задачу..."}
                      value={newInlineInput[quad.id] || ''}
                      onChange={(e) => setNewInlineInput(prev => ({ ...prev, [quad.id]: e.target.value }))}
                      className="flex-grow text-[10px] md:text-xs py-1 px-2.5 bg-slate-50 dark:bg-slate-800 focus:bg-white rounded-lg border border-slate-200 dark:border-slate-755 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!(newInlineInput[quad.id] || '').trim()}
                      className="p-1 px-2.5 bg-indigo-50 hover:bg-indigo-600 dark:bg-indigo-950/40 hover:text-white text-indigo-600 dark:text-indigo-455 rounded-lg font-bold text-xs disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>

                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* Floating Touch Drag Proxy Card */}
      {touchDrag && (
        <div
          className="touch-drag-proxy fixed pointer-events-none z-[9999] opacity-90 scale-[1.03] shadow-2xl rounded-xl border-2 border-indigo-505 bg-white dark:bg-slate-900 p-2.5 flex flex-col justify-center text-slate-800 dark:text-slate-100 font-sans"
          style={{
            left: `${touchDrag.currentX - touchDrag.offsetX}px`,
            top: `${touchDrag.currentY - touchDrag.offsetY}px`,
            width: `${touchDrag.width}px`,
            height: `${touchDrag.height}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
            <span className="font-bold text-[11px] md:text-xs truncate max-w-full">
              {touchDrag.text}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
