import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Folder, 
  Tag as TagIcon, 
  Calendar, 
  ChevronUp, 
  ChevronDown,
  Sparkles,
  SlidersHorizontal,
  ArrowUpDown,
  FileText
} from 'lucide-react';
import { TaskNode, TagCategory, Priority } from '../types';

interface TableViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[]) => void;
}

type SortField = 'text' | 'completed' | 'priority' | 'progress' | 'dueDate';
type SortOrder = 'asc' | 'desc';

export default function TableView({
  nodes,
  tagCategories,
  activeProjectId,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask
}: TableViewProps) {
  const [sortField, setSortField] = useState<SortField>('text');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterText, setFilterText] = useState('');
  const [newInlineText, setNewInlineText] = useState('');

  // Priority ranking for sorting
  const priorityLevels: Record<Priority, number> = {
    'urgent': 4,
    'high': 3,
    'medium': 2,
    'low': 1,
    'none': 0
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter tasks
  const rawTasks = useMemo(() => {
    return nodes.filter(n => !n.isContainer);
  }, [nodes]);

  const filteredTasks = useMemo(() => {
    return rawTasks.filter(task => {
      const matchText = task.text.toLowerCase().includes(filterText.toLowerCase());
      const matchNote = task.notes && task.notes.toLowerCase().includes(filterText.toLowerCase());
      return matchText || matchNote;
    });
  }, [rawTasks, filterText]);

  // Sorted tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'text') {
        comparison = a.text.localeCompare(b.text);
      } else if (sortField === 'completed') {
        comparison = (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
      } else if (sortField === 'priority') {
        const orderA = priorityLevels[a.priority];
        const orderB = priorityLevels[b.priority];
        comparison = orderA - orderB;
      } else if (sortField === 'progress') {
        const progressA = a.progress || 0;
        const progressB = b.progress || 0;
        comparison = progressA - progressB;
      } else if (sortField === 'dueDate') {
        const dateA = a.dueDate || '9999-12-31';
        const dateB = b.dueDate || '9999-12-31';
        comparison = dateA.localeCompare(dateB);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [filteredTasks, sortField, sortOrder]);

  const togglePriority = (task: TaskNode) => {
    const cycle: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];
    const currentIdx = cycle.indexOf(task.priority);
    const nextPriority = cycle[(currentIdx + 1) % cycle.length];
    onUpdateNode({
      ...task,
      priority: nextPriority
    });
  };

  const cycleProgress = (task: TaskNode) => {
    const current = task.progress || 0;
    const nextVal = current >= 100 ? 0 : current + 25;
    onUpdateNode({
      ...task,
      progress: nextVal
    });
  };

  const handleInlineAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInlineText.trim()) return;
    if (onCreateTask) {
      onCreateTask(newInlineText.trim(), []);
    } else {
      // Internal custom construct
      const fallback: TaskNode = {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        projectId: activeProjectId,
        text: newInlineText.trim(),
        x: 0,
        y: 0,
        parentId: null,
        priority: 'none',
        tags: [],
        notes: '',
        completed: false,
        files: []
      };
      onUpdateNode(fallback);
    }
    setNewInlineText('');
  };

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40';
      case 'high': return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40';
      case 'medium': return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/40';
      case 'low': return 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800';
      default: return 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200/50 dark:border-slate-800/50';
    }
  };

  const getPriorityLabel = (p: Priority) => {
    switch (p) {
      case 'urgent': return 'Срочно';
      case 'high': return 'Высокий';
      case 'medium': return 'Средний';
      case 'low': return 'Низкий';
      default: return 'Нет';
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-350 dark:text-slate-600" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400 font-extrabold shrink-0" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400 font-extrabold shrink-0" />
    );
  };

  const getHeaderClass = (field: SortField, baseWidth: string) => {
    const isActive = sortField === field;
    return `${baseWidth} px-4 py-2 cursor-pointer transition-colors ${
      isActive 
        ? 'bg-indigo-50/40 dark:bg-indigo-950/15 text-indigo-700 dark:text-indigo-400 font-extrabold' 
        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;
  };

  return (
    <div id="table-spreadsheet-workspace" className="flex flex-col w-full h-[calc(100vh-130px)] bg-[#FAFBFD] dark:bg-slate-950/20 font-sans overflow-hidden">
      
      {/* Search and Insert Toolbar Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800">
        <form onSubmit={handleInlineAdd} className="w-full md:max-w-md flex items-center relative">
          <input
            type="text"
            placeholder="Создать задачу быстро... (Нажмите Enter)"
            value={newInlineText}
            onChange={(e) => setNewInlineText(e.target.value)}
            className="w-full text-xs py-2 pl-3 pr-8 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white text-slate-800 dark:text-slate-100 rounded-xl border border-slate-205 dark:border-slate-755 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-450"
          />
          <button
            type="submit"
            disabled={!newInlineText.trim()}
            className="absolute right-1.5 p-1 bg-indigo-50 dark:bg-indigo-950/55 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-all disabled:opacity-30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
          {/* Sorting Dropdown Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs w-full sm:w-auto">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 pl-2 pr-1 select-none whitespace-nowrap">Сортировка:</span>
            <select
              value={sortField}
              aria-label="Поле сортировки"
              onChange={(e) => handleSort(e.target.value as SortField)}
              className="bg-transparent border-0 text-slate-700 dark:text-slate-200 text-xs py-1.5 px-2.5 focus:outline-none font-bold cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750/50"
            >
              <option value="text" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 font-semibold">По алфавиту / имени</option>
              <option value="dueDate" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 font-semibold">По дате выполнения</option>
              <option value="priority" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 font-semibold">По приоритету</option>
              <option value="progress" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 font-semibold">По прогрессу</option>
              <option value="completed" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 font-semibold">По статусу</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-750/70 rounded-lg transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
              title={sortOrder === 'asc' ? 'Сортировка по возрастанию (А-Я, от старых к новым)' : 'Сортировка по убыванию (Я-А, от новых к старым)'}
            >
              <span className="text-[9px] font-extrabold uppercase mr-1">
                {sortOrder === 'asc' ? 'А-Я' : 'Я-А'}
              </span>
              {sortOrder === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400 font-extrabold" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-indigo-650 dark:text-indigo-400 font-extrabold" />
              )}
            </button>
          </div>

          {/* Filter Input */}
          <div className="relative w-full sm:w-48 lg:w-56 flex items-center">
            <input
              type="text"
              placeholder="Фильтр в таблице..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full text-xs py-2 px-3 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl border border-slate-205 dark:border-slate-755 focus:outline-none focus:ring-1 focus:ring-indigo-550 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Spreadsheet grid layout container */}
      <div className="flex-1 overflow-auto custom-scrollbar select-none bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
          
          <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-150 dark:border-slate-800 h-10 shrink-0 font-extrabold text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 z-20">
            <tr>
              <th className={getHeaderClass('completed', 'w-16')} onClick={() => handleSort('completed')}>
                <div className="flex items-center gap-1 justify-center">
                  <span>Статус</span>
                  {getSortIcon('completed')}
                </div>
              </th>
              
              <th className={getHeaderClass('text', 'w-2/5')} onClick={() => handleSort('text')}>
                <div className="flex items-center gap-1.5">
                  <span>Задача / Идея</span>
                  {getSortIcon('text')}
                </div>
              </th>

              <th className={getHeaderClass('priority', 'w-32')} onClick={() => handleSort('priority')}>
                <div className="flex items-center gap-1 justify-between pr-2">
                  <span>Приоритет</span>
                  {getSortIcon('priority')}
                </div>
              </th>

              <th className={getHeaderClass('dueDate', 'w-36')} onClick={() => handleSort('dueDate')}>
                <div className="flex items-center gap-1 justify-between pr-2">
                  <span>Срок</span>
                  {getSortIcon('dueDate')}
                </div>
              </th>

              <th className={getHeaderClass('progress', 'w-36')} onClick={() => handleSort('progress')}>
                <div className="flex items-center gap-1 justify-between pr-2">
                  <span>Прогресс</span>
                  {getSortIcon('progress')}
                </div>
              </th>

              <th className="w-36 px-4 py-2 font-extrabold text-[10px] text-slate-400 dark:text-slate-500">Теги</th>
              <th className="w-24 px-4 py-2 text-center font-extrabold text-[10px] text-slate-400 dark:text-slate-500">Опции</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center text-slate-400 text-xs">
                  Задачи не найдены. Создайте новую задачу или измените поисковый запрос.
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => {
                const isSelected = selectedNodeId === task.id;

                return (
                  <tr
                    key={task.id}
                    className={`group/row transition-all h-12 text-xs hover:bg-slate-50/55 dark:hover:bg-slate-850/45 ${
                      isSelected ? 'bg-indigo-50/30 dark:bg-indigo-950/15' : ''
                    }`}
                  >
                    {/* Done Checklist Checkbox */}
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => onUpdateNode({
                          ...task,
                          completed: !task.completed
                        })}
                        className={`text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-full transition-transform cursor-pointer ${
                          task.completed ? 'text-indigo-600 dark:text-indigo-400' : ''
                        }`}
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 inline-block" />
                        ) : (
                          <Circle className="w-4 h-4 shrink-0 inline-block" />
                        )}
                      </button>
                    </td>

                    {/* Inline Rename Text */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5 overflow-hidden w-full">
                        <input
                          type="text"
                          value={task.text}
                          onChange={(e) => {
                            onUpdateNode({
                              ...task,
                              text: e.target.value
                            });
                          }}
                          className={`w-full bg-transparent border-0 focus:ring-0 p-1 rounded hover:bg-slate-100/50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-extrabold focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-850 truncate ${
                            task.completed ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : ''
                          }`}
                        />
                      </div>
                    </td>

                    {/* Cyclic Priority Badging */}
                    <td className="px-4 py-2">
                      <button
                        onClick={() => togglePriority(task)}
                        title="Нажмите для циклической смены приоритета"
                        className={`px-2 py-1.5 rounded-xl text-[10px] font-extrabold select-none cursor-pointer transition-all hover:scale-102 ${getPriorityBadge(task.priority)}`}
                      >
                        {getPriorityLabel(task.priority)}
                      </button>
                    </td>

                    {/* Date picker */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="date"
                          value={task.dueDate || ''}
                          onChange={(e) => {
                            onUpdateNode({
                              ...task,
                              dueDate: e.target.value
                            });
                          }}
                          className="text-[11px] bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-201 dark:border-slate-705 px-1.5 py-0.5 rounded-lg focus:outline-none focus:border-indigo-500 max-w-[110px]"
                        />
                      </div>
                    </td>

                    {/* Progress with interactive cycle click / slider */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          title={`Потяните ползунок для изменения прогресса: ${task.progress || 0}%`}
                          value={task.progress || 0}
                          onChange={(e) => {
                            onUpdateNode({
                              ...task,
                              progress: parseInt(e.target.value, 10)
                            });
                          }}
                          className="w-20 accent-indigo-600 dark:accent-indigo-400 h-1 cursor-pointer"
                        />
                        <button
                          onClick={() => cycleProgress(task)}
                          className="font-mono text-[10.5px] font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-450 dark:hover:text-indigo-400 px-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                        >
                          {task.progress || 0}%
                        </button>
                      </div>
                    </td>

                    {/* Tags block list */}
                    <td className="px-4 py-2 overflow-hidden truncate">
                      <div className="flex flex-wrap gap-1">
                        {task.tags && task.tags.length > 0 ? (
                          task.tags.map(t => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-md text-[9.5px] font-semibold border border-indigo-100/50 dark:border-indigo-900/40"
                            >
                              #{t}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </div>
                    </td>

                    {/* Action button menu list rows */}
                    <td className="px-4 py-2 text-center select-none">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onSelectNode(task.id)}
                          title="Редактировать во вспомогательной панели"
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteNode(task.id)}
                          title="Удалить безвозвратно"
                          className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

        </table>
      </div>

    </div>
  );
}
