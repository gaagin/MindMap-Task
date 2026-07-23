import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  X, 
  Calendar, 
  Trash2, 
  Circle, 
  Check,
  Loader2, 
  FileText, 
  HelpCircle,
  MoreVertical,
  Maximize2,
  Minimize2,
  Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';
import { getPomoStatsForNode, formatTotalPomoTime } from '../utils';

interface EisenhowerMatrixProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], priority?: Priority, parentId?: string | null, dueDate?: string) => void;
  selectedNodeIds?: string[];
  searchQuery?: string;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  onFocusedTaskIdChange?: (id: string | null) => void;
}

interface QuadrantConfig {
  id: string;
  title: string;
  label: string;
  roman: string;
  circleColor: string;
  textColor: string;
  checkboxColor: string;
  checkboxColorClass: string;
  priorities: Priority[];
  targetPriority: Priority;
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
  onFullScreenChange,
  onFocusedTaskIdChange,
}: EisenhowerMatrixProps) {
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'active' | 'completed'>('active');
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
  const [showMatrixHelp, setShowMatrixHelp] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Quick-create state via FAB
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTasksTitle, setNewTasksTitle] = useState('');
  const [newTaskQuadrant, setNewTaskQuadrant] = useState<'q1' | 'q2' | 'q3' | 'q4'>('q1');
  const [newTaskDays, setNewTaskDays] = useState('');

  // Quadrant detailed tasks list modal states
  const [activeListQuadrantId, setActiveListQuadrantId] = useState<string | null>(null);
  const [modalNewTaskText, setModalNewTaskText] = useState('');

  const handleModalQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const text = modalNewTaskText.trim();
    if (!text || !activeListQuadrant) return;

    const targetPriority = activeListQuadrant.targetPriority;

    if (onCreateTask) {
      onCreateTask(text, [], targetPriority, null, undefined);
    } else {
      const newNodeId = 'node-' + Math.random().toString(36).substring(2, 9);
      const newTask: TaskNode = {
        id: newNodeId,
        projectId: activeProjectId,
        text,
        x: 150,
        y: 150,
        parentId: null,
        priority: targetPriority,
        tags: [],
        notes: '',
        completed: false,
        files: [],
        updatedAt: new Date().toISOString()
      };
      onUpdateNode(newTask);
    }
    setModalNewTaskText('');
  };

  // Filter tasks mapping containers and workflow rectangles out
  const filteredTasks = useMemo(() => {
    return nodes.filter(n => {
      if (n.isContainer || n.isWorkflowRectangle) return false;
      
      // Filter out archived tasks unless matching search query
      const isSearchActive = !!searchQuery.trim();
      if (n.archived) {
        if (!isSearchActive) return false;
        const q = searchQuery.toLowerCase();
        const textMatch = n.text.toLowerCase().includes(q);
        const notesMatch = n.notes?.toLowerCase().includes(q) || false;
        const eqModelMatches = n.equipmentModel?.toLowerCase().includes(q) || false;
        const eqBarcodeMatches = n.equipmentBarcode?.toLowerCase().includes(q) || false;
        const eqStockMatches = n.equipmentStockCode?.toLowerCase().includes(q) || false;
        const eqNoteMatches = n.equipmentNote?.toLowerCase().includes(q) || false;
        const customPropsMatches = n.customProperties?.some(
          cp => cp.name?.toLowerCase().includes(q) || cp.value?.toLowerCase().includes(q)
        ) || false;
        return textMatch || notesMatch || eqModelMatches || eqBarcodeMatches || eqStockMatches || eqNoteMatches || customPropsMatches;
      }

      // Filter by search query
      if (isSearchActive) {
        const q = searchQuery.toLowerCase();
        const textMatch = n.text.toLowerCase().includes(q);
        const tagMatch = n.tags?.some(t => t.toLowerCase().includes(q)) || false;
        const notesMatch = n.notes?.toLowerCase().includes(q) || false;
        const eqModelMatches = n.equipmentModel?.toLowerCase().includes(q) || false;
        const eqBarcodeMatches = n.equipmentBarcode?.toLowerCase().includes(q) || false;
        const eqStockMatches = n.equipmentStockCode?.toLowerCase().includes(q) || false;
        const eqNoteMatches = n.equipmentNote?.toLowerCase().includes(q) || false;
        const customPropsMatches = n.customProperties?.some(
          cp => cp.name?.toLowerCase().includes(q) || cp.value?.toLowerCase().includes(q)
        ) || false;
        if (!textMatch && !tagMatch && !notesMatch && !eqModelMatches && !eqBarcodeMatches && !eqStockMatches && !eqNoteMatches && !customPropsMatches) return false;
      }

      // Filter by completion status
      if (filterCompleted === 'active' && n.completed) return false;
      if (filterCompleted === 'completed' && !n.completed) return false;

      // Only show tasks with date on today or overdue
      if (!n.dueDate) return false;

      const isTodayOrOverdue = (() => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const parts = n.dueDate.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const due = new Date(year, month, day);
            due.setHours(0, 0, 0, 0);
            return due.getTime() <= today.getTime();
          }

          const due = new Date(n.dueDate);
          due.setHours(0, 0, 0, 0);
          return due.getTime() <= today.getTime();
        } catch {
          return false;
        }
      })();

      if (!isTodayOrOverdue) return false;

      return true;
    });
  }, [nodes, searchQuery, filterCompleted]);

  // Quadrants configuration matching Eisenhower model rules and requested design
  const quadrants: QuadrantConfig[] = [
    {
      id: "q1",
      title: "Важно и срочно",
      label: "срочно_важно",
      roman: "I",
      circleColor: "bg-[#FF4A55]",
      textColor: "text-[#FF4A55]",
      checkboxColor: "#FF4A55",
      checkboxColorClass: "border-[#FF4A55]/30 hover:border-[#FF4A55]/80",
      priorities: ["urgent"],
      targetPriority: "urgent"
    },
    {
      id: "q2",
      title: "Важно, но несрочно",
      label: "несрочно_важно",
      roman: "II",
      circleColor: "bg-[#FFB01A]",
      textColor: "text-[#FFB01A]",
      checkboxColor: "#FFB01A",
      checkboxColorClass: "border-[#FFB01A]/30 hover:border-[#FFB01A]/80",
      priorities: ["high"],
      targetPriority: "high"
    },
    {
      id: "q3",
      title: "Срочно, но неважно",
      label: "срочно_неважно",
      roman: "III",
      circleColor: "bg-[#3C76F1]",
      textColor: "text-[#3C76F1]",
      checkboxColor: "#3C76F1",
      checkboxColorClass: "border-[#3C76F1]/30 hover:border-[#3C76F1]/80",
      priorities: ["medium"],
      targetPriority: "medium"
    },
    {
      id: "q4",
      title: "Неважно и несрочно",
      label: "несрочно_неважно",
      roman: "IV",
      circleColor: "bg-[#05C48F]",
      textColor: "text-[#05C48F]",
      checkboxColor: "#A1A8B3", // Light gray slate border inside screenshot
      checkboxColorClass: "border-[#CBD5E1] hover:border-[#05C48F]",
      priorities: ["low", "none"],
      targetPriority: "low"
    }
  ];

  const activeListQuadrant = activeListQuadrantId 
    ? quadrants.find(q => q.id === activeListQuadrantId) || null 
    : null;

  // Group tasks by quadrant priority list
  const getTasksForQuadrant = (quad: QuadrantConfig) => {
    return filteredTasks.filter(task => {
      if (task.priority) {
        return quad.priorities.includes(task.priority);
      } else {
        return quad.priorities.includes('none');
      }
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

  // Touch drag-and-drop for mobile devices
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
    
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDrag) return;
    const touch = e.touches[0];
    
    if (e.cancelable) {
      e.preventDefault();
    }

    setTouchDrag(prev => prev ? {
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY
    } : null);

    const proxyEl = document.querySelector('.touch-drag-proxy') as HTMLElement;
    let oldDisplay = '';
    if (proxyEl) {
      oldDisplay = proxyEl.style.display;
      proxyEl.style.display = 'none';
    }

    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (proxyEl) {
      proxyEl.style.display = oldDisplay;
    }

    if (element) {
      const quadContainer = element.closest('[data-quadrant-id]');
      if (quadContainer) {
        const quadId = quadContainer.getAttribute('data-quadrant-id');
        if (quadId && draggedOverQuadrant !== quadId) {
          setDraggedOverQuadrant(quadId);
        }
      } else {
        setDraggedOverQuadrant(null);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchDrag) return;

    const targetQuadrantId = draggedOverQuadrant;
    const taskId = touchDrag.taskId;

    // Detect if this was a simple tap (very minimal touch movement)
    const dx = Math.abs(touchDrag.currentX - touchDrag.startX);
    const dy = Math.abs(touchDrag.currentY - touchDrag.startY);
    const isTap = dx < 10 && dy < 10;

    setTouchDrag(null);
    setDraggedOverQuadrant(null);
    setDraggedCardId(null);

    if (isTap) {
      // Direct touch select to open details panel for the task immediately
      onSelectNode(taskId);
      return;
    }

    if (!targetQuadrantId) return;

    const task = nodes.find(n => n.id === taskId);
    if (!task) return;

    const targetQuad = quadrants.find(q => q.id === targetQuadrantId);
    if (!targetQuad) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    onUpdateNode({
      ...task,
      priority: targetQuad.targetPriority,
      updatedAt: new Date().toISOString()
    });
  };

  // Quick action submit inside Fabric FAB Modal
  const handleModalCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTasksTitle.trim();
    if (!text) return;

    let calcedDueDate: string | undefined = undefined;
    if (newTaskDays) {
      const parsedDays = parseInt(newTaskDays, 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + parsedDays);
        calcedDueDate = d.toISOString().split('T')[0];
      }
    }

    const selectedQuad = quadrants.find(q => q.id === newTaskQuadrant);
    const targetPriority = selectedQuad ? selectedQuad.targetPriority : 'low';

    if (onCreateTask) {
      onCreateTask(text, [], targetPriority, null, calcedDueDate);
    } else {
      const newNodeId = 'node-' + Math.random().toString(36).substring(2, 9);
      const newTask: TaskNode = {
        id: newNodeId,
        projectId: activeProjectId,
        text,
        x: 150,
        y: 150,
        parentId: null,
        priority: targetPriority,
        tags: [],
        notes: '',
        completed: false,
        files: [],
        dueDate: calcedDueDate,
        updatedAt: new Date().toISOString()
      };
      onUpdateNode(newTask);
    }

    // Clean states
    setNewTasksTitle('');
    setNewTaskQuadrant('q1');
    setNewTaskDays('');
    setShowCreateModal(false);
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

  // Convert dueDate (YYYY-MM-DD) to remaining/elapsed days ending with "д"
  const getDaysDisplay = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dateStr);
      due.setHours(0, 0, 0, 0);
      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return `${Math.abs(diffDays)}д`;
    } catch {
      return null;
    }
  };

  const totalImportantText = useMemo(() => {
    const q1 = quadrants.find(q => q.id === 'q1');
    const q2 = quadrants.find(q => q.id === 'q2');
    
    const q1Tasks = q1 ? filteredTasks.filter(t => q1.priorities.includes(t.priority || 'none')) : [];
    const q2Tasks = q2 ? filteredTasks.filter(t => q2.priorities.includes(t.priority || 'none')) : [];
    
    const sumQ1 = q1Tasks.reduce((sum, task) => {
      const et = task.estimatedTime;
      return sum + (et !== undefined && et !== null && !isNaN(et) ? et : 0);
    }, 0);
    const sumQ2 = q2Tasks.reduce((sum, task) => {
      const et = task.estimatedTime;
      return sum + (et !== undefined && et !== null && !isNaN(et) ? et : 0);
    }, 0);
    
    const totalMinutes = sumQ1 + sumQ2;
    if (totalMinutes < 60) {
      return `${totalMinutes} мин`;
    } else {
      const hours = Number((totalMinutes / 60).toFixed(1));
      return `${hours} ч`;
    }
  }, [filteredTasks]);

  return (
    <div 
      id="eisenhower-matrix-container" 
      className={`flex flex-col font-sans overflow-hidden relative transition-all duration-200 ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen bg-[#F5F6FC] dark:bg-[#0B0F19]' 
          : 'w-full h-full bg-[#F5F6FC] dark:bg-slate-950/80'
      }`}
    >
      
      {/* Header Panel with Title and Sum of Estimated Hours for Important Quadrants */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 md:p-4 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 w-full shrink-0 z-30">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm md:text-base font-extrabold text-slate-800 dark:text-slate-100 font-sans tracking-tight">
            Матрица Эйзенхауэра
          </h2>
        </div>

        <div className="flex items-center justify-end gap-2 relative">
          {/* Estimated Time Badge */}
          <div 
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 text-xs font-bold shadow-xs mr-1"
            title="Сумма ориентировочного времени работы для квадрантов 'Важно и срочно' и 'Важно, но несрочно'"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>Время важных дел (I + II): <span className="font-extrabold">{totalImportantText}</span></span>
          </div>

          {/* Toggle Button for Full Screen */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className={`p-1.5 rounded-full backdrop-blur-xs border transition-all shadow-sm cursor-pointer flex items-center justify-center shrink-0 ${
              isFullScreen 
                ? 'text-amber-600 bg-amber-50/90 border-amber-200 dark:bg-amber-950/40 dark:border-amber-855 dark:text-amber-400' 
                : 'text-slate-500 hover:bg-white/80 dark:hover:bg-slate-800 bg-white/60 dark:bg-slate-900/60 border-slate-200/50 dark:border-slate-800/50'
            }`}
            title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
          >
            {isFullScreen ? <Minimize2 className="w-5 h-5 font-bold" /> : <Maximize2 className="w-5 h-5 font-bold" />}
          </button>

          <button 
            type="button"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="p-1.5 rounded-full text-slate-500 hover:bg-white/80 dark:hover:bg-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xs border border-slate-200/50 dark:border-slate-800/50 transition-colors shadow-sm cursor-pointer flex items-center justify-center shrink-0"
            title="Опции фильтрации"
          >
            <MoreVertical className="w-5 h-5 flex items-center justify-center" />
          </button>

          {/* Settings / Filter dropdown Menu */}
          <AnimatePresence>
            {showFilterMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setShowFilterMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-10 z-50 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2.5 space-y-2 flex flex-col font-sans"
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2.5 py-1 select-none">
                    Фильтры завершенности
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {(['all', 'active', 'completed'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setFilterCompleted(f);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full px-2.5 py-1.5 text-xs font-bold text-left rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                          filterCompleted === f 
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400' 
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>
                          {f === 'active' ? 'Активные' : f === 'completed' ? 'Выполненные' : 'Все задачи'}
                        </span>
                        {filterCompleted === f && <Check className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400" />}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMatrixHelp(!showMatrixHelp);
                        setShowFilterMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-bold text-left text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>О методе Эйзенхауэра</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
              <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">О Матрице Эйзенхауэра</p>
                <p className="mb-2">
                  Это один из самых популярных методов тайм-менеджмента, который помогает распределить дела по приоритетам на основе двух критериев: 
                  <strong> важности</strong> и <strong>срочности</strong>.
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 list-disc pl-4 mt-1 font-semibold">
                  <li><span className="text-rose-500 font-extrabold">I. Срочно и важно</span> — выполнить самостоятельно как можно скорее.</li>
                  <li><span className="text-amber-500 font-extrabold">II. Несрочно, но важно</span> — основа успеха. Самые важные цели, планируйте их.</li>
                  <li><span className="text-blue-500 font-extrabold">III. Срочно, но неважно</span> — делегируйте, автоматизируйте или сократите.</li>
                  <li><span className="text-emerald-500 font-extrabold">IV. Неважно и несрочно</span> — исключите из списка или отложите.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main 2x2 Clean Quadrant Canvas */}
      <div className="flex-grow p-2 md:p-3 overflow-y-auto custom-scrollbar flex flex-col h-full min-h-0">
        <div className="grid grid-cols-2 grid-rows-2 gap-2 md:gap-3 flex-grow h-full relative min-h-[460px]">
          {quadrants.map(quad => {
            const quadTasks = getTasksForQuadrant(quad);
            const isOver = draggedOverQuadrant === quad.id;
            
            return (
              <div
                key={quad.id}
                data-quadrant-id={quad.id}
                onDragOver={(e) => handleDragOver(e, quad.id)}
                onDragLeave={() => setDraggedOverQuadrant(null)}
                onDrop={(e) => handleDrop(e, quad.id)}
                onClick={() => setActiveListQuadrantId(quad.id)}
                className={`flex flex-col rounded-[20px] md:rounded-[24px] p-2.5 md:p-4 transition-all h-full bg-white dark:bg-slate-900 cursor-pointer hover:shadow-[0_4px_24px_rgba(0,0,0,0.02)] ${
                  isOver 
                    ? `ring-4 ring-offset-0 ring-indigo-500/15 scale-[0.995] shadow-inner`
                    : `shadow-[0_4px_20px_rgba(0,0,0,0.015)] dark:shadow-none`
                }`}
              >
                {/* Header inside quadrant card */}
                <div className="flex items-center gap-1.5 mb-2.5 md:mb-3.5 shrink-0 select-none">
                  <div className={`w-5.5 h-5.5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${quad.circleColor}`}>
                    {quad.roman}
                  </div>
                  <span className={`text-[12px] md:text-[13.5px] font-bold tracking-tight lowercase ${quad.textColor}`}>
                    {quad.label}
                  </span>
                  {(quad.id === 'q1' || quad.id === 'q2') && (
                    (() => {
                      const quadEstimatedTime = quadTasks.reduce((sum, task) => {
                        const et = task.estimatedTime;
                        return sum + (et !== undefined && et !== null && !isNaN(et) ? et : 0);
                      }, 0);
                      if (quadEstimatedTime > 0) {
                        return (
                          <span className="ml-auto text-[10.5px] md:text-[11.5px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Timer className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                            <span>{quadEstimatedTime} мин</span>
                          </span>
                        );
                      }
                      return null;
                    })()
                  )}
                </div>

                {/* Tasks loop inside current quadrant */}
                <div className="flex-grow overflow-y-auto pr-0.5 space-y-2 md:space-y-2.5 custom-scrollbar">
                  {quadTasks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center py-6 select-none">
                      <span className="text-slate-400 dark:text-slate-600 text-[13px] md:text-[13.5px] font-semibold font-sans">
                        Нет задач
                      </span>
                    </div>
                  ) : (
                    quadTasks.map(task => {
                      const isSelected = selectedNodeId === task.id;
                      const taskDays = task.dueDate ? getDaysDisplay(task.dueDate) : null;
                      const isDraggingTouch = touchDrag?.taskId === task.id;
                      
                      return (
                        <div
                          key={task.id}
                          data-task-id={task.id}
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onTouchStart={(e) => handleTouchStart(e, task.id, task.text)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(task.id, e);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (onFocusedTaskIdChange) {
                              onFocusedTaskIdChange(task.id);
                            }
                            if (window.innerWidth < 1024) {
                              onSelectNode(null);
                            }
                          }}
                          className={`group relative flex flex-col gap-1 py-1 px-0.5 md:px-1.5 rounded-lg md:rounded-xl transition-all cursor-grab active:cursor-grabbing select-none ${
                            isDraggingTouch
                              ? 'opacity-40 scale-[0.98]'
                              : isSelected 
                                ? 'bg-indigo-50/30 dark:bg-indigo-950/20 ring-1 ring-indigo-500/15'
                                : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-start gap-1.5 md:gap-2">
                            {/* Priority-colored checkbox indicator mimicking screenshot */}
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
                              className={`w-5 h-5 rounded-[6px] border-[2.2px] flex items-center justify-center shrink-0 mt-0.5 transition-all cursor-pointer ${
                                task.completed 
                                  ? 'bg-emerald-500 border-emerald-500 text-white' 
                                  : `bg-white dark:bg-slate-800 ${quad.checkboxColorClass}`
                              }`}
                              style={{ borderColor: !task.completed ? quad.checkboxColor : undefined }}
                              title="Отметить как готово"
                            >
                              {task.completed && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <span className={`text-[12.5px] md:text-[13.5px] font-medium text-slate-800 dark:text-slate-100 leading-tight break-words block ${
                                task.completed ? 'line-through text-slate-400 dark:text-slate-500 font-medium' : ''
                              }`}>
                                {task.text}
                              </span>
                              
                              {taskDays && (
                                <div className="text-[10px] md:text-[11px] font-bold text-[#FF4A55] mt-0.5 tracking-tight font-sans">
                                  {taskDays}
                                </div>
                              )}

                              {(() => {
                                const stats = getPomoStatsForNode(task, nodes);
                                return stats.pomodoroTotalTime > 0 ? (
                                  <div 
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] md:text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1 tracking-tight font-sans inline-flex items-center gap-1 select-none"
                                    title={`Проведено на помидоре: ${formatTotalPomoTime(stats.pomodoroTotalTime)}`}
                                  >
                                    <span>🍅</span>
                                    <span>{formatTotalPomoTime(stats.pomodoroTotalTime)}</span>
                                  </div>
                                ) : null;
                              })()}

                              {task.estimatedTime !== undefined && task.estimatedTime !== null && !isNaN(task.estimatedTime) ? (
                                <div 
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const val = prompt("Изменить ориентировочное время работы (в минутах):", task.estimatedTime?.toString() || "30");
                                    if (val !== null) {
                                      if (val === "") {
                                        onUpdateNode({ ...task, estimatedTime: undefined });
                                      } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) {
                                          onUpdateNode({ ...task, estimatedTime: num });
                                        }
                                      }
                                    }
                                  }}
                                  className="text-[10px] md:text-[11px] font-bold text-indigo-605 dark:text-indigo-400 mt-1 tracking-tight font-sans inline-flex items-center gap-1 cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                  title={`Ориентировочное время: ${task.estimatedTime} мин (нажмите для изменения)`}
                                >
                                  <Timer className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span>{task.estimatedTime} мин</span>
                                </div>
                              ) : (
                                <div 
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const val = prompt("Укажите ориентировочное время работы (в минутах):", "30");
                                    if (val !== null) {
                                      if (val === "") {
                                        onUpdateNode({ ...task, estimatedTime: undefined });
                                      } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) {
                                          onUpdateNode({ ...task, estimatedTime: num });
                                        }
                                      }
                                    }
                                  }}
                                  className="text-[10px] md:text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1 tracking-tight font-sans inline-flex items-center gap-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                  title="Нажмите, чтобы указать ориентировочное время работы"
                                >
                                  <Timer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>0 мин</span>
                                </div>
                              )}
                            </div>

                            {/* Options on hover (desktop only for precision edit) */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-lg p-0.5 transition-opacity duration-150 absolute right-1 -top-1.5 z-10">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(task.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                                title="Подробное редактирование"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNode(task.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                                title="Удалить задачу"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            );
          })}

          {/* Floating task creation button (FAB) at bottom-right mimic screenshot layout */}
          <button
            type="button"
            id="fab-create-task"
            onClick={() => setShowCreateModal(true)}
            className="absolute bottom-4 right-4 w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#3C76F1] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(60,118,241,0.4)] hover:bg-[#2563EB] active:scale-95 transition-all z-20 cursor-pointer"
            title="Добавить задачу"
          >
            <Plus className="w-7 h-7 md:w-8 md:h-8 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Touch drag proxy illustration */}
      {touchDrag && (
        <div
          className="touch-drag-proxy fixed pointer-events-none z-[9999] opacity-90 scale-[1.03] shadow-2xl rounded-xl border-2 border-indigo-500 bg-white dark:bg-slate-900 p-2.5 flex flex-col justify-center text-slate-800 dark:text-slate-100 font-sans"
          style={{
            left: `${touchDrag.currentX - touchDrag.offsetX}px`,
            top: `${touchDrag.currentY - touchDrag.offsetY}px`,
            width: `${touchDrag.width}px`,
            height: `${touchDrag.height}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
            <span className="font-bold text-[12px] md:text-xs truncate max-w-full">
              {touchDrag.text}
            </span>
          </div>
        </div>
      )}

      {/* Task Quick-Creation Modal Sheet */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-950 rounded-[28px] shadow-2xl p-6 w-full max-w-md border border-slate-100 dark:border-slate-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                  Добавление задачи
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer animate-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleModalCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                    Название задачи
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="Введите текст..."
                    value={newTasksTitle}
                    onChange={(e) => setNewTasksTitle(e.target.value)}
                    className="w-full text-xs font-semibold py-2.5 px-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                    Куда поместить
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {quadrants.map(q => {
                      const isSelected = newTaskQuadrant === q.id;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setNewTaskQuadrant(q.id as any)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer ${
                            isSelected 
                              ? `${q.circleColor} text-white border-transparent ring-2 ring-indigo-500/20 scale-[1.02] shadow-sm` 
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 transition-all ${
                            isSelected 
                              ? 'bg-white text-slate-900 font-extrabold' 
                              : `text-white ${q.circleColor}`
                          }`}>
                            {q.roman}
                          </div>
                          <span className={`truncate text-[11px] font-bold transition-colors ${
                            isSelected ? 'text-white' : q.textColor
                          }`}>
                            {q.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                    Срок завершения (через сколько дней)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    placeholder="Пример: 30"
                    value={newTaskDays}
                    onChange={(e) => setNewTaskDays(e.target.value)}
                    className="w-full text-xs font-semibold py-2.5 px-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4.5 py-2 text-xs font-bold text-white bg-[#3C76F1] hover:bg-[#2563EB] rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    Создать задачу
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quadrant Tasks List Modal - FULL SCREEN */}
      <AnimatePresence>
        {activeListQuadrant && (
          <div className="fixed inset-0 bg-white dark:bg-slate-950 z-[9998] flex flex-col overflow-hidden" onClick={() => setActiveListQuadrantId(null)}>
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-full max-w-5xl mx-auto flex flex-col p-6 md:p-12"
            >
              <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-900 mb-8 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${activeListQuadrant.circleColor} shadow-md`}>
                    {activeListQuadrant.roman}
                  </div>
                  <div>
                    <span className="text-[11px] font-black tracking-wider uppercase text-slate-400 dark:text-slate-500 block">
                      Квадрант Матрицы Эйзенхауэра
                    </span>
                    <h3 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                      Задачи: <span className={activeListQuadrant.textColor}>{activeListQuadrant.title}</span>
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveListQuadrantId(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold text-xs transition-all cursor-pointer flex items-center gap-2"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                  <span>Закрыть</span>
                </button>
              </div>

              {/* Quick task creation within the quadrant */}
              <form onSubmit={handleModalQuickCreate} className="mb-8 shrink-0 flex gap-3 p-1.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-900">
                <input
                  type="text"
                  required
                  placeholder="Быстрое добавление новой задачи в этот квадрант..."
                  value={modalNewTaskText}
                  onChange={(e) => setModalNewTaskText(e.target.value)}
                  className="w-full text-sm font-semibold py-3.5 px-4 bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600"
                />
                <button
                  type="submit"
                  className="px-6 py-3.5 text-sm font-bold text-white bg-[#3C76F1] hover:bg-[#2563EB] rounded-xl transition-colors shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
                  <span>Добавить задачу</span>
                </button>
              </form>

              {/* Tasks List */}
              <div className="flex-grow overflow-y-auto pr-2 space-y-3 custom-scrollbar min-h-0">
                {getTasksForQuadrant(activeListQuadrant).length === 0 ? (
                  <div className="py-24 text-center select-none flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-400 mb-4 border border-slate-100 dark:border-slate-900">
                      <FileText className="w-8 h-8" />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-base font-semibold">
                      В этом квадранте пока нет задач
                    </p>
                    <p className="text-slate-400 dark:text-slate-600 text-sm mt-1 max-w-sm">
                      Используйте поле выше, чтобы быстро добавить новую задачу в список.
                    </p>
                  </div>
                ) : (
                  getTasksForQuadrant(activeListQuadrant).map(task => {
                    const isSelected = selectedNodeId === task.id;
                    const taskDays = task.dueDate ? getDaysDisplay(task.dueDate) : null;

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          onSelectNode(task.id);
                          setActiveListQuadrantId(null); // Close modal on select to show details side drawer
                        }}
                        className={`group relative flex flex-col gap-1 p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-50/20 dark:bg-indigo-950/25 border-indigo-500/30 ring-1 ring-indigo-500/15 shadow-sm'
                            : 'bg-white dark:bg-slate-900/40 border-slate-100 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/70 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Complete checkbox */}
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
                            className={`w-6 h-6 rounded-lg border-[2.2px] flex items-center justify-center shrink-0 mt-0.5 transition-all cursor-pointer ${
                              task.completed 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                                : `bg-white dark:bg-slate-800 ${activeListQuadrant.checkboxColorClass}`
                            }`}
                            style={{ borderColor: !task.completed ? activeListQuadrant.checkboxColor : undefined }}
                          >
                            {task.completed && <Check className="w-4 h-4 stroke-[3px]" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <span className={`text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-tight break-words block ${
                              task.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                            }`}>
                              {task.text}
                            </span>
                            
                            {taskDays && (
                              <div className="text-xs font-bold text-[#FF4A55] mt-1.5 tracking-tight font-sans">
                                {taskDays}
                              </div>
                            )}

                            <div className="flex flex-wrap gap-3 items-center mt-2">
                              {/* Pomodoro display */}
                              {(() => {
                                const stats = getPomoStatsForNode(task, nodes);
                                return stats.pomodoroTotalTime > 0 ? (
                                  <div className="text-xs font-bold text-rose-600 dark:text-rose-400 tracking-tight font-sans inline-flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-md select-none">
                                    <span>🍅</span>
                                    <span>{formatTotalPomoTime(stats.pomodoroTotalTime)}</span>
                                  </div>
                                ) : null;
                              })()}

                              {/* Estimated Time display */}
                              {task.estimatedTime !== undefined && task.estimatedTime !== null && !isNaN(task.estimatedTime) ? (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const val = prompt("Изменить ориентировочное время работы (в минутах):", task.estimatedTime?.toString() || "30");
                                    if (val !== null) {
                                      if (val === "") {
                                        onUpdateNode({ ...task, estimatedTime: undefined });
                                      } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) {
                                          onUpdateNode({ ...task, estimatedTime: num });
                                        }
                                      }
                                    }
                                  }}
                                  className="text-xs font-bold text-indigo-650 dark:text-indigo-400 tracking-tight font-sans inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/20 px-2 py-0.5 rounded-md cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                >
                                  <Timer className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span>{task.estimatedTime} мин</span>
                                </div>
                              ) : (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const val = prompt("Укажите ориентировочное время работы (в минутах):", "30");
                                    if (val !== null) {
                                      if (val === "") {
                                        onUpdateNode({ ...task, estimatedTime: undefined });
                                      } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) {
                                          onUpdateNode({ ...task, estimatedTime: num });
                                        }
                                      }
                                    }
                                  }}
                                  className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-tight font-sans inline-flex items-center gap-1.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                >
                                  <Timer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>0 мин</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quick action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(task.id);
                                setActiveListQuadrantId(null);
                              }}
                              className="p-2 rounded-xl text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Подробное редактирование"
                            >
                              <FileText className="w-4.5 h-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteNode(task.id);
                              }}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Удалить задачу"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-900 shrink-0 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveListQuadrantId(null)}
                  className="px-6 py-3 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
