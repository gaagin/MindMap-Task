import React, { useState, useRef, useEffect } from 'react';
import { 
  Filter, 
  ArrowUpDown, 
  Zap, 
  Sparkles, 
  Search, 
  SlidersHorizontal, 
  Plus, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Check, 
  Table, 
  Kanban, 
  Calendar, 
  GanttChart, 
  LayoutGrid, 
  Grid, 
  Smartphone, 
  Network, 
  Star, 
  Trash2, 
  Eye, 
  EyeOff, 
  Copy, 
  Database, 
  FileSpreadsheet, 
  Archive, 
  Columns, 
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Clock,
  Tag as TagIcon,
  CheckCircle2,
  Paperclip,
  FileText,
  User,
  DollarSign,
  Palette,
  ExternalLink
} from 'lucide-react';
import { ViewMode, Priority, TagCategory, TaskNode } from '../types';

export type SortField = 'text' | 'completed' | 'priority' | 'progress' | 'dueDate' | 'startDate' | 'createdAt' | 'pomodoroTotalTime' | 'none';
export type SortOrder = 'asc' | 'desc';

export interface NotionDatabaseBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  
  // Filter states
  filterStatus: string;
  onFilterStatusChange: (status: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (priority: string) => void;
  filterTag: string;
  onFilterTagChange: (tag: string) => void;
  filterDueDate: string;
  onFilterDueDateChange: (dueDate: string) => void;
  filterAttachments: string;
  onFilterAttachmentsChange: (attachments: string) => void;
  filterNotes: string;
  onFilterNotesChange: (notes: string) => void;
  
  // Sort states
  sortField: SortField;
  onSortFieldChange: (field: SortField) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  
  // Search states
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchedCount?: number;
  currentSearchIndex?: number;
  onNextSearchMatch?: () => void;
  onPrevSearchMatch?: () => void;
  
  // Group by
  groupBy?: 'status' | 'category' | 'container' | 'priority' | 'none';
  onGroupByChange?: (groupBy: 'status' | 'category' | 'container' | 'priority' | 'none') => void;
  
  // Action callbacks
  onCreateTask: (text: string, priority?: Priority, tags?: string[], dueDate?: string) => void;
  onOpenSyncModal: () => void;
  onOpenAiConsole: () => void;
  onOpenSidebar?: () => void;
  
  // Split screen
  isSplitScreen?: boolean;
  onToggleSplitScreen?: () => void;
  
  // Focus states
  focusedTaskId?: string | null;
  focusedContainerId?: string | null;
  focusedNode?: TaskNode | null;
  onGoBackOneFocusLevel?: () => void;
  onExitFocus?: () => void;
  onToggleDefaultView?: () => void;
  
  // Tag categories & properties
  tagCategories?: TagCategory[];
  availableTags?: string[];
  
  // Sync status
  isSyncing?: boolean;
  hasSyncError?: boolean;
  
  // Property visibility
  visibleProperties?: Record<string, boolean>;
  onTogglePropertyVisibility?: (propKey: string) => void;
}

export const ALL_VIEW_MODES: { id: ViewMode; name: string; icon: any; notionType: string }[] = [
  { id: 'table', name: 'Таблица', icon: Table, notionType: 'Table' },
  { id: 'kanban', name: 'Доска', icon: Kanban, notionType: 'Board' },
  { id: 'calendar', name: 'Календарь', icon: Calendar, notionType: 'Calendar' },
  { id: 'gantt', name: 'График', icon: GanttChart, notionType: 'Timeline' },
  { id: 'canvas', name: 'Холст', icon: Network, notionType: 'MindMap' },
  { id: 'eisenhower', name: 'Матрица', icon: LayoutGrid, notionType: 'Matrix' },
  { id: 'anydo', name: 'Any.do', icon: Grid, notionType: 'AnyDo' },
  { id: 'mobile-list', name: 'Списки', icon: Smartphone, notionType: 'List' },
];

export const PROPERTY_DEFINITIONS = [
  { id: 'text', name: 'Название (Имя)', icon: FileText, default: true },
  { id: 'status', name: 'Статус выполнения', icon: CheckCircle2, default: true },
  { id: 'priority', name: 'Приоритет', icon: Zap, default: true },
  { id: 'dueDate', name: 'Срок (Дедлайн)', icon: Calendar, default: true },
  { id: 'startDate', name: 'Дата начала', icon: Clock, default: false },
  { id: 'tags', name: 'Теги и категории', icon: TagIcon, default: true },
  { id: 'assignee', name: 'Исполнитель', icon: User, default: true },
  { id: 'progress', name: 'Прогресс %', icon: Check, default: true },
  { id: 'pomodoroTotalTime', name: 'Фокус-время (Помодоро)', icon: Clock, default: false },
  { id: 'files', name: 'Файлы и вложения', icon: Paperclip, default: true },
  { id: 'notes', name: 'Заметки / Описание', icon: FileText, default: true },
  { id: 'budget', name: 'Бюджет / Стоимость', icon: DollarSign, default: false },
];

export default function NotionDatabaseBar({
  viewMode,
  onViewModeChange,
  projectName = 'Проекты',
  projectIcon = '📁',
  onUpdateProjectName,
  filterStatus,
  onFilterStatusChange,
  filterPriority,
  onFilterPriorityChange,
  filterTag,
  onFilterTagChange,
  filterDueDate,
  onFilterDueDateChange,
  filterAttachments,
  onFilterAttachmentsChange,
  filterNotes,
  onFilterNotesChange,
  sortField,
  onSortFieldChange,
  sortOrder,
  onSortOrderChange,
  searchQuery,
  onSearchQueryChange,
  searchedCount = 0,
  currentSearchIndex = 0,
  onNextSearchMatch,
  onPrevSearchMatch,
  groupBy = 'none',
  onGroupByChange,
  onCreateTask,
  onOpenSyncModal,
  onOpenAiConsole,
  onOpenSidebar,
  isSplitScreen = false,
  onToggleSplitScreen,
  focusedTaskId,
  focusedContainerId,
  focusedNode,
  onGoBackOneFocusLevel,
  onExitFocus,
  onToggleDefaultView,
  tagCategories = [],
  availableTags = [],
  isSyncing = false,
  hasSyncError = false,
  visibleProperties = {},
  onTogglePropertyVisibility
}: NotionDatabaseBarProps) {
  // Popover & UI state
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
  const [isSearchInputOpen, setIsSearchInputOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitleText, setEditedTitleText] = useState(projectName);
  const [copiedLinkSuccess, setCopiedLinkSuccess] = useState(false);

  // Submenus inside View Settings modal
  const [activeSettingsSubmenu, setActiveSettingsSubmenu] = useState<'main' | 'layout' | 'properties' | 'filter' | 'sort' | 'group' | 'color'>('main');

  // Active filter popovers inside inline filter bar
  const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);
  const [isAddFilterMenuOpen, setIsAddFilterMenuOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewSettingsRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Count active filters
  const activeFiltersCount = [
    filterStatus !== 'all',
    filterPriority !== 'all',
    filterTag !== 'all',
    filterDueDate !== 'all',
    filterAttachments !== 'all',
    filterNotes !== 'all'
  ].filter(Boolean).length;

  const isAnyFilterActive = activeFiltersCount > 0 || searchQuery.trim().length > 0;
  const isSortingActive = sortField !== 'none' && sortField !== undefined;

  // Auto-open filter bar if any filter is set
  useEffect(() => {
    if (isAnyFilterActive || isSortingActive) {
      setIsFilterBarOpen(true);
    }
  }, [isAnyFilterActive, isSortingActive]);

  // Click away listeners for menus
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (viewSettingsRef.current && !viewSettingsRef.current.contains(target) && !target.closest('#notion-settings-btn')) {
        setIsViewSettingsOpen(false);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(target) && !target.closest('#notion-new-btn')) {
        setIsNewMenuOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(target) && !target.closest('#notion-sort-btn')) {
        setIsSortMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearAllFiltersAndSort = () => {
    onFilterStatusChange('all');
    onFilterPriorityChange('all');
    onFilterTagChange('all');
    onFilterDueDateChange('all');
    onFilterAttachmentsChange('all');
    onFilterNotesChange('all');
    onSortFieldChange('none');
    onSearchQueryChange('');
  };

  const handleCopyViewLink = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', viewMode);
      navigator.clipboard.writeText(url.toString());
      setCopiedLinkSuccess(true);
      setTimeout(() => setCopiedLinkSuccess(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const currentViewObj = ALL_VIEW_MODES.find(v => v.id === viewMode) || ALL_VIEW_MODES[0];
  const CurrentViewIcon = currentViewObj.icon;

  return (
    <div className="w-full shrink-0 flex flex-col bg-white dark:bg-[#191919] border-b border-[#E9E9E7] dark:border-[#2F2F2F] text-[#37352F] dark:text-[#E3E2E0] select-none transition-colors z-20">
      
      {/* 1. FOCUS / BREADCRUMB HEADER (if in task/container focus) */}
      {(focusedTaskId || focusedContainerId) && (
        <div className="px-4 sm:px-6 py-1.5 bg-[#F7F7F5] dark:bg-[#202020] border-b border-[#E9E9E7] dark:border-[#2F2F2F] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#2383E2] animate-pulse" />
            <span className="font-semibold text-[#787774] dark:text-[#9B9A97]">Фокус:</span>
            <span className="font-bold text-[#37352F] dark:text-[#E3E2E0] truncate max-w-xs sm:max-w-md">
              {focusedNode?.text || 'Без названия'}
            </span>
            {focusedNode?.savedFilters && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-500/20">
                ★ сохраненные фильтры
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleDefaultView && (
              <button
                type="button"
                onClick={onToggleDefaultView}
                className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                  focusedNode?.defaultView === viewMode
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/40'
                    : 'text-[#787774] dark:text-[#9B9A97] border-[#E9E9E7] dark:border-[#2F2F2F] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
                }`}
                title="Сделать этот вид видом по умолчанию для этого элемента"
              >
                <Star className={`w-3 h-3 ${focusedNode?.defaultView === viewMode ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span className="hidden sm:inline">{focusedNode?.defaultView === viewMode ? 'По умолчанию' : 'Сделать дефолтным'}</span>
              </button>
            )}
            {onGoBackOneFocusLevel && (
              <button
                type="button"
                onClick={onGoBackOneFocusLevel}
                className="px-2 py-1 rounded bg-[#EFEFED] dark:bg-[#2A2A2A] hover:bg-[#E0E0DE] dark:hover:bg-[#333333] text-[#37352F] dark:text-[#E3E2E0] text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Назад на один уровень"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Назад</span>
              </button>
            )}
            {onExitFocus && (
              <button
                type="button"
                onClick={onExitFocus}
                className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Выйти из режима фокуса"
              >
                <X className="w-3.5 h-3.5" />
                <span>Выйти</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. NOTION MAIN VIEW TABS & DATABASE ACTION BUTTONS */}
      <div className="h-11 px-3 sm:px-6 flex items-center justify-between gap-2 overflow-x-auto invisible-scrollbar">
        
        {/* Left: View Tabs List matching Notion Screenshot 1 */}
        <div className="flex items-center gap-1 overflow-x-auto invisible-scrollbar shrink-0">
          {ALL_VIEW_MODES.map(option => {
            const OptionIcon = option.icon;
            const isSelected = viewMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onViewModeChange(option.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#37352F] dark:text-[#E3E2E0] shadow-2xs'
                    : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
                }`}
              >
                <OptionIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{option.name}</span>
              </button>
            );
          })}

          {/* Plus button to add / switch view */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsViewsMenuOpen(!isViewsMenuOpen)}
              className="p-1 rounded-md text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer"
              title="Добавить или переключить вид"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {isViewsMenuOpen && (
              <div 
                className="absolute top-8 left-0 w-48 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setIsViewsMenuOpen(false)}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                  Режим отображения
                </div>
                {ALL_VIEW_MODES.map(v => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onViewModeChange(v.id)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-[#787774]" />
                        <span>{v.name}</span>
                      </div>
                      {viewMode === v.id && <Check className="w-3 h-3 text-[#2383E2]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Notion Action Icons Toolbar matching Screenshot 1 */}
        <div className="flex items-center gap-1 shrink-0">
          
          {/* 1. Filter Button */}
          <button
            type="button"
            onClick={() => setIsFilterBarOpen(!isFilterBarOpen)}
            className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
              isFilterBarOpen || isAnyFilterActive
                ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title="Фильтры"
          >
            <Filter className="w-3.5 h-3.5" />
            {activeFiltersCount > 0 && (
              <span className="text-[10px] font-bold bg-[#2383E2] text-white rounded-full px-1 leading-tight">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* 2. Sort Button */}
          <div className="relative" ref={sortMenuRef}>
            <button
              id="notion-sort-btn"
              type="button"
              onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
              className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
                isSortingActive || isSortMenuOpen
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
              }`}
              title="Сортировка"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {isSortingActive && (
                <span className="text-[10px] font-bold text-[#2383E2]">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>

            {/* Quick Sort Popover */}
            {isSortMenuOpen && (
              <div className="absolute right-0 top-8 w-56 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider flex items-center justify-between">
                  <span>Сортировка</span>
                  {isSortingActive && (
                    <button
                      type="button"
                      onClick={() => {
                        onSortFieldChange('none');
                        setIsSortMenuOpen(false);
                      }}
                      className="text-rose-500 hover:underline cursor-pointer text-[10px]"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                
                <div className="space-y-0.5 mt-1">
                  {[
                    { id: 'text', label: 'По названию' },
                    { id: 'dueDate', label: 'По сроку (дедлайну)' },
                    { id: 'startDate', label: 'По дате начала' },
                    { id: 'priority', label: 'По приоритету' },
                    { id: 'progress', label: 'По прогрессу' },
                    { id: 'pomodoroTotalTime', label: 'По фокус-времени' },
                  ].map(f => {
                    const isCur = sortField === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          if (isCur) {
                            onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            onSortFieldChange(f.id as SortField);
                            onSortOrderChange('asc');
                          }
                          setIsSortMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                      >
                        <span className={isCur ? 'font-semibold text-[#2383E2]' : ''}>{f.label}</span>
                        {isCur && (
                          <span className="text-[10px] font-bold text-[#2383E2] bg-[#2383E2]/10 px-1 rounded">
                            {sortOrder === 'asc' ? 'А → Я / Возр.' : 'Я → А / Убыв.'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. Automations Button (Sync) */}
          <button
            type="button"
            onClick={onOpenSyncModal}
            className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
              isSyncing
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title="Автоматизации и синхронизация (Google Sheets / Cloud)"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>

          {/* 4. AI Autofill Button */}
          <button
            type="button"
            onClick={onOpenAiConsole}
            className="p-1.5 rounded-md flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer"
            title="AI Автозаполнение и ассистент (Gemini)"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* 5. Search Button */}
          <button
            type="button"
            onClick={() => {
              setIsSearchInputOpen(!isSearchInputOpen);
              if (!isSearchInputOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
            className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
              isSearchInputOpen || searchQuery.trim().length > 0
                ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title="Поиск"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* 6. Notion View Settings Button (Screenshot 3) */}
          <button
            id="notion-settings-btn"
            type="button"
            onClick={() => {
              setIsViewSettingsOpen(!isViewSettingsOpen);
              setActiveSettingsSubmenu('main');
            }}
            className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
              isViewSettingsOpen
                ? 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#37352F] dark:text-[#E3E2E0]'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title="Параметры и настройки вида"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* 7. Notion Blue "New ∨" Button */}
          <div className="relative ml-1" ref={newMenuRef}>
            <div className="flex items-center rounded-md bg-[#2383E2] hover:bg-[#1D74C6] text-white shadow-2xs overflow-hidden transition-colors">
              <button
                id="notion-new-btn"
                type="button"
                onClick={() => onCreateTask('Новая задача', 'none')}
                className="px-2.5 py-1 text-xs font-semibold hover:bg-black/10 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>New</span>
              </button>
              <button
                type="button"
                onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                className="px-1 py-1 hover:bg-black/15 transition-colors cursor-pointer border-l border-white/20"
                title="Шаблоны создания"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Template creation menu */}
            {isNewMenuOpen && (
              <div className="absolute right-0 top-8 w-56 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                  Создать элемент
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onCreateTask('Новая задача', 'none');
                    setIsNewMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2383E2]" />
                  <span>Обычная задача</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateTask('Срочная цель', 'urgent');
                    setIsNewMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-rose-500" />
                  <span>Срочная задача (⚡)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    onCreateTask('Задача на сегодня', 'medium', [], todayStr);
                    setIsNewMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>Задача на сегодня (📅)</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 3. NOTION INLINE FILTER & SORT BAR (Screenshot 2) */}
      {(isFilterBarOpen || isSearchInputOpen || isAnyFilterActive || isSortingActive) && (
        <div className="px-3 sm:px-6 py-1.5 bg-white dark:bg-[#191919] border-t border-[#E9E9E7] dark:border-[#2F2F2F] flex flex-wrap items-center gap-1.5 text-xs animate-in slide-in-from-top-1 duration-150">
          
          {/* Active Sort Pills */}
          {isSortingActive && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-0.5 rounded bg-[#2383E2]/10 hover:bg-[#2383E2]/20 text-[#2383E2] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                title="Нажмите для смены направления сортировки"
              >
                <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                <span>
                  {sortField === 'text' && 'По названию'}
                  {sortField === 'dueDate' && 'По сроку'}
                  {sortField === 'startDate' && 'По дате начала'}
                  {sortField === 'priority' && 'По приоритету'}
                  {sortField === 'progress' && 'По прогрессу'}
                  {sortField === 'pomodoroTotalTime' && 'По фокус-времени'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              <button
                type="button"
                onClick={() => onSortFieldChange('none')}
                className="p-0.5 text-[#787774] hover:text-rose-500 rounded cursor-pointer"
                title="Удалить сортировку"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Divider between sort and filter if sorting is active */}
          {isSortingActive && (
            <div className="h-4 w-px bg-[#E9E9E7] dark:bg-[#2F2F2F] mx-0.5" />
          )}

          {/* Filter: Status Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveFilterPopover(activeFilterPopover === 'status' ? null : 'status')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterStatus !== 'all'
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>
                {filterStatus === 'all' && 'Статус'}
                {filterStatus === 'active' && 'Статус: Активные'}
                {filterStatus === 'completed' && 'Статус: Выполненные'}
                {filterStatus === 'archived' && 'Статус: 📦 Архив'}
                {filterStatus === 'not_tasks' && 'Статус: 🚫 Не-задачи'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeFilterPopover === 'status' && (
              <div 
                className="absolute left-0 top-7 w-48 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 text-xs"
                onClick={() => setActiveFilterPopover(null)}
              >
                {[
                  { id: 'all', label: 'Все разделы' },
                  { id: 'active', label: 'Активные задачи' },
                  { id: 'completed', label: 'Выполненные' },
                  { id: 'archived', label: '📦 Архивные' },
                  { id: 'not_tasks', label: '🚫 Не-задачи' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFilterStatusChange(item.id)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <span>{item.label}</span>
                    {filterStatus === item.id && <Check className="w-3 h-3 text-[#2383E2]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter: Priority Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveFilterPopover(activeFilterPopover === 'priority' ? null : 'priority')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterPriority !== 'all'
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>
                {filterPriority === 'all' && 'Приоритет'}
                {filterPriority === 'none' && 'Приоритет: Без'}
                {filterPriority === 'low' && 'Приоритет: Низкий'}
                {filterPriority === 'medium' && 'Приоритет: Средний'}
                {filterPriority === 'high' && 'Приоритет: Высокий'}
                {filterPriority === 'urgent' && 'Приоритет: Критический'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeFilterPopover === 'priority' && (
              <div 
                className="absolute left-0 top-7 w-48 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 text-xs"
                onClick={() => setActiveFilterPopover(null)}
              >
                {[
                  { id: 'all', label: 'Все приоритеты' },
                  { id: 'urgent', label: '⚡ Критический' },
                  { id: 'high', label: '🔴 Высокий' },
                  { id: 'medium', label: '🟡 Средний' },
                  { id: 'low', label: '🔵 Низкий' },
                  { id: 'none', label: '⚪ Без приоритета' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFilterPriorityChange(item.id)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <span>{item.label}</span>
                    {filterPriority === item.id && <Check className="w-3 h-3 text-[#2383E2]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter: Tags Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveFilterPopover(activeFilterPopover === 'tags' ? null : 'tags')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterTag !== 'all'
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <TagIcon className="w-3 h-3" />
              <span>{filterTag === 'all' ? 'Теги' : `#${filterTag}`}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeFilterPopover === 'tags' && (
              <div 
                className="absolute left-0 top-7 w-52 max-h-64 overflow-y-auto bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 text-xs"
                onClick={() => setActiveFilterPopover(null)}
              >
                <button
                  type="button"
                  onClick={() => onFilterTagChange('all')}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                >
                  <span>Все теги</span>
                  {filterTag === 'all' && <Check className="w-3 h-3 text-[#2383E2]" />}
                </button>
                {tagCategories.map(cat => (
                  <div key={cat.id} className="pt-1">
                    <div className="px-2 py-0.5 text-[9px] font-bold uppercase text-[#787774]" style={{ color: cat.color }}>
                      {cat.name}
                    </div>
                    {(cat.tags || []).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onFilterTagChange(t)}
                        className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                      >
                        <span>#{t}</span>
                        {filterTag === t && <Check className="w-3 h-3 text-[#2383E2]" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filter: Due Date Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveFilterPopover(activeFilterPopover === 'dueDate' ? null : 'dueDate')}
              className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterDueDate !== 'all'
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>
                {filterDueDate === 'all' && 'Срок'}
                {filterDueDate === 'overdue' && 'Срок: Просрочено'}
                {filterDueDate === 'today' && 'Срок: Сегодня'}
                {filterDueDate === 'this_week' && 'Срок: На неделе'}
                {filterDueDate === 'has_due_date' && 'Срок: Есть'}
                {filterDueDate === 'no_due_date' && 'Срок: Нет'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeFilterPopover === 'dueDate' && (
              <div 
                className="absolute left-0 top-7 w-48 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 text-xs"
                onClick={() => setActiveFilterPopover(null)}
              >
                {[
                  { id: 'all', label: 'Любой срок' },
                  { id: 'overdue', label: '⚠️ Просрочено' },
                  { id: 'today', label: '📅 Сегодня' },
                  { id: 'this_week', label: '📆 На этой неделе' },
                  { id: 'has_due_date', label: 'С дедлайном' },
                  { id: 'no_due_date', label: 'Без дедлайна' },
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFilterDueDateChange(item.id)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <span>{item.label}</span>
                    {filterDueDate === item.id && <Check className="w-3 h-3 text-[#2383E2]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Filter / More Filters Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAddFilterMenuOpen(!isAddFilterMenuOpen)}
              className="px-2 py-0.5 rounded text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Filter</span>
            </button>

            {isAddFilterMenuOpen && (
              <div 
                className="absolute left-0 top-7 w-48 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 text-xs"
                onClick={() => setIsAddFilterMenuOpen(false)}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                  Фильтровать по свойству
                </div>
                <button
                  type="button"
                  onClick={() => setActiveFilterPopover('status')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Статус</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterPopover('priority')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Приоритет</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterPopover('tags')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <TagIcon className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Теги</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilterPopover('dueDate')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Срок</span>
                </button>
                <button
                  type="button"
                  onClick={() => onFilterAttachmentsChange(filterAttachments === 'has_files' ? 'all' : 'has_files')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Вложения / Файлы</span>
                </button>
                <button
                  type="button"
                  onClick={() => onFilterNotesChange(filterNotes === 'has_notes' ? 'all' : 'has_notes')}
                  className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#787774]" />
                  <span>Заметки</span>
                </button>
              </div>
            )}
          </div>

          {/* Inline Search Input Bar */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Поиск по задачам..."
                className="pl-7 pr-6 py-0.5 text-xs bg-[#F7F7F5] dark:bg-[#202020] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] focus:bg-white dark:focus:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2383E2] text-[#37352F] dark:text-[#E3E2E0] placeholder-[#787774] transition-all w-32 sm:w-48"
              />
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange('')}
                  className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F] rounded cursor-pointer"
                  title="Очистить поиск"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Clear All Filters Button */}
            {(isAnyFilterActive || isSortingActive) && (
              <button
                type="button"
                onClick={handleClearAllFiltersAndSort}
                className="text-[11px] text-rose-500 hover:text-rose-600 hover:underline px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                title="Сбросить все фильтры и сортировку"
              >
                Сбросить
              </button>
            )}
          </div>

        </div>
      )}

      {/* 4. NOTION "VIEW SETTINGS" POPUP MODAL / DRAWER (Screenshot 3) */}
      {isViewSettingsOpen && (
        <div 
          ref={viewSettingsRef}
          className="absolute right-3 sm:right-6 top-12 w-80 max-h-[85vh] overflow-y-auto bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-xl shadow-2xl z-50 text-xs text-[#37352F] dark:text-[#E3E2E0] animate-in fade-in zoom-in-95 duration-150 p-2 select-none"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
            <span className="font-semibold text-xs text-[#37352F] dark:text-[#E3E2E0]">
              {activeSettingsSubmenu === 'main' ? 'View settings' : (
                <button 
                  type="button" 
                  onClick={() => setActiveSettingsSubmenu('main')}
                  className="flex items-center gap-1 text-[#2383E2] hover:underline cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Назад</span>
                </button>
              )}
            </span>
            <button
              type="button"
              onClick={() => setIsViewSettingsOpen(false)}
              className="p-1 text-[#787774] hover:text-[#37352F] dark:hover:text-[#E3E2E0] rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeSettingsSubmenu === 'main' && (
            <div className="space-y-1">
              {/* Active View Title row */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] mb-2">
                <CurrentViewIcon className="w-4 h-4 text-[#2383E2] shrink-0" />
                <span className="font-semibold truncate flex-1">{currentViewObj.name}</span>
                <span className="text-[10px] text-[#787774] bg-[#EFEFED] dark:bg-[#2A2A2A] px-1.5 py-0.5 rounded font-mono">
                  {currentViewObj.notionType}
                </span>
              </div>

              {/* Layout Switcher row */}
              <button
                type="button"
                onClick={() => setActiveSettingsSubmenu('layout')}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CurrentViewIcon className="w-4 h-4 text-[#787774]" />
                  <span>Layout</span>
                </div>
                <div className="flex items-center gap-1 text-[#787774]">
                  <span>{currentViewObj.notionType}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Property Visibility row */}
              <button
                type="button"
                onClick={() => setActiveSettingsSubmenu('properties')}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#787774]" />
                  <span>Property visibility</span>
                </div>
                <div className="flex items-center gap-1 text-[#787774]">
                  <span>
                    {PROPERTY_DEFINITIONS.filter(p => visibleProperties[p.id] !== false).length}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Filter row */}
              <button
                type="button"
                onClick={() => {
                  setIsFilterBarOpen(true);
                  setIsViewSettingsOpen(false);
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#787774]" />
                  <span>Filter</span>
                </div>
                <div className="flex items-center gap-1 text-[#787774]">
                  <span>{activeFiltersCount > 0 ? `${activeFiltersCount} active` : ''}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Sort row */}
              <button
                type="button"
                onClick={() => setActiveSettingsSubmenu('sort')}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-[#787774]" />
                  <span>Sort</span>
                </div>
                <div className="flex items-center gap-1 text-[#787774]">
                  <span>{isSortingActive ? sortField : ''}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Group row */}
              {onGroupByChange && (
                <button
                  type="button"
                  onClick={() => setActiveSettingsSubmenu('group')}
                  className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Grid className="w-4 h-4 text-[#787774]" />
                    <span>Group</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#787774]">
                    <span>{groupBy !== 'none' ? groupBy : ''}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              )}

              {/* Copy link to view */}
              <button
                type="button"
                onClick={handleCopyViewLink}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-[#787774]" />
                  <span>Copy link to view</span>
                </div>
                {copiedLinkSuccess && (
                  <span className="text-[10px] text-emerald-500 font-semibold">Скопировано!</span>
                )}
              </button>

              {/* Section Separator: Data source settings */}
              <div className="pt-3 pb-1 px-2 text-[10px] font-bold text-[#787774] uppercase tracking-wider border-t border-[#E9E9E7] dark:border-[#2F2F2F] mt-2">
                Data source settings
              </div>

              {/* Source (Project Name) */}
              <div className="px-2 py-1.5 rounded flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#787774]" />
                  <span>Source</span>
                </div>
                <span className="font-semibold text-[#2383E2] truncate max-w-[120px]">
                  {projectName}
                </span>
              </div>

              {/* Automations */}
              <button
                type="button"
                onClick={() => {
                  onOpenSyncModal();
                  setIsViewSettingsOpen(false);
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#787774]" />
                  <span>Automations & Sync</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#787774]" />
              </button>

              {/* AI Autofill */}
              <button
                type="button"
                onClick={() => {
                  onOpenAiConsole();
                  setIsViewSettingsOpen(false);
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>AI Autofill</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#787774]" />
              </button>

              {/* Split Screen Toggle */}
              {onToggleSplitScreen && (
                <button
                  type="button"
                  onClick={onToggleSplitScreen}
                  className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Columns className="w-4 h-4 text-[#787774]" />
                    <span>Split Screen</span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSplitScreen ? 'bg-indigo-600 text-white' : 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#787774]'}`}>
                    {isSplitScreen ? '2 Screens' : '1 Screen'}
                  </span>
                </button>
              )}

              {/* View Archived Pages */}
              <button
                type="button"
                onClick={() => {
                  onFilterStatusChange(filterStatus === 'archived' ? 'all' : 'archived');
                  setIsViewSettingsOpen(false);
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer text-amber-600 dark:text-amber-400"
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  <span>View archived pages</span>
                </div>
                {filterStatus === 'archived' && <Check className="w-3.5 h-3.5 text-amber-500" />}
              </button>
            </div>
          )}

          {/* Submenu: Layout Selection */}
          {activeSettingsSubmenu === 'layout' && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                Выберите вид отображения
              </div>
              {ALL_VIEW_MODES.map(v => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onViewModeChange(v.id);
                      setActiveSettingsSubmenu('main');
                    }}
                    className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-[#787774]" />
                      <span className={viewMode === v.id ? 'font-semibold text-[#2383E2]' : ''}>
                        {v.name} ({v.notionType})
                      </span>
                    </div>
                    {viewMode === v.id && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Submenu: Property Visibility */}
          {activeSettingsSubmenu === 'properties' && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                Видимость свойств карточек / столбцов
              </div>
              {PROPERTY_DEFINITIONS.map(prop => {
                const isVisible = visibleProperties[prop.id] !== false;
                const Icon = prop.icon;
                return (
                  <button
                    key={prop.id}
                    type="button"
                    onClick={() => onTogglePropertyVisibility && onTogglePropertyVisibility(prop.id)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-[#787774]" />
                      <span className={isVisible ? 'font-medium' : 'text-[#787774] line-through'}>
                        {prop.name}
                      </span>
                    </div>
                    {isVisible ? (
                      <Eye className="w-3.5 h-3.5 text-[#2383E2]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#787774]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Submenu: Sort Options */}
          {activeSettingsSubmenu === 'sort' && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider flex items-center justify-between">
                <span>Сортировка</span>
                {isSortingActive && (
                  <button
                    type="button"
                    onClick={() => {
                      onSortFieldChange('none');
                      setActiveSettingsSubmenu('main');
                    }}
                    className="text-rose-500 text-[10px] hover:underline"
                  >
                    Сбросить
                  </button>
                )}
              </div>
              {[
                { id: 'text', label: 'По названию' },
                { id: 'dueDate', label: 'По сроку (дедлайну)' },
                { id: 'startDate', label: 'По дате начала' },
                { id: 'priority', label: 'По приоритету' },
                { id: 'progress', label: 'По прогрессу' },
                { id: 'pomodoroTotalTime', label: 'По фокус-времени' },
              ].map(f => {
                const isCur = sortField === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (isCur) {
                        onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        onSortFieldChange(f.id as SortField);
                        onSortOrderChange('asc');
                      }
                      setActiveSettingsSubmenu('main');
                    }}
                    className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                  >
                    <span className={isCur ? 'font-semibold text-[#2383E2]' : ''}>{f.label}</span>
                    {isCur && (
                      <span className="text-[10px] font-bold text-[#2383E2] bg-[#2383E2]/10 px-1 rounded">
                        {sortOrder === 'asc' ? 'А → Я' : 'Я → А'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Submenu: Group Options */}
          {activeSettingsSubmenu === 'group' && onGroupByChange && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider">
                Группировка
              </div>
              {[
                { id: 'none', label: 'Без группировки' },
                { id: 'status', label: 'По статусу выполнения' },
                { id: 'priority', label: 'По приоритету' },
                { id: 'category', label: 'По категориям / тегам' },
                { id: 'container', label: 'По контейнерам / разделам' },
              ].map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onGroupByChange(g.id as any);
                    setActiveSettingsSubmenu('main');
                  }}
                  className="w-full text-left px-2 py-2 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                >
                  <span className={groupBy === g.id ? 'font-semibold text-[#2383E2]' : ''}>{g.label}</span>
                  {groupBy === g.id && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                </button>
              ))}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
