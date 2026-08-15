import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  ExternalLink,
  PanelLeft,
  Box,
  Boxes,
  Layers,
  FolderOpen
} from 'lucide-react';
import { ViewMode, Priority, TagCategory, TaskNode } from '../types';

export type SortField = 'text' | 'completed' | 'priority' | 'progress' | 'dueDate' | 'startDate' | 'createdAt' | 'pomodoroTotalTime' | 'none';
export type SortOrder = 'asc' | 'desc';

export interface AreaOption {
  id: string;
  name: string;
  isContainer?: boolean;
  isWorkflow?: boolean;
  isEquipment?: boolean;
  count?: number;
}

export interface NotionDatabaseBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  
  // Sidebar states
  isSidebarOpen?: boolean;
  onOpenSidebar?: () => void;
  onToggleSidebar?: () => void;
  
  // Filter states
  filterStatus: string;
  onFilterStatusChange: (status: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (priority: string) => void;
  filterTag: string;
  onFilterTagChange: (tag: string) => void;
  filterArea?: string;
  onFilterAreaChange?: (area: string) => void;
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
  
  // Tag categories, available tags & areas
  tagCategories?: TagCategory[];
  allProjectTags?: string[];
  availableAreas?: AreaOption[];
  
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
  { id: 'area', name: 'Область / Контейнер', icon: Box, default: true },
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
  isSidebarOpen = false,
  onOpenSidebar,
  onToggleSidebar,
  filterStatus,
  onFilterStatusChange,
  filterPriority,
  onFilterPriorityChange,
  filterTag,
  onFilterTagChange,
  filterArea = 'all',
  onFilterAreaChange,
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
  isSplitScreen = false,
  onToggleSplitScreen,
  focusedTaskId,
  focusedContainerId,
  focusedNode,
  onGoBackOneFocusLevel,
  onExitFocus,
  onToggleDefaultView,
  tagCategories = [],
  allProjectTags = [],
  availableAreas = [],
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
  const [copiedLinkSuccess, setCopiedLinkSuccess] = useState(false);

  // Submenus inside View Settings modal
  const [activeSettingsSubmenu, setActiveSettingsSubmenu] = useState<'main' | 'layout' | 'properties' | 'filter' | 'sort' | 'group' | 'color'>('main');

  // Active filter popovers inside inline filter bar
  const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);
  const [isAddFilterMenuOpen, setIsAddFilterMenuOpen] = useState(false);

  // Instant search queries for inside popovers
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const [prioritySearchQuery, setPrioritySearchQuery] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [areaSearchQuery, setAreaSearchQuery] = useState('');
  const [dueSearchQuery, setDueSearchQuery] = useState('');
  const [sortSearchQuery, setSortSearchQuery] = useState('');
  const [addFilterSearchQuery, setAddFilterSearchQuery] = useState('');
  const [propSearchQuery, setPropSearchQuery] = useState('');
  const [layoutSearchQuery, setLayoutSearchQuery] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewSettingsRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Count active filters
  const activeFiltersCount = [
    filterStatus !== 'all',
    filterPriority !== 'all',
    filterTag !== 'all',
    filterArea !== 'all',
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
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target) && !target.closest('.notion-filter-pill')) {
        setActiveFilterPopover(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearAllFiltersAndSort = () => {
    onFilterStatusChange('all');
    onFilterPriorityChange('all');
    onFilterTagChange('all');
    if (onFilterAreaChange) onFilterAreaChange('all');
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

  // Selected area info
  const selectedAreaObj = useMemo(() => {
    if (!filterArea || filterArea === 'all') return null;
    if (filterArea === 'root') return { id: 'root', name: 'Корень (без области)', count: 0 };
    return availableAreas.find(a => a.id === filterArea) || null;
  }, [filterArea, availableAreas]);

  // All combined tags list filtered by tagSearchQuery
  const processedTags = useMemo(() => {
    const query = tagSearchQuery.trim().toLowerCase();
    
    // Group categorized tags
    const categorizedGroups: { category: TagCategory; tags: string[] }[] = [];
    const usedTagSet = new Set<string>();

    tagCategories.forEach(cat => {
      const matched = (cat.tags || []).filter(t => {
        if (!t) return false;
        if (!query) return true;
        return t.toLowerCase().includes(query) || cat.name.toLowerCase().includes(query);
      });
      if (matched.length > 0) {
        categorizedGroups.push({ category: cat, tags: matched });
        matched.forEach(t => usedTagSet.add(t));
      }
    });

    // Uncategorized / all remaining tags
    const otherTags = allProjectTags.filter(t => {
      if (!t) return false;
      if (usedTagSet.has(t)) return false;
      if (!query) return true;
      return t.toLowerCase().includes(query);
    });

    return { categorizedGroups, otherTags };
  }, [tagCategories, allProjectTags, tagSearchQuery]);

  // Filtered areas by areaSearchQuery
  const filteredAreas = useMemo(() => {
    const q = areaSearchQuery.trim().toLowerCase();
    if (!q) return availableAreas;
    return availableAreas.filter(a => a.name.toLowerCase().includes(q));
  }, [availableAreas, areaSearchQuery]);

  // Filtered statuses
  const statusOptions = [
    { id: 'all', label: 'Все статусы' },
    { id: 'active', label: 'Активные задачи' },
    { id: 'completed', label: 'Выполненные' },
    { id: 'archived', label: '📦 Архивные' },
    { id: 'not_tasks', label: '🚫 Не-задачи' },
  ];
  const filteredStatuses = statusOptions.filter(s => 
    !statusSearchQuery || s.label.toLowerCase().includes(statusSearchQuery.toLowerCase())
  );

  // Filtered priorities
  const priorityOptions = [
    { id: 'all', label: 'Все приоритеты' },
    { id: 'urgent', label: '⚡ Критический' },
    { id: 'high', label: '🔴 Высокий' },
    { id: 'medium', label: '🟡 Средний' },
    { id: 'low', label: '🔵 Низкий' },
    { id: 'none', label: '⚪ Без приоритета' },
  ];
  const filteredPriorities = priorityOptions.filter(p => 
    !prioritySearchQuery || p.label.toLowerCase().includes(prioritySearchQuery.toLowerCase())
  );

  // Filtered due dates
  const dueDateOptions = [
    { id: 'all', label: 'Любой срок' },
    { id: 'overdue', label: '⚠️ Просрочено' },
    { id: 'today', label: '📅 Сегодня' },
    { id: 'this_week', label: '📆 На этой неделе' },
    { id: 'has_due_date', label: 'С дедлайном' },
    { id: 'no_due_date', label: 'Без дедлайна' },
  ];
  const filteredDueDates = dueDateOptions.filter(d => 
    !dueSearchQuery || d.label.toLowerCase().includes(dueSearchQuery.toLowerCase())
  );

  // Filtered sort fields
  const sortOptions = [
    { id: 'text', label: 'По названию' },
    { id: 'dueDate', label: 'По сроку (дедлайну)' },
    { id: 'startDate', label: 'По дате начала' },
    { id: 'priority', label: 'По приоритету' },
    { id: 'progress', label: 'По прогрессу' },
    { id: 'pomodoroTotalTime', label: 'По фокус-времени' },
  ];
  const filteredSortOptions = sortOptions.filter(s => 
    !sortSearchQuery || s.label.toLowerCase().includes(sortSearchQuery.toLowerCase())
  );

  // Add filter items
  const addFilterOptions = [
    { id: 'area', label: 'Область / Контейнер', icon: Box },
    { id: 'tags', label: 'Теги', icon: TagIcon },
    { id: 'status', label: 'Статус', icon: CheckCircle2 },
    { id: 'priority', label: 'Приоритет', icon: Zap },
    { id: 'dueDate', label: 'Срок (дедлайн)', icon: Calendar },
    { id: 'files', label: 'Вложения / Файлы', icon: Paperclip },
    { id: 'notes', label: 'Заметки', icon: FileText },
  ];
  const filteredAddFilterOptions = addFilterOptions.filter(f => 
    !addFilterSearchQuery || f.label.toLowerCase().includes(addFilterSearchQuery.toLowerCase())
  );

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
      <div className="h-11 px-2.5 sm:px-4 flex items-center justify-between gap-2 overflow-x-auto invisible-scrollbar">
        
        {/* Left: Sidebar Toggle + Project title + View Tabs List */}
        <div className="flex items-center gap-1 overflow-x-auto invisible-scrollbar shrink-0">
          
          {/* Main Left Sidebar Toggle Button */}
          <button
            type="button"
            onClick={onToggleSidebar || onOpenSidebar}
            className={`p-1.5 rounded-md flex items-center gap-1.5 text-xs transition-colors cursor-pointer mr-1 shrink-0 ${
              isSidebarOpen
                ? 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#37352F] dark:text-[#E3E2E0] font-semibold ring-1 ring-[#2383E2]/30'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title={isSidebarOpen ? "Скрыть главную левую панель (меню)" : "Открыть главную левую панель (меню)"}
          >
            <PanelLeft className="w-4 h-4 text-[#2383E2] dark:text-[#2383E2]" />
            <span className="hidden md:inline font-semibold text-xs text-slate-800 dark:text-slate-200">Панель</span>
          </button>

          <div className="h-4 w-px bg-[#E9E9E7] dark:bg-[#2F2F2F] mx-0.5 shrink-0" />

          {/* View Modes Tabs */}
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
                    ? 'bg-[#EFEFED] dark:bg-[#2A2A2A] text-[#37352F] dark:text-[#E3E2E0] shadow-2xs font-semibold'
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
                className="absolute top-8 left-0 w-52 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150"
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

        {/* Right: Notion Action Icons Toolbar */}
        <div className="flex items-center gap-1 shrink-0">
          
          {/* 1. Filter Button */}
          <button
            type="button"
            onClick={() => setIsFilterBarOpen(!isFilterBarOpen)}
            className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
              isFilterBarOpen || isAnyFilterActive
                ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/20'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
            }`}
            title="Фильтры"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="text-[10px] font-bold bg-[#2383E2] text-white rounded-full px-1.5 py-0.2 leading-tight">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* 2. Sort Button */}
          <div className="relative" ref={sortMenuRef}>
            <button
              id="notion-sort-btn"
              type="button"
              onClick={() => {
                setIsSortMenuOpen(!isSortMenuOpen);
                setSortSearchQuery('');
              }}
              className={`p-1.5 rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer ${
                isSortingActive || isSortMenuOpen
                  ? 'bg-[#2383E2]/10 text-[#2383E2] font-semibold'
                  : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0]'
              }`}
              title="Сортировка"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Сортировка</span>
              {isSortingActive && (
                <span className="text-[10px] font-bold text-[#2383E2]">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>

            {/* Quick Sort Popover with Search */}
            {isSortMenuOpen && (
              <div className="absolute right-0 top-8 w-60 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1 text-[10px] font-bold text-[#787774] uppercase tracking-wider flex items-center justify-between border-b border-[#E9E9E7] dark:border-[#2F2F2F] pb-1.5">
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

                {/* Instant Search inside Sort popover */}
                <div className="p-1 my-1">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={sortSearchQuery}
                      onChange={(e) => setSortSearchQuery(e.target.value)}
                      placeholder="Поиск поля..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {sortSearchQuery && (
                      <button onClick={() => setSortSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
                  {filteredSortOptions.map(f => {
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

          {/* 6. Notion View Settings Button */}
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

      {/* 3. NOTION INLINE FILTER & SORT BAR WITH INSTANT SEARCH IN ALL POPOVERS */}
      {(isFilterBarOpen || isSearchInputOpen || isAnyFilterActive || isSortingActive) && (
        <div className="px-3 sm:px-6 py-1.5 bg-white dark:bg-[#191919] border-t border-[#E9E9E7] dark:border-[#2F2F2F] flex flex-wrap items-center gap-1.5 text-xs animate-in slide-in-from-top-1 duration-150 relative">
          
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

          {/* Filter: Areas / Containers Pill ("Фильтр по областям") */}
          {onFilterAreaChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setActiveFilterPopover(activeFilterPopover === 'area' ? null : 'area');
                  setAreaSearchQuery('');
                }}
                className={`notion-filter-pill px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                  filterArea !== 'all'
                    ? 'bg-[#2383E2]/15 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/30'
                    : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
                }`}
              >
                <Box className="w-3 h-3 text-[#2383E2]" />
                <span className="truncate max-w-[140px]">
                  {filterArea === 'all' && 'Область'}
                  {filterArea === 'root' && 'Область: Корень'}
                  {selectedAreaObj && `Область: ${selectedAreaObj.name}`}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* Area Filter Popover with Instant Search */}
              {activeFilterPopover === 'area' && (
                <div 
                  ref={filterPopoverRef}
                  className="absolute left-0 top-7 w-64 max-h-72 overflow-y-auto bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] sticky top-0 bg-white dark:bg-[#202020] z-10">
                    <div className="relative flex items-center">
                      <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={areaSearchQuery}
                        onChange={(e) => setAreaSearchQuery(e.target.value)}
                        placeholder="Поиск области / контейнера..."
                        className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                      />
                      {areaSearchQuery && (
                        <button onClick={() => setAreaSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onFilterAreaChange('all');
                        setActiveFilterPopover(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Boxes className="w-3.5 h-3.5 text-[#787774]" />
                        <span>Все области</span>
                      </div>
                      {filterArea === 'all' && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onFilterAreaChange('root');
                        setActiveFilterPopover(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">🌐</span>
                        <span>Корень (без области/контейнера)</span>
                      </div>
                      {filterArea === 'root' && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                    </button>

                    {filteredAreas.length > 0 ? (
                      filteredAreas.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            onFilterAreaChange(a.id);
                            setActiveFilterPopover(null);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 pr-1">
                            <span className="shrink-0">{a.isContainer ? '📦' : a.isWorkflow ? '📐' : a.isEquipment ? '⚙️' : '📁'}</span>
                            <span className="truncate">{a.name}</span>
                            {a.count !== undefined && (
                              <span className="text-[10px] text-[#787774] font-mono shrink-0">({a.count})</span>
                            )}
                          </div>
                          {filterArea === a.id && <Check className="w-3.5 h-3.5 text-[#2383E2] shrink-0" />}
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-2 text-xs text-[#787774] italic">
                        Области не найдены
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filter: Tags Pill (With ALL tags + Instant Search) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setActiveFilterPopover(activeFilterPopover === 'tags' ? null : 'tags');
                setTagSearchQuery('');
              }}
              className={`notion-filter-pill px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterTag !== 'all'
                  ? 'bg-[#2383E2]/15 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/30'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <TagIcon className="w-3 h-3 text-[#2383E2]" />
              <span className="truncate max-w-[120px]">{filterTag === 'all' ? 'Теги' : `#${filterTag}`}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Tags Filter Popover with Instant Search & All Tags */}
            {activeFilterPopover === 'tags' && (
              <div 
                ref={filterPopoverRef}
                className="absolute left-0 top-7 w-64 max-h-72 overflow-y-auto bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] sticky top-0 bg-white dark:bg-[#202020] z-10">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={tagSearchQuery}
                      onChange={(e) => setTagSearchQuery(e.target.value)}
                      placeholder="Поиск тега..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {tagSearchQuery && (
                      <button onClick={() => setTagSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onFilterTagChange('all');
                      setActiveFilterPopover(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer font-semibold"
                  >
                    <span>Все теги</span>
                    {filterTag === 'all' && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                  </button>

                  {/* Categorized tag groups */}
                  {processedTags.categorizedGroups.map(group => (
                    <div key={group.category.id} className="pt-1 border-t border-[#E9E9E7] dark:border-[#2F2F2F]">
                      <div className="px-2 py-0.5 text-[9.5px] font-bold uppercase flex items-center gap-1" style={{ color: group.category.color || '#2383E2' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.category.color || '#2383E2' }} />
                        <span>{group.category.name}</span>
                      </div>
                      <div className="space-y-0.5">
                        {group.tags.map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              onFilterTagChange(t);
                              setActiveFilterPopover(null);
                            }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                          >
                            <span className={filterTag === t ? 'font-bold text-[#2383E2]' : ''}>#{t}</span>
                            {filterTag === t && <Check className="w-3 h-3 text-[#2383E2]" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* All other uncategorized tags */}
                  {processedTags.otherTags.length > 0 && (
                    <div className="pt-1 border-t border-[#E9E9E7] dark:border-[#2F2F2F]">
                      <div className="px-2 py-0.5 text-[9.5px] font-bold uppercase text-[#787774]">
                        {processedTags.categorizedGroups.length > 0 ? 'Все остальные теги' : 'Теги задач'}
                      </div>
                      <div className="space-y-0.5">
                        {processedTags.otherTags.map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              onFilterTagChange(t);
                              setActiveFilterPopover(null);
                            }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                          >
                            <span className={filterTag === t ? 'font-bold text-[#2383E2]' : ''}>#{t}</span>
                            {filterTag === t && <Check className="w-3 h-3 text-[#2383E2]" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {processedTags.categorizedGroups.length === 0 && processedTags.otherTags.length === 0 && (
                    <div className="text-center py-2 text-xs text-[#787774] italic">
                      Теги не найдены
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Filter: Status Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setActiveFilterPopover(activeFilterPopover === 'status' ? null : 'status');
                setStatusSearchQuery('');
              }}
              className={`notion-filter-pill px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterStatus !== 'all'
                  ? 'bg-[#2383E2]/15 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/30'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-[#2383E2]" />
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
                ref={filterPopoverRef}
                className="absolute left-0 top-7 w-52 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={statusSearchQuery}
                      onChange={(e) => setStatusSearchQuery(e.target.value)}
                      placeholder="Поиск статуса..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {statusSearchQuery && (
                      <button onClick={() => setStatusSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {filteredStatuses.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onFilterStatusChange(item.id);
                        setActiveFilterPopover(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {filterStatus === item.id && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter: Priority Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setActiveFilterPopover(activeFilterPopover === 'priority' ? null : 'priority');
                setPrioritySearchQuery('');
              }}
              className={`notion-filter-pill px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterPriority !== 'all'
                  ? 'bg-[#2383E2]/15 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/30'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <Zap className="w-3 h-3 text-[#2383E2]" />
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
                ref={filterPopoverRef}
                className="absolute left-0 top-7 w-52 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={prioritySearchQuery}
                      onChange={(e) => setPrioritySearchQuery(e.target.value)}
                      placeholder="Поиск приоритета..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {prioritySearchQuery && (
                      <button onClick={() => setPrioritySearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {filteredPriorities.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onFilterPriorityChange(item.id);
                        setActiveFilterPopover(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {filterPriority === item.id && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter: Due Date Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setActiveFilterPopover(activeFilterPopover === 'dueDate' ? null : 'dueDate');
                setDueSearchQuery('');
              }}
              className={`notion-filter-pill px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors ${
                filterDueDate !== 'all'
                  ? 'bg-[#2383E2]/15 text-[#2383E2] font-semibold ring-1 ring-[#2383E2]/30'
                  : 'bg-[#F7F7F5] dark:bg-[#202020] text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A]'
              }`}
            >
              <Calendar className="w-3 h-3 text-[#2383E2]" />
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
                ref={filterPopoverRef}
                className="absolute left-0 top-7 w-52 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={dueSearchQuery}
                      onChange={(e) => setDueSearchQuery(e.target.value)}
                      placeholder="Поиск срока..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {dueSearchQuery && (
                      <button onClick={() => setDueSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {filteredDueDates.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onFilterDueDateChange(item.id);
                        setActiveFilterPopover(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center justify-between cursor-pointer"
                    >
                      <span>{item.label}</span>
                      {filterDueDate === item.id && <Check className="w-3.5 h-3.5 text-[#2383E2]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Filter / More Filters Pill with Instant Search */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsAddFilterMenuOpen(!isAddFilterMenuOpen);
                setAddFilterSearchQuery('');
              }}
              className="notion-filter-pill px-2 py-0.5 rounded text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] hover:text-[#37352F] dark:hover:text-[#E3E2E0] flex items-center gap-1 cursor-pointer transition-colors border border-dashed border-[#E9E9E7] dark:border-[#2F2F2F]"
            >
              <Plus className="w-3 h-3" />
              <span>+ Фильтр</span>
            </button>

            {isAddFilterMenuOpen && (
              <div 
                ref={filterPopoverRef}
                className="absolute left-0 top-7 w-56 bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={addFilterSearchQuery}
                      onChange={(e) => setAddFilterSearchQuery(e.target.value)}
                      placeholder="Поиск типа фильтра..."
                      className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                    />
                    {addFilterSearchQuery && (
                      <button onClick={() => setAddFilterSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {filteredAddFilterOptions.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (opt.id === 'files') {
                            onFilterAttachmentsChange(filterAttachments === 'has_files' ? 'all' : 'has_files');
                          } else if (opt.id === 'notes') {
                            onFilterNotesChange(filterNotes === 'has_notes' ? 'all' : 'has_notes');
                          } else {
                            setActiveFilterPopover(opt.id);
                          }
                          setIsAddFilterMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] flex items-center gap-2 cursor-pointer"
                      >
                        <Icon className="w-3.5 h-3.5 text-[#2383E2]" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
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
                placeholder="Мгновенный поиск..."
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
                className="text-[11px] text-rose-500 hover:text-rose-600 hover:underline px-1.5 py-0.5 rounded cursor-pointer transition-colors font-medium whitespace-nowrap"
                title="Сбросить все фильтры и сортировку"
              >
                Сбросить все
              </button>
            )}
          </div>

        </div>
      )}

      {/* 4. NOTION "VIEW SETTINGS" POPUP MODAL / DRAWER */}
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
                onClick={() => {
                  setActiveSettingsSubmenu('layout');
                  setLayoutSearchQuery('');
                }}
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
                onClick={() => {
                  setActiveSettingsSubmenu('properties');
                  setPropSearchQuery('');
                }}
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
                onClick={() => {
                  setActiveSettingsSubmenu('sort');
                  setSortSearchQuery('');
                }}
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
              <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={layoutSearchQuery}
                    onChange={(e) => setLayoutSearchQuery(e.target.value)}
                    placeholder="Поиск вида..."
                    className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                  />
                  {layoutSearchQuery && (
                    <button onClick={() => setLayoutSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {ALL_VIEW_MODES.filter(v => !layoutSearchQuery || v.name.toLowerCase().includes(layoutSearchQuery.toLowerCase())).map(v => {
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

          {/* Submenu: Property Visibility with Instant Search */}
          {activeSettingsSubmenu === 'properties' && (
            <div className="space-y-1">
              <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={propSearchQuery}
                    onChange={(e) => setPropSearchQuery(e.target.value)}
                    placeholder="Поиск свойства..."
                    className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                  />
                  {propSearchQuery && (
                    <button onClick={() => setPropSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {PROPERTY_DEFINITIONS.filter(p => !propSearchQuery || p.name.toLowerCase().includes(propSearchQuery.toLowerCase())).map(prop => {
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
              <div className="p-1 border-b border-[#E9E9E7] dark:border-[#2F2F2F] mb-1">
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-[#787774] absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={sortSearchQuery}
                    onChange={(e) => setSortSearchQuery(e.target.value)}
                    placeholder="Поиск сортировки..."
                    className="w-full pl-6 pr-5 py-1 text-xs bg-[#F7F7F5] dark:bg-[#191919] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded focus:outline-none focus:ring-1 focus:ring-[#2383E2]"
                  />
                  {sortSearchQuery && (
                    <button onClick={() => setSortSearchQuery('')} className="absolute right-1.5 p-0.5 text-[#787774] hover:text-[#37352F]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {filteredSortOptions.map(f => {
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
