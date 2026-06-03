import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Paperclip, 
  FileText, 
  FileImage, 
  Download, 
  Plus, 
  Maximize2,
  Calendar,
  Layers,
  HelpCircle
} from 'lucide-react';
import { TaskNode, Priority, AttachmentFile } from '../types';
import { formatFileSize, generateId, calculateProgress, getDescendants } from '../utils';

interface TaskDetailsPanelProps {
  node: TaskNode | null;
  allNodes: TaskNode[];
  onClose: () => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  onDeleteNode: (id: string) => void;
}

const PASTEL_COLORS = [
  { value: '#6366f1', name: 'Индиго' },
  { value: '#3b82f6', name: 'Синий' },
  { value: '#10b981', name: 'Изумруд' },
  { value: '#f59e0b', name: 'Янтарный' },
  { value: '#ec4899', name: 'Розовый' },
  { value: '#a855f7', name: 'Фиолетовый' },
  { value: '', name: 'По умолчанию' },
];

export default function TaskDetailsPanel({
  node,
  allNodes,
  onClose,
  onUpdateNode,
  onDeleteNode
}: TaskDetailsPanelProps) {
  const [tagInput, setTagInput] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  if (!node) return null;

  // Generic modification helper
  const handlePropChange = <K extends keyof TaskNode>(key: K, value: TaskNode[K]) => {
    onUpdateNode({
      ...node,
      [key]: value
    });
  };

  // Add the tag to target
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = tagInput.trim().replace(/#/g, '');
    if (!tag) return;
    
    if (node.tags && node.tags.includes(tag)) {
      setTagInput('');
      return;
    }

    const updatedTags = node.tags ? [...node.tags, tag] : [tag];
    handlePropChange('tags', updatedTags);
    setTagInput('');
  };

  // Remove individual tag
  const handleRemoveTag = (indexToRemove: number) => {
    const updatedTags = node.tags.filter((_, idx) => idx !== indexToRemove);
    handlePropChange('tags', updatedTags);
  };

  // Upload attachment and convert to base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;
    
    setFileError(null);
    const file = filesList[0];

    // Safety: limit file uploads to 1.5MB to stay within LocalStorage limits comfortably
    const MAX_BYTES = 1.5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setFileError('Размер файла превышает 1.5 МБ. Выберите файл меньшего размера для стабильного сохранения.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const newAttachment: AttachmentFile = {
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: base64Data,
      };

      const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
      handlePropChange('files', updatedFiles);
    };
    reader.onerror = () => {
      setFileError('Ошибка считывания файла.');
    };
    reader.readAsDataURL(file);
  };

  // Remove individual attachment
  const handleRemoveFile = (fileId: string) => {
    if (!node.files) return;
    const updatedFiles = node.files.filter(f => f.id !== fileId);
    handlePropChange('files', updatedFiles);
  };

  return (
    <aside className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-50 transform translate-x-0 transition-transform duration-300 ease-out">
      {/* Header */}
      <div className="h-16 px-6 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" /> Свойства задачи
        </h3>
        <button 
          onClick={onClose}
          className="p-1 px-[5px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          title="Закрыть панель"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        
        {/* Name / Heading */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Текст задачи (ветвь)
          </label>
          <textarea
            value={node.text}
            onChange={(e) => handlePropChange('text', e.target.value)}
            className="w-full text-base font-semibold px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
            rows={2}
            placeholder="Введите название задачи..."
          />
        </div>

        {/* State / Done badge */}
        <div className="flex items-center justify-between bg-[#FAFBFD]/60 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/50 dark:border-slate-850">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Статус выполнения:</span>
          <button
            onClick={() => {
              const nextCompleted = !node.completed;
              onUpdateNode({
                ...node,
                completed: nextCompleted,
                progress: nextCompleted ? 100 : 0
              });
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition-colors ${
              node.completed 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900' 
                : 'bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900'
            }`}
          >
            {node.completed ? '✓ Выполнено' : '○ В процессе'}
          </button>
        </div>

        {/* Прогресс выполнения */}
        {(() => {
          const hasChildren = allNodes.some(n => n.parentId === node.id);
          const calculatedProgressVal = hasChildren ? (calculateProgress(node.id, allNodes) || 0) : 0;
          const descendantsCount = getDescendants(node.id, allNodes).length;
          const manualProgressVal = node.progress !== undefined ? node.progress : (node.completed ? 100 : 0);

          return (
            <div className="space-y-2 bg-[#FAFBFD]/40 dark:bg-slate-800/20 p-3 rounded-lg border border-slate-150 dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Прогресс задачи
                </label>
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {hasChildren ? `${calculatedProgressVal}%` : `${manualProgressVal}%`}
                </span>
              </div>

              {hasChildren ? (
                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${calculatedProgressVal}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 italic font-medium">
                    Рассчитывается автоматически на основе {descendantsCount} подзадач(и)
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={manualProgressVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      onUpdateNode({
                        ...node,
                        progress: val,
                        completed: val === 100
                      });
                    }}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-505"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                    <span>0% (Начало)</span>
                    <span>50% (В процессе)</span>
                    <span>100% (Выполнено)</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Priority buttons */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Приоритет задачи
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {(['none', 'low', 'medium', 'high', 'urgent'] as const).map((p) => {
              let label = 'Нет';
              let activeColor = 'border-slate-600 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
              if (p === 'low') {
                label = 'Низкий';
                activeColor = 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-400';
              } else if (p === 'medium') {
                label = 'Средний';
                activeColor = 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400';
              } else if (p === 'high') {
                label = 'Высокий';
                activeColor = 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
              } else if (p === 'urgent') {
                label = 'Критич.';
                activeColor = 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
              }

              const isCurrent = node.priority === p;
              return (
                <button
                  key={p}
                  onClick={() => handlePropChange('priority', p)}
                  className={`py-2 px-1 text-center text-[10px] font-medium rounded-lg border transition-all cursor-pointer ${
                    isCurrent 
                      ? `${activeColor} font-semibold border-2` 
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Срок выполнения (Due Date) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            Срок выполнения (дедлайн)
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={node.dueDate || ''}
              onChange={(e) => handlePropChange('dueDate', e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
            />
            {node.dueDate && (
              <button
                onClick={() => handlePropChange('dueDate', '')}
                className="px-2.5 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg transition-colors text-xs font-medium cursor-pointer"
                title="Очистить срок"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* Branch / Connector Color picker */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Цвет ветви связи
          </label>
          <div className="flex flex-wrap gap-2">
            {PASTEL_COLORS.map((col) => {
              const isSelected = (node.color || '') === col.value;
              return (
                <button
                  key={col.value || 'default'}
                  onClick={() => handlePropChange('color', col.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    isSelected ? 'ring-2 ring-indigo-500 scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: col.value || '#cbd5e1',
                  }}
                  title={col.name}
                />
              );
            })}
          </div>
        </div>

        {/* Tags Block */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Теги задачи
          </label>
          <form onSubmit={handleAddTag} className="flex gap-2">
            <input
              type="text"
              placeholder="Добавить тег..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
            />
            <button
              type="submit"
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          {node.tags && node.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {node.tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-100 dark:border-transparent"
                >
                  #{tag}
                  <button 
                    onClick={() => handleRemoveTag(index)}
                    className="p-0.5 hover:text-rose-600 text-slate-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Нет тегов.</p>
          )}
        </div>

        {/* Notes (textarea) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Заметки и описание задачи
          </label>
          <textarea
            value={node.notes}
            onChange={(e) => handlePropChange('notes', e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-sans"
            rows={5}
            placeholder="Опишите задачу поподробнее (поддерживается текстовая спецификация)..."
          />
        </div>

        {/* Files Attached list & input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Файлы и вложения
          </label>

          <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-800 transition-colors rounded-xl p-4 text-center cursor-pointer">
            <input
              type="file"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Paperclip className="w-5 h-5 mx-auto text-slate-400" />
            <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-1.5">
              Нажмите для выбора файла
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Максимум 1.5 МБ для оптимального кэша
            </p>
          </div>

          {fileError && (
            <p className="text-xs text-rose-500 font-medium pl-1">{fileError}</p>
          )}

          {node.files && node.files.length > 0 ? (
            <div className="space-y-1.5 mt-3">
              {node.files.map((file) => {
                const isImg = file.type.startsWith('image/');
                return (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between p-2 bg-[#FAFBFD]/60 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {isImg ? (
                        <FileImage className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-slate-700 dark:text-slate-300 font-medium truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-shrink-0">
                      {file.dataUrl && (
                        <a
                          href={file.dataUrl}
                          download={file.name}
                          className="p-1.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-600 rounded-lg border border-slate-200 dark:border-slate-600 shadow-xs"
                          title="Скачать файл"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-1.5 bg-white dark:bg-slate-700 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 dark:border-slate-600 shadow-xs"
                        title="Удалить файл"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Нет вложений.</p>
          )}
        </div>
      </div>

      {/* Dangerous/Root operations */}
      {node.parentId !== null && (
        <div className="p-4 border-t border-slate-250/60 dark:border-slate-800 bg-[#FAFBFD]/60">
          <button
            onClick={() => {
              if (confirm('Удалить эту ветку mindmap вместе с дочерними?')) {
                onDeleteNode(node.id);
                onClose();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2 border border-rose-250 dark:border-rose-950 text-rose-600 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Удалить текущую ветвь задач
          </button>
        </div>
      )}
    </aside>
  );
}
