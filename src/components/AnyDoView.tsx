import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  X, 
  CheckCircle2, 
  Circle, 
  MoreVertical, 
  Folder, 
  ShoppingBag, 
  User, 
  Lightbulb, 
  CheckSquare, 
  BookOpen, 
  Calendar, 
  ChevronRight, 
  ArrowLeft,
  Trash2,
  AlertCircle,
  Eye,
  Tag,
  Clock,
  Sparkles,
  Inbox,
  Briefcase,
  Home,
  Check,
  ListTodo
} from 'lucide-react';
import { TaskNode, Priority, TagCategory } from '../types';

interface AnyDoViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string | null;
  selectedNodeId: string | null;
  activePomodoroNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onCreateTask: (
    text: string, 
    initialTags: string[], 
    initialPriority?: Priority, 
    parentId?: string | null, 
    dueDate?: string, 
    extraFields?: Partial<TaskNode>
  ) => void;
  onFullScreenChange?: (isFullscreen: boolean) => void;
  onFocusedTaskIdChange?: (taskId: string | null) => void;
  selectedNodeIds?: string[];
  onToggleSelectNode?: (nodeId: string) => void;
}

export default function AnyDoView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onFullScreenChange,
  onFocusedTaskIdChange,
  selectedNodeIds = [],
  onToggleSelectNode
}: AnyDoViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);
  const [expandedFilter, setExpandedFilter] = useState<'all' | 'active' | 'completed'>('all');
  
  // New list creation state
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListColor, setNewListColor] = useState('#6366f1');

  // Inline quick task inputs per container
  const [quickTaskTexts, setQuickTaskTexts] = useState<Record<string, string>>({});

  // Helper to check if task matches search query (including equipment properties)
  const checkTaskSearchMatch = (t: TaskNode, qStr: string): boolean => {
    if (!qStr.trim()) return true;
    const q = qStr.toLowerCase();
    const textMatch = t.text?.toLowerCase().includes(q) || false;
    const notesMatch = t.notes?.toLowerCase().includes(q) || false;
    const tagMatch = t.tags?.some(tag => tag.toLowerCase().includes(q)) || false;
    const eqModelMatch = t.equipmentModel?.toLowerCase().includes(q) || false;
    const eqBarcodeMatch = t.equipmentBarcode?.toLowerCase().includes(q) || false;
    const eqStockMatch = t.equipmentStockCode?.toLowerCase().includes(q) || false;
    const eqNoteMatch = t.equipmentNote?.toLowerCase().includes(q) || false;
    const customPropsMatch = t.customProperties?.some(
      cp => cp.name?.toLowerCase().includes(q) || cp.value?.toLowerCase().includes(q)
    ) || false;
    return textMatch || notesMatch || tagMatch || eqModelMatch || eqBarcodeMatch || eqStockMatch || eqNoteMatch || customPropsMatch;
  };

  // Helper to determine the container of a task node
  const getTaskContainerId = (node: TaskNode): string | null => {
    let curr: TaskNode | undefined = node;
    const visited = new Set<string>();
    while (curr && curr.parentId) {
      if (visited.has(curr.parentId)) break; // cycle protection
      visited.add(curr.parentId);
      const parentNode = nodes.find(n => n.id === curr!.parentId);
      if (parentNode && parentNode.isContainer) return parentNode.id;
      curr = parentNode;
    }
    return null;
  };

  // Traverses up from target node to verify if it's inside a specific container
  const isNodeInContainer = (node: TaskNode, containerId: string): boolean => {
    let curr: TaskNode | undefined = node;
    const visited = new Set<string>();
    while (curr && curr.parentId) {
      if (visited.has(curr.parentId)) break;
      visited.add(curr.parentId);
      if (curr.parentId === containerId) return true;
      curr = nodes.find(n => n.id === curr!.parentId);
    }
    return false;
  };

  // 1. Get all containers
  const containers = useMemo(() => {
    return nodes.filter(n => n.isContainer && !n.archived);
  }, [nodes]);

  // 2. Get uncompleted tasks grouped by container
  const tasks = useMemo(() => {
    return nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.archived && !n.isNotTask);
  }, [nodes]);

  // Helper to map list names to beautiful icons
  const getListIcon = (name: string) => {
    const text = name.toLowerCase();
    if (text.includes('покуп') || text.includes('купи') || text.includes('магаз')) {
      return ShoppingBag;
    }
    if (text.includes('inbox') || text.includes('входящие') || text.includes('вход')) {
      return Inbox;
    }
    if (text.includes('личн') || text.includes('персон') || text.includes('семь')) {
      return User;
    }
    if (text.includes('иде') || text.includes('мысл') || text.includes('креат')) {
      return Lightbulb;
    }
    if (text.includes('todo') || text.includes('задач') || text.includes('дел') || text.includes('работ')) {
      return CheckSquare;
    }
    if (text.includes('чита') || text.includes('книг') || text.includes('библио')) {
      return BookOpen;
    }
    if (text.includes('дом')) {
      return Home;
    }
    return ListTodo;
  };

  // Create a new container (List) in Any.do style
  const handleCreateNewList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;

    onCreateTask(
      newListTitle.trim(),
      [],
      'none',
      null,
      undefined,
      {
        isContainer: true,
        isFloating: true,
        color: newListColor,
        width: 320,
        height: 300
      }
    );

    setNewListTitle('');
    setIsCreatingList(false);
  };

  // Create a task inside a specific container quick input
  const handleCreateQuickTask = (containerId: string | null) => {
    const text = quickTaskTexts[containerId || 'inbox'] || '';
    if (!text.trim()) return;

    onCreateTask(
      text.trim(),
      [],
      'none',
      containerId, // parentId (container)
      undefined
    );

    setQuickTaskTexts(prev => ({
      ...prev,
      [containerId || 'inbox']: ''
    }));
  };

  // Toggle task completion
  const handleToggleTask = (task: TaskNode) => {
    onUpdateNode({
      ...task,
      completed: !task.completed,
      updatedAt: new Date().toISOString()
    });
  };

  // Delete a container/list
  const handleDeleteContainer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Вы уверены, что хотите удалить этот список со всеми задачами?')) {
      onDeleteNode(id);
      if (expandedContainerId === id) {
        setExpandedContainerId(null);
      }
    }
  };

  // Preset colors for the color picker
  const colors = [
    '#ef4444', // Red
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899'  // Pink
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-slate-950/20 h-full p-4 md:p-8 relative">
      <AnimatePresence mode="wait">
        {!expandedContainerId ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="max-w-5xl mx-auto space-y-6"
          >
            {/* Any.do Style Search Header */}
            <div className="relative w-full">
              <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск задач, событий и т.д. ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.02)] rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 text-slate-800 dark:text-slate-100 font-sans transition-all"
              />
            </div>

            {/* Grid of Lists/Containers (2 columns on mobile, auto on desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              
              {/* --- 1. INBOX (Uncategorized Tasks Card) --- */}
              {(() => {
                const inboxTasks = tasks.filter(t => {
                  const cId = getTaskContainerId(t);
                  const isMatch = cId === null;
                  return isMatch && checkTaskSearchMatch(t, searchQuery);
                });
                const inboxUncompleted = inboxTasks.filter(t => !t.completed);

                return (
                  <motion.div
                    layoutId="inbox-card"
                    onClick={() => {
                      setExpandedContainerId('inbox');
                      setExpandedFilter('all');
                    }}
                    className="group relative flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-100/80 dark:border-slate-800 rounded-[22px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer aspect-square p-5 text-center select-none"
                  >
                    {/* Badge Count */}
                    {inboxUncompleted.length > 0 && (
                      <div className="absolute top-3.5 right-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-2xs font-sans">
                        {inboxUncompleted.length}
                      </div>
                    )}

                    {/* Centered Large Name */}
                    <div className="flex flex-col items-center gap-2">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base tracking-wide uppercase font-sans">
                        INBOX
                      </h3>
                      <Inbox className="w-4.5 h-4.5 text-slate-300 dark:text-slate-600 group-hover:text-sky-500 transition-colors" />
                    </div>
                  </motion.div>
                );
              })()}

              {/* --- 2. USER CONTAINERS GRIDS --- */}
              {containers.map(container => {
                const containerTasks = tasks.filter(t => {
                  const isMatch = isNodeInContainer(t, container.id);
                  return isMatch && checkTaskSearchMatch(t, searchQuery);
                });
                const uncompleted = containerTasks.filter(t => !t.completed);
                const color = container.color || '#6366f1';
                const IconComponent = getListIcon(container.text);

                return (
                  <motion.div
                    key={container.id}
                    layoutId={`container-card-${container.id}`}
                    onClick={() => {
                      setExpandedContainerId(container.id);
                      setExpandedFilter('all');
                    }}
                    className="group relative flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-100/80 dark:border-slate-800 rounded-[22px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer aspect-square p-5 text-center select-none"
                  >
                    {/* Badge Count */}
                    {uncompleted.length > 0 && (
                      <div 
                        className="absolute top-3.5 right-3.5 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center font-sans shadow-2xs"
                        style={{ backgroundColor: `${color}15`, color: color }}
                      >
                        {uncompleted.length}
                      </div>
                    )}

                    {/* Centered Large Name */}
                    <div className="flex flex-col items-center gap-2 px-1 min-w-0 w-full">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base tracking-wide uppercase truncate w-full font-sans">
                        {container.text}
                      </h3>
                      <IconComponent className="w-4.5 h-4.5 text-slate-300 dark:text-slate-600 group-hover:text-sky-500 transition-colors shrink-0" style={{ color: `${color}cc` }} />
                    </div>

                    {/* Delete Icon on Hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteContainer(container.id, e);
                      }}
                      className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                      title="Удалить список"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}

              {/* --- 3. CREATE NEW LIST CARD (ANY.DO PLUS TILE) --- */}
              <motion.div
                layoutId="create-list-card"
                className="relative flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-100/80 dark:border-slate-800 rounded-[22px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer aspect-square p-5 text-center"
              >
                {!isCreatingList ? (
                  <button
                    onClick={() => setIsCreatingList(true)}
                    className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer text-sky-500 hover:text-sky-600 transition-colors"
                  >
                    <Plus className="w-8 h-8 stroke-[1.5]" />
                  </button>
                ) : (
                  <form onSubmit={handleCreateNewList} className="w-full h-full flex flex-col justify-between text-left" onClick={e => e.stopPropagation()}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">
                          Новый список
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsCreatingList(false)}
                          className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <input
                        type="text"
                        placeholder="Название..."
                        value={newListTitle}
                        onChange={(e) => setNewListTitle(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800 dark:text-slate-100 font-sans"
                        autoFocus
                        required
                      />
                    </div>

                    {/* Color selection */}
                    <div className="flex gap-1.5 justify-center py-1">
                      {colors.slice(2, 6).map(col => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setNewListColor(col)}
                          className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                            newListColor === col ? 'scale-125 ring-1 ring-sky-500 ring-offset-1 dark:ring-offset-slate-900' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-sky-500 hover:bg-sky-600 text-white text-[11px] py-1.5 rounded-xl font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      Создать
                    </button>
                  </form>
                )}
              </motion.div>

            </div>
          </motion.div>
        ) : (
          /* --- EXPANDED DETAILED LIST CONTAINER MODE (FOCUSED DETAIL VIEW) --- */
          <motion.div
            key="container-details"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-lg overflow-hidden flex flex-col min-h-[500px]"
          >
            {/* Header with back button */}
            {(() => {
              const isInbox = expandedContainerId === 'inbox';
              const targetContainer = isInbox ? null : containers.find(c => c.id === expandedContainerId);
              const color = targetContainer?.color || '#6366f1';
              const title = isInbox ? 'INBOX' : targetContainer?.text || 'Задачи';
              const IconComponent = getListIcon(title);

              const allTargetTasks = tasks.filter(t => {
                const isMatch = isInbox ? getTaskContainerId(t) === null : isNodeInContainer(t, expandedContainerId!);
                return isMatch;
              });

              // Filtered list based on filter tab and search
              const displayedTasks = allTargetTasks.filter(t => {
                if (expandedFilter === 'active' && t.completed) return false;
                if (expandedFilter === 'completed' && !t.completed) return false;
                return checkTaskSearchMatch(t, searchQuery);
              });

              return (
                <>
                  <div 
                    className="p-6 text-white flex items-center justify-between relative overflow-hidden"
                    style={{ backgroundColor: color }}
                  >
                    {/* Decorative abstract pattern */}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent pointer-events-none" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      <button
                        onClick={() => {
                          setExpandedContainerId(null);
                          setSearchQuery('');
                        }}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer text-white"
                        title="Вернуться к обзору"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                          <IconComponent className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold font-sans tracking-tight">
                            {title}
                          </h2>
                          <p className="text-xs text-white/70">
                            {allTargetTasks.filter(t => !t.completed).length} активных задач
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-black/10 py-1 px-2.5 rounded-lg">
                        {allTargetTasks.length} всего
                      </span>
                    </div>
                  </div>

                  {/* Filter tabs and quick add bar */}
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex gap-1.5 p-1 bg-slate-50 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
                      {(['all', 'active', 'completed'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setExpandedFilter(tab)}
                          className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer font-sans ${
                            expandedFilter === tab
                              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          {tab === 'all' ? 'Все' : tab === 'active' ? 'Активные' : 'Завершенные'}
                        </button>
                      ))}
                    </div>

                    {/* Inline search inside expanded container */}
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Найти в этом списке..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-sans"
                      />
                    </div>
                  </div>

                  {/* Quick Add Bar */}
                  <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900 border-b border-slate-150/40 dark:border-slate-800 flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 shadow-2xs focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                      <input
                        type="text"
                        placeholder={`Добавить задачу в ${title}...`}
                        value={quickTaskTexts[expandedContainerId || ''] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTaskTexts(prev => ({ ...prev, [expandedContainerId || '']: val }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateQuickTask(expandedContainerId === 'inbox' ? null : expandedContainerId);
                        }}
                        className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700 dark:text-slate-200 font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateQuickTask(expandedContainerId === 'inbox' ? null : expandedContainerId)}
                        className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Добавить
                      </button>
                    </div>
                  </div>

                  {/* Tasks list */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    <AnimatePresence initial={false}>
                      {displayedTasks.map(task => (
                        <motion.div
                          key={task.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                            selectedNodeId === task.id
                              ? 'bg-indigo-50/75 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                          }`}
                          onClick={() => onSelectNode(task.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTask(task);
                              }}
                              className={`transition-colors cursor-pointer ${
                                task.completed 
                                  ? 'text-emerald-500 hover:text-emerald-600' 
                                  : 'text-slate-300 hover:text-indigo-500'
                              }`}
                            >
                              {task.completed ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <span className={`text-sm font-sans ${
                                task.completed 
                                  ? 'text-slate-400 dark:text-slate-500 line-through' 
                                  : 'text-slate-700 dark:text-slate-200 font-medium'
                              }`}>
                                {task.text}
                              </span>
                              {task.dueDate && (
                                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 font-sans">
                                  <Calendar className="w-3 h-3" />
                                  <span>{task.dueDate} {task.dueTime || ''}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {task.priority && task.priority !== 'none' && (
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase font-mono tracking-wider ${
                                task.priority === 'urgent' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' :
                                task.priority === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                                task.priority === 'medium' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400' :
                                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                              }`}>
                                {task.priority}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Удалить эту задачу?')) {
                                  onDeleteNode(task.id);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all"
                              title="Удалить задачу"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {displayedTasks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckCircle2 className="w-12 h-12 text-emerald-300 dark:text-emerald-800 mb-3 animate-bounce" />
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 font-sans">
                          Список пуст
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mt-1">
                          Задач, соответствующих фильтру, не найдено. Добавьте новые задачи с помощью поля ввода выше!
                        </p>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
