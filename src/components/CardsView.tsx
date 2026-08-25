import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Tag as TagIcon, 
  Calendar, 
  ChevronRight,
  SlidersHorizontal,
  FileText,
  Paperclip,
  Maximize2,
  Minimize2,
  Clock,
  MessageSquare,
  Search,
  Check,
  Eye,
  Box,
  Boxes,
  Layers,
  Wrench,
  Cpu,
  Barcode,
  FolderOpen,
  FolderPlus,
  ArrowRight,
  Hash,
  AlertTriangle,
  Zap,
  MoreHorizontal,
  Copy,
  ExternalLink,
  Filter,
  Grid,
  Sparkles,
  LayoutGrid,
  CheckSquare,
  ShieldCheck,
  ShieldAlert,
  Activity,
  HardDrive,
  Home,
  ListTodo
} from 'lucide-react';
import { TaskNode, TagCategory, Priority, ViewMode } from '../types';
import { getPomoStatsForNode, formatTotalPomoTime, calculateProgress, getTaskExternalLinks, playNotificationChime } from '../utils';
import GoogleDriveImage from './GoogleDriveImage';

export interface CardsViewProps {
  nodes: TaskNode[];
  allNodes?: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask?: (text: string, initialTags: string[], priority?: Priority, dueDate?: string, parentId?: string | null, extraFields?: Partial<TaskNode>) => void;
  selectedNodeIds?: string[];
  onToggleSelectNode?: (id: string) => void;
  onToggleSelectAll?: (ids: string[]) => void;
  onBulkDelete?: () => void;
  onBulkToggleCompleted?: (completed: boolean) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  focusedTaskId?: string | null;
  focusedContainerId?: string | null;
  onFocusedTaskIdChange?: (id: string | null) => void;
  onFocusedContainerIdChange?: (id: string | null) => void;
  collapseCompleted?: boolean;
  onCollapseCompletedChange?: (val: boolean) => void;
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  setViewMode?: (mode: ViewMode) => void;
  searchQuery?: string;
}

type CardTypeFilter = 'all' | 'containers' | 'equipment';
type CardGroupBy = 'none' | 'type' | 'status' | 'priority' | 'container';
type CardSize = 'small' | 'medium' | 'large';

interface GroupSection {
  id: string;
  title: string;
  subtitle?: string;
  icon?: any;
  iconColor?: string;
  badgeBg?: string;
  count: number;
  items: TaskNode[];
  kind: 'all' | 'task' | 'container' | 'equipment';
}

// Notion color palette for tags
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

function formatCardDate(dateStr?: string): { formatted: string; isOverdue: boolean; isToday: boolean } {
  if (!dateStr) return { formatted: '', isOverdue: false, isToday: false };
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    const dCheck = new Date(dateStr);
    dCheck.setHours(0, 0, 0, 0);

    const isToday = dCheck.getTime() === today.getTime();
    const isOverdue = dCheck.getTime() < today.getTime();

    const formatted = d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
    return { formatted, isOverdue, isToday };
  } catch {
    return { formatted: dateStr, isOverdue: false, isToday: false };
  }
}

// Check node kind (containers and equipment are supported in cards view)
function getNodeKind(node: TaskNode): 'container' | 'equipment' | 'other' {
  if (node.isContainer) return 'container';
  if (
    node.isEquipment ||
    node.equipmentModel ||
    node.equipmentBarcode ||
    node.equipmentStockCode ||
    node.tags?.some(t => ['оборудование', 'техника', 'прибор', 'инструмент', 'аппаратура', 'equipment'].includes(t.toLowerCase()))
  ) {
    return 'equipment';
  }
  return 'other';
}

export default function CardsView({
  nodes,
  allNodes = [],
  tagCategories,
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  selectedNodeIds = [],
  onToggleSelectNode,
  onToggleSelectAll,
  onBulkDelete,
  onBulkToggleCompleted,
  onFullScreenChange,
  focusedTaskId,
  focusedContainerId,
  onFocusedTaskIdChange,
  onFocusedContainerIdChange,
  collapseCompleted = false,
  onCollapseCompletedChange,
  projectName = 'Карточки',
  projectIcon = '🎴',
  onUpdateProjectName,
  setViewMode,
  searchQuery = ''
}: CardsViewProps) {
  const [typeFilter, setTypeFilter] = useState<CardTypeFilter>('all');
  const [groupBy, setGroupBy] = useState<CardGroupBy>('type');
  const [cardSize, setCardSize] = useState<CardSize>('medium');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState<null | 'task' | 'container' | 'equipment'>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCovers, setShowCovers] = useState(true);

  // Quick creation form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('none');
  const [newDueDate, setNewDueDate] = useState('');
  const [newTagsStr, setNewTagsStr] = useState('');
  const [newContainerPlace, setNewContainerPlace] = useState('');
  const [newEquipmentModel, setNewEquipmentModel] = useState('');
  const [newEquipmentBarcode, setNewEquipmentBarcode] = useState('');
  const [newEquipmentStockCode, setNewEquipmentStockCode] = useState('');
  const [newEquipmentNote, setNewEquipmentNote] = useState('');

  // Node pool for subtask references
  const effectiveAllNodes = allNodes.length > 0 ? allNodes : nodes;

  const activeFocusId = focusedContainerId || focusedTaskId;
  const isMainScreen = !activeFocusId;
  const currentFocusedNode = activeFocusId ? effectiveAllNodes.find(n => n.id === activeFocusId) : null;

  // Toggle fullscreen mode
  const handleToggleFullScreen = () => {
    const next = !isFullScreen;
    setIsFullScreen(next);
    if (onFullScreenChange) onFullScreenChange(next);
  };

  // Node counts by kind (containers and equipment)
  const counts = useMemo(() => {
    let containerCount = 0;
    let equipmentCount = 0;

    if (isMainScreen) {
      nodes.forEach(n => {
        const isParentAContainer = n.parentId ? effectiveAllNodes.some(p => p.id === n.parentId && p.isContainer) : false;
        if (n.isContainer && !isParentAContainer) {
          containerCount++;
        }
      });
      return {
        all: containerCount,
        containers: containerCount,
        equipment: 0
      };
    }

    nodes.forEach(n => {
      const kind = getNodeKind(n);
      if (kind === 'container') containerCount++;
      else if (kind === 'equipment') equipmentCount++;
    });

    return {
      all: containerCount + equipmentCount,
      containers: containerCount,
      equipment: equipmentCount
    };
  }, [nodes, isMainScreen, effectiveAllNodes]);

  // Filtered nodes by type filter & search (exclusively containers and equipment)
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      const kind = getNodeKind(node);

      // On main screen: ONLY show containers from the main screen (top-level root containers)
      if (isMainScreen) {
        const isParentAContainer = node.parentId ? effectiveAllNodes.some(p => p.id === node.parentId && p.isContainer) : false;
        if (kind !== 'container' || isParentAContainer) {
          return false;
        }
      } else {
        // Inside focused container: show containers and equipment
        if (kind !== 'container' && kind !== 'equipment') return false;
      }

      // Type filter
      if (typeFilter === 'containers' && kind !== 'container') return false;
      if (typeFilter === 'equipment' && kind !== 'equipment') return false;

      // Collapse completed if set
      if (collapseCompleted && node.completed) {
        return false;
      }

      // Search query filter (if passed internally)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const textMatch = (node.text || '').toLowerCase().includes(q);
        const notesMatch = (node.notes || '').toLowerCase().includes(q);
        const tagMatch = (node.tags || []).some(t => t.toLowerCase().includes(q));
        const modelMatch = (node.equipmentModel || '').toLowerCase().includes(q);
        const barcodeMatch = (node.equipmentBarcode || '').toLowerCase().includes(q);
        const stockMatch = (node.equipmentStockCode || '').toLowerCase().includes(q);
        const placeMatch = (node.containerPlace || '').toLowerCase().includes(q);

        if (!textMatch && !notesMatch && !tagMatch && !modelMatch && !barcodeMatch && !stockMatch && !placeMatch) {
          return false;
        }
      }

      return true;
    });
  }, [nodes, isMainScreen, effectiveAllNodes, typeFilter, collapseCompleted, searchQuery]);

  // Groups generation
  const groupedSections = useMemo((): GroupSection[] => {
    if (groupBy === 'none') {
      return [{ id: 'all', title: 'Все карточки', count: filteredNodes.length, items: filteredNodes, kind: 'all' as const }];
    }

    if (groupBy === 'type') {
      const containers = filteredNodes.filter(n => getNodeKind(n) === 'container');
      const equipment = filteredNodes.filter(n => getNodeKind(n) === 'equipment');

      const sections: GroupSection[] = [];
      if (containers.length > 0 || typeFilter === 'all' || typeFilter === 'containers') {
        sections.push({
          id: 'containers',
          title: 'Контейнеры и Зоны',
          subtitle: 'Группирующие боксы с вложенным оборудованием и карточками',
          icon: Boxes,
          iconColor: 'text-indigo-500 dark:text-indigo-400',
          badgeBg: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40',
          count: containers.length,
          items: containers,
          kind: 'container' as const
        });
      }
      if (equipment.length > 0 || typeFilter === 'all' || typeFilter === 'equipment') {
        sections.push({
          id: 'equipment',
          title: 'Оборудование и Техника',
          subtitle: 'Аппаратура, моторы, приборы с моделями и штрихкодами',
          icon: Wrench,
          iconColor: 'text-amber-500 dark:text-amber-400',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
          count: equipment.length,
          items: equipment,
          kind: 'equipment' as const
        });
      }
      return sections;
    }

    if (groupBy === 'status') {
      const todo = filteredNodes.filter(n => (n.status === 'todo' || !n.status) && !n.completed);
      const progress = filteredNodes.filter(n => n.status === 'progress' && !n.completed);
      const waiting = filteredNodes.filter(n => n.status === 'waiting' && !n.completed);
      const done = filteredNodes.filter(n => n.status === 'done' || n.completed);

      return [
        { id: 'todo', title: 'К выполнению', icon: Circle, iconColor: 'text-slate-400', badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300', count: todo.length, items: todo, kind: 'all' as const },
        { id: 'progress', title: 'В процессе', icon: Activity, iconColor: 'text-blue-500', badgeBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300', count: progress.length, items: progress, kind: 'all' as const },
        { id: 'waiting', title: 'Ожидание', icon: Clock, iconColor: 'text-amber-500', badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300', count: waiting.length, items: waiting, kind: 'all' as const },
        { id: 'done', title: 'Завершено', icon: CheckCircle2, iconColor: 'text-emerald-500', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300', count: done.length, items: done, kind: 'all' as const },
      ];
    }

    if (groupBy === 'priority') {
      const urgent = filteredNodes.filter(n => n.priority === 'urgent');
      const high = filteredNodes.filter(n => n.priority === 'high');
      const medium = filteredNodes.filter(n => n.priority === 'medium');
      const low = filteredNodes.filter(n => n.priority === 'low');
      const none = filteredNodes.filter(n => !n.priority || n.priority === 'none');

      return [
        { id: 'urgent', title: 'Срочные ⚡', icon: Zap, iconColor: 'text-rose-500', badgeBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300', count: urgent.length, items: urgent, kind: 'all' as const },
        { id: 'high', title: 'Высокий приоритет', icon: AlertTriangle, iconColor: 'text-orange-500', badgeBg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-300', count: high.length, items: high, kind: 'all' as const },
        { id: 'medium', title: 'Средний приоритет', icon: Circle, iconColor: 'text-amber-500', badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300', count: medium.length, items: medium, kind: 'all' as const },
        { id: 'low', title: 'Низкий приоритет', icon: Circle, iconColor: 'text-sky-500', badgeBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-300', count: low.length, items: low, kind: 'all' as const },
        { id: 'none', title: 'Без приоритета', icon: Circle, iconColor: 'text-slate-400', badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300', count: none.length, items: none, kind: 'all' as const },
      ];
    }

    if (groupBy === 'container') {
      const containerMap: Record<string, TaskNode[]> = {};
      const noContainerNodes: TaskNode[] = [];

      filteredNodes.forEach(n => {
        if (n.parentId) {
          const parent = effectiveAllNodes.find(p => p.id === n.parentId);
          if (parent) {
            if (!containerMap[parent.id]) containerMap[parent.id] = [];
            containerMap[parent.id].push(n);
            return;
          }
        }
        noContainerNodes.push(n);
      });

      const sections: GroupSection[] = Object.keys(containerMap).map(cid => {
        const cNode = effectiveAllNodes.find(p => p.id === cid);
        return {
          id: cid,
          title: cNode ? cNode.text : 'Контейнер',
          subtitle: cNode?.containerPlace ? `Зона: ${cNode.containerPlace}` : undefined,
          icon: Box,
          iconColor: 'text-indigo-500',
          badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',
          count: containerMap[cid].length,
          items: containerMap[cid],
          kind: 'container' as const
        };
      });

      if (noContainerNodes.length > 0) {
        sections.unshift({
          id: 'root',
          title: 'Без контейнера (Корневые)',
          subtitle: undefined,
          icon: Layers,
          iconColor: 'text-slate-400',
          badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
          count: noContainerNodes.length,
          items: noContainerNodes,
          kind: 'all' as const
        });
      }

      return sections;
    }

    return [{ id: 'all', title: 'Все элементы', count: filteredNodes.length, items: filteredNodes, kind: 'all' as const }];
  }, [filteredNodes, groupBy, typeFilter, effectiveAllNodes]);

  // Handle creating a new card from modal
  const handleConfirmCreate = () => {
    if (!newTitle.trim() || !onCreateTask) return;
    const tags = newTagsStr
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const targetParentId = activeFocusId || null;

    if (showCreateModal === 'task') {
      onCreateTask(newTitle.trim(), tags, newPriority, newDueDate || undefined, targetParentId);
    } else if (showCreateModal === 'container') {
      onCreateTask(
        newTitle.trim(),
        tags,
        'none',
        undefined,
        targetParentId,
        {
          isContainer: true,
          containerPlace: newContainerPlace.trim() || undefined,
          width: 420,
          height: 260
        }
      );
    } else if (showCreateModal === 'equipment') {
      onCreateTask(
        newTitle.trim(),
        tags,
        'none',
        undefined,
        targetParentId,
        {
          isEquipment: true,
          isNotTask: true,
          equipmentModel: newEquipmentModel.trim() || undefined,
          equipmentBarcode: newEquipmentBarcode.trim() || undefined,
          equipmentStockCode: newEquipmentStockCode.trim() || undefined,
          equipmentNote: newEquipmentNote.trim() || undefined,
          width: 240,
          height: 150
        }
      );
    }

    // Reset fields
    setNewTitle('');
    setNewPriority('none');
    setNewDueDate('');
    setNewTagsStr('');
    setNewContainerPlace('');
    setNewEquipmentModel('');
    setNewEquipmentBarcode('');
    setNewEquipmentStockCode('');
    setNewEquipmentNote('');
    setShowCreateModal(null);
  };

  // Grid column class by card size
  const gridClasses = {
    small: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5',
    medium: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
    large: 'grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5'
  }[cardSize];

  return (
    <div className={`relative w-full h-full flex flex-col bg-[#FAF9F6] dark:bg-[#141414] text-[#37352F] dark:text-[#D4D4D4] select-none overflow-hidden font-sans transition-colors ${isFullScreen ? 'fixed inset-0 z-50' : ''}`}>
      
      {/* Container Focus Breadcrumbs Banner (When drilled into a container) */}
      {!isMainScreen && (
        <div className="h-10 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50 px-4 flex items-center justify-between text-xs shrink-0 z-30">
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (onFocusedContainerIdChange) onFocusedContainerIdChange(null);
                if (onFocusedTaskIdChange) onFocusedTaskIdChange(null);
              }}
              className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-semibold hover:underline cursor-pointer shrink-0"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Главный экран</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <div className="flex items-center gap-1.5 font-bold text-[#37352F] dark:text-[#E3E2E0] truncate">
              <Boxes className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">{currentFocusedNode?.text || 'Контейнер'}</span>
            </div>
            {currentFocusedNode?.containerPlace && (
              <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-medium shrink-0">
                📍 {currentFocusedNode.containerPlace}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (onFocusedContainerIdChange) onFocusedContainerIdChange(null);
              if (onFocusedTaskIdChange) onFocusedTaskIdChange(null);
            }}
            className="px-2.5 py-1 rounded-md bg-white dark:bg-[#1E1E1E] border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-xs font-semibold transition-colors cursor-pointer shadow-2xs shrink-0"
          >
            ← В главный экран
          </button>
        </div>
      )}

      {/* Top Gallery / Cards Sub-header Controls Bar */}
      <div className="h-12 border-b border-[#E9E9E7] dark:border-[#242424] bg-white/80 dark:bg-[#191919]/80 backdrop-blur-md px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        
        {/* Left Side: Type Filter Chips (All, Containers, Equipment) */}
        <div className="flex items-center gap-1.5 overflow-x-auto invisible-scrollbar py-1">
          {isMainScreen ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white shadow-xs">
                <Boxes className="w-3.5 h-3.5" />
                <span>Контейнеры экрана</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                  {counts.containers}
                </span>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-[#37352F] text-white dark:bg-white dark:text-[#191919] shadow-xs'
                    : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#252525]'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Все</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${typeFilter === 'all' ? 'bg-white/20 dark:bg-black/20' : 'bg-[#EFEFED] dark:bg-[#2A2A2A]'}`}>
                  {counts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter('containers')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  typeFilter === 'containers'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-[#787774] dark:text-[#9B9A97] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Контейнеры</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${typeFilter === 'containers' ? 'bg-white/20' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'}`}>
                  {counts.containers}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter('equipment')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  typeFilter === 'equipment'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-[#787774] dark:text-[#9B9A97] hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Оборудование</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${typeFilter === 'equipment' ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'}`}>
                  {counts.equipment}
                </span>
              </button>
            </>
          )}
        </div>

        {/* Right Side: Grouping, Density, Fullscreen & Create */}
        <div className="flex items-center gap-1.5 shrink-0">
          
          {/* Group By selector */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-[#787774] dark:text-[#9B9A97]">
            <span className="text-[11px]">Группировка:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as CardGroupBy)}
              className="bg-[#EFEFED] dark:bg-[#252525] border-none text-[#37352F] dark:text-[#E3E2E0] text-xs rounded-md px-2 py-1 cursor-pointer focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="type">По типу (Контейнеры / Оборудование)</option>
              <option value="container">По контейнерам</option>
              <option value="status">По статусу</option>
              <option value="priority">По приоритету</option>
              <option value="none">Без группировки (Сплошная сетка)</option>
            </select>
          </div>

          {/* Card Size Selector */}
          <div className="hidden md:flex items-center bg-[#EFEFED] dark:bg-[#252525] p-0.5 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setCardSize('small')}
              title="Компактный размер"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${cardSize === 'small' ? 'bg-white dark:bg-[#1A1A1A] text-[#37352F] dark:text-[#E3E2E0] shadow-xs' : 'text-[#787774] dark:text-[#9B9A97]'}`}
            >
              S
            </button>
            <button
              type="button"
              onClick={() => setCardSize('medium')}
              title="Стандартный размер"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${cardSize === 'medium' ? 'bg-white dark:bg-[#1A1A1A] text-[#37352F] dark:text-[#E3E2E0] shadow-xs' : 'text-[#787774] dark:text-[#9B9A97]'}`}
            >
              M
            </button>
            <button
              type="button"
              onClick={() => setCardSize('large')}
              title="Крупный размер"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${cardSize === 'large' ? 'bg-white dark:bg-[#1A1A1A] text-[#37352F] dark:text-[#E3E2E0] shadow-xs' : 'text-[#787774] dark:text-[#9B9A97]'}`}
            >
              L
            </button>
          </div>

          {/* Toggle Covers */}
          <button
            type="button"
            onClick={() => setShowCovers(!showCovers)}
            className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              showCovers
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                : 'text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#252525]'
            }`}
            title={showCovers ? 'Скрыть обложки' : 'Показать обложки карточек'}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={handleToggleFullScreen}
            className="p-1.5 rounded-md text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#252525] transition-colors cursor-pointer"
            title={isFullScreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Primary "+ Добавить" Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить</span>
            </button>

            {showAddMenu && (
              <div 
                className="absolute right-0 top-8 w-56 bg-white dark:bg-[#1E1E1E] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal('container');
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-left text-[#37352F] dark:text-[#E3E2E0] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  <div className="w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Boxes className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold">Новый контейнер / бокс</div>
                    <div className="text-[10px] text-[#787774] dark:text-[#9B9A97]">Для группировки и хранения</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal('equipment');
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-left text-[#37352F] dark:text-[#E3E2E0] hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer mt-0.5"
                >
                  <div className="w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                    <Wrench className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold">Новое оборудование</div>
                    <div className="text-[10px] text-[#787774] dark:text-[#9B9A97]">С моделью, штрихкодом и артикулом</div>
                  </div>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Multi-selection Action Floating Ribbon */}
      {selectedNodeIds.length > 0 && (
        <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between shadow-md shrink-0 animate-in slide-in-from-top-2 duration-150 z-20">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <CheckSquare className="w-4 h-4" />
            <span>Выбрано элементов: {selectedNodeIds.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {onBulkToggleCompleted && (
              <button
                type="button"
                onClick={onBulkToggleCompleted}
                className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Завершить / Снять</span>
              </button>
            )}
            {onBulkDelete && (
              <button
                type="button"
                onClick={onBulkDelete}
                className="px-2.5 py-1 rounded bg-rose-500/80 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить выбранные</span>
              </button>
            )}
            {onToggleSelectAll && (
              <button
                type="button"
                onClick={() => onToggleSelectAll([])}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors cursor-pointer"
              >
                Снять выбор
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-4 shadow-sm">
              <Boxes className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-[#37352F] dark:text-[#E3E2E0] mb-1">
              {isMainScreen ? 'На главном экране нет контейнеров' : 'В этом контейнере пока пусто'}
            </h3>
            <p className="text-xs text-[#787774] dark:text-[#9B9A97] mb-5">
              {isMainScreen 
                ? 'На главном экране в виде карточек отображаются только корневые контейнеры (боксы). Создайте контейнер для размещения оборудования и задач.'
                : 'Добавьте оборудование или создайте вложенный бокс внутри этого контейнера.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => setShowCreateModal('container')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Контейнер / Бокс</span>
              </button>
              {!isMainScreen && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal('equipment')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Оборудование</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          groupedSections.map((section) => {
            const SectionIcon = section.icon || Grid;
            if (section.items.length === 0) return null;
            return (
              <div key={section.id} className="space-y-3.5">
                
                {/* Section Header (when grouping is active) */}
                {groupBy !== 'none' && (
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#E9E9E7] dark:border-[#262626]">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded ${section.badgeBg}`}>
                        <SectionIcon className={`w-4 h-4 ${section.iconColor || ''}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-[#37352F] dark:text-[#E3E2E0]">
                            {section.title}
                          </h2>
                          <span className="text-xs px-2 py-0.2 rounded-full font-semibold bg-[#EFEFED] dark:bg-[#252525] text-[#787774] dark:text-[#9B9A97]">
                            {section.count}
                          </span>
                        </div>
                        {section.subtitle && (
                          <p className="text-[11px] text-[#787774] dark:text-[#9B9A97]">
                            {section.subtitle}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Quick add in this specific section */}
                    <button
                      type="button"
                      onClick={() => {
                        if (section.kind === 'container') setShowCreateModal('container');
                        else if (section.kind === 'equipment') setShowCreateModal('equipment');
                        else setShowCreateModal('task');
                      }}
                      className="p-1 rounded-md text-[#787774] dark:text-[#9B9A97] hover:bg-[#EFEFED] dark:hover:bg-[#252525] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer flex items-center gap-1 text-xs"
                      title="Добавить элемент в эту категорию"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Добавить</span>
                    </button>
                  </div>
                )}

                {/* Grid of Cards */}
                <div className={gridClasses}>
                  {section.items.map((node) => {
                    const kind = getNodeKind(node);
                    const isSelected = selectedNodeId === node.id || selectedNodeIds.includes(node.id);
                    
                    if (kind === 'container') {
                      return (
                        <ContainerCard
                          key={node.id}
                          node={node}
                          allNodes={effectiveAllNodes}
                          isSelected={isSelected}
                          cardSize={cardSize}
                          showCovers={showCovers}
                          onSelectNode={onSelectNode}
                          onUpdateNode={onUpdateNode}
                          onDeleteNode={onDeleteNode}
                          onFocusedTaskIdChange={onFocusedTaskIdChange}
                          onFocusedContainerIdChange={onFocusedContainerIdChange}
                          setViewMode={setViewMode}
                          onCreateTask={onCreateTask}
                          onToggleSelectNode={onToggleSelectNode}
                          tagCategories={tagCategories}
                        />
                      );
                    }

                    if (kind === 'equipment') {
                      return (
                        <EquipmentCard
                          key={node.id}
                          node={node}
                          isSelected={isSelected}
                          cardSize={cardSize}
                          showCovers={showCovers}
                          onSelectNode={onSelectNode}
                          onUpdateNode={onUpdateNode}
                          onDeleteNode={onDeleteNode}
                          onToggleSelectNode={onToggleSelectNode}
                          tagCategories={tagCategories}
                        />
                      );
                    }

                    // Default Standard Task Card
                    return (
                      <TaskCard
                        key={node.id}
                        node={node}
                        allNodes={effectiveAllNodes}
                        isSelected={isSelected}
                        cardSize={cardSize}
                        showCovers={showCovers}
                        activePomodoroNodeId={activePomodoroNodeId}
                        onSelectNode={onSelectNode}
                        onUpdateNode={onUpdateNode}
                        onDeleteNode={onDeleteNode}
                        onToggleSelectNode={onToggleSelectNode}
                        tagCategories={tagCategories}
                      />
                    );
                  })}
                </div>

              </div>
            );
          })
        )}

      </div>

      {/* Creation Modal for Task, Container or Equipment */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E1E1E] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className={`px-5 py-4 border-b border-[#E9E9E7] dark:border-[#2F2F2F] flex items-center justify-between ${
              showCreateModal === 'container' 
                ? 'bg-indigo-50/50 dark:bg-indigo-950/30' 
                : showCreateModal === 'equipment'
                ? 'bg-amber-50/50 dark:bg-amber-950/30'
                : 'bg-blue-50/50 dark:bg-blue-950/30'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${
                  showCreateModal === 'container'
                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400'
                    : showCreateModal === 'equipment'
                    ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400'
                    : 'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400'
                }`}>
                  {showCreateModal === 'container' && <Boxes className="w-4 h-4" />}
                  {showCreateModal === 'equipment' && <Wrench className="w-4 h-4" />}
                  {showCreateModal === 'task' && <CheckSquare className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#37352F] dark:text-[#E3E2E0]">
                    {showCreateModal === 'container' && 'Создать контейнер / группу'}
                    {showCreateModal === 'equipment' && 'Добавить оборудование'}
                    {showCreateModal === 'task' && 'Создать новую задачу'}
                  </h3>
                  <p className="text-[11px] text-[#787774] dark:text-[#9B9A97]">
                    {showCreateModal === 'container' && 'Группирующий контейнер для хранения карточек и подцелей'}
                    {showCreateModal === 'equipment' && 'Карточка с техническими характеристиками и штрихкодом'}
                    {showCreateModal === 'task' && 'Стандартная задача с чекбоксом, дедлайном и приоритетом'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(null)}
                className="p-1 rounded-md text-[#787774] hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              
              {/* Title / Name */}
              <div>
                <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                  {showCreateModal === 'equipment' ? 'Наименование оборудования *' : 'Название *'}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    showCreateModal === 'equipment' 
                      ? 'Например: Шпиндельный мотор 2.2kW' 
                      : showCreateModal === 'container'
                      ? 'Например: Зона A / Модуль логистики'
                      : 'Например: Подготовить технический отчет'
                  }
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate();
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
                />
              </div>

              {/* Specific fields for Containers */}
              {showCreateModal === 'container' && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                    Местоположение / Зона (необязательно)
                  </label>
                  <input
                    type="text"
                    value={newContainerPlace}
                    onChange={(e) => setNewContainerPlace(e.target.value)}
                    placeholder="Например: Сектор B-4 / Этаж 2"
                    className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              )}

              {/* Specific fields for Equipment */}
              {showCreateModal === 'equipment' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                        Модель (Model)
                      </label>
                      <input
                        type="text"
                        value={newEquipmentModel}
                        onChange={(e) => setNewEquipmentModel(e.target.value)}
                        placeholder="GDZ-80-2.2B"
                        className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                        Артикул (Stok kod)
                      </label>
                      <input
                        type="text"
                        value={newEquipmentStockCode}
                        onChange={(e) => setNewEquipmentStockCode(e.target.value)}
                        placeholder="STK-9482"
                        className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-amber-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                      Штрихкод (Barkod)
                    </label>
                    <input
                      type="text"
                      value={newEquipmentBarcode}
                      onChange={(e) => setNewEquipmentBarcode(e.target.value)}
                      placeholder="4820019283749"
                      className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-amber-500 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                      Тех. примечание (Qeyd)
                    </label>
                    <input
                      type="text"
                      value={newEquipmentNote}
                      onChange={(e) => setNewEquipmentNote(e.target.value)}
                      placeholder="24000 RPM, водяное охлаждение"
                      className="w-full px-3 py-1.5 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none focus:border-amber-500 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Priority & Due Date (For Task & General) */}
              {showCreateModal === 'task' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                      Приоритет
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as Priority)}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none text-xs"
                    >
                      <option value="none">Обычный (нет)</option>
                      <option value="low">Низкий</option>
                      <option value="medium">Средний</option>
                      <option value="high">Высокий 🔥</option>
                      <option value="urgent">Срочно ⚡</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                      Срок (Дедлайн)
                    </label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none text-xs"
                    >
                    </input>
                  </div>
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="block text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] uppercase mb-1">
                  Теги (через запятую)
                </label>
                <input
                  type="text"
                  value={newTagsStr}
                  onChange={(e) => setNewTagsStr(e.target.value)}
                  placeholder="дизайн, бэкенд, срочно"
                  className="w-full px-3 py-2 rounded-lg bg-[#F7F6F3] dark:bg-[#252525] border border-[#E9E9E7] dark:border-[#333] text-[#37352F] dark:text-[#E3E2E0] outline-none text-xs"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-[#E9E9E7] dark:border-[#2F2F2F] bg-[#FAF9F6] dark:bg-[#1A1A1A] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#787774] hover:bg-[#EFEFED] dark:hover:bg-[#252525] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmCreate}
                disabled={!newTitle.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать карточку</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// ==========================================
// 1. STANDARD TASK CARD COMPONENT
// ==========================================
interface TaskCardProps {
  key?: any;
  node: TaskNode;
  allNodes: TaskNode[];
  isSelected: boolean;
  cardSize: CardSize;
  showCovers: boolean;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onToggleSelectNode?: (id: string) => void;
  tagCategories: TagCategory[];
}

function TaskCard({
  node,
  allNodes,
  isSelected,
  cardSize,
  showCovers,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onToggleSelectNode,
  tagCategories
}: TaskCardProps) {
  // Child subtasks calculation
  const subtasks = useMemo(() => {
    return allNodes.filter(n => n.parentId === node.id && !n.archived);
  }, [allNodes, node.id]);

  const completedSubtasks = useMemo(() => {
    return subtasks.filter(s => s.completed).length;
  }, [subtasks]);

  const progressPercent = useMemo(() => {
    if (typeof node.progress === 'number' && node.progress > 0) return node.progress;
    if (subtasks.length > 0) return Math.round((completedSubtasks / subtasks.length) * 100);
    return node.completed ? 100 : 0;
  }, [node.progress, node.completed, subtasks.length, completedSubtasks]);

  // Image cover
  const coverImage = useMemo(() => {
    if (!showCovers) return null;
    const imgFile = (node.files || []).find(f => 
      (f.type?.startsWith('image/') || 
       f.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || 
       (f.dataUrl && f.dataUrl.startsWith('data:image/')) ||
       f.googleDriveId) &&
      (f.googleDriveId || (f.dataUrl && f.dataUrl.trim() !== ''))
    );
    if (imgFile) return imgFile;

    // Check comment image
    const commentImg = (node.comments || []).find(c => (c.imageUrl && c.imageUrl.trim() !== '') || c.imageGoogleDriveId);
    if (commentImg) {
      return {
        dataUrl: commentImg.imageUrl || undefined,
        googleDriveId: commentImg.imageGoogleDriveId,
        name: 'Cover image'
      };
    }
    return null;
  }, [node.files, node.comments, showCovers]);

  const { formatted: dueDateFormatted, isOverdue, isToday } = formatCardDate(node.dueDate);
  const isPomoRunning = activePomodoroNodeId === node.id;

  const priorityConfig = {
    urgent: { label: 'Срочно', bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800/40', icon: '⚡' },
    high: { label: 'Высокий', bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800/40', icon: '🔥' },
    medium: { label: 'Средний', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/40', icon: '●' },
    low: { label: 'Низкий', bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-800/40', icon: '○' },
    none: null
  }[node.priority || 'none'];

  const statusConfig = {
    progress: { label: 'В процессе', bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
    waiting: { label: 'Ожидание', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
    done: { label: 'Готово', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
    todo: { label: 'К выполнению', bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' }
  }[node.status || 'todo'];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => onSelectNode(node.id, e)}
      className={`group relative flex flex-col rounded-xl bg-white dark:bg-[#1E1E1E] border transition-all duration-150 cursor-pointer overflow-hidden shadow-2xs hover:shadow-md ${
        isSelected 
          ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-indigo-100 dark:shadow-none' 
          : 'border-[#E9E9E7] dark:border-[#2A2A2A] hover:border-[#D0D0CD] dark:hover:border-[#3A3A3A]'
      } ${node.completed ? 'opacity-70 dark:opacity-60 bg-[#FAFAFA] dark:bg-[#1A1A1A]' : ''}`}
    >
      
      {/* Cover Image */}
      {coverImage && (coverImage.googleDriveId || (coverImage.dataUrl && coverImage.dataUrl.trim() !== '')) && (
        <div className="relative w-full h-32 sm:h-36 bg-[#F0F0EE] dark:bg-[#252525] overflow-hidden border-b border-[#E9E9E7] dark:border-[#2A2A2A]">
          {coverImage.googleDriveId ? (
            <GoogleDriveImage
              driveId={coverImage.googleDriveId}
              alt={node.text}
              sz="w400"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              fallbackUrl={coverImage.dataUrl}
            />
          ) : coverImage.dataUrl ? (
            <img
              src={coverImage.dataUrl}
              alt={node.text}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : null}
          {/* Subtle image gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      {/* Card Content Container */}
      <div className={`p-3.5 sm:p-4 flex flex-col flex-1 ${cardSize === 'small' ? 'space-y-2' : 'space-y-3'}`}>
        
        {/* Top Header Row: Status, Priority, Multi-select Checkbox */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Status Pill */}
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusConfig.bg}`}>
              {node.completed ? 'Завершено ✓' : statusConfig.label}
            </span>

            {/* Priority Badge */}
            {priorityConfig && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border}`}>
                <span>{priorityConfig.icon}</span>
                <span>{priorityConfig.label}</span>
              </span>
            )}
          </div>

          {/* Selection Checkbox */}
          {onToggleSelectNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectNode(node.id);
              }}
              className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100 text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600'}`}
              title="Выбрать для групповых действий"
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                {isSelected && <Check className="w-2.5 h-2.5" />}
              </div>
            </button>
          )}
        </div>

        {/* Task Title & Completion Checkbox */}
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const nextCompleted = !node.completed;
              if (nextCompleted) playNotificationChime();
              onUpdateNode({
                ...node,
                completed: nextCompleted,
                status: nextCompleted ? 'done' : 'todo',
                updatedAt: new Date().toISOString()
              });
            }}
            className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
            title={node.completed ? 'Отметить как невыполненную' : 'Отметить как выполненную'}
          >
            {node.completed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-50 dark:fill-emerald-950/40" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          <h4 className={`text-xs sm:text-sm font-medium leading-snug flex-1 text-[#37352F] dark:text-[#E3E2E0] ${
            node.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''
          }`}>
            {node.icon && <span className="mr-1.5">{node.icon}</span>}
            {node.text || 'Без названия'}
          </h4>
        </div>

        {/* Notes excerpt if present */}
        {node.notes && cardSize !== 'small' && (
          <p className="text-[11px] text-[#787774] dark:text-[#9B9A97] line-clamp-2 leading-relaxed pl-6">
            {node.notes}
          </p>
        )}

        {/* Subtasks Progress Bar (if subtasks exist) */}
        {subtasks.length > 0 && (
          <div className="space-y-1 pl-6 pt-0.5">
            <div className="flex items-center justify-between text-[10px] text-[#787774] dark:text-[#9B9A97]">
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3 text-indigo-500" />
                <span>{completedSubtasks}/{subtasks.length} подзадач</span>
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#EFEFED] dark:bg-[#2A2A2A] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  progressPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pl-6 pt-1">
            {node.tags.map((tag) => {
              const colors = getNotionTagColor(tag);
              return (
                <span
                  key={tag}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}
                >
                  #{tag}
                </span>
              );
            })}
          </div>
        )}

        {/* Footer Metrics & Actions */}
        <div className="pt-2 mt-auto border-t border-[#F0F0EE] dark:border-[#262626] flex items-center justify-between text-[11px] text-[#787774] dark:text-[#9B9A97]">
          
          {/* Due Date Indicator */}
          <div className="flex items-center gap-1">
            {node.dueDate ? (
              <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                isOverdue 
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold' 
                  : isToday
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'bg-[#F0F0EE] dark:bg-[#262626] text-[#787774] dark:text-[#9B9A97]'
              }`}>
                <Calendar className="w-3 h-3" />
                <span>{dueDateFormatted}</span>
                {node.dueTime && <span className="opacity-75">{node.dueTime}</span>}
              </span>
            ) : (
              <span className="text-[10px] opacity-40">Без срока</span>
            )}
          </div>

          {/* Right Metrics: Files, Comments, Pomodoro */}
          <div className="flex items-center gap-2.5">
            {node.files && node.files.length > 0 && (
              <span className="flex items-center gap-0.8 text-[10px]" title={`Вложений: ${node.files.length}`}>
                <Paperclip className="w-3 h-3" />
                <span>{node.files.length}</span>
              </span>
            )}

            {node.comments && node.comments.length > 0 && (
              <span className="flex items-center gap-0.8 text-[10px] text-blue-500" title={`Комментариев: ${node.comments.length}`}>
                <MessageSquare className="w-3 h-3" />
                <span>{node.comments.length}</span>
              </span>
            )}

            {node.pomodoroTotalTime ? (
              <span className={`flex items-center gap-0.8 text-[10px] ${isPomoRunning ? 'text-rose-500 font-bold animate-pulse' : ''}`} title="Фокус-время Помодоро">
                <Clock className="w-3 h-3" />
                <span>{formatTotalPomoTime(node.pomodoroTotalTime)}</span>
              </span>
            ) : null}

            {/* Quick Open Eye Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id, e, 'details');
              }}
              className="p-1 rounded hover:bg-[#EFEFED] dark:hover:bg-[#2A2A2A] text-[#787774] hover:text-[#37352F] dark:hover:text-[#E3E2E0] transition-colors cursor-pointer"
              title="Открыть свойства задачи"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>

    </motion.div>
  );
}

// ==========================================
// 2. CONTAINER CARD COMPONENT (КОНТЕЙНЕР)
// ==========================================
interface ContainerCardProps {
  key?: any;
  node: TaskNode;
  allNodes: TaskNode[];
  isSelected: boolean;
  cardSize: CardSize;
  showCovers: boolean;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onFocusedTaskIdChange?: (id: string | null) => void;
  onFocusedContainerIdChange?: (id: string | null) => void;
  setViewMode?: (mode: ViewMode) => void;
  onCreateTask?: (text: string, initialTags: string[], priority?: Priority, dueDate?: string, parentId?: string | null) => void;
  onToggleSelectNode?: (id: string) => void;
  tagCategories: TagCategory[];
}

function ContainerCard({
  node,
  allNodes,
  isSelected,
  cardSize,
  showCovers,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onFocusedTaskIdChange,
  onFocusedContainerIdChange,
  setViewMode,
  onCreateTask,
  onToggleSelectNode,
  tagCategories
}: ContainerCardProps) {
  // Nested subtasks calculation
  const childTasks = useMemo(() => {
    return allNodes.filter(n => n.parentId === node.id && !n.archived);
  }, [allNodes, node.id]);

  const completedCount = useMemo(() => {
    return childTasks.filter(c => c.completed).length;
  }, [childTasks]);

  const completionPercent = childTasks.length > 0 
    ? Math.round((completedCount / childTasks.length) * 100)
    : 0;

  const handleEnterContainer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectNode) {
      onSelectNode(null); // Ensure properties drawer is closed
    }
    if (onFocusedContainerIdChange) {
      onFocusedContainerIdChange(node.id);
    } else if (onFocusedTaskIdChange) {
      onFocusedTaskIdChange(node.id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      onClick={handleEnterContainer}
      className={`group relative flex flex-col rounded-xl bg-white dark:bg-[#1A1A1E] border-2 transition-all duration-150 cursor-pointer overflow-hidden shadow-xs hover:shadow-lg ${
        isSelected 
          ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-indigo-100 dark:shadow-none' 
          : 'border-indigo-200/90 dark:border-indigo-900/50 hover:border-indigo-400 dark:hover:border-indigo-700'
      }`}
    >
      {/* Top Container Industrial / Folder Badge Banner */}
      <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 text-white px-3.5 py-1.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5 text-indigo-100" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-50">
            КОНТЕЙНЕР
          </span>
          {node.containerPlace && (
            <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded-md font-medium text-white/90">
              📍 {node.containerPlace}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.2 rounded-full text-white">
            {childTasks.length} {childTasks.length === 1 ? 'элемент' : 'элементов'}
          </span>
          {/* Quick Properties button if user specifically wants container details */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(node.id, e, 'details');
            }}
            className="p-0.5 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Свойства контейнера"
          >
            <Eye className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Container Content Body */}
      <div className={`p-4 flex flex-col flex-1 bg-gradient-to-b from-indigo-50/20 to-transparent dark:from-indigo-950/10 ${cardSize === 'small' ? 'space-y-2.5' : 'space-y-3.5'}`}>
        
        {/* Container Title */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 font-semibold shadow-2xs">
              {node.icon || <FolderOpen className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#37352F] dark:text-[#E3E2E0] leading-snug">
                {node.text || 'Безымянный контейнер'}
              </h4>
              <p className="text-[10px] text-[#787774] dark:text-[#9B9A97]">
                {completedCount} из {childTasks.length} выполнено ({completionPercent}%)
              </p>
            </div>
          </div>

          {onToggleSelectNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectNode(node.id);
              }}
              className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100 text-indigo-600' : 'text-slate-400'}`}
              title="Выбрать контейнер"
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                {isSelected && <Check className="w-2.5 h-2.5" />}
              </div>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="w-full h-2 bg-indigo-100 dark:bg-indigo-950/60 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                completionPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* Preview of first 3 child tasks */}
        {childTasks.length > 0 ? (
          <div 
            onClick={handleEnterContainer}
            className="space-y-1.5 bg-white/80 dark:bg-[#1E1E1E]/80 rounded-lg p-2.5 border border-indigo-100/70 dark:border-indigo-900/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors cursor-pointer"
            title="Нажмите, чтобы открыть список задач"
          >
            <div className="text-[10px] font-bold text-indigo-900/70 dark:text-indigo-300/70 uppercase tracking-wider flex items-center justify-between">
              <span>Задачи в боксе:</span>
              <span className="text-[9px] text-indigo-500 font-normal lowercase">открыть список →</span>
            </div>
            <div className="space-y-1">
              {childTasks.slice(0, 3).map(task => (
                <div key={task.id} className="flex items-center gap-1.5 text-xs text-[#37352F] dark:text-[#D4D4D4] truncate">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${task.completed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span className={`truncate ${task.completed ? 'line-through text-slate-400' : ''}`}>
                    {task.text}
                  </span>
                </div>
              ))}
              {childTasks.length > 3 && (
                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium pl-3.5">
                  + ещё {childTasks.length - 3} задач...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div 
            onClick={handleEnterContainer}
            className="p-3 rounded-lg border border-dashed border-indigo-200 dark:border-indigo-900/60 bg-white/40 dark:bg-black/10 text-center text-[11px] text-indigo-600/70 dark:text-indigo-400/70 hover:bg-indigo-50/50 transition-colors cursor-pointer"
          >
            Контейнер пуст (нажмите, чтобы открыть список)
          </div>
        )}

        {/* Action Controls Footer */}
        <div className="pt-2 mt-auto border-t border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between gap-2">
          
          {/* Dive into container button */}
          <button
            type="button"
            onClick={handleEnterContainer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            title="Открыть список задач этого бокса"
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Список задач</span>
            <ChevronRight className="w-3 h-3" />
          </button>

          {/* Quick add subtask directly into this container */}
          {onCreateTask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const taskName = prompt(`Добавить задачу в контейнер "${node.text}":`);
                if (taskName && taskName.trim()) {
                  onCreateTask(taskName.trim(), [], 'none', undefined, node.id);
                }
              }}
              className="p-1.5 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
              title="Добавить задачу внутрь контейнера"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ==========================================
// 3. EQUIPMENT CARD COMPONENT (ОБОРУДОВАНИЕ)
// ==========================================
interface EquipmentCardProps {
  key?: any;
  node: TaskNode;
  isSelected: boolean;
  cardSize: CardSize;
  showCovers: boolean;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onToggleSelectNode?: (id: string) => void;
  tagCategories: TagCategory[];
}

function EquipmentCard({
  node,
  isSelected,
  cardSize,
  showCovers,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onToggleSelectNode,
  tagCategories
}: EquipmentCardProps) {
  // Equipment Image cover
  const coverImage = useMemo(() => {
    if (!showCovers) return null;
    const imgFile = (node.files || []).find(f => 
      (f.type?.startsWith('image/') || 
       f.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || 
       (f.dataUrl && f.dataUrl.startsWith('data:image/')) ||
       f.googleDriveId) &&
      (f.googleDriveId || (f.dataUrl && f.dataUrl.trim() !== ''))
    );
    return imgFile || null;
  }, [node.files, showCovers]);

  const [copiedBarcode, setCopiedBarcode] = useState(false);

  const handleCopyBarcode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.equipmentBarcode) {
      navigator.clipboard.writeText(node.equipmentBarcode);
      setCopiedBarcode(true);
      setTimeout(() => setCopiedBarcode(false), 1500);
    }
  };

  const healthBadge = {
    on_track: { label: 'Исправно', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/40', icon: ShieldCheck },
    at_risk: { label: 'Требует ТО', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/40', icon: AlertTriangle },
    off_track: { label: 'В ремонте', bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800/40', icon: ShieldAlert },
  }[node.health || 'on_track'];

  const HealthIcon = healthBadge.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => onSelectNode(node.id, e)}
      className={`group relative flex flex-col rounded-xl bg-white dark:bg-[#1C1B18] border-2 transition-all duration-150 cursor-pointer overflow-hidden shadow-xs hover:shadow-lg ${
        isSelected 
          ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/20 shadow-amber-100 dark:shadow-none' 
          : 'border-amber-300/80 dark:border-amber-700/60 hover:border-amber-500 dark:hover:border-amber-600'
      }`}
    >
      
      {/* Top Equipment Industrial Tech Badge Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-3.5 py-1.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-amber-200" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-50">
            ⚙️ ОБОРУДОВАНИЕ
          </span>
        </div>

        {/* Health status badge */}
        <div className="flex items-center gap-1 bg-black/25 px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-100">
          <HealthIcon className="w-3 h-3 text-amber-200" />
          <span>{healthBadge.label}</span>
        </div>
      </div>

      {/* Equipment Image Cover if present */}
      {coverImage && (coverImage.googleDriveId || (coverImage.dataUrl && coverImage.dataUrl.trim() !== '')) && (
        <div className="relative w-full h-32 bg-amber-950/20 overflow-hidden border-b border-amber-200 dark:border-amber-900/40">
          {coverImage.googleDriveId ? (
            <GoogleDriveImage
              driveId={coverImage.googleDriveId}
              alt={node.text}
              sz="w400"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              fallbackUrl={coverImage.dataUrl}
            />
          ) : coverImage.dataUrl ? (
            <img
              src={coverImage.dataUrl}
              alt={node.text}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : null}
        </div>
      )}

      {/* Equipment Details Content */}
      <div className={`p-4 flex flex-col flex-1 bg-gradient-to-b from-amber-50/30 to-transparent dark:from-amber-950/15 ${cardSize === 'small' ? 'space-y-2.5' : 'space-y-3.5'}`}>
        
        {/* Title and Hardware Icon */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0 font-bold shadow-2xs">
              {node.icon || <Cpu className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#37352F] dark:text-[#E3E2E0] leading-snug">
                {node.text || 'Оборудование без имени'}
              </h4>
              {node.equipmentModel && (
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Модель: {node.equipmentModel}
                </p>
              )}
            </div>
          </div>

          {onToggleSelectNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectNode(node.id);
              }}
              className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100 text-amber-600' : 'text-slate-400'}`}
              title="Выбрать оборудование"
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                {isSelected && <Check className="w-2.5 h-2.5" />}
              </div>
            </button>
          )}
        </div>

        {/* Technical Specification Chips Grid */}
        <div className="space-y-2 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg p-2.5 border border-amber-200/70 dark:border-amber-800/40 text-xs">
          
          {/* Barcode / Barkod */}
          {node.equipmentBarcode ? (
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <span className="text-[#787774] dark:text-[#9B9A97] flex items-center gap-1 font-medium">
                <Barcode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Штрихкод:</span>
              </span>
              <button
                type="button"
                onClick={handleCopyBarcode}
                className="font-mono bg-white dark:bg-black/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-[#37352F] dark:text-[#E3E2E0] flex items-center gap-1 hover:bg-amber-100 transition-colors cursor-pointer"
                title="Нажмите для копирования"
              >
                <span>{node.equipmentBarcode}</span>
                {copiedBarcode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-2.5 h-2.5 opacity-60" />}
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-amber-700/60 dark:text-amber-400/60 italic">
              Штрихкод не задан
            </div>
          )}

          {/* Stock Code / Stok kod */}
          {node.equipmentStockCode && (
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <span className="text-[#787774] dark:text-[#9B9A97] flex items-center gap-1 font-medium">
                <Hash className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Артикул:</span>
              </span>
              <span className="font-semibold px-2 py-0.5 bg-white dark:bg-black/40 rounded border border-amber-200 dark:border-amber-800 text-[#37352F] dark:text-[#E3E2E0]">
                {node.equipmentStockCode}
              </span>
            </div>
          )}

          {/* Technical Note / Qeyd */}
          {node.equipmentNote && (
            <div className="pt-1 border-t border-amber-200/50 dark:border-amber-800/30 text-[11px] text-[#5A5955] dark:text-[#B0B0A8] leading-relaxed">
              <span className="font-bold text-amber-800 dark:text-amber-300">Примечание: </span>
              {node.equipmentNote}
            </div>
          )}

        </div>

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {node.tags.map((tag) => {
              const colors = getNotionTagColor(tag);
              return (
                <span
                  key={tag}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}
                >
                  #{tag}
                </span>
              );
            })}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 mt-auto border-t border-amber-200/60 dark:border-amber-800/40 flex items-center justify-between text-[11px] text-[#787774] dark:text-[#9B9A97]">
          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
            Инвентарь & Оснастка
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(node.id, e, 'details');
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Параметры</span>
          </button>
        </div>

      </div>

    </motion.div>
  );
}
