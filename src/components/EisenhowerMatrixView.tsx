import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  X, 
  Calendar, 
  Trash2, 
  Circle, 
  Check, 
  FileText, 
  HelpCircle,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Timer,
  Tag,
  ListTree,
  GripVertical,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Flame,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  Eye,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskNode, TagCategory, Priority } from '../types';
import { getPomoStatsForNode, formatTotalPomoTime, calculateProgress } from '../utils';

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
  subtitle: string;
  label: string;
  roman: string;
  actionText: string;
  pillBg: string;
  pillText: string;
  accentBorder: string;
  priorities: Priority[];
  targetPriority: Priority;
}

const getNotionTagColor = (tagName: string) => {
  const notionPalettes = [
    { bg: 'bg-[#E3E2E0] dark:bg-[#2C2C2C]', text: 'text-[#32302C] dark:text-[#D4D4D4]' },
    { bg: 'bg-[#EEE0DA] dark:bg-[#432A1C]', text: 'text-[#64473A] dark:text-[#D4A373]' },
    { bg: 'bg-[#FADEC9] dark:bg-[#4A2D13]', text: 'text-[#8A480B] dark:text-[#E89943]' },
    { bg: 'bg-[#FDECC8] dark:bg-[#4D3A1B]', text: 'text-[#8A6700] dark:text-[#F3CE63]' },
    { bg: 'bg-[#DBEDDB] dark:bg-[#1E3B29]', text: 'text-[#1E7242] dark:text-[#8EE6A5]' },
    { bg: 'bg-[#D3E5EF] dark:bg-[#1C354A]', text: 'text-[#0B6E99] dark:text-[#7EBDE6]' },
    { bg: 'bg-[#E8DEEE] dark:bg-[#3C254C]', text: 'text-[#6940A5] dark:text-[#D5B8F6]' },
    { bg: 'bg-[#F5E0E9] dark:bg-[#4E2439]', text: 'text-[#961964] dark:text-[#EE85B5]' },
    { bg: 'bg-[#FFE2DD] dark:bg-[#4D2420]', text: 'text-[#C23C32] dark:text-[#FFAAA0]' },
  ];
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return notionPalettes[Math.abs(hash) % notionPalettes.length];
};

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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewLayout, setViewLayout] = useState<'matrix2x2' | 'columns'>('matrix2x2');
  const [showHelp, setShowHelp] = useState(false);
  const [showPropertiesMenu, setShowPropertiesMenu] = useState(false);

  // Property visibility toggles (Notion style properties menu)
  const [visibleProps, setVisibleProps] = useState({
    dueDate: true,
    tags: true,
    subtasks: true,
    pomodoro: true,
    estimatedTime: true,
  });

  // Inline task creation in a specific quadrant
  const [inlineCreateQuadId, setInlineCreateQuadId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState('');
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // Drag and drop states
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

  // Quadrant modal view state (for expanded focus view)
  const [activeListQuadrantId, setActiveListQuadrantId] = useState<string | null>(null);
  const [modalNewTaskText, setModalNewTaskText] = useState('');

  useEffect(() => {
    if (onFullScreenChange) {
      onFullScreenChange(isFullScreen);
    }
  }, [isFullScreen, onFullScreenChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineCreateQuadId) {
          setInlineCreateQuadId(null);
          setInlineText('');
        } else if (activeListQuadrantId) {
          setActiveListQuadrantId(null);
        } else if (isFullScreen) {
          setIsFullScreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, inlineCreateQuadId, activeListQuadrantId]);

  useEffect(() => {
    if (inlineCreateQuadId && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineCreateQuadId]);

  // Quadrants configuration matching Notion aesthetic with authentic pastel badges
  const quadrants: QuadrantConfig[] = [
    {
      id: "q1",
      title: "Срочно и важно",
      subtitle: "Сделай в первую очередь",
      label: "Срочно / Важно",
      roman: "I",
      actionText: "Do First",
      pillBg: "bg-[#FFE2DD] dark:bg-[#4D2420]",
      pillText: "text-[#C23C32] dark:text-[#FFAAA0]",
      accentBorder: "border-[#FFE2DD] dark:border-[#4D2420]",
      priorities: ["urgent"],
      targetPriority: "urgent"
    },
    {
      id: "q2",
      title: "Важно, но не срочно",
      subtitle: "Запланируй время",
      label: "Не срочно / Важно",
      roman: "II",
      actionText: "Schedule",
      pillBg: "bg-[#FADEC9] dark:bg-[#4A2D13]",
      pillText: "text-[#8A480B] dark:text-[#E89943]",
      accentBorder: "border-[#FADEC9] dark:border-[#4A2D13]",
      priorities: ["high"],
      targetPriority: "high"
    },
    {
      id: "q3",
      title: "Срочно, но не важно",
      subtitle: "Делегируй или сократи",
      label: "Срочно / Не важно",
      roman: "III",
      actionText: "Delegate",
      pillBg: "bg-[#D3E5EF] dark:bg-[#1C354A]",
      pillText: "text-[#0B6E99] dark:text-[#7EBDE6]",
      accentBorder: "border-[#D3E5EF] dark:border-[#1C354A]",
      priorities: ["medium"],
      targetPriority: "medium"
    },
    {
      id: "q4",
      title: "Не важно и не срочно",
      subtitle: "Отложи или исключи",
      label: "Не срочно / Не важно",
      roman: "IV",
      actionText: "Don't Do",
      pillBg: "bg-[#DBEDDB] dark:bg-[#1E3B29]",
      pillText: "text-[#1E7242] dark:text-[#8EE6A5]",
      accentBorder: "border-[#DBEDDB] dark:border-[#1E3B29]",
      priorities: ["low", "none"],
      targetPriority: "low"
    }
  ];

  const activeListQuadrant = activeListQuadrantId 
    ? quadrants.find(q => q.id === activeListQuadrantId) || null 
    : null;

  // Filter tasks mapping containers and workflow rectangles out
  const filteredTasks = useMemo(() => {
    return nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.archived);
  }, [nodes]);

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

  // Touch drag-and-drop support
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
    if (e.cancelable) e.preventDefault();

    setTouchDrag(prev => prev ? ({
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY,
    }) : null);

    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const quadElem = elem?.closest('[data-quadrant-id]');
    if (quadElem) {
      const quadId = quadElem.getAttribute('data-quadrant-id');
      setDraggedOverQuadrant(quadId);
    } else {
      setDraggedOverQuadrant(null);
    }
  };

  const handleTouchEnd = () => {
    if (!touchDrag) return;
    const targetQuadrantId = draggedOverQuadrant;
    const taskId = touchDrag.taskId;

    setTouchDrag(null);
    setDraggedCardId(null);
    setDraggedOverQuadrant(null);

    if (!targetQuadrantId) {
      onSelectNode(taskId);
      return;
    }

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

  // Submit inline new task in a quadrant
  const handleInlineSubmit = (quad: QuadrantConfig) => {
    const text = inlineText.trim();
    if (!text) {
      setInlineCreateQuadId(null);
      return;
    }

    if (onCreateTask) {
      onCreateTask(text, [], quad.targetPriority, null, undefined);
    } else {
      const newNodeId = 'node-' + Math.random().toString(36).substring(2, 9);
      const newTask: TaskNode = {
        id: newNodeId,
        projectId: activeProjectId,
        text,
        x: 150,
        y: 150,
        parentId: null,
        priority: quad.targetPriority,
        tags: [],
        notes: '',
        completed: false,
        files: [],
        updatedAt: new Date().toISOString()
      };
      onUpdateNode(newTask);
    }

    setInlineText('');
    setInlineCreateQuadId(null);
  };

  // Submit modal task creation
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

  const formatNotionDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);

      const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Сегодня';
      if (diffDays === 1) return 'Завтра';
      if (diffDays === -1) return 'Вчера';
      
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      return `${d.getDate()} ${months[d.getMonth()]}`;
    } catch {
      return dateStr;
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
    if (totalMinutes === 0) return '0 мин';
    if (totalMinutes < 60) return `${totalMinutes} мин`;
    const hours = Number((totalMinutes / 60).toFixed(1));
    return `${hours} ч`;
  }, [filteredTasks]);

  const activeCount = filteredTasks.filter(t => !t.completed).length;

  return (
    <div 
      id="notion-eisenhower-matrix"
      className={`flex flex-col font-sans overflow-hidden relative select-none bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#D4D4D4] ${
        isFullScreen 
          ? 'fixed inset-0 z-[150] w-screen h-screen' 
          : 'w-full h-full'
      }`}
    >
      {/* Notion-style Top Bar & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 border-b border-[#EDEDEB] dark:border-[#2F2F2F] shrink-0 z-30">
        
        {/* Left: Notion Page Icon & Breadcrumb Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg select-none">🎯</span>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm md:text-[15px] font-semibold text-[#37352F] dark:text-[#FFFFFF] tracking-tight truncate">
              Матрица Эйзенхауэра
            </h2>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-[#F7F6F3] dark:bg-[#252525] px-2 py-0.5 rounded-full border border-[#EDEDEB] dark:border-[#2F2F2F]">
              {activeCount} активн.
            </span>
          </div>
        </div>

        {/* Right: Notion Action Buttons, View Switcher & Filters */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          
          {/* Estimated focus badge */}
          <div 
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-[#787774] dark:text-[#9B9A97] bg-[#F7F6F3] dark:bg-[#252525] hover:bg-[#EFEFED] dark:hover:bg-[#2F2F2F] transition-colors"
            title="Сумма времени важных задач (Квадранты I + II)"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Фокус (I+II): <strong className="text-[#37352F] dark:text-[#FFFFFF]">{totalImportantText}</strong></span>
          </div>

          {/* View Layout Toggle: 2x2 Matrix vs Columns */}
          <div className="flex items-center bg-[#F7F6F3] dark:bg-[#252525] p-0.5 rounded border border-[#EDEDEB] dark:border-[#2F2F2F]">
            <button
              type="button"
              onClick={() => setViewLayout('matrix2x2')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewLayout === 'matrix2x2' 
                  ? 'bg-white dark:bg-[#333333] text-[#37352F] dark:text-[#FFFFFF] shadow-2xs' 
                  : 'text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F]'
              }`}
              title="Сетка 2×2"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('columns')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                viewLayout === 'columns' 
                  ? 'bg-white dark:bg-[#333333] text-[#37352F] dark:text-[#FFFFFF] shadow-2xs' 
                  : 'text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F]'
              }`}
              title="Колонки (Доска)"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Properties Visibility Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowPropertiesMenu(!showPropertiesMenu);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                showPropertiesMenu 
                  ? 'bg-[#EFEFED] dark:bg-[#2F2F2F] text-[#37352F] dark:text-white' 
                  : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#F7F6F3] dark:hover:bg-[#252525]'
              }`}
              title="Настройка отображения свойств"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Свойства</span>
            </button>

            {showPropertiesMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPropertiesMenu(false)} />
                <div className="absolute right-0 top-8 z-50 w-52 bg-white dark:bg-[#252525] border border-[#EDEDEB] dark:border-[#2F2F2F] rounded-lg shadow-xl p-2 space-y-1 text-xs">
                  <span className="text-[10px] font-bold text-[#787774] dark:text-[#9B9A97] uppercase px-2 py-1 block">
                    Показывать в карточках
                  </span>
                  {[
                    { id: 'dueDate', label: '📅 Срок выполнения' },
                    { id: 'tags', label: '🏷️ Теги задачи' },
                    { id: 'subtasks', label: '🪜 Подзадачи' },
                    { id: 'pomodoro', label: '🍅 Таймер Помодоро' },
                    { id: 'estimatedTime', label: '⏱️ Оценка времени' },
                  ].map(prop => (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => setVisibleProps(prev => ({ ...prev, [prop.id]: !prev[prop.id as keyof typeof prev] }))}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#F7F6F3] dark:hover:bg-[#2F2F2F] text-left transition-colors cursor-pointer"
                    >
                      <span>{prop.label}</span>
                      {visibleProps[prop.id as keyof typeof visibleProps] && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Help Info Button */}
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
              showHelp ? 'bg-[#EFEFED] dark:bg-[#2F2F2F] text-[#37352F] dark:text-white' : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#F7F6F3] dark:hover:bg-[#252525]'
            }`}
            title="О методе Эйзенхауэра"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 rounded text-xs text-[#787774] dark:text-[#9B9A97] hover:bg-[#F7F6F3] dark:hover:bg-[#252525] transition-colors cursor-pointer"
            title={isFullScreen ? "Выйти из полноэкранного режима (Esc)" : "Развернуть на весь экран"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Notion '+ Новая' button */}
          <button
            type="button"
            onClick={() => {
              setInlineCreateQuadId('q1');
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Новая задача</span>
          </button>
        </div>
      </div>

      {/* Notion Callout Guide (Collapsible) */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-[#EDEDEB] dark:border-[#2F2F2F] bg-[#F7F6F3] dark:bg-[#202020] px-4 py-3 text-xs leading-relaxed overflow-hidden shrink-0"
          >
            <div className="max-w-5xl mx-auto flex items-start gap-3">
              <span className="text-base">💡</span>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#37352F] dark:text-white">Принцип матрицы Эйзенхауэра в Notion</p>
                  <button type="button" onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[#787774] dark:text-[#9B9A97]">
                  Разделение задач по осям <strong>Срочности</strong> и <strong>Важности</strong>. Перетаскивайте карточки между квадрантами для быстрой смены приоритета.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                  {quadrants.map(q => (
                    <div key={q.id} className="p-2 rounded bg-white dark:bg-[#262626] border border-[#EDEDEB] dark:border-[#333333]">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${q.pillBg} ${q.pillText}`}>
                        {q.roman}. {q.label}
                      </span>
                      <p className="text-[11px] text-[#787774] dark:text-[#9B9A97] mt-1">{q.subtitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Canvas Area */}
      <div className="flex-1 p-3 md:p-4 overflow-y-auto custom-scrollbar flex flex-col min-h-0 bg-[#FAFAFA] dark:bg-[#191919]">
        <div className={`grid gap-3 flex-1 min-h-[500px] ${
          viewLayout === 'matrix2x2' 
            ? 'grid-cols-1 md:grid-cols-2 grid-rows-none md:grid-rows-2' 
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}>
          {quadrants.map(quad => {
            const quadTasks = getTasksForQuadrant(quad);
            const isOver = draggedOverQuadrant === quad.id;
            const isCreating = inlineCreateQuadId === quad.id;

            return (
              <div
                key={quad.id}
                data-quadrant-id={quad.id}
                onDragOver={(e) => handleDragOver(e, quad.id)}
                onDragLeave={() => setDraggedOverQuadrant(null)}
                onDrop={(e) => handleDrop(e, quad.id)}
                className={`flex flex-col rounded-lg bg-[#F7F6F3] dark:bg-[#202020] border transition-all h-full p-2.5 ${
                  isOver 
                    ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 ring-1 ring-indigo-500/20' 
                    : 'border-[#EBEAE7] dark:border-[#2C2C2C]'
                }`}
              >
                {/* Quadrant Header (Notion Board Group Header style) */}
                <div className="flex items-center justify-between gap-1.5 pb-2 mb-1 border-b border-[#EDEDEB] dark:border-[#2B2B2B] shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${quad.pillBg} ${quad.pillText}`}>
                      {quad.roman}. {quad.title}
                    </span>
                    <span className="text-[11px] font-medium text-[#787774] dark:text-[#9B9A97]">
                      {quadTasks.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {/* Add task button in header */}
                    <button
                      type="button"
                      onClick={() => setInlineCreateQuadId(quad.id)}
                      className="p-1 rounded text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white hover:bg-white dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer"
                      title="Добавить задачу"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {/* Expand / Detailed modal button */}
                    <button
                      type="button"
                      onClick={() => setActiveListQuadrantId(quad.id)}
                      className="p-1 rounded text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white hover:bg-white dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer"
                      title="Развернуть квадрант"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Task Cards Container */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar min-h-0 pt-1">
                  {quadTasks.length === 0 && !isCreating ? (
                    <div className="h-28 flex flex-col items-center justify-center text-center p-3 select-none">
                      <span className="text-xs text-[#9B9A97] dark:text-[#6F6E6B]">
                        Нет задач
                      </span>
                      <button
                        type="button"
                        onClick={() => setInlineCreateQuadId(quad.id)}
                        className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Создать</span>
                      </button>
                    </div>
                  ) : (
                    quadTasks.map(task => {
                      const isSelected = selectedNodeId === task.id;
                      const isDraggingTouch = touchDrag?.taskId === task.id;
                      const overdue = isOverdue(task.dueDate);
                      const dateFormatted = formatNotionDate(task.dueDate);
                      const subtasks = nodes.filter(n => n.parentId === task.id && !n.isContainer && !n.isWorkflowRectangle);
                      const completedSubtasks = subtasks.filter(s => s.completed).length;
                      const pomoStats = getPomoStatsForNode(task, nodes);

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
                            if (onFocusedTaskIdChange) onFocusedTaskIdChange(task.id);
                          }}
                          className={`group relative bg-white dark:bg-[#252525] rounded-md p-2.5 border transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none ${
                            isDraggingTouch
                              ? 'opacity-40 scale-[0.98]'
                              : isSelected
                                ? 'border-indigo-500 ring-1 ring-indigo-500/20'
                                : 'border-[#E9E9E7] dark:border-[#2F2F2F] hover:border-[#C4C3BE] dark:hover:border-[#444444]'
                          }`}
                        >
                          {/* Top Row: Checkbox, Title and Hover Actions */}
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
                              className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                task.completed 
                                  ? 'bg-[#1E7242] border-[#1E7242] text-white' 
                                  : 'border-[#C4C3BE] dark:border-[#555555] hover:border-slate-500 bg-white dark:bg-[#202020]'
                              }`}
                              title={task.completed ? "Отметить как невыполненную" : "Отметить как выполненную"}
                            >
                              {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <span className={`text-[12.5px] leading-snug font-medium text-[#37352F] dark:text-[#ECECEC] break-words block ${
                                task.completed ? 'line-through text-[#9B9A97] dark:text-[#6F6E6B]' : ''
                              }`}>
                                {task.text}
                              </span>
                            </div>

                            {/* Quick Hover Controls */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectNode(task.id);
                                }}
                                className="p-1 rounded text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white hover:bg-[#F7F6F3] dark:hover:bg-[#333333] transition-colors"
                                title="Редактировать"
                              >
                                <FileText className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNode(task.id);
                                }}
                                className="p-1 rounded text-[#9B9A97] hover:text-rose-500 hover:bg-[#F7F6F3] dark:hover:bg-[#333333] transition-colors"
                                title="Удалить"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Properties row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1 border-t border-[#F2F1ED] dark:border-[#2C2C2C]">
                            
                            {/* Date Badge */}
                            {visibleProps.dueDate && task.dueDate && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium ${
                                overdue && !task.completed
                                  ? 'bg-[#FFE2DD] text-[#C23C32] dark:bg-[#4D2420] dark:text-[#FFAAA0]' 
                                  : 'bg-[#F7F6F3] text-[#787774] dark:bg-[#2C2C2C] dark:text-[#9B9A97]'
                              }`}>
                                <Calendar className="w-2.5 h-2.5" />
                                <span>{dateFormatted}</span>
                              </span>
                            )}

                            {/* Tags Chips */}
                            {visibleProps.tags && task.tags && task.tags.length > 0 && (
                              task.tags.map((tag, tIdx) => {
                                const style = getNotionTagColor(tag);
                                return (
                                  <span
                                    key={tIdx}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text}`}
                                  >
                                    #{tag}
                                  </span>
                                );
                              })
                            )}

                            {/* Subtasks Count */}
                            {visibleProps.subtasks && subtasks.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#E8DEEE]/70 dark:bg-[#3C254C]/70 text-[#6940A5] dark:text-[#D5B8F6]">
                                <ListTree className="w-2.5 h-2.5" />
                                <span>{completedSubtasks}/{subtasks.length}</span>
                              </span>
                            )}

                            {/* Pomodoro Focus Time */}
                            {visibleProps.pomodoro && pomoStats.pomodoroTotalTime > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-mono">
                                <span>🍅</span>
                                <span>{formatTotalPomoTime(pomoStats.pomodoroTotalTime)}</span>
                              </span>
                            )}

                            {/* Estimated Time */}
                            {visibleProps.estimatedTime && task.estimatedTime !== undefined && task.estimatedTime !== null && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <Timer className="w-2.5 h-2.5" />
                                <span>{task.estimatedTime}м</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Inline creation input */}
                  {isCreating && (
                    <div className="p-2 bg-white dark:bg-[#252525] border border-indigo-400 dark:border-indigo-600 rounded-md shadow-xs space-y-2">
                      <input
                        ref={inlineInputRef}
                        type="text"
                        placeholder="Название задачи..."
                        value={inlineText}
                        onChange={(e) => setInlineText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleInlineSubmit(quad);
                          } else if (e.key === 'Escape') {
                            setInlineCreateQuadId(null);
                            setInlineText('');
                          }
                        }}
                        className="w-full text-xs font-medium bg-transparent border-0 focus:outline-none focus:ring-0 p-0 text-[#37352F] dark:text-[#FFFFFF]"
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#F2F1ED] dark:border-[#2F2F2F]">
                        <button
                          type="button"
                          onClick={() => {
                            setInlineCreateQuadId(null);
                            setInlineText('');
                          }}
                          className="px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInlineSubmit(quad)}
                          className="px-2.5 py-0.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer"
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notion '+ Новая страница / задача' bottom trigger */}
                {!isCreating && (
                  <button
                    type="button"
                    onClick={() => setInlineCreateQuadId(quad.id)}
                    className="mt-2 flex items-center gap-1.5 px-2 py-1 text-[11.5px] font-medium text-[#787774] dark:text-[#9B9A97] hover:text-[#37352F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-[#252525]/70 rounded transition-colors text-left w-full cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Новая задача</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Touch Drag Floating Proxy */}
      {touchDrag && (
        <div
          className="touch-drag-proxy fixed pointer-events-none z-[9999] opacity-90 scale-[1.03] shadow-2xl rounded-lg border border-indigo-500 bg-white dark:bg-[#252525] p-2.5 flex items-center gap-2 text-[#37352F] dark:text-white font-sans text-xs"
          style={{
            left: `${touchDrag.currentX - touchDrag.offsetX}px`,
            top: `${touchDrag.currentY - touchDrag.offsetY}px`,
            width: `${touchDrag.width}px`,
            height: `${touchDrag.height}px`,
          }}
        >
          <span className="w-3 h-3 rounded-full border border-slate-400 shrink-0" />
          <span className="font-medium truncate">{touchDrag.text}</span>
        </div>
      )}

      {/* Expanded Quadrant Focus Modal (Full View) */}
      <AnimatePresence>
        {activeListQuadrant && (
          <div 
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-2xs z-[9998] flex items-center justify-center p-4"
            onClick={() => setActiveListQuadrantId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-[#202020] border border-[#EDEDEB] dark:border-[#2F2F2F] rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDEDEB] dark:border-[#2F2F2F] shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${activeListQuadrant.pillBg} ${activeListQuadrant.pillText}`}>
                    {activeListQuadrant.roman}. {activeListQuadrant.title}
                  </span>
                  <span className="text-xs text-[#787774] dark:text-[#9B9A97]">
                    ({getTasksForQuadrant(activeListQuadrant).length} задач)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveListQuadrantId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Input in Modal */}
              <form onSubmit={handleModalQuickCreate} className="p-4 border-b border-[#EDEDEB] dark:border-[#2F2F2F] flex gap-2 shrink-0 bg-[#F7F6F3] dark:bg-[#191919]">
                <input
                  type="text"
                  required
                  placeholder="Добавить новую задачу в этот квадрант (нажмите Enter)..."
                  value={modalNewTaskText}
                  onChange={(e) => setModalNewTaskText(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-md text-xs text-[#37352F] dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-md shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </form>

              {/* Task list in modal */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {getTasksForQuadrant(activeListQuadrant).length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-xs">
                    В этом квадранте пока нет задач
                  </div>
                ) : (
                  getTasksForQuadrant(activeListQuadrant).map(task => (
                    <div
                      key={task.id}
                      onClick={() => {
                        onSelectNode(task.id);
                        setActiveListQuadrantId(null);
                      }}
                      className="flex items-center justify-between p-3 rounded-lg border border-[#EDEDEB] dark:border-[#2F2F2F] hover:border-indigo-400 dark:hover:border-indigo-600 bg-white dark:bg-[#252525] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
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
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            task.completed ? 'bg-[#1E7242] border-[#1E7242] text-white' : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </button>
                        <span className={`text-xs font-medium ${task.completed ? 'line-through text-slate-400' : 'text-[#37352F] dark:text-white'}`}>
                          {task.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectNode(task.id);
                            setActiveListQuadrantId(null);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNode(task.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
