import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Circle, 
  CheckCircle2, 
  Loader2, 
  Tag, 
  Calendar, 
  ChevronUp, 
  ChevronDown, 
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal, 
  ArrowUpDown, 
  FileText, 
  Link as LinkIcon, 
  Maximize2, 
  Minimize2, 
  Timer, 
  MessageSquare, 
  Layers, 
  Search, 
  MoreHorizontal, 
  ExternalLink, 
  Check, 
  Eye,
  GripVertical,
  Star,
  Share2,
  CheckSquare,
  Square,
  Sparkles,
  Smile,
  Copy,
  Clock,
  Menu,
  X,
  User,
  Filter,
  Paperclip,
  Flame,
  Zap,
  ListFilter
} from 'lucide-react';
import { TaskNode, Priority, TagCategory, ViewMode } from '../types';
import { generateId, getPomoStatsForNode, formatTotalPomoTime, getTaskExternalLinks } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface MobileListViewProps {
  nodes: TaskNode[];
  tagCategories: TagCategory[];
  activeProjectId: string;
  selectedNodeId: string | null;
  activePomodoroNodeId?: string | null;
  onSelectNode: (id: string | null, eOrIsMulti?: any, initialTab?: 'details' | 'chat') => void;
  onUpdateNode: (node: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onCreateTask: (text: string, tags: string[], priority: Priority, dueDate?: string, parentId?: string | null) => void;
  onCreateTagCategory?: (name: string, color: string) => void;
  onUpdateTagCategory?: (id: string, name: string, color: string, tags: string[]) => void;
  onDeleteTagCategory?: (id: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
  onFocusTaskOnCanvas?: (id: string) => void;
  onFocusedTaskIdChange?: (id: string | null) => void;
  
  // Multi-select properties
  selectedNodeIds?: string[];
  isMultiSelectMode?: boolean;
  onToggleSelectNode?: (id: string) => void;
  onSelectNodes?: (ids: string[]) => void;
  onBulkDelete?: () => void;
  onBulkToggleCompleted?: (completed: boolean) => void;
  setIsMultiSelectMode?: (val: boolean) => void;

  // Notion project & view control props
  projectName?: string;
  projectIcon?: string;
  onUpdateProjectName?: (name: string) => void;
  onUpdateProjectIcon?: (icon: string) => void;
  setViewMode?: (mode: ViewMode) => void;
  onOpenSidebar?: () => void;
}

interface TaskTreeItem {
  node: TaskNode;
  children: TaskTreeItem[];
}

// Authentic Notion Pastel Color Palette for Tag Pills
const NOTION_TAG_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  blue: { bg: 'bg-[#E8F3FF]', text: 'text-[#1E67C6]', darkBg: 'dark:bg-[#1E3A5F]', darkText: 'dark:text-[#90CDF4]' },
  yellow: { bg: 'bg-[#FFF5E5]', text: 'text-[#9A6700]', darkBg: 'dark:bg-[#4A3B18]', darkText: 'dark:text-[#FBD38D]' },
  purple: { bg: 'bg-[#F6EEFF]', text: 'text-[#7843B6]', darkBg: 'dark:bg-[#3D2561]', darkText: 'dark:text-[#D6BCFA]' },
  teal: { bg: 'bg-[#E8F9F3]', text: 'text-[#0F766E]', darkBg: 'dark:bg-[#1B4D43]', darkText: 'dark:text-[#81E6D9]' },
  red: { bg: 'bg-[#FDF0EE]', text: 'text-[#C53030]', darkBg: 'dark:bg-[#5C2323]', darkText: 'dark:text-[#FEB2B2]' },
  pink: { bg: 'bg-[#F8E8F8]', text: 'text-[#97266D]', darkBg: 'dark:bg-[#4C1D4A]', darkText: 'dark:text-[#F687B3]' },
  brown: { bg: 'bg-[#F0EEEB]', text: 'text-[#5A554E]', darkBg: 'dark:bg-[#3A3733]', darkText: 'dark:text-[#CBD5E0]' },
  gray: { bg: 'bg-[#F1F3F5]', text: 'text-[#495057]', darkBg: 'dark:bg-[#373E47]', darkText: 'dark:text-[#E2E8F0]' },
  green: { bg: 'bg-[#EBF7EE]', text: 'text-[#2B7A4B]', darkBg: 'dark:bg-[#1C452C]', darkText: 'dark:text-[#9AE6B4]' },
  orange: { bg: 'bg-[#FFF0E6]', text: 'text-[#C05621]', darkBg: 'dark:bg-[#4E2D1A]', darkText: 'dark:text-[#FEEBC8]' },
};

// Map tag names / categories to Notion tag color schemes
function getNotionTagStyle(tagName: string): { bg: string; text: string; darkBg: string; darkText: string } {
  const lower = (tagName || '').toLowerCase();
  if (lower.includes('kickoff') || lower.includes('проект') || lower.includes('старт')) return NOTION_TAG_COLORS.blue;
  if (lower.includes('comment') || lower.includes('rfc') || lower.includes('обсуждение') || lower.includes('интервью')) return NOTION_TAG_COLORS.yellow;
  if (lower.includes('spec') || lower.includes('tech') || lower.includes('тз') || lower.includes('архитектур') || lower.includes('движок')) return NOTION_TAG_COLORS.purple;
  if (lower.includes('analysis') || lower.includes('data') || lower.includes('анализ') || lower.includes('данные')) return NOTION_TAG_COLORS.teal;
  if (lower.includes('overview') || lower.includes('postgres') || lower.includes('db') || lower.includes('база')) return NOTION_TAG_COLORS.red;
  if (lower.includes('research') || lower.includes('study') || lower.includes('исследован') || lower.includes('отзыв')) return NOTION_TAG_COLORS.pink;
  if (lower.includes('plan') || lower.includes('план') || lower.includes('roadmap') || lower.includes('модель')) return NOTION_TAG_COLORS.brown;
  if (lower.includes('report') || lower.includes('отчет') || lower.includes('решение') || lower.includes('лог')) return NOTION_TAG_COLORS.gray;
  if (lower.includes('release') || lower.includes('релиз') || lower.includes('готов')) return NOTION_TAG_COLORS.green;
  if (lower.includes('review') || lower.includes('код') || lower.includes('ревью')) return NOTION_TAG_COLORS.blue;
  
  // Hash string to pick deterministic color
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorKeys = Object.keys(NOTION_TAG_COLORS);
  const colorKey = colorKeys[Math.abs(hash) % colorKeys.length];
  return NOTION_TAG_COLORS[colorKey];
}

// Notion Priority Pills: P1 (Urgent), P2 (High), P3 (Medium), P4 (Low/None)
function getNotionPriorityBadge(priority: Priority): { label: string; bg: string; text: string; darkBg: string; darkText: string } {
  switch (priority) {
    case 'urgent':
      return { label: 'P1', bg: 'bg-[#FDF0EE]', text: 'text-[#C53030]', darkBg: 'dark:bg-[#5C2323]', darkText: 'dark:text-[#FEB2B2]' };
    case 'high':
      return { label: 'P1', bg: 'bg-[#FDF0EE]', text: 'text-[#C53030]', darkBg: 'dark:bg-[#5C2323]', darkText: 'dark:text-[#FEB2B2]' };
    case 'medium':
      return { label: 'P2', bg: 'bg-[#FFF5E5]', text: 'text-[#DD6B20]', darkBg: 'dark:bg-[#4A3B18]', darkText: 'dark:text-[#FBD38D]' };
    case 'low':
      return { label: 'P3', bg: 'bg-[#FEFCE8]', text: 'text-[#CA8A04]', darkBg: 'dark:bg-[#423C15]', darkText: 'dark:text-[#FDE047]' };
    case 'none':
    default:
      return { label: 'P4', bg: 'bg-[#F1F3F5]', text: 'text-[#718096]', darkBg: 'dark:bg-[#373E47]', darkText: 'dark:text-[#CBD5E0]' };
  }
}

// Notion Illustrated Face Avatars (matching the screenshot)
const NOTION_AVATARS = [
  { id: 'av-1', name: 'Alex', svg: (
    <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
      <circle cx="18" cy="18" r="17" fill="#F7F7F5" stroke="#37352F" strokeWidth="1.5" />
      {/* Hair */}
      <path d="M11 15C11 11 14 9 18 9C22 9 25 11 25 15C25 16 24 16 23 15C21 14 19 14 18 14C17 14 15 14 13 15C12 16 11 16 11 15Z" fill="#37352F" />
      {/* Glasses */}
      <rect x="13" y="16" width="4" height="3" rx="1" fill="none" stroke="#37352F" strokeWidth="1.2" />
      <rect x="19" y="16" width="4" height="3" rx="1" fill="none" stroke="#37352F" strokeWidth="1.2" />
      <line x1="17" y1="17.5" x2="19" y2="17.5" stroke="#37352F" strokeWidth="1.2" />
      {/* Smile */}
      <path d="M16 23C17 24 19 24 20 23" stroke="#37352F" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )},
  { id: 'av-2', name: 'Elena', svg: (
    <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
      <circle cx="18" cy="18" r="17" fill="#F7F7F5" stroke="#37352F" strokeWidth="1.5" />
      {/* Long dark hair */}
      <path d="M10 14C10 9 13 8 18 8C23 8 26 9 26 14C26 21 25 24 25 24C24 20 23 18 23 15C22 13 19 13 18 13C17 13 14 13 13 15C13 18 12 20 11 24C11 24 10 21 10 14Z" fill="#37352F" />
      {/* Eyes */}
      <circle cx="15" cy="17" r="1.2" fill="#37352F" />
      <circle cx="21" cy="17" r="1.2" fill="#37352F" />
      {/* Smile */}
      <path d="M16 22C17 23 19 23 20 22" stroke="#37352F" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )},
  { id: 'av-3', name: 'Max', svg: (
    <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
      <circle cx="18" cy="18" r="17" fill="#F7F7F5" stroke="#37352F" strokeWidth="1.5" />
      {/* Curly hair */}
      <path d="M11 14C10 12 12 9 15 9C16 8 18 8 20 9C23 9 25 11 25 14C25 15 24 15 23 14C21 13 19 13 18 13C17 13 15 13 13 14C12 15 11 15 11 14Z" fill="#37352F" />
      {/* Eyes & Eyebrows */}
      <circle cx="15" cy="16" r="1.2" fill="#37352F" />
      <circle cx="21" cy="16" r="1.2" fill="#37352F" />
      {/* Beard */}
      <path d="M14 21C14 25 22 25 22 21" stroke="#37352F" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )},
  { id: 'av-4', name: 'Sophia', svg: (
    <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
      <circle cx="18" cy="18" r="17" fill="#F7F7F5" stroke="#37352F" strokeWidth="1.5" />
      {/* Bob hair */}
      <path d="M11 16C11 10 13 9 18 9C23 9 25 10 25 16C25 20 24 21 24 21C23 18 23 16 22 14C21 13 19 13 18 13C17 13 15 13 14 14C13 16 13 18 12 21C12 21 11 20 11 16Z" fill="#37352F" />
      {/* Eyes */}
      <circle cx="15.5" cy="17" r="1.2" fill="#37352F" />
      <circle cx="20.5" cy="17" r="1.2" fill="#37352F" />
      {/* Smile */}
      <path d="M16.5 22C17.5 23 18.5 23 19.5 22" stroke="#37352F" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )}
];

// Helper to get or pick a Notion avatar deterministically for a task
function getTaskNotionAvatar(task: TaskNode) {
  if (task.assigneeAvatar) {
    const found = NOTION_AVATARS.find(a => a.id === task.assigneeAvatar);
    if (found) return found;
  }
  let hash = 0;
  const str = task.id + (task.text || '');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % NOTION_AVATARS.length;
  return NOTION_AVATARS[idx];
}

// Popular curated emojis for Notion Docs items matching the screenshot
const NOTION_SAMPLE_EMOJIS = [
  '🐵', '🤝', '🚂', '🏗️', '📬', '🛢️', '🥕', '📝', '⌨️', '👩‍💻', '⬆️', '📖', '🦜',
  '📄', '📎', '💡', '🚀', '🎯', '✨', '⚡', '📊', '🔍', '📌', '🛠️', '🔒', '📦', '💬'
];

export default function MobileListView({
  nodes,
  tagCategories = [],
  activeProjectId,
  selectedNodeId,
  activePomodoroNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onCreateTask,
  onCreateTagCategory,
  onUpdateTagCategory,
  onDeleteTagCategory,
  onFullScreenChange,
  onFocusTaskOnCanvas,
  onFocusedTaskIdChange,
  
  // Multi-select properties
  selectedNodeIds = [],
  isMultiSelectMode = false,
  onToggleSelectNode,
  onSelectNodes,
  onBulkDelete,
  onBulkToggleCompleted,
  setIsMultiSelectMode,

  // Notion project & view control props
  projectName = 'Docs',
  projectIcon = '📎',
  onUpdateProjectName,
  onUpdateProjectIcon,
  setViewMode,
  onOpenSidebar
}: MobileListViewProps) {
  // Visible column properties toggles
  const [visibleProps, setVisibleProps] = useState({
    tag: true,
    priority: true,
    assignee: true,
    dueDate: true,
    checkbox: true,
    subtasks: true,
    comments: true,
    pomodoro: false
  });

  // Inline editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Inline quick item addition row
  const [isInlineAdding, setIsInlineAdding] = useState(false);
  const [inlineNewTitle, setInlineNewTitle] = useState('');
  const [inlineNewEmoji, setInlineNewEmoji] = useState('📄');
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // Task-specific popovers
  const [activeEmojiPickerTaskId, setActiveEmojiPickerTaskId] = useState<string | null>(null);
  const [activeTagPickerTaskId, setActiveTagPickerTaskId] = useState<string | null>(null);
  const [activePriorityPickerTaskId, setActivePriorityPickerTaskId] = useState<string | null>(null);
  const [activeAssigneePickerTaskId, setActiveAssigneePickerTaskId] = useState<string | null>(null);
  const [activeTaskMenuId, setActiveTaskMenuId] = useState<string | null>(null);

  // Collapsed parents state for nested subtasks
  const [collapsedParentIds, setCollapsedParentIds] = useState<Record<string, boolean>>({});

  // Drag & drop state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | 'inside' | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingNodeId(null);
        setIsInlineAdding(false);
        setActiveEmojiPickerTaskId(null);
        setActiveTagPickerTaskId(null);
        setActivePriorityPickerTaskId(null);
        setActiveAssigneePickerTaskId(null);
        setActiveTaskMenuId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus inline input when triggered
  useEffect(() => {
    if (isInlineAdding && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [isInlineAdding]);

  // Clean task title & get icon
  const getTaskDisplayIcon = (task: TaskNode) => {
    if (task.icon) return task.icon;
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
    const match = task.text.match(emojiRegex);
    if (match) return match[0];
    return '📄';
  };

  const getTaskCleanText = (task: TaskNode) => {
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u;
    return task.text.replace(emojiRegex, '').trim() || task.text;
  };

  // Available tag categories & tags
  const allAvailableTags = useMemo(() => {
    const fromProps = tagCategories.flatMap(c => c.tags || []);
    const fromNodes = nodes.flatMap(n => n.tags || []);
    return Array.from(new Set([...fromProps, ...fromNodes])).filter(Boolean);
  }, [tagCategories, nodes]);

  // Friendly date helper
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const formatRowDate = (dateStr?: string) => {
    if (!dateStr) return null;
    if (dateStr === todayStr) return { text: 'Сегодня', shortText: 'Сег.', isOverdue: false, isToday: true };
    if (dateStr === tomorrowStr) return { text: 'Завтра', shortText: 'Завтра', isOverdue: false, isToday: false };
    if (dateStr < todayStr) return { text: 'Просрочено', shortText: 'Проср.', isOverdue: true, isToday: false };
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const day = parseInt(parts[2], 10);
        const mIdx = parseInt(parts[1], 10) - 1;
        return { text: `${day} ${months[mIdx]}`, shortText: `${day} ${months[mIdx]}`, isOverdue: false, isToday: false };
      }
    } catch {}
    return { text: dateStr, shortText: dateStr, isOverdue: false, isToday: false };
  };

  // Build hierarchical task tree
  const taskTreeRoots = useMemo(() => {
    const list = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.isNotTask);
    const nodeMap = new Map<string, TaskTreeItem>();
    list.forEach(node => {
      nodeMap.set(node.id, { node, children: [] });
    });

    const roots: TaskTreeItem[] = [];
    list.forEach(node => {
      const item = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(item);
      } else {
        roots.push(item);
      }
    });

    return roots;
  }, [nodes]);

  // Statistics
  const totalCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.isNotTask).length;
  const completedCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.isNotTask && n.completed).length;
  const activeCount = totalCount - completedCount;
  const overdueCount = nodes.filter(n => !n.isContainer && !n.isWorkflowRectangle && !n.isNotTask && !n.completed && n.dueDate && n.dueDate < todayStr).length;

  // Handlers for task mutations
  const handleToggleComplete = (task: TaskNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onUpdateNode({
      ...task,
      completed: !task.completed
    });
  };

  const handleUpdateIcon = (taskId: string, newIcon: string) => {
    const task = nodes.find(n => n.id === taskId);
    if (!task) return;
    onUpdateNode({
      ...task,
      icon: newIcon
    });
    setActiveEmojiPickerTaskId(null);
  };

  const handleUpdatePriority = (taskId: string, newPriority: Priority) => {
    const task = nodes.find(n => n.id === taskId);
    if (!task) return;
    onUpdateNode({
      ...task,
      priority: newPriority
    });
    setActivePriorityPickerTaskId(null);
  };

  const handleToggleTag = (taskId: string, tagName: string) => {
    const task = nodes.find(n => n.id === taskId);
    if (!task) return;
    const currentTags = task.tags || [];
    const hasTag = currentTags.includes(tagName);
    const updatedTags = hasTag ? currentTags.filter(t => t !== tagName) : [...currentTags, tagName];
    onUpdateNode({
      ...task,
      tags: updatedTags
    });
  };

  const handleUpdateAssignee = (taskId: string, avatarId: string) => {
    const task = nodes.find(n => n.id === taskId);
    if (!task) return;
    onUpdateNode({
      ...task,
      assigneeAvatar: avatarId
    });
    setActiveAssigneePickerTaskId(null);
  };

  const handleSaveInlineTitle = (task: TaskNode) => {
    if (editingTitleText.trim()) {
      onUpdateNode({
        ...task,
        text: editingTitleText.trim()
      });
    }
    setEditingNodeId(null);
  };

  const handleCreateInlineTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inlineNewTitle.trim()) {
      setIsInlineAdding(false);
      return;
    }
    const fullText = inlineNewEmoji ? `${inlineNewEmoji} ${inlineNewTitle.trim()}` : inlineNewTitle.trim();
    onCreateTask(fullText, [], 'none', undefined, null);
    setInlineNewTitle('');
    // Keep adding mode active for rapid creation, like Notion
    setTimeout(() => {
      if (inlineInputRef.current) inlineInputRef.current.focus();
    }, 50);
  };

  const handleDuplicateTask = (task: TaskNode) => {
    onCreateTask(
      `Копия: ${task.text}`,
      [...(task.tags || [])],
      task.priority || 'none',
      task.dueDate,
      task.parentId
    );
    setActiveTaskMenuId(null);
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedNodeId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedNodeId === id) return;
    setDragOverNodeId(id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    if (relY < rect.height * 0.3) {
      setDragOverPosition('above');
    } else if (relY > rect.height * 0.7) {
      setDragOverPosition('below');
    } else {
      setDragOverPosition('inside');
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedNodeId;
    setDraggedNodeId(null);
    setDragOverNodeId(null);
    setDragOverPosition(null);

    if (!sourceId || sourceId === targetId) return;

    const sourceTask = nodes.find(n => n.id === sourceId);
    const targetTask = nodes.find(n => n.id === targetId);
    if (!sourceTask || !targetTask) return;

    if (dragOverPosition === 'inside') {
      // Make source a subtask of target
      onUpdateNode({
        ...sourceTask,
        parentId: targetId
      });
      setCollapsedParentIds(prev => ({ ...prev, [targetId]: false }));
    } else {
      // Move to same parent level as target
      onUpdateNode({
        ...sourceTask,
        parentId: targetTask.parentId || null
      });
    }
  };

  // Render recursive Notion row item
  const renderNotionRow = (item: TaskTreeItem, depth = 0) => {
    const { node, children } = item;
    const isSelected = selectedNodeId === node.id;
    const isChecked = isMultiSelectMode && selectedNodeIds.includes(node.id);
    const isEditing = editingNodeId === node.id;
    const isCollapsed = !!collapsedParentIds[node.id];
    const hasChildren = children.length > 0;

    const displayIcon = getTaskDisplayIcon(node);
    const cleanTitle = getTaskCleanText(node);
    const priorityBadge = getNotionPriorityBadge(node.priority);
    const avatar = getTaskNotionAvatar(node);
    const dateInfo = formatRowDate(node.dueDate);
    const primaryTag = node.tags && node.tags.length > 0 ? node.tags[0] : null;
    const tagStyle = primaryTag ? getNotionTagStyle(primaryTag) : null;

    const isDragTarget = dragOverNodeId === node.id;

    return (
      <div 
        key={node.id} 
        id={`notion-task-row-${node.id}`}
        className="flex flex-col select-none relative"
      >
        {/* Drop indicator above */}
        {isDragTarget && dragOverPosition === 'above' && (
          <div className="h-0.5 bg-[#2383e2] w-full rounded-full my-0.5 animate-pulse" />
        )}

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDrop={(e) => handleDrop(e, node.id)}
          onClick={(e) => {
            if (isMultiSelectMode && onToggleSelectNode) {
              onToggleSelectNode(node.id);
            } else {
              onSelectNode(node.id, e);
            }
          }}
          className={`group flex items-center justify-between py-1.5 px-1.5 sm:px-2 rounded-md transition-all duration-150 cursor-pointer border border-transparent ${
            isSelected
              ? 'bg-[#EBF5FB] dark:bg-[#1E3A5F]/40 border-[#D4E6F1] dark:border-[#2B4C7E]'
              : isChecked
                ? 'bg-[#F0F7FF] dark:bg-[#1C2D42]'
                : 'hover:bg-[#F7F7F5] dark:hover:bg-[#202020]'
          } ${isDragTarget && dragOverPosition === 'inside' ? 'ring-2 ring-[#2383e2] bg-[#E8F3FF] dark:bg-[#1E3A5F]' : ''}`}
          style={{ paddingLeft: `${Math.max(4, Math.min(depth * 14 + 4, 36))}px` }}
        >
          {/* Left: Drag Handle, Chevron, Checkbox, Emoji Icon, Title */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-1.5 sm:pr-2">
            
            {/* Drag 6-dots handle (appears on hover on desktop) */}
            <div 
              className="hidden sm:block opacity-0 group-hover:opacity-100 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] cursor-grab active:cursor-grabbing p-0.5 -ml-1 transition-opacity shrink-0"
              title="Перетащить для изменения порядка или вложения"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Hierarchical Chevron toggle for child items */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsedParentIds(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                }}
                className="p-0.5 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] rounded hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] transition-colors shrink-0"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 ${!isCollapsed ? 'rotate-90' : ''}`} />
              </button>
            ) : depth > 0 ? (
              <span className="w-2.5 sm:w-3.5 shrink-0" />
            ) : null}

            {/* Multi-select checkbox if mode is enabled or on row hover */}
            {isMultiSelectMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToggleSelectNode) onToggleSelectNode(node.id);
                }}
                className="text-[#9B9A97] hover:text-[#2383e2] shrink-0 p-0.5 cursor-pointer"
              >
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-[#2383e2] fill-[#2383e2]/10" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Notion Task Completion Checkbox */}
            {visibleProps.checkbox && !isMultiSelectMode && (
              <button
                type="button"
                onClick={(e) => handleToggleComplete(node, e)}
                className={`p-0.5 rounded transition-all shrink-0 cursor-pointer ${
                  node.completed
                    ? 'text-[#2383e2]'
                    : 'text-[#C4C3C0] hover:text-[#37352F] dark:hover:text-[#D4D4D4]'
                }`}
                title={node.completed ? "Отметить невыполненной" : "Отметить выполненной"}
              >
                {node.completed ? (
                  <CheckCircle2 className="w-4 h-4 fill-[#2383e2]/15 text-[#2383e2]" />
                ) : (
                  <Circle className="w-4 h-4 stroke-[1.75]" />
                )}
              </button>
            )}

            {/* Notion Emoji / Document Page Icon (Clickable popover) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveEmojiPickerTaskId(activeEmojiPickerTaskId === node.id ? null : node.id);
                }}
                className="w-5 h-5 flex items-center justify-center text-sm rounded hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer"
                title="Изменить иконку страницы"
              >
                {displayIcon}
              </button>

              {/* Instant Emoji Picker Popover */}
              {activeEmojiPickerTaskId === node.id && (
                <div 
                  className="fixed z-[160] bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#373737] rounded-xl shadow-2xl p-2.5 w-64 animate-in fade-in zoom-in-95 duration-150 select-text"
                  style={{ top: 'auto', left: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E9E9E7] dark:border-[#373737]">
                    <span className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97]">Иконка страницы</span>
                    <button
                      onClick={() => setActiveEmojiPickerTaskId(null)}
                      className="p-0.5 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto">
                    {NOTION_SAMPLE_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleUpdateIcon(node.id, emoji)}
                        className="w-7 h-7 flex items-center justify-center text-base rounded hover:bg-[#F0EEEB] dark:hover:bg-[#2F2F2F] transition-all hover:scale-115 cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notion Task Title with inline edit and hover underline */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editingTitleText}
                  autoFocus
                  onChange={(e) => setEditingTitleText(e.target.value)}
                  onBlur={() => handleSaveInlineTitle(node)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveInlineTitle(node);
                    if (e.key === 'Escape') setEditingNodeId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-white dark:bg-[#191919] border border-[#2383e2] rounded px-1.5 py-0.5 text-[13.5px] sm:text-[14px] text-[#37352F] dark:text-[#EBEBEB] focus:outline-none"
                />
              ) : (
                <span 
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                    setEditingTitleText(cleanTitle);
                  }}
                  className={`text-[13.5px] sm:text-[14px] leading-snug font-normal md:font-medium text-[#37352F] dark:text-[#EBEBEB] group-hover:underline underline-offset-2 truncate transition-colors flex-1 min-w-[60px] sm:min-w-0 ${
                    node.completed ? 'line-through opacity-50 text-[#787774] dark:text-[#8F8F8F]' : ''
                  }`}
                  title={cleanTitle}
                >
                  {cleanTitle}
                </span>
              )}

              {/* Subtasks Count Badge if any */}
              {visibleProps.subtasks && hasChildren && (
                <span className="text-[10px] text-[#787774] dark:text-[#8F8F8F] bg-[#F1F1EF] dark:bg-[#2B2B2B] px-1.5 py-0.2 rounded-full font-mono shrink-0">
                  {children.filter(c => c.node.completed).length}/{children.length}
                </span>
              )}

              {/* Comments Badge if any */}
              {visibleProps.comments && node.comments && node.comments.length > 0 && (
                <span className="hidden xs:inline-flex items-center gap-0.5 text-[10px] text-[#787774] dark:text-[#8F8F8F] bg-[#F1F1EF] dark:bg-[#2B2B2B] px-1.5 py-0.2 rounded font-sans shrink-0">
                  <MessageSquare className="w-2.5 h-2.5" />
                  {node.comments.length}
                </span>
              )}

              {/* Files Attached Badge if any */}
              {node.files && node.files.length > 0 && (
                <span className="hidden xs:inline-flex items-center gap-0.5 text-[10px] text-[#787774] dark:text-[#8F8F8F] shrink-0" title={`${node.files.length} вложенных файлов`}>
                  <Paperclip className="w-2.5 h-2.5" />
                </span>
              )}

              {/* Active Pomodoro Timer if running */}
              {activePomodoroNodeId === node.id && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-900 animate-pulse shrink-0">
                  <Timer className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">Фокус</span>
                </span>
              )}
            </div>
          </div>

          {/* Right Properties: Tag Pill, Priority Pill, Assignee Avatar, Date, Hover Actions (Matching SS_List.png) */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0 ml-1">
            
            {/* 1. Tag / Category Pill in authentic Notion pastel colors (Hidden on mobile to prioritize title) */}
            {visibleProps.tag && (
              <div className="hidden sm:block relative shrink-0">
                {primaryTag ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTagPickerTaskId(activeTagPickerTaskId === node.id ? null : node.id);
                    }}
                    className={`text-[12px] font-medium px-2 py-0.5 rounded transition-transform hover:scale-105 cursor-pointer whitespace-nowrap ${tagStyle?.bg} ${tagStyle?.text} ${tagStyle?.darkBg} ${tagStyle?.darkText}`}
                  >
                    {primaryTag}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTagPickerTaskId(activeTagPickerTaskId === node.id ? null : node.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[11px] text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] px-1.5 py-0.5 rounded transition-all cursor-pointer"
                  >
                    + Тег
                  </button>
                )}

                {/* Tag Selection Popover */}
                {activeTagPickerTaskId === node.id && (
                  <div 
                    className="fixed z-[160] bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#373737] rounded-xl shadow-2xl p-2.5 w-52 animate-in fade-in duration-150 select-text"
                    style={{ top: 'auto', right: 'auto' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] pb-1.5 mb-1.5 border-b border-[#E9E9E7] dark:border-[#373737] flex items-center justify-between">
                      <span>Категория / Тег</span>
                      <button onClick={() => setActiveTagPickerTaskId(null)}>
                        <X className="w-3.5 h-3.5 text-[#9B9A97]" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {['Project Kickoff', 'Request for Comment', 'Technical Spec', 'Data Analysis', 'Architecture Overview', 'Research', 'Planning', 'Reporting', ...allAvailableTags.filter(t => !['Project Kickoff', 'Request for Comment', 'Technical Spec', 'Data Analysis', 'Architecture Overview', 'Research', 'Planning', 'Reporting'].includes(t))].map(tag => {
                        const style = getNotionTagStyle(tag);
                        const isSelectedTag = (node.tags || []).includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleTag(node.id, tag)}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                              isSelectedTag ? 'bg-[#F0F7FF] dark:bg-[#1C2D42]' : 'hover:bg-[#F7F7F5] dark:hover:bg-[#252525]'
                            }`}
                          >
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${style.bg} ${style.text} ${style.darkBg} ${style.darkText}`}>
                              {tag}
                            </span>
                            {isSelectedTag && <Check className="w-3.5 h-3.5 text-[#2383e2]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Priority Pill (P1, P2, P3, P4) */}
            {visibleProps.priority && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePriorityPickerTaskId(activePriorityPickerTaskId === node.id ? null : node.id);
                  }}
                  className={`text-[10.5px] sm:text-[12px] font-semibold px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded transition-transform hover:scale-105 cursor-pointer whitespace-nowrap ${priorityBadge.bg} ${priorityBadge.text} ${priorityBadge.darkBg} ${priorityBadge.darkText}`}
                  title={`Приоритет: ${node.priority || 'none'}`}
                >
                  {priorityBadge.label}
                </button>

                {/* Priority Selection Popover */}
                {activePriorityPickerTaskId === node.id && (
                  <div 
                    className="fixed z-[160] bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#373737] rounded-xl shadow-2xl p-2 w-44 animate-in fade-in duration-150 select-text"
                    style={{ top: 'auto', right: 'auto' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] pb-1.5 mb-1 border-b border-[#E9E9E7] dark:border-[#373737] flex items-center justify-between">
                      <span>Приоритет</span>
                      <button onClick={() => setActivePriorityPickerTaskId(null)}>
                        <X className="w-3.5 h-3.5 text-[#9B9A97]" />
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {[
                        { val: 'urgent', badge: getNotionPriorityBadge('urgent'), label: 'P1 (Критический)' },
                        { val: 'high', badge: getNotionPriorityBadge('high'), label: 'P1 (Высокий)' },
                        { val: 'medium', badge: getNotionPriorityBadge('medium'), label: 'P2 (Средний)' },
                        { val: 'low', badge: getNotionPriorityBadge('low'), label: 'P3 (Низкий)' },
                        { val: 'none', badge: getNotionPriorityBadge('none'), label: 'P4 (Без приоритета)' },
                      ].map(p => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => handleUpdatePriority(node.id, p.val as Priority)}
                          className="w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between hover:bg-[#F7F7F5] dark:hover:bg-[#252525] transition-colors"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${p.badge.bg} ${p.badge.text} ${p.badge.darkBg} ${p.badge.darkText}`}>
                            {p.badge.label}
                          </span>
                          <span className="text-[11px] text-[#787774] dark:text-[#9B9A97]">{p.label.split(' ')[1]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Assignee Illustrated Avatar Circle */}
            {visibleProps.assignee && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAssigneePickerTaskId(activeAssigneePickerTaskId === node.id ? null : node.id);
                  }}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden hover:ring-2 hover:ring-[#2383e2] transition-all cursor-pointer shadow-xs flex items-center justify-center"
                  title={`Исполнитель: ${avatar.name}`}
                >
                  {avatar.svg}
                </button>

                {/* Assignee Selection Popover */}
                {activeAssigneePickerTaskId === node.id && (
                  <div 
                    className="fixed z-[160] bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#373737] rounded-xl shadow-2xl p-2 w-40 animate-in fade-in duration-150 select-text"
                    style={{ top: 'auto', right: 'auto' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-semibold text-[#787774] dark:text-[#9B9A97] pb-1 mb-1.5 border-b border-[#E9E9E7] dark:border-[#373737]">
                      Исполнитель
                    </div>
                    <div className="space-y-1">
                      {NOTION_AVATARS.map(av => (
                        <button
                          key={av.id}
                          type="button"
                          onClick={() => handleUpdateAssignee(node.id, av.id)}
                          className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#F7F7F5] dark:hover:bg-[#252525] transition-colors text-xs text-left"
                        >
                          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                            {av.svg}
                          </div>
                          <span className="text-xs text-[#37352F] dark:text-[#EBEBEB]">{av.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Due Date Badge if enabled & present */}
            {visibleProps.dueDate && dateInfo && (
              <span 
                className={`text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded whitespace-nowrap ${
                  dateInfo.isOverdue 
                    ? 'bg-[#FDF0EE] text-[#C53030] dark:bg-[#5C2323] dark:text-[#FEB2B2] font-semibold animate-pulse'
                    : dateInfo.isToday
                      ? 'bg-[#FFF5E5] text-[#9A6700] dark:bg-[#4A3B18] dark:text-[#FBD38D] font-medium'
                      : 'text-[#787774] dark:text-[#8F8F8F]'
                }`}
              >
                <span className="sm:hidden">{dateInfo.shortText}</span>
                <span className="hidden sm:inline">{dateInfo.text}</span>
              </span>
            )}

            {/* 5. Hover Quick Action Buttons (Open Side Peek, Add subtask, 3-dots menu) */}
            <div className="hidden md:flex opacity-0 group-hover:opacity-100 items-center gap-0.5 transition-opacity ml-1 shrink-0">
              
              {/* Add subtask */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTask('Новая подзадача', [], 'none', undefined, node.id);
                  setCollapsedParentIds(prev => ({ ...prev, [node.id]: false }));
                }}
                className="p-1 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] rounded hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] transition-colors"
                title="Добавить подзадачу"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Open page details side peek */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id, e, 'details');
                }}
                className="p-1 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] rounded hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] transition-colors"
                title="Открыть страницу"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              {/* 3-dots Row Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTaskMenuId(activeTaskMenuId === node.id ? null : node.id);
                  }}
                  className="p-1 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] rounded hover:bg-[#EAEAEA] dark:hover:bg-[#2F2F2F] transition-colors"
                  title="Опции"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {activeTaskMenuId === node.id && (
                  <div 
                    className="fixed z-[160] bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#373737] rounded-xl shadow-2xl p-1.5 w-44 animate-in fade-in duration-150 select-text"
                    style={{ top: 'auto', right: 'auto' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNodeId(node.id);
                        setEditingTitleText(cleanTitle);
                        setActiveTaskMenuId(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#37352F] dark:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#252525] flex items-center gap-2"
                    >
                      <span>Переименовать</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateTask(node)}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#37352F] dark:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#252525] flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#9B9A97]" />
                      <span>Дублировать</span>
                    </button>
                    {onFocusTaskOnCanvas && (
                      <button
                        type="button"
                        onClick={() => {
                          onFocusTaskOnCanvas(node.id);
                          setActiveTaskMenuId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#37352F] dark:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#252525] flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Открыть на холсте</span>
                      </button>
                    )}
                    <div className="h-px bg-[#E9E9E7] dark:bg-[#373737] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteNode(node.id);
                        setActiveTaskMenuId(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Drop indicator below */}
        {isDragTarget && dragOverPosition === 'below' && (
          <div className="h-0.5 bg-[#2383e2] w-full rounded-full my-0.5 animate-pulse" />
        )}

        {/* Child items recursive rendering */}
        {hasChildren && !isCollapsed && (
          <div className="relative">
            {/* Notion subtle hierarchical guide line */}
            <div 
              className="absolute left-0 top-0 bottom-2 w-px bg-[#E9E9E7] dark:bg-[#333333]" 
              style={{ left: `${Math.max(8, Math.min(depth * 14 + 10, 36))}px` }} 
            />
            {children.map(child => renderNotionRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      id="notion-list-view-container"
      className="flex flex-col bg-white dark:bg-[#191919] text-[#37352F] dark:text-[#D4D4D4] font-sans h-full w-full overflow-hidden select-none relative"
    >
      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-2.5 sm:px-12 lg:px-20 pt-4 pb-24 max-w-5xl mx-auto w-full">
        
        {/* Notion List Rows */}
        <div className="space-y-0.5">
          {taskTreeRoots.length === 0 ? (
            <div className="py-16 text-center text-[#9B9A97]">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-[#787774] dark:text-[#9B9A97]">Список документов пуст</p>
              <p className="text-xs mt-1">Нажмите «New» или кнопку ниже, чтобы создать первую страницу</p>
              <button
                type="button"
                onClick={() => setIsInlineAdding(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2383e2] text-white text-xs font-semibold rounded-md shadow-xs hover:bg-[#1d6fc2] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать страницу</span>
              </button>
            </div>
          ) : (
            taskTreeRoots.map(item => renderNotionRow(item, 0))
          )}
        </div>

        {/* Inline "+ New page" Row at the bottom of the list */}
        {isInlineAdding ? (
          <form 
            onSubmit={handleCreateInlineTask}
            className="flex items-center gap-2 py-2 px-2.5 rounded-md bg-[#F7F7F5] dark:bg-[#202020] border border-[#2383e2] mt-1 animate-in fade-in duration-100"
          >
            <span className="text-base">{inlineNewEmoji}</span>
            <input
              ref={inlineInputRef}
              type="text"
              value={inlineNewTitle}
              onChange={(e) => setInlineNewTitle(e.target.value)}
              placeholder="Название новой страницы (Enter для создания, Esc для отмены)..."
              className="flex-1 bg-transparent text-sm text-[#37352F] dark:text-[#EBEBEB] focus:outline-none placeholder-[#9B9A97]"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsInlineAdding(false);
              }}
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-[#2383e2] hover:bg-[#1d6fc2] text-white text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              Добавить
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsInlineAdding(true)}
            className="flex items-center gap-2 py-1.5 px-2.5 text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#EBEBEB] hover:bg-[#F7F7F5] dark:hover:bg-[#202020] rounded-md transition-colors cursor-pointer mt-1 text-xs font-medium w-full text-left group"
          >
            <Plus className="w-4 h-4 text-[#9B9A97] group-hover:text-[#37352F] dark:group-hover:text-[#EBEBEB]" />
            <span>New page</span>
          </button>
        )}

      </div>

      {/* Multi-Select Bottom Floating Action Bar */}
      {isMultiSelectMode && selectedNodeIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#202020] text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 z-[140] animate-in slide-in-from-bottom-4 duration-200 border border-[#373737]">
          <span className="text-xs font-semibold text-[#D4D4D4]">
            Выбрано: {selectedNodeIds.length}
          </span>
          <div className="h-4 w-px bg-[#444444]" />
          
          {onBulkToggleCompleted && (
            <button
              type="button"
              onClick={() => onBulkToggleCompleted(true)}
              className="px-2.5 py-1 bg-[#333333] hover:bg-[#444444] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Отметить выполненными
            </button>
          )}

          {onBulkDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              className="px-2.5 py-1 bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Удалить</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (setIsMultiSelectMode) setIsMultiSelectMode(false);
              if (onSelectNodes) onSelectNodes([]);
            }}
            className="p-1 text-[#9B9A97] hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
