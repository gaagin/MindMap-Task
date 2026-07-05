import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Archive,
  Paperclip, 
  FileText, 
  FileImage, 
  Download, 
  Plus, 
  Maximize2,
  Calendar,
  Layers,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Circle,
  CheckCircle2,
  Loader2,
  Eye,
  Edit,
  Link as LinkIcon,
  Check,
  Bell,
  BellOff,
  Timer,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  History,
  Search,
  Send,
  Image,
  GripVertical
} from 'lucide-react';
import { TaskNode, Priority, AttachmentFile, TagCategory } from '../types';
import { formatFileSize, generateId, calculateProgress, getDescendants, playNotificationChime, getPomoStatsForNode, proxiedFetch, pruneTaskNodeHistory, suggestEstimatedTime } from '../utils';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import GoogleDriveImage from './GoogleDriveImage';
import { motion } from 'motion/react';

const fetch = proxiedFetch;

interface TaskDetailsPanelProps {
  node: TaskNode | null;
  allNodes: TaskNode[];
  onClose: () => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onAddChildNode?: (parentId: string, preventSelection?: boolean) => void;
  onSelectNode?: (id: string | null) => void;
  categories?: TagCategory[];
  onCreateTagCategory?: (name: string, color: string) => void;
  onUpdateTagCategory?: (id: string, name: string, color: string, tags: string[]) => void;
  onDeleteTagCategory?: (id: string) => void;
  googleToken?: string | null;
  onUpdateNodeParent?: (id: string, newParentId: string | null, newX?: number, newY?: number) => void;
  initialTab?: 'details' | 'chat';
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
  onDeleteNode,
  onAddChildNode,
  onSelectNode,
  categories = [],
  onCreateTagCategory,
  onUpdateTagCategory,
  onDeleteTagCategory,
  googleToken = null,
  onUpdateNodeParent,
  initialTab = 'details'
}: TaskDetailsPanelProps) {
  const [tagInput, setTagInput] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeBlockers = node ? allNodes.filter(n => node.blockedBy?.includes(n.id) && !n.completed) : [];
  const hasActiveBlockers = activeBlockers.length > 0;
  const suggestedTime = node ? suggestEstimatedTime(node.text, allNodes) : undefined;

  // Drag and touch sorting states for subtasks
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeTouchIndex, setActiveTouchIndex] = useState<number | null>(null);
  const lastSwapTimeRef = React.useRef<number>(0);

  // Image Lightbox zoom and rotation states
  const [lightboxImage, setLightboxImage] = useState<AttachmentFile | null>(null);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [lightboxRotation, setLightboxRotation] = useState(0);

  // Reset zoom/rotation when image changes
  React.useEffect(() => {
    setLightboxScale(1);
    setLightboxRotation(0);
  }, [lightboxImage?.id]);

  // Version history states
  const [originalText, setOriginalText] = useState('');
  const [originalNotes, setOriginalNotes] = useState('');
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [isHistorySectionOpen, setIsHistorySectionOpen] = useState(false);

  // Sync original state whenever node switches
  React.useEffect(() => {
    if (node) {
      setOriginalText(node.text || '');
      setOriginalNotes(node.notes || '');
    }
  }, [node?.id]);

  // Track and autofocus on newly created subtasks inside TaskDetailsPanel
  const prevSubtaskIdsRef = React.useRef<string[]>([]);
  const isFirstRenderRef = React.useRef<boolean>(true);

  React.useEffect(() => {
    if (!node) {
      isFirstRenderRef.current = true;
      prevSubtaskIdsRef.current = [];
      return;
    }

    const currentSubtasks = allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle);
    const currentSubtaskIds = currentSubtasks.map(s => s.id);

    if (isFirstRenderRef.current) {
      prevSubtaskIdsRef.current = currentSubtaskIds;
      isFirstRenderRef.current = false;
      return;
    }

    // Find if a new subtask has been added
    const newSubtaskId = currentSubtaskIds.find(id => !prevSubtaskIdsRef.current.includes(id));
    if (newSubtaskId) {
      // Focus on the newly created subtask's input
      setTimeout(() => {
        const inputElement = document.getElementById(`subtask-input-${newSubtaskId}`);
        if (inputElement) {
          (inputElement as HTMLInputElement).focus();
          (inputElement as HTMLInputElement).select();
        }
      }, 50);
    }

    prevSubtaskIdsRef.current = currentSubtaskIds;
  }, [allNodes, node?.id]);

  // Manual Pomodoro time editing states
  const [isEditingPomoTime, setIsEditingPomoTime] = useState(false);
  const [editPomoHours, setEditPomoHours] = useState(0);
  const [editPomoMinutes, setEditPomoMinutes] = useState(0);
  const [editPomoSeconds, setEditPomoSeconds] = useState(0);
  const [editPomoSessions, setEditPomoSessions] = useState(0);

  // Custom Pomodoro minutes state
  const [customPomoMinutes, setCustomPomoMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_pomo_custom_minutes');
      return saved ? parseInt(saved, 10) : 25;
    } catch (e) {
      return 25;
    }
  });

  // Tab and insert links states for Task Notes
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('edit');
  const [isInsertingLink, setIsInsertingLink] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const notesTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Chat/Comments state variables
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>(initialTab);
  const [detailsSubTab, setDetailsSubTab] = useState<'main' | 'dates' | 'tags'>('main');
  const [blockerSearch, setBlockerSearch] = useState('');

  // GTD sorting wizard states
  const [isGTDWizardOpen, setIsGTDWizardOpen] = useState(false);
  const [gtdFlow, setGtdFlow] = useState<'inbox' | 'next_actions' | 'waiting' | 'projects' | 'calendar' | 'generic'>('inbox');
  const [gtdStep, setGtdStep] = useState<string>('start');
  const [gtdMoveResult, setGtdMoveResult] = useState<string | null>(null);
  const [selectedGtdDate, setSelectedGtdDate] = useState<string>('');
  const [manualContainerId, setManualContainerId] = useState<string>('');
  const [gtdWaitingComment, setGtdWaitingComment] = useState<string>('');

  const detectAndResetGTDFlow = () => {
    if (!node) return;
    const parentContainer = node.parentId ? allNodes.find(p => p.id === node.parentId && (p.isContainer || p.isWorkflowRectangle)) : null;
    const text = parentContainer?.text?.toLowerCase() || '';
    
    if (!parentContainer || text.includes('входящ') || text.includes('inbox') || text.includes('вход')) {
      setGtdFlow('inbox');
    } else if (text.includes('следующ') || text.includes('next') || text.includes('очередь')) {
      setGtdFlow('next_actions');
    } else if (text.includes('ожидан') || text.includes('wait') || text.includes('делегир')) {
      setGtdFlow('waiting');
    } else if (text.includes('проект') || text.includes('project')) {
      setGtdFlow('projects');
    } else if (text.includes('календар') || text.includes('calendar') || text.includes('дата')) {
      setGtdFlow('calendar');
    } else {
      setGtdFlow('generic');
    }
    setGtdStep('start');
    setGtdMoveResult(null);
    setSelectedGtdDate('');
    setManualContainerId('');
    setGtdWaitingComment('');
  };

  React.useEffect(() => {
    detectAndResetGTDFlow();
    
    // Automatically expand GTD assistant for Inbox tasks or nodes with no container parent
    if (node && !node.isContainer && !node.isWorkflowRectangle) {
      const parentContainer = node.parentId ? allNodes.find(n => n.id === node.parentId && n.isContainer) : null;
      const text = parentContainer?.text?.toLowerCase() || '';
      const isInbox = !parentContainer || text.includes('входящ') || text.includes('inbox') || text.includes('вход');
      if (isInbox) {
        setIsGTDWizardOpen(true);
      }
    }
  }, [node?.id]);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, node?.id]);

  const [commentText, setCommentText] = useState('');
  const [isUploadingCommentImage, setIsUploadingCommentImage] = useState(false);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const [uploadedCommentImageInfo, setUploadedCommentImageInfo] = useState<{
    imageUrl?: string;
    imageGoogleDriveId?: string;
    imageWebViewLink?: string;
  } | null>(null);
  
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const commentImageInputRef = React.useRef<HTMLInputElement>(null);

  // Scroll to chat bottom
  React.useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [node?.comments, activeTab]);

  const uploadCommentImage = async (file: File) => {
    // Set local preview
    const reader = new FileReader();
    reader.onload = () => {
      setCommentImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setFileError(null);
    setIsUploadingCommentImage(true);

    try {
      if (googleToken) {
        // 1. Get or create special folder on Google Drive
        const folderId = await getOrCreateGoogleDriveFolder(googleToken);

        // 2. Create the file metadata reference on Google Drive
        const name = file.name || `Pasted_Image_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        const mimeType = file.type || 'image/png';
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            mimeType,
            parents: folderId ? [folderId] : undefined
          })
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Не удалось создать метаданные на Диске: ${errText}`);
        }

        const createData = await createRes.json();
        const driveFileId = createData.id;

        // 3. Upload raw file body as media
        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': mimeType
          },
          body: file
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Не удалось загрузить тело файла: ${errText}`);
        }

        // Grant public read permission so other devices can read the file anonymously and automatically
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            })
          });
        } catch (permissionErr) {
          console.warn('[Google Drive Auth] Failed to list file permissions as public for comment image:', permissionErr);
        }

        // 4. Retrieve web links
        const finalRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,webViewLink,webContentLink,size`, {
          headers: {
            'Authorization': `Bearer ${googleToken}`
          }
        });

        if (!finalRes.ok) {
          throw new Error('Не удалось получить ссылки на файл с Диска');
        }

        const finalData = await finalRes.json();
        setUploadedCommentImageInfo({
          imageUrl: finalData.webViewLink || finalData.webContentLink || '',
          imageGoogleDriveId: driveFileId,
          imageWebViewLink: finalData.webViewLink
        });
      } else {
        const MAX_BYTES = 1024 * 1024; // 1MB limit for comments local image
        if (file.size > MAX_BYTES) {
          setFileError('Размер изображения для чата превышает 1 МБ. Войдите через Google для хранения без лимитов!');
          setCommentImagePreview(null);
          setIsUploadingCommentImage(false);
          return;
        }

        const readerLocal = new FileReader();
        readerLocal.onload = () => {
          setUploadedCommentImageInfo({
            imageUrl: readerLocal.result as string
          });
        };
        readerLocal.readAsDataURL(file);
      }
    } catch (err: any) {
      console.error(err);
      setFileError(`Не удалось загрузить картинку в чат: ${err.message || err}`);
      setCommentImagePreview(null);
    } finally {
      setIsUploadingCommentImage(false);
    }
  };

  const handleCommentImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    await uploadCommentImage(file);
  };

  const handleCommentAreaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadCommentImage(file);
          break; // only upload first image
        }
      }
    }
  };

  const handleSendComment = () => {
    if (!commentText.trim() && !uploadedCommentImageInfo?.imageUrl) return;

    const user = auth.currentUser;
    const commenterName = user?.displayName || user?.email || 'Пользователь';
    const commenterPhoto = user?.photoURL || '';
    const commenterUid = user?.uid || 'anonymous';

    const newComment = {
      id: generateId(),
      userId: commenterUid,
      userName: commenterName,
      userPhoto: commenterPhoto,
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
      imageUrl: uploadedCommentImageInfo?.imageUrl,
      imageGoogleDriveId: uploadedCommentImageInfo?.imageGoogleDriveId,
      imageWebViewLink: uploadedCommentImageInfo?.imageWebViewLink
    };

    const updatedComments = node.comments ? [...node.comments, newComment] : [newComment];
    handlePropChange('comments', updatedComments);

    setCommentText('');
    setCommentImagePreview(null);
    setUploadedCommentImageInfo(null);
  };

  const handleDeleteComment = (commentId: string) => {
    if (!node.comments) return;
    const updated = node.comments.filter(c => c.id !== commentId);
    handlePropChange('comments', updated);
  };

  const handleInsertTaskLink = (targetId: string, targetText: string) => {
    const linkText = `[${targetText}](task:${targetId})`;
    const currentVal = node ? (node.notes || '') : '';
    let newVal = currentVal;

    const textarea = notesTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      newVal = currentVal.substring(0, start) + linkText + currentVal.substring(end);
      
      handlePropChange('notes', newVal);
      
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + linkText.length;
      }, 50);
    } else {
      newVal = currentVal ? currentVal + '\n' + linkText : linkText;
      handlePropChange('notes', newVal);
    }
    setIsInsertingLink(false);
    setLinkSearchQuery('');
  };

  const parseInlineContent = (text: string): React.ReactNode[] => {
    if (!text) return [];

    const pattern = /(\[([^\]]+)\]\(task:([a-zA-Z0-9\-]+)\)|\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]|task:\/\/([a-zA-Z0-9\-]+)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const matchedStr = match[0];

      if (match[3]) {
        // [Label](task:ID)
        const label = match[2];
        const targetId = match[3];
        const targetNode = allNodes.find(n => n.id === targetId);
        parts.push(
          <button
            key={`task-${match.index}`}
            type="button"
            onClick={() => onSelectNode?.(targetId)}
            className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-150 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold rounded text-[11px] align-middle border border-indigo-100 dark:border-indigo-900/50 transition-all cursor-pointer"
            title={`Перейти к задаче "${targetNode?.text || label}"`}
          >
            <LinkIcon className="w-3 h-3 shrink-0" />
            {label}
          </button>
        );
      } else if (match[4]) {
        // [[Name]] or [[Name|ID]]
        const nameOrLabel = match[4];
        const explicitId = match[5];
        
        let targetNode = explicitId ? allNodes.find(n => n.id === explicitId) : null;
        if (!targetNode && !explicitId) {
          targetNode = allNodes.find(n => n.text?.trim().toLowerCase() === nameOrLabel.trim().toLowerCase());
        }
        
        const label = nameOrLabel;
        const targetId = targetNode ? targetNode.id : explicitId;

        if (targetId) {
          parts.push(
            <button
              key={`wiki-${match.index}`}
              type="button"
              onClick={() => onSelectNode?.(targetId)}
              className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-150 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold rounded text-[11px] align-middle border border-indigo-100 dark:border-indigo-900/50 transition-all cursor-pointer"
              title={`Перейти к задаче "${targetNode?.text || label}"`}
            >
              <LinkIcon className="w-3 h-3 shrink-0" />
              {label}
            </button>
          );
        } else {
          parts.push(
            <span key={`wiki-span-${match.index}`} className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
              [[{nameOrLabel}]]
            </span>
          );
        }
      } else if (match[6]) {
        // task://ID
        const targetId = match[6];
        const targetNode = allNodes.find(n => n.id === targetId);
        parts.push(
          <button
            key={`task-ref-${match.index}`}
            type="button"
            onClick={() => onSelectNode?.(targetId)}
            className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-150 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold rounded text-[11px] align-middle border border-indigo-100 dark:border-indigo-900/50 transition-all cursor-pointer"
            title={`Перейти к задаче "${targetNode?.text || targetId}"`}
          >
            <LinkIcon className="w-3 h-3 shrink-0" />
            {targetNode?.text || `Задача ${targetId.substring(0, 6)}`}
          </button>
        );
      } else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
        // Bold
        const boldContent = matchedStr.slice(2, -2);
        parts.push(
          <strong key={`bold-${match.index}`} className="font-extrabold text-slate-900 dark:text-white">
            {boldContent}
          </strong>
        );
      } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
        // Italic
        const italicContent = matchedStr.slice(1, -1);
        parts.push(
          <em key={`italic-${match.index}`} className="italic text-slate-800 dark:text-slate-200">
            {italicContent}
          </em>
        );
      } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
        // Inline Code
        const codeContent = matchedStr.slice(1, -1);
        parts.push(
          <code key={`code-${match.index}`} className="px-1.5 py-0.5 bg-slate-105 dark:bg-slate-950/60 rounded font-mono text-[11px] font-semibold text-pink-600 dark:text-pink-400 border border-slate-200/50 dark:border-slate-800/40">
            {codeContent}
          </code>
        );
      } else if (matchedStr.startsWith('[') && matchedStr.includes('](')) {
        // External link [label](url)
        const labelMatch = matchedStr.match(/\[(.*?)\]/);
        const urlMatch = matchedStr.match(/\((https?:\/\/.*?)\)/);
        if (labelMatch && urlMatch) {
          const label = labelMatch[1];
          const url = urlMatch[1];
          parts.push(
            <a
              key={`link-${match.index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 font-semibold"
            >
              {label}
            </a>
          );
        } else {
          parts.push(matchedStr);
        }
      } else {
        parts.push(matchedStr);
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const renderMarkdownLine = (line: string, lineKey: string) => {
    // Check headers
    if (line.startsWith('### ')) {
      return (
        <h3 key={lineKey} className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-2.5 mb-1 tracking-tight">
          {parseInlineContent(line.slice(4))}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={lineKey} className="text-sm font-bold text-slate-850 dark:text-slate-100 mt-3 mb-1.5 tracking-tight">
          {parseInlineContent(line.slice(3))}
        </h2>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h1 key={lineKey} className="text-base font-extrabold text-slate-900 dark:text-slate-50 mt-4 mb-2 tracking-tight border-b border-slate-100 dark:border-slate-800/50 pb-0.5">
          {parseInlineContent(line.slice(2))}
        </h1>
      );
    }

    // Check blockquote
    if (line.startsWith('> ')) {
      return (
        <blockquote key={lineKey} className="border-l-4 border-indigo-400 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/10 pl-3 py-1 pr-1 italic my-2 rounded-r text-slate-600 dark:text-slate-400">
          {parseInlineContent(line.slice(2))}
        </blockquote>
      );
    }

    // Check bullet list items
    const bulletMatch = line.match(/^(\s*)([-*•])\s+(.*)/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const content = bulletMatch[3];
      return (
        <div key={lineKey} className="flex items-start gap-2 my-1" style={{ paddingLeft: `${indent * 8 + 4}px` }}>
          <span className="text-indigo-500 font-extrabold select-none">•</span>
          <div className="flex-1 text-slate-700 dark:text-slate-300 leading-relaxed">{parseInlineContent(content)}</div>
        </div>
      );
    }

    // Check ordered list items
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      const num = orderedMatch[2];
      const content = orderedMatch[3];
      return (
        <div key={lineKey} className="flex items-start gap-2 my-1" style={{ paddingLeft: `${indent * 8 + 4}px` }}>
          <span className="text-indigo-500/80 font-bold font-mono select-none text-[10px] pt-[2px]">{num}.</span>
          <div className="flex-1 text-slate-700 dark:text-slate-300 leading-relaxed">{parseInlineContent(content)}</div>
        </div>
      );
    }

    // Fallback to regular line/paragraph
    if (!line.trim()) {
      return <div key={lineKey} className="h-2" />;
    }

    return (
      <p key={lineKey} className="my-1 text-slate-700 dark:text-slate-300 leading-relaxed">
        {parseInlineContent(line)}
      </p>
    );
  };

  const renderNotesWithLinks = (notesText: string) => {
    if (!notesText) {
      return (
        <span className="text-slate-400 dark:text-slate-500 italic text-xs block py-2">
          Заметки пусты. Перейдите во вкладку «Редактор» для добавления.
        </span>
      );
    }

    const lines = notesText.split('\n');

    return (
      <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 min-h-[100px] flex flex-col gap-1">
        {lines.map((line, idx) => renderMarkdownLine(line, `line-${idx}`))}
      </div>
    );
  };

  // Pomodoro state definition and operations
  interface PomodoroState {
    nodeId: string;
    nodeText: string;
    isRunning: boolean;
    isPaused: boolean;
    isBreak: boolean; // false = work, true = break
    duration: number; // in seconds
    endTime: number | null; // end timestamp
    timeLeft: number; // remaining seconds
  }

  const [pomo, setPomo] = useState<PomodoroState>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_pomodoro');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isRunning && !parsed.isPaused && parsed.endTime) {
          const now = Date.now();
          const remaining = Math.max(0, Math.round((parsed.endTime - now) / 1000));
          if (remaining === 0) {
            return {
              ...parsed,
              timeLeft: 0,
              isRunning: false,
              endTime: null
            };
          } else {
            return {
              ...parsed,
              timeLeft: remaining
            };
          }
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse pomodoro state:', e);
    }
    
    // Default duration uses customPomoMinutes if loaded from storage, else 1500
    const initialMins = (() => {
      try {
        const saved = localStorage.getItem('task_mindmap_pomo_custom_minutes');
        return saved ? parseInt(saved, 10) : 25;
      } catch (e) {
        return 25;
      }
    })();
    return {
      nodeId: '',
      nodeText: '',
      isRunning: false,
      isPaused: false,
      isBreak: false,
      duration: initialMins * 60,
      endTime: null,
      timeLeft: initialMins * 60
    };
  });

  const savePomoState = (newState: PomodoroState) => {
    setPomo(newState);
    localStorage.setItem('task_mindmap_pomodoro', JSON.stringify(newState));
    window.dispatchEvent(new Event('task_mindmap_pomo_update'));

    // Sync active Pomodoro state to Cloud Firestore (real-time cross-device syncer)
    const user = auth.currentUser;
    if (user) {
      try {
        const docRef = doc(db, 'workspaces', user.uid);
        updateDoc(docRef, {
          activePomodoro: newState
        }).catch(async (err) => {
          console.warn('[Firebase Pomo Sync] Failed to update activePomodoro using updateDoc (document may not exist):', err);
          
          // Fallback if the user document does not exist yet.
          // Create a minimally schema-compliant empty workspace that satisfies isValidWorkspace security rules
          const emptyWorkspace = {
            userId: user.uid,
            folders: [],
            projects: [],
            nodes: {},
            updatedAt: new Date().toISOString(),
            activePomodoro: newState
          };
          try {
            await setDoc(docRef, emptyWorkspace, { merge: true });
          } catch (setErr) {
            console.error('[Firebase Pomo Sync] Failed to merge/create empty workspace with activePomodoro:', setErr);
          }
        });
      } catch (err) {
        console.error('[Firebase Pomo Sync] Error building Firestore path for Pomodoro sync:', err);
      }
    }
  };

  const handleChangeCustomMinutes = (mins: number) => {
    const val = Math.max(1, Math.min(180, mins));
    setCustomPomoMinutes(val);
    localStorage.setItem('task_mindmap_pomo_custom_minutes', String(val));
    if (!pomo.isRunning) {
      const newState = {
        ...pomo,
        duration: val * 60,
        timeLeft: val * 60
      };
      savePomoState(newState);
    }
  };

  const onUpdateNodeRef = React.useRef(onUpdateNode);
  const allNodesRef = React.useRef(allNodes);

  React.useEffect(() => {
    onUpdateNodeRef.current = onUpdateNode;
  }, [onUpdateNode]);

  React.useEffect(() => {
    allNodesRef.current = allNodes;
  }, [allNodes]);

  React.useEffect(() => {
    if (!pomo.isRunning || pomo.isPaused) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (pomo.endTime) {
        const remaining = Math.max(0, Math.round((pomo.endTime - now) / 1000));
        setPomo(prev => {
          if (prev.timeLeft === remaining) return prev;
          return { ...prev, timeLeft: remaining };
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pomo.isRunning, pomo.isPaused, pomo.endTime]);

  React.useEffect(() => {
    const handleExternalPomoChange = () => {
      try {
        const saved = localStorage.getItem('task_mindmap_pomodoro');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.isRunning && !parsed.isPaused && parsed.endTime) {
            const now = Date.now();
            const remaining = Math.max(0, Math.round((parsed.endTime - now) / 1000));
            setPomo({
              ...parsed,
              timeLeft: remaining
            });
          } else {
            setPomo(parsed);
          }
        } else {
          setPomo(prev => ({
            ...prev,
            nodeId: '',
            nodeText: '',
            isRunning: false,
            isPaused: false,
            isBreak: false,
            endTime: null,
          }));
        }
      } catch (e) {
        console.error('Failed to parse pomodoro state externally in TaskDetailsPanel:', e);
      }
    };

    window.addEventListener('storage', handleExternalPomoChange);
    window.addEventListener('task_mindmap_pomo_update', handleExternalPomoChange);
    return () => {
      window.removeEventListener('storage', handleExternalPomoChange);
      window.removeEventListener('task_mindmap_pomo_update', handleExternalPomoChange);
    };
  }, []);

  const handleStartFocus = (customDuration?: number) => {
    if (!node) return;
    const duration = customDuration !== undefined ? customDuration : (customPomoMinutes * 60);
    const newState: PomodoroState = {
      nodeId: node.id,
      nodeText: node.text,
      isRunning: true,
      isPaused: false,
      isBreak: false,
      duration: duration,
      endTime: Date.now() + duration * 1000,
      timeLeft: duration
    };
    savePomoState(newState);
  };

  const handleTogglePomoPause = () => {
    if (pomo.isPaused) {
      const durationLeft = pomo.timeLeft;
      const newState: PomodoroState = {
        ...pomo,
        isPaused: false,
        endTime: Date.now() + durationLeft * 1000
      };
      savePomoState(newState);
    } else {
      const newState: PomodoroState = {
        ...pomo,
        isPaused: true,
        endTime: null
      };
      savePomoState(newState);
    }
  };

  const handleResetPomo = () => {
    const newState: PomodoroState = {
      nodeId: '',
      nodeText: '',
      isRunning: false,
      isPaused: false,
      isBreak: false,
      duration: customPomoMinutes * 60,
      endTime: null,
      timeLeft: customPomoMinutes * 60
    };
    savePomoState(newState);
  };

  const handleCompletePomoEarly = () => {
    if (!pomo.isRunning) return;
    
    // If it is work session, add the elapsed time
    if (!pomo.isBreak && pomo.nodeId) {
      const elapsed = pomo.duration - pomo.timeLeft;
      if (elapsed > 0) {
        const targetNode = allNodes.find(n => n.id === pomo.nodeId);
        if (targetNode) {
          const minutesToSubtract = Math.round(elapsed / 60);
          const currentEst = targetNode.estimatedTime !== undefined && targetNode.estimatedTime !== null && !isNaN(targetNode.estimatedTime)
            ? targetNode.estimatedTime
            : 0;
          const nextEst = targetNode.estimatedTime !== undefined && targetNode.estimatedTime !== null && !isNaN(targetNode.estimatedTime)
            ? Math.max(0, parseFloat((currentEst - minutesToSubtract).toFixed(2)))
            : undefined;

          onUpdateNode({
            ...targetNode,
            pomodoroTotalTime: (targetNode.pomodoroTotalTime || 0) + elapsed,
            pomodoroSessionsCount: (targetNode.pomodoroSessionsCount || 0) + 1,
            estimatedTime: nextEst
          });
        }
      }
    }
    
    handleResetPomo();
  };

  const formatPomoTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatTotalPomoTime = (totalSeconds: number) => {
    if (!totalSeconds) return '0 мин';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} ч`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} мин`);
    return parts.join(' ');
  };

  // Copy direct task link handler
  const handleCopyLink = () => {
    if (!node) return;
    try {
      const taskLink = `${window.location.origin}${window.location.pathname}?task=${node.id}`;
      navigator.clipboard.writeText(taskLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy task link:', e);
    }
  };

  // Category management inside TaskProperties
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [addingTagToCatId, setAddingTagToCatId] = useState<string | null>(null);
  const [newCatTagName, setNewCatTagName] = useState('');


  // Local active categories for this specific node
  const activeCategories = node.tagCategories || categories || [];

  const handleUpdateCategories = (newCategories: TagCategory[]) => {
    onUpdateNode({
      ...node,
      tagCategories: newCategories
    });
  };

  const handleCreateTagCategory = (name: string, color: string) => {
    const newCat: TagCategory = {
      id: 'cat-' + generateId(),
      name,
      color,
      tags: [],
      updatedAt: new Date().toISOString()
    };
    onUpdateNode({
      ...node!,
      updatedAt: new Date().toISOString(),
      tagCategories: [...activeCategories, newCat]
    });
    if (onCreateTagCategory) {
      onCreateTagCategory(name, color);
    }
  };

  const handleUpdateTagCategory = (id: string, name: string, color: string, tags: string[]) => {
    const nextCategories = activeCategories.map(c => 
      c.id === id ? { ...c, name, color, tags, updatedAt: new Date().toISOString() } : c
    );
    onUpdateNode({
      ...node!,
      updatedAt: new Date().toISOString(),
      tagCategories: nextCategories
    });
    if (onUpdateTagCategory) {
      onUpdateTagCategory(id, name, color, tags);
    }
  };

  const handleDeleteTagCategory = (id: string) => {
    const nextCategories = activeCategories.filter(c => c.id !== id);
    onUpdateNode({
      ...node!,
      updatedAt: new Date().toISOString(),
      tagCategories: nextCategories
    });
    if (onDeleteTagCategory) {
      onDeleteTagCategory(id);
    }
  };

  // Category collapse state, loaded and persisted in localStorage using the same key as Sidebar for 100% synchronization
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_collapsed_categories');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse collapsed categories:', e);
    }
    return {};
  });

  React.useEffect(() => {
    localStorage.setItem('task_mindmap_collapsed_categories', JSON.stringify(collapsedCategoryIds));
  }, [collapsedCategoryIds]);

  // Safe confirmation states for iframes (avoiding browser confirm dialog)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteSubtaskId, setConfirmDeleteSubtaskId] = useState<string | null>(null);
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  // Reset confirmations on node change
  React.useEffect(() => {
    setConfirmDelete(false);
    setConfirmDeleteSubtaskId(null);
    setConfirmDeleteCatId(null);
  }, [node?.id]);

  if (!node) return null;

  // Check if it is the central workspace core node
  const isCentralRootNode = node.parentId === null && !node.isFloating && !node.isContainer;

  // Filter subtasks to determine if any has estimatedTime set
  const subtasksListForTime = allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle);
  const hasSubtaskWithTime = subtasksListForTime.some(c => c.estimatedTime !== undefined && c.estimatedTime !== null && !isNaN(c.estimatedTime) && !c.archived);

  // Generic modification helper
  const handlePropChange = <K extends keyof TaskNode>(key: K, value: TaskNode[K]) => {
    onUpdateNode({
      ...node,
      [key]: value,
      updatedAt: new Date().toISOString()
    });
  };

  // GTD Sorter Action Resolvers
  const [pendingGtdType, setPendingGtdType] = useState<string>('');
  const [pendingGtdDate, setPendingGtdDate] = useState<string>('');

  const findGTDContainer = (type: string) => {
    if (!node) return null;
    const projectContainers = allNodes.filter(n => n.projectId === node.projectId && (n.isContainer || n.isWorkflowRectangle));
    
    const searchTerms: Record<string, string[]> = {
      inbox: ['inbox', 'входящ', 'вход'],
      trash: ['trash', 'корзин', 'удалить', 'delete'],
      someday: ['someday', 'maybe', 'когда-нибудь', 'может быть', 'инкубатор'],
      reference: ['reference', 'справоч', 'справка', 'материал', 'ссылк'],
      do_it: ['do it', 'сделать', 'выполнить', 'прямо сейчас', '2 мин', 'do_it'],
      waiting: ['waiting', 'ожида', 'делегир', 'delegate'],
      calendar: ['calendar', 'календар', 'дата', 'время'],
      next_actions: ['next action', 'следующие действия', 'следующ', 'очередь'],
      projects: ['project', 'проект', 'многошаг']
    };

    const terms = searchTerms[type];
    if (!terms) return null;
    
    for (const term of terms) {
      const found = projectContainers.find(c => c.text && c.text.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    
    return null;
  };

  const handleGtdAction = (
    type: 'inbox' | 'trash' | 'someday' | 'reference' | 'do_it' | 'waiting' | 'calendar' | 'next_actions' | 'projects', 
    dateStr?: string
  ) => {
    if (!node || !onUpdateNodeParent) return;
    
    const container = findGTDContainer(type);
    if (container) {
      onUpdateNodeParent(node.id, container.id, container.x, container.y);
      
      let updatedNode = { ...node };
      let updatedPlace = `${container.text} (X: ${Math.round(container.x)}, Y: ${Math.round(container.y)})`;

      if (type === 'calendar' && dateStr) {
        updatedNode.dueDate = dateStr;
      }
      
      onUpdateNode({
        ...updatedNode,
        parentId: container.id,
        containerPlace: updatedPlace
      });

      setGtdMoveResult(`Задача успешно перемещена в контейнер «${container.text}»!`);
      setGtdStep('done');
    } else {
      setPendingGtdType(type);
      setPendingGtdDate(dateStr || '');
      setGtdStep('manual_mapping');
    }
  };

  const handleManualMappingSubmit = () => {
    if (!node || !onUpdateNodeParent || !manualContainerId) return;
    
    const container = allNodes.find(c => c.id === manualContainerId);
    if (!container) return;

    onUpdateNodeParent(node.id, container.id, container.x, container.y);

    let updatedNode = { ...node };
    let updatedPlace = `${container.text} (X: ${Math.round(container.x)}, Y: ${Math.round(container.y)})`;

    if (pendingGtdType === 'calendar' && pendingGtdDate) {
      updatedNode.dueDate = pendingGtdDate;
    }

    onUpdateNode({
      ...updatedNode,
      parentId: container.id,
      containerPlace: updatedPlace
    });

    setGtdMoveResult(`Задача успешно перемещена в контейнер «${container.text}»!`);
    setGtdStep('done');
  };

  // Version History record helper
  const recordHistoryVersion = (prevText: string, prevNotes: string, label: string) => {
    if (!node) return;
    const currentHistory = node.history || [];
    
    // Prevent recording duplicate if nothing actually changed from previous history
    const lastVersion = currentHistory[0];
    if (lastVersion && lastVersion.text === prevText && lastVersion.notes === prevNotes) {
      return;
    }

    const newVersion = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      text: prevText,
      notes: prevNotes,
      description: label
    };

    onUpdateNode({
      ...node,
      history: pruneTaskNodeHistory([newVersion, ...currentHistory])
    });
  };

  const handleSaveManualCheckpoint = () => {
    if (!node) return;
    const currentHistory = node.history || [];
    const newVersion = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      text: node.text,
      notes: node.notes || '',
      description: 'Ручная контрольная точка'
    };
    onUpdateNode({
      ...node,
      history: pruneTaskNodeHistory([newVersion, ...currentHistory])
    });
  };

  const handleRestoreVersion = (version: any) => {
    if (!node) return;
    const currentHistory = node.history || [];
    
    // Create an automatic backup of the current state before we overwrite it
    const backupVersion = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      text: node.text,
      notes: node.notes || '',
      description: `Авто-сохранение перед откатом`
    };

    onUpdateNode({
      ...node,
      text: version.text,
      notes: version.notes,
      history: pruneTaskNodeHistory([backupVersion, ...currentHistory.filter(h => h.id !== version.id)])
    });

    // Sync original text / notes to prevent immediate back-trigger on blur
    setOriginalText(version.text);
    setOriginalNotes(version.notes);
  };

  const handleDeleteVersion = (versionId: string) => {
    if (!node || !node.history) return;
    onUpdateNode({
      ...node,
      history: node.history.filter(h => h.id !== versionId)
    });
  };

  const handleClearHistory = () => {
    if (!node) return;
    onUpdateNode({
      ...node,
      history: []
    });
  };

  const handleSetRelativeReminder = (minutesBefore: number | undefined) => {
    if (minutesBefore === undefined) {
      onUpdateNode({
        ...node,
        reminderMinutesBefore: undefined,
        reminderDate: node.reminderDate || node.dueDate || '',
        reminderTime: node.reminderTime || node.dueTime || '',
        reminderDismissed: false
      });
      return;
    }

    const dueDateStr = node.dueDate || new Date().toISOString().split('T')[0];
    const dueTimeStr = node.dueTime || '12:00';

    try {
      const dueDateTime = new Date(`${dueDateStr}T${dueTimeStr}`);
      if (isNaN(dueDateTime.getTime())) return;

      const reminderDateTime = new Date(dueDateTime.getTime() - minutesBefore * 60 * 1000);
      const rDate = reminderDateTime.toISOString().split('T')[0];
      const rTime = reminderDateTime.toTimeString().split(' ')[0].substring(0, 5);

      onUpdateNode({
        ...node,
        reminderMinutesBefore: minutesBefore,
        reminderDate: rDate,
        reminderTime: rTime,
        reminderDismissed: false
      });
    } catch (error) {
      console.error('Failed to calculate reminder time:', error);
    }
  };

  const handleTimePropChange = (key: 'startDate' | 'startTime' | 'dueDate' | 'dueTime', val: string) => {
    const updatedNode = { 
      ...node, 
      [key]: val || undefined 
    };

    if (key === 'startDate' && !val) {
      updatedNode.startTime = undefined;
    }

    if (key === 'dueDate' && !val) {
      updatedNode.dueTime = undefined;
      updatedNode.reminderMinutesBefore = undefined;
      updatedNode.reminderDate = undefined;
      updatedNode.reminderTime = undefined;
      updatedNode.reminderDismissed = undefined;
    }
    
    if ((key === 'dueDate' || key === 'dueTime') && updatedNode.reminderMinutesBefore !== undefined) {
      const mBefore = updatedNode.reminderMinutesBefore;
      // Only recalculate reminder if dueDate exists
      if (updatedNode.dueDate) {
        const dueDateStr = updatedNode.dueDate || new Date().toISOString().split('T')[0];
        const dueTimeStr = updatedNode.dueTime || '12:00';
        try {
          const dueDateTime = new Date(`${dueDateStr}T${dueTimeStr}`);
          if (!isNaN(dueDateTime.getTime())) {
            const reminderDateTime = new Date(dueDateTime.getTime() - mBefore * 60 * 1000);
            updatedNode.reminderDate = reminderDateTime.toISOString().split('T')[0];
            updatedNode.reminderTime = reminderDateTime.toTimeString().split(' ')[0].substring(0, 5);
            updatedNode.reminderDismissed = false;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    onUpdateNode(updatedNode);
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

  const handleToggleCategoryTag = (tag: string) => {
    const isPresent = node.tags && node.tags.includes(tag);
    if (isPresent) {
      const updatedTags = node.tags.filter(t => t !== tag);
      handlePropChange('tags', updatedTags);
    } else {
      const updatedTags = node.tags ? [...node.tags, tag] : [tag];
      handlePropChange('tags', updatedTags);
    }
  };

  // Helper to get or create a folder on Google Drive
  const getOrCreateGoogleDriveFolder = async (token: string): Promise<string | null> => {
    try {
      const q = encodeURIComponent("name='MindMap_Attachments' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
        }
      }

      // Create folder if not found
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'MindMap_Attachments',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      if (createRes.ok) {
        const createData = await createRes.json();
        return createData.id;
      }
    } catch (e) {
      console.error('Error getting/creating Drive folder:', e);
    }
    return null;
  };

  // Upload attachment either to local base64 or directly to Google Drive
  const uploadFile = async (file: File) => {
    // If it's a pasted image with generic name, rename it to make it look nicer
    let finalFile = file;
    if (file.name === 'image.png' || !file.name) {
      const extension = file.type ? file.type.split('/')[1] || 'png' : 'png';
      const formattedDate = new Date().toISOString().split('T')[0] + '_' + new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      finalFile = new File([file], `Pasted_File_${formattedDate}.${extension}`, { type: file.type });
    }

    if (googleToken) {
      setIsUploadingFile(true);
      try {
        // 1. Get or create special folder on Google Drive
        const folderId = await getOrCreateGoogleDriveFolder(googleToken);

        // 2. Create the file metadata reference on Google Drive
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: finalFile.name,
            mimeType: finalFile.type || 'application/octet-stream',
            parents: folderId ? [folderId] : undefined
          })
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Не удалось создать метаданные на Диске: ${errText}`);
        }

        const createData = await createRes.json();
        const driveFileId = createData.id;

        // 3. Upload raw file body as media
        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': finalFile.type || 'application/octet-stream'
          },
          body: finalFile
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Не удалось загрузить тело файла: ${errText}`);
        }

        // Grant public read permission so other devices can read the file anonymously and automatically
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            })
          });
        } catch (permissionErr) {
          console.warn('[Google Drive Auth] Failed to list file permissions as public:', permissionErr);
        }

        // 4. Retrieve web links
        const finalRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,webViewLink,webContentLink,size`, {
          headers: {
            'Authorization': `Bearer ${googleToken}`
          }
        });

        if (!finalRes.ok) {
          throw new Error('Не удалось получить ссылки на файл с Диска');
        }

        const finalData = await finalRes.json();

        // 5. Build and save attachment record
        const newAttachment: AttachmentFile = {
          id: generateId(),
          name: finalFile.name,
          type: finalFile.type,
          size: finalFile.size,
          dataUrl: finalData.webViewLink || finalData.webContentLink || '',
          googleDriveId: driveFileId,
          webViewLink: finalData.webViewLink,
          webContentLink: finalData.webContentLink,
        };

        const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
        handlePropChange('files', updatedFiles);
      } catch (err: any) {
        console.error(err);
        setFileError(`Не удалось сохранить на Google Диск: ${err.message || err}`);
      } finally {
        setIsUploadingFile(false);
      }
    } else {
      // Local Base64 storage
      const MAX_BYTES = 1.5 * 1024 * 1024;
      if (finalFile.size > MAX_BYTES) {
        setFileError('Размер файла превышает 1.5 МБ. Пожалуйста, авторизуйте Google Sheets в шапке, чтобы разблокировать неограниченные вложения на Google Диск!');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const newAttachment: AttachmentFile = {
          id: generateId(),
          name: finalFile.name,
          type: finalFile.type,
          size: finalFile.size,
          dataUrl: base64Data,
        };

        const updatedFiles = node.files ? [...node.files, newAttachment] : [newAttachment];
        handlePropChange('files', updatedFiles);
      };
      reader.onerror = () => {
        setFileError('Ошибка считывания файла.');
      };
      reader.readAsDataURL(finalFile);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;
    
    setFileError(null);
    await uploadFile(filesList[0]);
  };

  // Paste handler for the entire aside wrapper
  const handleAsidePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    // If active tab is chat/comments, don't interfere with comment image input paste
    if (activeTab === 'chat') return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasFile = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        hasFile = true;
        break;
      }
    }

    if (!hasFile) return; // Let default text pasting work! 

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadFile(file);
        }
      }
    }
  };

  // Remove individual attachment and destroy its cloud file if applicable
  const handleRemoveFile = async (fileId: string) => {
    if (!node.files) return;
    const fileToRemove = node.files.find(f => f.id === fileId);

    if (fileToRemove && fileToRemove.googleDriveId && googleToken) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileToRemove.googleDriveId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${googleToken}`
          }
        });
      } catch (e) {
        console.error('Failed to delete cloud Google Drive file:', e);
      }
    }

    const updatedFiles = node.files.filter(f => f.id !== fileId);
    handlePropChange('files', updatedFiles);
  };

  if (isFullscreen) {
    const subtasks = allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle);
    const sortedSubtasks = [...subtasks].sort((a, b) => {
      const orderA = a.subtaskOrder !== undefined ? a.subtaskOrder : 1000000;
      const orderB = b.subtaskOrder !== undefined ? b.subtaskOrder : 1000000;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

    const handleMoveSubtask = (subtaskId: string, direction: 'up' | 'down') => {
      const index = sortedSubtasks.findIndex(s => s.id === subtaskId);
      if (index === -1) return;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sortedSubtasks.length) return;

      const itemA = sortedSubtasks[index];
      const itemB = sortedSubtasks[targetIndex];

      sortedSubtasks.forEach((item, idx) => {
        if (item.subtaskOrder === undefined) {
          item.subtaskOrder = idx * 10;
        }
      });

      const tempOrder = itemA.subtaskOrder!;
      itemA.subtaskOrder = itemB.subtaskOrder!;
      itemB.subtaskOrder = tempOrder;

      onUpdateNode({ ...itemA });
      onUpdateNode({ ...itemB });
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;

      const now = Date.now();
      if (now - lastSwapTimeRef.current < 200) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const threshold = rect.height / 2;

      if (draggedIndex < index && mouseY < threshold) return;
      if (draggedIndex > index && mouseY > threshold) return;

      const draggedItem = sortedSubtasks[draggedIndex];
      const targetItem = sortedSubtasks[index];

      sortedSubtasks.forEach((item, idx) => {
        if (item.subtaskOrder === undefined) {
          item.subtaskOrder = idx * 10;
        }
      });

      const tempOrder = draggedItem.subtaskOrder!;
      draggedItem.subtaskOrder = targetItem.subtaskOrder!;
      targetItem.subtaskOrder = tempOrder;

      lastSwapTimeRef.current = now;
      onUpdateNode({ ...draggedItem });
      onUpdateNode({ ...targetItem });
      setDraggedIndex(index);
    };

    const handleDragEnd = () => {
      setDraggedIndex(null);
    };

    return (
      <div 
        onPaste={handleAsidePaste}
        className="fixed inset-0 bg-slate-100 dark:bg-slate-950 z-[100] flex flex-col h-screen w-screen overflow-hidden font-sans select-none"
      >
        {/* HEADER BAR */}
        <div className="h-14 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-extrabold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-lg flex items-center gap-1.5 max-w-[200px] md:max-w-[400px]">
              <Layers className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{node.text}</span>
            </span>
            {node.parentId && (() => {
              const parentNode = allNodes.find(n => n.id === node.parentId);
              if (parentNode && onSelectNode) {
                return (
                  <button
                    type="button"
                    onClick={() => onSelectNode(parentNode.id)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50/40 hover:bg-indigo-100/40 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-lg border border-indigo-100/20 dark:border-indigo-900/20 transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[150px]">Назад к: {parentNode.text}</span>
                  </button>
                );
              }
            })()}
            {node.mirrorParentId && (() => {
              const parentNode = allNodes.find(n => n.id === node.mirrorParentId);
              if (parentNode && onSelectNode) {
                return (
                  <button
                    type="button"
                    onClick={() => onSelectNode(parentNode.id)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-50/40 hover:bg-purple-100/40 dark:bg-purple-950/20 dark:hover:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-lg border border-purple-100/20 dark:border-purple-900/20 transition-all cursor-pointer"
                    title={`Перейти к исходной родительской задаче: ${parentNode.text}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-purple-500" />
                    <span className="truncate max-w-[150px]">Родительская: {parentNode.text}</span>
                  </button>
                );
              } else if (node.mirrorParentText) {
                return (
                  <span className="text-xs font-bold text-slate-450 dark:text-slate-500 px-3 py-1 bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-lg">
                    Родительская: {node.mirrorParentText}
                  </span>
                );
              }
            })()}
            {node.mirrorGroupId && (() => {
              const mirrorCopies = allNodes.filter(n => n.mirrorGroupId === node.mirrorGroupId && n.id !== node.id);
              return mirrorCopies.map(mCopy => {
                const mParent = mCopy.parentId ? allNodes.find(n => n.id === mCopy.parentId) : null;
                const placeLabel = mParent ? mParent.text : 'Свободная';
                return (
                  <button
                    key={mCopy.id}
                    type="button"
                    onClick={() => onSelectNode && onSelectNode(mCopy.id)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-lg border border-purple-100 dark:border-purple-900/30 transition-all cursor-pointer"
                    title={`Перейти к зеркальной копии в "${placeLabel}"`}
                  >
                    <span>🪞</span>
                    <span className="truncate max-w-[150px]">Зеркало: {placeLabel}</span>
                  </button>
                );
              });
            })()}
          </div>

          {/* Core Title input centered */}
          <div className="flex-1 max-w-xl mx-4">
            <input
              type="text"
              value={node.text}
              onChange={(e) => handlePropChange('text', e.target.value)}
              onFocus={() => {
                setOriginalText(node.text);
                setOriginalNotes(node.notes || '');
              }}
              onBlur={() => {
                if (node.text !== originalText) {
                  recordHistoryVersion(originalText, originalNotes, 'Правка названия (полный экран)');
                }
              }}
              className="w-full text-sm font-bold px-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center dark:text-slate-100 font-sans"
              placeholder="Введите название задачи..."
            />
          </div>

          {/* Action buttons on the right */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button"
              onClick={handleCopyLink}
              className={`p-1.5 px-2.5 rounded-lg hover:bg-slate-105 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer ${copied ? 'text-emerald-650 dark:text-emerald-400' : 'text-slate-500 hover:text-indigo-500'}`}
              title="Скопировать прямую ссылку"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <LinkIcon className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? "Ссылка скопирована!" : "Ссылка"}</span>
            </button>

            <button 
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-bold flex items-center gap-1.5 text-xs cursor-pointer transition-all border border-indigo-100/30"
              title="Вернуться к обычному виду"
            >
              <Maximize2 className="w-3.5 h-3.5 rotate-180" />
              <span>Свернуть</span>
            </button>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
              title="Закрыть панель"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BENTO GRID AREA */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-4 p-4 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-hidden">
          
          {/* COLUMN 1: SUBTASKS & POMODORO */}
          <div className="flex flex-col gap-4 min-h-0 h-full">
            {/* SUBTASKS CARD */}
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs overflow-hidden min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <span className="text-xs font-bold text-slate-505 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Подзадачи ({sortedSubtasks.length})
                </span>
                {onAddChildNode && (
                  <button
                    type="button"
                    onClick={() => onAddChildNode(node.id, true)}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-750 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Добавить
                  </button>
                )}
              </div>

              {/* Scrollable Subtasks content */}
              <div className="flex-1 overflow-y-auto pr-1">
                {sortedSubtasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {sortedSubtasks.map((child, index) => (
                      <motion.div 
                        key={child.id}
                        layout
                        transition={{ type: "spring", stiffness: 500, damping: 45 }}
                        className="flex items-center justify-between gap-1.5 p-2 bg-slate-50/50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60 group hover:border-slate-250 dark:hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 select-none shrink-0 min-w-[14px]">
                            {index + 1}.
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              onUpdateNode({
                                ...child,
                                completed: !child.completed
                              });
                            }}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex-shrink-0 transition-colors"
                          >
                            {child.completed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-455" />
                            ) : pomo.isRunning && pomo.nodeId === child.id ? (
                              <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 opacity-75"></span>
                                <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                              </span>
                            ) : (
                              <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                            )}
                          </button>

                          <input
                            type="text"
                            value={child.text}
                            onChange={(e) => {
                              onUpdateNode({
                                ...child,
                                text: e.target.value
                              });
                            }}
                            className={`text-xs font-semibold bg-transparent border-0 focus:ring-0 focus:outline-none p-0 w-full text-slate-700 dark:text-slate-200 ${
                              child.completed ? 'line-through text-slate-400 dark:text-slate-500 italic' : ''
                            }`}
                          />

                          {child.estimatedTime !== undefined && child.estimatedTime !== null && !isNaN(child.estimatedTime) ? (
                            <button 
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                const val = prompt("Изменить ориентировочное время работы подзадачи (в минутах):", child.estimatedTime?.toString() || "30");
                                if (val !== null) {
                                  if (val === "") {
                                    onUpdateNode({ ...child, estimatedTime: undefined });
                                  } else {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      onUpdateNode({ ...child, estimatedTime: num });
                                    }
                                  }
                                }
                              }}
                              className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-150/40 dark:border-indigo-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                              title={`Ориентировочное время: ${child.estimatedTime} мин (нажмите для изменения)`}
                            >
                              <Timer className="w-2.5 h-2.5 text-indigo-500" />
                              {child.estimatedTime}м
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                const val = prompt("Укажите ориентировочное время работы подзадачи (в минутах):", "30");
                                if (val !== null) {
                                  if (val === "") {
                                    onUpdateNode({ ...child, estimatedTime: undefined });
                                  } else {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      onUpdateNode({ ...child, estimatedTime: num });
                                    }
                                  }
                                }
                              }}
                              className="text-[9px] font-bold text-slate-400 dark:text-slate-505 bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 cursor-pointer hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all"
                              title="Нажмите, чтобы указать ориентировочное время работы"
                            >
                              <Timer className="w-2.5 h-2.5 text-slate-400" />
                              0м
                            </button>
                          )}

                          {(() => {
                            const childStats = getPomoStatsForNode(child, allNodes);
                            return childStats.pomodoroTotalTime > 0 ? (
                              <span 
                                className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-150/30 dark:border-rose-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 select-none"
                                title={`Проведено на Помидоре: ${formatTotalPomoTime(childStats.pomodoroTotalTime)}`}
                              >
                                🍅 {formatTotalPomoTime(childStats.pomodoroTotalTime)}
                              </span>
                            ) : null;
                          })()}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveSubtask(child.id, 'up')}
                            className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === sortedSubtasks.length - 1}
                            onClick={() => handleMoveSubtask(child.id, 'down')}
                            className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {onSelectNode && (
                            <button
                              type="button"
                              onClick={() => onSelectNode(child.id)}
                              title="Свойства"
                              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (confirmDeleteSubtaskId === child.id) {
                                onDeleteNode(child.id);
                                setConfirmDeleteSubtaskId(null);
                              } else {
                                setConfirmDeleteSubtaskId(child.id);
                                setTimeout(() => setConfirmDeleteSubtaskId(curr => curr === child.id ? null : curr), 4000);
                              }
                            }}
                            className={`p-1 rounded text-slate-400 hover:text-rose-650 hover:bg-slate-100 dark:hover:bg-slate-800 transition ${
                              confirmDeleteSubtaskId === child.id ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/20 font-bold px-2' : ''
                            }`}
                          >
                            {confirmDeleteSubtaskId === child.id ? 'Да?' : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-xs py-8">
                    <span>Нет дочерних подзадач</span>
                  </div>
                )}
              </div>
            </div>

            {/* POMODORO CARD */}
            {node.isContainer ? (
              <div className="bg-emerald-500/10 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-500/15 dark:border-emerald-500/10 flex flex-col justify-between shrink-0 h-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
                    Время по проекту
                  </span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-extrabold uppercase py-0.5 px-2 rounded-full tracking-wider">
                    Проект / Область
                  </span>
                </div>

                <div className="text-xs space-y-2 py-3 px-3.5 bg-white/50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-[11.5px]">
                        Общее время по проекту:
                      </span>
                      <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 text-[12px]">
                        {formatTotalPomoTime(getPomoStatsForNode(node, allNodes).pomodoroTotalTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-505 dark:text-slate-500 text-[10.5px]">
                      <span>Всего завершенных сессий:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {getPomoStatsForNode(node, allNodes).pomodoroSessionsCount}
                      </span>
                    </div>
                  </div>
                  <div className="text-[9.5px] text-slate-450 dark:text-slate-500 border-t border-slate-100/80 dark:border-slate-800/60 pt-2 mt-2 leading-normal italic">
                    💡 Время рассчитывается как сумма накопленной фокусировки по всем вложенным в него задачам и подветвям.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/85 p-4 shadow-xs shrink-0 flex flex-col justify-between h-auto gap-3">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-rose-500 animate-pulse" />
                    Pomodoro Таймер
                  </span>
                  {pomo.isRunning && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase bg-rose-100 text-rose-750 dark:bg-rose-950 dark:text-rose-400 animate-pulse">
                      Фокус
                    </span>
                  )}
                </div>

                {/* Timer clock view */}
                <div className="flex flex-col justify-center items-center py-1">
                  <div className="w-full max-w-[200px] text-center bg-slate-50 dark:bg-slate-950/30 border border-slate-150 dark:border-slate-850 p-2 rounded-xl relative overflow-hidden">
                    <div className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100 tracking-tight tabular-nums z-10 relative">
                      {formatPomoTime(pomo.timeLeft)}
                    </div>
                    {pomo.isRunning && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
                        <div 
                          className="h-full bg-rose-500 transition-all duration-1000"
                          style={{ width: `${(pomo.timeLeft / pomo.duration) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium mt-1">
                    {pomo.isRunning 
                      ? `Фокусировка на задаче 🎯` 
                      : `Таймер настроен на ${customPomoMinutes} мин`}
                  </p>
                </div>

                {/* SESSIONS STATS / ACCUMULATED SAVED TIME */}
                <div className="text-xs space-y-2 py-2 px-2.5 bg-rose-50/20 dark:bg-rose-950/5 rounded-lg border border-rose-100/30 dark:border-rose-950/20">
                  {!isEditingPomoTime ? (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-[11px] flex items-center gap-1">
                          Накоплено времени:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold font-mono text-rose-600 dark:text-rose-450 text-[11px]">
                            {formatTotalPomoTime(node.pomodoroTotalTime || 0)}
                          </span>
                          <button 
                            type="button"
                            onClick={() => {
                              const total = node.pomodoroTotalTime || 0;
                              setEditPomoHours(Math.floor(total / 3600));
                              setEditPomoMinutes(Math.floor((total % 3600) / 60));
                              setEditPomoSeconds(total % 60);
                              setEditPomoSessions(node.pomodoroSessionsCount || 0);
                              setIsEditingPomoTime(true);
                            }}
                            className="p-1 hover:bg-rose-100/50 dark:hover:bg-rose-955/35 text-rose-650 dark:text-rose-400 rounded transition cursor-pointer"
                            title="Редактировать время вручную"
                          >
                            <Edit className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-slate-505 dark:text-slate-500 text-[10px]">
                        <span>Всего запусков («помидоров»):</span>
                        <span className="font-semibold">{node.pomodoroSessionsCount || 0}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-0.5 text-left">
                      <div className="text-[9px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wide">
                        Редактирование времени фокусировки
                      </div>
                      
                      <div className="grid grid-cols-3 gap-1">
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-400 dark:text-slate-505 block text-center font-bold">ЧАСЫ</span>
                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={editPomoHours === 0 ? '' : editPomoHours}
                            placeholder="0"
                            onChange={(e) => setEditPomoHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-400 dark:text-slate-505 block text-center font-bold">МИН</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={editPomoMinutes === 0 ? '' : editPomoMinutes}
                            placeholder="0"
                            onChange={(e) => setEditPomoMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                            className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-400 dark:text-slate-505 block text-center font-bold">СЕК</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={editPomoSeconds === 0 ? '' : editPomoSeconds}
                            placeholder="0"
                            onChange={(e) => setEditPomoSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                            className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded px-1.5 py-0.5">
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">Всего «помидоров»:</span>
                        <input
                          type="number"
                          min="0"
                          max="999"
                          value={editPomoSessions === 0 ? '' : editPomoSessions}
                          placeholder="0"
                          onChange={(e) => setEditPomoSessions(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-10 px-1 py-0.5 text-center text-xs font-mono font-bold bg-slate-55 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setIsEditingPomoTime(false)}
                          className="px-2 py-0.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-350 cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const totalSeconds = (editPomoHours * 3600) + (editPomoMinutes * 60) + editPomoSeconds;
                            onUpdateNode({
                              ...node,
                              pomodoroTotalTime: totalSeconds,
                              pomodoroSessionsCount: editPomoSessions
                            });
                            setIsEditingPomoTime(false);
                          }}
                          className="px-2 py-0.5 text-[9px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom numeric timer minutes input */}
                {!pomo.isRunning && (
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/85 rounded-lg p-1 w-full justify-between">
                      <span className="text-[9px] text-slate-400 dark:text-slate-505 font-bold uppercase pl-1 shrink-0">
                        Время:
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={customPomoMinutes === 0 ? '' : customPomoMinutes}
                        placeholder="25"
                        onChange={(e) => {
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setCustomPomoMinutes(0);
                            return;
                          }
                          const val = parseInt(valStr, 10);
                          if (!isNaN(val)) {
                            handleChangeCustomMinutes(val);
                          }
                        }}
                        onBlur={() => {
                          if (customPomoMinutes < 1 || customPomoMinutes > 180) {
                            handleChangeCustomMinutes(25);
                          }
                        }}
                        className="w-12 px-1 py-0.5 text-center text-xs font-bold font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium shrink-0 pr-1">
                        минут
                      </span>
                    </div>
                  </div>
                )}

                {/* Focus controls and custom duration presets */}
                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                  {!pomo.isRunning ? (
                    <div className="flex gap-1 w-full">
                      {[15, 25, 45, 60].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => handleChangeCustomMinutes(mins)}
                          className={`flex-1 py-1 text-[10px] font-bold rounded border transition cursor-pointer ${
                            customPomoMinutes === mins
                              ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-505 hover:bg-slate-50'
                          }`}
                        >
                          {mins}м
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleStartFocus(customPomoMinutes * 60)}
                        className="p-1 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] rounded-lg shadow-xs flex items-center gap-1 cursor-pointer transition-all shrink-0 animate-pulse"
                      >
                        <Play className="w-3 h-3" /> Старт
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 w-full">
                      <div className="flex gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={handleTogglePomoPause}
                          className={`flex-1 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                            pomo.isPaused 
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' 
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900'
                          }`}
                        >
                          {pomo.isPaused ? 'Продолжить' : 'Пауза'}
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPomo}
                          className="p-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>

                      {/* EARLY COMPLETION BUTTON */}
                      <button
                        type="button"
                        onClick={handleCompletePomoEarly}
                        className="w-full py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/10 dark:hover:bg-rose-955/20 text-rose-600 dark:text-rose-450 border border-rose-200/50 dark:border-rose-900 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                        title="Остановить таймер и сохранить накопленное время фокусировки"
                      >
                        💾 Сберечь время ({formatTotalPomoTime(pomo.duration - pomo.timeLeft)})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: RICH NOTES & WIKI LINKS */}
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs overflow-hidden h-full min-h-0">
            <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Подробное описание и заметки
                </span>
              </div>
              
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setNotesMode('edit')}
                  className={`px-3 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    notesMode === 'edit' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-505'
                  }`}
                >
                  Редактор
                </button>
                <button
                  type="button"
                  onClick={() => setNotesMode('preview')}
                  className={`px-3 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    notesMode === 'preview' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-505'
                  }`}
                >
                  Превью
                </button>
              </div>
            </div>

            {/* Note area */}
            <div className="flex-1 mt-3 min-h-0 flex flex-col relative">
              {notesMode === 'edit' ? (
                <textarea
                  ref={notesTextareaRef}
                  value={node.notes || ''}
                  onChange={(e) => handlePropChange('notes', e.target.value)}
                  onFocus={() => {
                    setOriginalText(node.text);
                    setOriginalNotes(node.notes || '');
                  }}
                  onBlur={() => {
                    if ((node.notes || '') !== originalNotes) {
                      recordHistoryVersion(originalText, originalNotes, 'Правка заметок (полный экран)');
                    }
                  }}
                  className="flex-1 w-full text-xs bg-slate-50/40 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg p-4 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-sans resize-none h-full"
                  placeholder="Напишите мысли, plans, спецификации... Используйте [[Имя Задачи]] для создания связей..."
                />
              ) : (
                <div className="flex-1 overflow-y-auto pr-1 text-slate-700 dark:text-slate-200 text-xs leading-relaxed">
                  {renderNotesWithLinks(node.notes || '')}
                </div>
              )}

              {/* Wiki Links Connector button */}
              <div className="absolute right-3 bottom-3 z-10">
                <button
                  type="button"
                  onClick={() => setIsInsertingLink(!isInsertingLink)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" /> Ссылка на задачу
                </button>

                {isInsertingLink && (
                  <div className="absolute right-0 bottom-9 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl shadow-2xl p-3 space-y-2 text-left">
                    <div className="text-[10px] font-extrabold text-slate-400 dark:text-slate-505 uppercase tracking-wider flex items-center justify-between">
                      <span>Связать с задачей</span>
                      <button onClick={() => { setIsInsertingLink(false); setLinkSearchQuery(''); }} className="text-slate-400 hover:text-slate-650">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                      <input
                        type="text"
                        placeholder="Поиск задачи..."
                        value={linkSearchQuery}
                        onChange={(e) => setLinkSearchQuery(e.target.value)}
                        className="w-full text-xs pl-7 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                      {allNodes
                        .filter(n => n.id !== node.id)
                        .filter(n => n.text.toLowerCase().includes(linkSearchQuery.toLowerCase()))
                        .map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleInsertTaskLink(item.id, item.text)}
                            className="w-full text-left px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-[11px]"
                          >
                            <span className="font-bold block truncate text-slate-800 dark:text-slate-200">{item.text}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Version History Section inside Column 2 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-3 bg-[#FAFBFD]/30 dark:bg-slate-800/20 shrink-0">
              <button
                type="button"
                onClick={() => setIsHistorySectionOpen(!isHistorySectionOpen)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-850/80 transition-all select-none cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[11px] font-bold text-slate-750 dark:text-slate-350 uppercase tracking-wider">
                    История изменений
                  </span>
                  <span className="text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-mono">
                    {(node.history || []).length}
                  </span>
                </div>
                {isHistorySectionOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {isHistorySectionOpen && (
                <div className="p-3 space-y-3 bg-white dark:bg-slate-900 animate-fade-in max-h-[180px] overflow-y-auto text-left">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="text-[9px] text-slate-400 dark:text-slate-505 italic leading-tight">
                      Автосохранение истории
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveManualCheckpoint}
                      className="px-2 py-0.5 text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-955/30 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded transition shadow-2xs shrink-0"
                      title="Сохранить текущую версию как снимок"
                    >
                      + Снимок
                    </button>
                  </div>

                  {(node.history || []).length === 0 ? (
                    <div className="text-center py-3 text-[11px] text-slate-400 dark:text-slate-505 italic">
                      История изменений пуста
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(node.history || []).map((ver) => {
                        const isExpanded = expandedVersionId === ver.id;
                        const canRestore = ver.text !== node.text || ver.notes !== node.notes;

                        return (
                          <div
                            key={ver.id}
                            className="p-2 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg flex flex-col gap-1"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                  {ver.description || 'Правка'}
                                </div>
                                <div className="text-[8.5px] text-slate-400 font-mono">
                                  {new Date(ver.timestamp).toLocaleString()}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedVersionId(isExpanded ? null : ver.id)}
                                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-505 dark:text-slate-400 rounded transition"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                </button>
                                
                                <button
                                  type="button"
                                  disabled={!canRestore}
                                  onClick={() => handleRestoreVersion(ver)}
                                  className={`px-1 py-0.5 text-[8.5px] font-bold rounded cursor-pointer transition ${
                                    canRestore 
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-955/40 dark:hover:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50' 
                                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                                  }`}
                                  title={canRestore ? "Восстановить версию" : "Текущая версия совпадает"}
                                >
                                  Откат
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteVersion(ver.id)}
                                  className="p-0.5 hover:bg-rose-105 dark:hover:bg-rose-950/20 text-rose-500 rounded transition"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-1 pt-1 border-t border-slate-150/40 dark:border-slate-800/40 space-y-1">
                                <div>
                                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-555 block uppercase font-sans">
                                    Название:
                                  </span>
                                  <div className="bg-white dark:bg-slate-800/80 p-1 rounded text-[9px] text-slate-700 dark:text-slate-350 border border-slate-100 dark:border-slate-850 break-words font-mono max-h-12 overflow-y-auto font-sans">
                                    {ver.text}
                                  </div>
                                </div>
                                
                                {ver.notes ? (
                                  <div>
                                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-555 block uppercase font-sans">
                                      Заметки:
                                    </span>
                                    <div className="bg-white dark:bg-slate-800/80 p-1 rounded text-[9px] text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-850 break-all font-mono whitespace-pre-wrap max-h-20 overflow-y-auto">
                                      {ver.notes}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[8.5px] text-slate-405 italic">Заметки пусты</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(node.history || []).length > 0 && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="text-[8.5px] font-bold text-rose-600 hover:underline transition-colors cursor-pointer"
                      >
                        Очистить всю историю
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: SCHEDULES, CATEGORIES & FILES */}
          <div className="flex flex-col gap-4 min-h-0 h-full">
            {/* SCHEDULE DATES & ESTIMATIONS CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs shrink-0 flex flex-col h-[400px] overflow-hidden">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                Планирование и параметры
              </span>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0 text-left">
                
                {/* ГРУППА 1: СТАТУС И ПРОГРЕСС */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                    Выполнение и прогресс
                  </span>

                  {/* Done switch / state badge */}
                  {!node.isWorkflowRectangle && (
                    <div className="space-y-2">
                      {hasActiveBlockers && (
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-700 dark:text-rose-400 font-medium space-y-1">
                          <span className="font-bold flex items-center gap-1">⚠️ Задача заблокирована!</span>
                          Вы не можете завершить её, пока не будут выполнены следующие задачи:
                          <ul className="list-disc pl-4 mt-1 space-y-0.5">
                            {activeBlockers.map(b => (
                              <li key={b.id} className="font-semibold">{b.text || 'Без названия'}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/60">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Статус выполнения:</span>
                        <select
                          value={node.completed ? 'done' : (node.status === 'waiting' ? 'waiting' : (node.progress && node.progress > 0 ? 'progress' : 'todo'))}
                          disabled={hasActiveBlockers && !node.completed}
                          onChange={(e) => {
                            const val = e.target.value as 'todo' | 'progress' | 'waiting' | 'done';
                            if (val === 'done') {
                              onUpdateNode({
                                ...node,
                                completed: true,
                                progress: 100,
                                status: 'done'
                              });
                            } else if (val === 'waiting') {
                              onUpdateNode({
                                ...node,
                                completed: false,
                                status: 'waiting'
                              });
                            } else if (val === 'progress') {
                              onUpdateNode({
                                ...node,
                                completed: false,
                                progress: node.progress && node.progress > 0 ? node.progress : 50,
                                status: 'progress'
                              });
                            } else {
                              onUpdateNode({
                                ...node,
                                completed: false,
                                progress: 0,
                                status: 'todo'
                              });
                            }
                          }}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <option value="todo">📋 План</option>
                          <option value="progress">▶ В работе</option>
                          <option value="waiting">⏳ В ожидании</option>
                          <option value="done">✓ Готово</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Progress slider/bar */}
                  {(() => {
                    const hasChildren = allNodes.some(n => n.parentId === node.id);
                    const calculatedProgressVal = hasChildren ? (calculateProgress(node.id, allNodes) || 0) : 0;
                    const descendantsCount = getDescendants(node.id, allNodes).length;
                    const manualProgressVal = node.progress !== undefined ? node.progress : (node.completed ? 100 : 0);

                    return (
                      <div className="space-y-2 bg-slate-50/30 dark:bg-slate-800/10 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/40">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-555 dark:text-slate-400 uppercase">
                            Прогресс задачи:
                          </label>
                          <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {hasChildren ? `${calculatedProgressVal}%` : `${manualProgressVal}%`}
                          </span>
                        </div>

                        {hasChildren ? (
                          <div className="space-y-1">
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300"
                                style={{ width: `${calculatedProgressVal}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-slate-400 dark:text-slate-505 italic font-medium leading-tight">
                              Рассчитывается из {descendantsCount} подзадач
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={manualProgressVal}
                              onChange={(e) => {
                                let val = parseInt(e.target.value);
                                if (hasActiveBlockers && val === 100) {
                                  val = 95; // restrict from reaching 100%
                                }
                                onUpdateNode({
                                  ...node,
                                  progress: val,
                                  completed: val === 100
                                });
                              }}
                              className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-505"
                            />
                            <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 font-medium">
                              <span>0%</span>
                              <span>50%</span>
                              <span>100%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Class selection: task vs non-task */}
                  <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/60">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Исключить из задач:</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-normal max-w-[130px]">Не учитывать как активную задачу</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePropChange('isNotTask', !node.isNotTask)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        node.isNotTask ? 'bg-rose-600' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          node.isNotTask ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* ГРУППА 2: WORKFLOW & CONTAINERS (IF APPLICABLE) */}
                {(node.isWorkflowRectangle || (!node.isWorkflowRectangle && !node.isContainer)) && (
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                      Специфические свойства
                    </span>

                    {/* Workflow step settings */}
                    {node.isWorkflowRectangle && (
                      <div className="space-y-2.5 bg-indigo-50/10 dark:bg-slate-800/20 p-2.5 rounded-lg border border-indigo-100/20 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-slate-550 dark:text-slate-300">Форма шага:</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePropChange('workflowShape', 'rectangle')}
                              className={`px-2 py-1 rounded text-[10.5px] font-extrabold border transition ${
                                node.workflowShape !== 'rhomb'
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-indigo-505'
                                  : 'bg-slate-50 dark:bg-slate-850 text-slate-505 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                              }`}
                            >
                              Прямоугольник
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePropChange('workflowShape', 'rhomb')}
                              className={`px-2 py-1 rounded text-[10.5px] font-extrabold border transition ${
                                node.workflowShape === 'rhomb'
                                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 border-amber-505'
                                  : 'bg-slate-50 dark:bg-slate-850 text-slate-505 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                              }`}
                            >
                              Ромб
                            </button>
                          </div>
                        </div>

                        <label className="flex items-center justify-between cursor-pointer select-none">
                          <span className="text-[11px] font-bold text-slate-550 dark:text-slate-300">Отключить авто-тег:</span>
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              checked={!!node.isZoneTriggerDisabled}
                              onChange={(e) => handlePropChange('isZoneTriggerDisabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:bg-rose-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5" />
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Container Properties */}
                    {!node.isWorkflowRectangle && !node.isContainer && (
                      <div className="space-y-2 bg-slate-50/40 dark:bg-slate-800/15 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/50">
                        {onUpdateNodeParent && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase block">
                              Переместить в контейнер:
                            </span>
                            <select
                              value={node.parentId || 'no-container'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'no-container') {
                                  onUpdateNodeParent(node.id, null);
                                } else {
                                  onUpdateNodeParent(node.id, val);
                                }
                              }}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded text-xs focus:outline-none dark:text-slate-100 cursor-pointer"
                            >
                              <option value="no-container">📦 Без контейнера</option>
                              {allNodes
                                .filter(n => n.isContainer && n.id !== node.id)
                                .map(container => (
                                  <option key={container.id} value={container.id}>
                                    📥 {container.text || 'Без имени'}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        {node.containerPlace && (
                          <div className="pt-1">
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-505 uppercase block mb-0.5">
                              Место в контейнере:
                            </span>
                            <p className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 truncate">
                              📦 {node.containerPlace}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ГРУППА 3: СРОКИ, ПРИОРИТЕТ, ОЦЕНКА, НАПОМИНАНИЯ */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                    Планирование, приоритет и сроки
                  </span>

                  {/* Priority & Estimation row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase">Приоритет:</span>
                      <select
                        value={node.priority || 'none'}
                        onChange={(e) => handlePropChange('priority', e.target.value as Priority)}
                        className="w-full text-xs px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="none">Без приоритета</option>
                        <option value="low">🟢 Низкий</option>
                        <option value="medium">🔵 Средний</option>
                        <option value="high">🟡 Высокий</option>
                        <option value="urgent">🔴 Критический</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase">Оценка (мин):</span>
                        {node.estimatedTime !== undefined && node.estimatedTime !== null && !hasSubtaskWithTime && (
                          <button
                            type="button"
                            onClick={() => handlePropChange('estimatedTime', undefined)}
                            className="text-[9px] text-rose-550 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                          >
                            Сброс
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder={hasSubtaskWithTime ? "Сумма подзадач" : "Например: 30"}
                        disabled={hasSubtaskWithTime}
                        value={node.estimatedTime !== undefined && node.estimatedTime !== null ? node.estimatedTime : ''}
                        onChange={(e) => handlePropChange('estimatedTime', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className={`w-full text-xs px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 ${
                          hasSubtaskWithTime ? 'bg-slate-100 dark:bg-slate-900/60 cursor-not-allowed font-semibold text-indigo-600 dark:text-indigo-400' : ''
                        }`}
                      />
                      {suggestedTime !== undefined && suggestedTime !== node.estimatedTime && !hasSubtaskWithTime && (
                        <div className="mt-1 text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
                          <span>Рекомендация: {suggestedTime} мин</span>
                          <button
                            type="button"
                            onClick={() => handlePropChange('estimatedTime', suggestedTime)}
                            className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 underline cursor-pointer"
                          >
                            Применить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Start Date & Time Row */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase">Дата и время начала:</span>
                      {(node.startDate || node.startTime) && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNode({
                              ...node,
                              startDate: undefined,
                              startTime: undefined
                            });
                          }}
                          className="text-[9px] text-rose-550 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        value={node.startDate || ''}
                        onChange={(e) => handleTimePropChange('startDate', e.target.value)}
                        className="w-full text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none"
                      />
                      <input
                        type="time"
                        value={node.startTime || ''}
                        onChange={(e) => handleTimePropChange('startTime', e.target.value)}
                        className="w-full text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Due Date & Time Row */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase">Срок сдачи (дедлайн):</span>
                      {(node.dueDate || node.dueTime) && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNode({
                              ...node,
                              dueDate: undefined,
                              dueTime: undefined,
                              reminderMinutesBefore: undefined
                            });
                          }}
                          className="text-[9px] text-rose-550 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        value={node.dueDate || ''}
                        onChange={(e) => handleTimePropChange('dueDate', e.target.value)}
                        className="w-full text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none"
                      />
                      <input
                        type="time"
                        value={node.dueTime || ''}
                        onChange={(e) => handleTimePropChange('dueTime', e.target.value)}
                        className="w-full text-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Reminder quick dropdown */}
                  {node.dueDate && (
                    <div className="flex items-center gap-2 bg-indigo-50/15 dark:bg-slate-900/40 p-2 rounded-xl border border-indigo-100/20 dark:border-slate-800">
                      <Bell className="w-3.5 h-3.5 text-indigo-500 shrink-0 animate-bounce" />
                      <span className="text-[10px] font-bold text-slate-550 dark:text-slate-400 uppercase">Напомнить:</span>
                      <select
                        value={
                          node.reminderDate && node.reminderMinutesBefore !== undefined
                            ? String(node.reminderMinutesBefore)
                            : node.reminderDate
                            ? 'custom'
                            : 'none'
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'none') {
                            onUpdateNode({
                              ...node,
                              reminderMinutesBefore: undefined,
                              reminderDate: undefined,
                              reminderTime: undefined,
                              reminderDismissed: undefined
                            });
                          } else if (val === 'custom') {
                            onUpdateNode({
                              ...node,
                              reminderMinutesBefore: undefined,
                              reminderDate: node.reminderDate || node.dueDate,
                              reminderTime: node.reminderTime || node.dueTime || '12:00',
                              reminderDismissed: false
                            });
                          } else {
                            handleSetRelativeReminder(Number(val));
                          }
                        }}
                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] px-1.5 py-0.5 focus:outline-none dark:text-slate-200 font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="none">Без напоминания</option>
                        <option value="0">В срок</option>
                        <option value="5">За 5 минут до</option>
                        <option value="10">За 10 минут до</option>
                        <option value="15">За 15 минут до</option>
                        <option value="30">За 30 минут до</option>
                        <option value="60">За 1 час до</option>
                        <option value="120">За 2 часа до</option>
                        <option value="1440">За 1 день до</option>
                        <option value="custom">Своё время...</option>
                      </select>
                    </div>
                  )}

                  {/* Reminder custom inputs */}
                  <div className="bg-slate-50/30 dark:bg-slate-800/10 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase flex items-center gap-1">
                        <Bell className="w-3 h-3 text-indigo-500" /> Своё напоминание:
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => playNotificationChime()}
                          className="text-[9px] text-indigo-600 hover:underline font-bold cursor-pointer"
                          title="Проверить звук"
                        >
                          Звук 🔊
                        </button>
                        {(node.reminderDate || node.reminderTime) && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateNode({
                                ...node,
                                reminderDate: undefined,
                                reminderTime: undefined,
                                reminderMinutesBefore: undefined,
                                reminderDismissed: undefined
                              });
                            }}
                            className="text-[9px] text-rose-500 hover:underline font-bold cursor-pointer"
                          >
                            Сбросить
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        value={node.reminderDate || ''}
                        onChange={(e) => {
                          onUpdateNode({
                            ...node,
                            reminderDate: e.target.value || undefined,
                            reminderMinutesBefore: undefined,
                            reminderDismissed: false
                          });
                        }}
                        className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded focus:outline-none dark:text-slate-100"
                      />
                      <input
                        type="time"
                        value={node.reminderTime || ''}
                        onChange={(e) => {
                          onUpdateNode({
                            ...node,
                            reminderTime: e.target.value || undefined,
                            reminderMinutesBefore: undefined,
                            reminderDismissed: false
                          });
                        }}
                        className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded focus:outline-none dark:text-slate-100 font-mono"
                      />
                    </div>

                    {node.reminderDate && node.reminderTime && (
                      <div className="p-1.5 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100/30 rounded">
                        <p className="text-[9.5px] text-indigo-650 dark:text-indigo-400 font-semibold leading-snug">
                          🔔 Сработает: {node.reminderDate} в {node.reminderTime}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ГРУППА 4: ВНЕШНЯЯ ССЫЛКА И ЦВЕТ СВЯЗИ */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                    Ссылки и внешний вид
                  </span>

                  {/* External link */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase">Внешняя ссылка:</span>
                      {node.externalLink && (
                        <a
                          href={node.externalLink.startsWith('http') ? node.externalLink : `https://${node.externalLink}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-650 dark:text-indigo-400 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          Перейти <LinkIcon className="w-3 h-3 text-indigo-500" />
                        </a>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={node.externalLink || ''}
                      onChange={(e) => handlePropChange('externalLink', e.target.value)}
                      className="w-full text-xs px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none dark:text-slate-100"
                    />
                  </div>

                  {/* Colors */}
                  <div className="space-y-1.5 pb-2 border-b border-slate-100 dark:border-slate-850">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-555 uppercase block">Цвет ветви связи:</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {PASTEL_COLORS.map(col => {
                        const isSelected = (node.color || '') === col.value;
                        return (
                          <button
                            key={col.value || 'default'}
                            type="button"
                            onClick={() => handlePropChange('color', col.value)}
                            className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer ${
                              isSelected ? 'ring-2 ring-indigo-500 scale-110 border-slate-400' : 'border-slate-200 dark:border-slate-800 hover:scale-105'
                            }`}
                            style={{ backgroundColor: col.value || '#cbd5e1' }}
                            title={col.name}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* ГРУППА: БЛОКИРОВКИ (BLOCKED BY) */}
                  <div className="space-y-3 pt-1">
                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-450 uppercase tracking-wider block">
                      Блокирующие задачи (Blocked By)
                    </span>
                    
                    <div className="space-y-1.5">
                      {(() => {
                        const currentBlockers = allNodes.filter(n => node.blockedBy?.includes(n.id));
                        if (currentBlockers.length === 0) {
                          return (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 italic bg-slate-50/50 dark:bg-slate-900/30 px-2.5 py-2 rounded-lg border border-dashed border-slate-150 dark:border-slate-800/50">
                              Нет блокирующих задач.
                            </div>
                          );
                        }
                        return currentBlockers.map(blocker => (
                          <div 
                            key={blocker.id} 
                            className="flex items-center justify-between bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-2 rounded-lg"
                          >
                            <div 
                              onClick={() => onSelectNode?.(blocker.id)}
                              className="min-w-0 flex-1 cursor-pointer hover:opacity-80 group/blocker-title"
                              title="Открыть свойства задачи"
                            >
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover/blocker-title:text-indigo-600 dark:group-hover/blocker-title:text-indigo-400 group-hover/blocker-title:underline truncate">
                                {blocker.text || 'Без названия'}
                              </div>
                              <div className="text-[9px] text-slate-400 dark:text-slate-505 flex items-center gap-1.5">
                                {blocker.completed ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Выполнена</span>
                                ) : (
                                  <span className="text-rose-500 dark:text-rose-400 font-bold">● Активный блокер</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedBlockedBy = (node.blockedBy || []).filter(id => id !== blocker.id);
                                handlePropChange('blockedBy', updatedBlockedBy);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded hover:bg-rose-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                              title="Удалить блокировку"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ));
                      })()}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase block">Добавить блокирующую задачу:</span>
                      
                      {/* Search box */}
                      <div className="relative mb-1.5">
                        <input
                          type="text"
                          placeholder="Поиск задачи..."
                          value={blockerSearch}
                          onChange={(e) => setBlockerSearch(e.target.value)}
                          className="w-full text-[11px] pl-7 pr-7 py-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 dark:text-slate-200"
                        />
                        <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        {blockerSearch && (
                          <button
                            type="button"
                            onClick={() => setBlockerSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const currentBlockedBy = node.blockedBy || [];
                          if (!currentBlockedBy.includes(val)) {
                            handlePropChange('blockedBy', [...currentBlockedBy, val]);
                          }
                          setBlockerSearch('');
                        }}
                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="">
                          {blockerSearch ? `Найдено задач: ${
                            allNodes.filter(n => {
                              if (n.id === node.id) return false;
                              if (n.isContainer || n.isWorkflowRectangle) return false;
                              if (node.blockedBy?.includes(n.id)) return false;
                              return (n.text || '').toLowerCase().includes(blockerSearch.toLowerCase());
                            }).length
                          }` : '-- Выберите задачу --'}
                        </option>
                        {allNodes
                          .filter(n => {
                            if (n.id === node.id) return false;
                            if (n.isContainer || n.isWorkflowRectangle) return false;
                            if (node.blockedBy?.includes(n.id)) return false;
                            if (blockerSearch) {
                              return (n.text || '').toLowerCase().includes(blockerSearch.toLowerCase());
                            }
                            return true;
                          })
                          .map(n => (
                            <option key={n.id} value={n.id}>
                              {n.completed ? '✓ ' : '○ '} {n.text || 'Без названия'}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* TAG CATEGORIES CARD */}
            <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs overflow-hidden flex flex-col animate-fade-in">
              {/* Ad-hoc Freeform Task Tags */}
              <div className="space-y-2 mb-3.5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Теги этой задачи
                </span>
                
                {/* List of active tag badges */}
                {node.tags && node.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-20 overflow-y-auto pr-1">
                    {node.tags.map((tag, index) => {
                      const matchedCategory = activeCategories.find(cat => cat.tags && cat.tags.includes(tag));
                      const color = matchedCategory?.color;
                      const style = color ? {
                        backgroundColor: `${color}18`,
                        color: color,
                        border: `1px solid ${color}35`
                      } : undefined;

                      return (
                        <span
                          key={`${tag}-${index}`}
                          style={style}
                          className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                            color 
                              ? '' 
                              : 'text-slate-600 dark:text-slate-450 bg-slate-50 dark:bg-slate-800/80 border border-slate-150 dark:border-slate-750'
                          }`}
                        >
                          #{tag}
                          <button 
                            onClick={() => handleRemoveTag(index)}
                            className="p-0.5 hover:text-rose-650 text-slate-400 hover:scale-110 active:scale-95 shrink-0 cursor-pointer transition-transform"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">Нет тегов.</p>
                )}

                {/* Freeform add form */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(e);
                  }} 
                  className="flex gap-2 mt-2"
                >
                  <input
                    type="text"
                    placeholder="Быстрый тег..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    className="flex-1 px-2.5 py-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="py-1 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                  >
                    +
                  </button>
                </form>
              </div>

              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-500" />
                  Категории тегов и меток
                </span>
                {onCreateTagCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCatForm(!showNewCatForm);
                      setNewCatName('');
                      setNewCatColor('#6366f1');
                    }}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Создать группу
                  </button>
                )}
              </div>

              {/* Add New Category form inline inside card */}
              {showNewCatForm && onCreateTagCategory && (
                <div className="bg-slate-50 dark:bg-slate-800 border p-3 rounded-lg space-y-2 text-xs mb-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-450 block mb-1">Имя группы</label>
                    <input
                      type="text"
                      placeholder="Например, Спринт, Срочность..."
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border rounded px-2 py-1 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => setShowNewCatForm(false)} className="px-2 py-0.5 bg-slate-200 rounded text-[10px]">Отмена</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (newCatName.trim()) {
                          handleCreateTagCategory(newCatName.trim(), newCatColor);
                          setShowNewCatForm(false);
                        }
                      }}
                      className="px-2 py-0.5 bg-indigo-600 text-white rounded font-bold text-[10px]"
                    >
                      Создать
                    </button>
                  </div>
                </div>
              )}

              {/* Scrollable categories list */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
                {activeCategories && activeCategories.length > 0 ? (
                  activeCategories.map(cat => {
                    const isAddingTag = addingTagToCatId === cat.id;
                    return (
                      <div key={cat.id} className="p-2.5 bg-slate-50/50 dark:bg-slate-850/10 rounded-xl border border-slate-100 dark:border-slate-800/40 text-xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                          <div 
                            className="flex items-center gap-1.5 cursor-pointer select-none truncate flex-1 hover:bg-slate-100 dark:hover:bg-slate-850 p-1 rounded"
                            onClick={() => {
                              setCollapsedCategoryIds(prev => ({ ...prev, [cat.id]: !prev[cat.id] }));
                            }}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: cat.color }} />
                            <span className="text-slate-700 dark:text-slate-300 font-bold truncate">{cat.name}</span>
                          </div>
                          
                          <div className="flex gap-1.5 pl-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const nextVal = !isAddingTag;
                                setAddingTagToCatId(nextVal ? cat.id : null);
                                setNewCatTagName('');
                              }}
                              className="text-indigo-600 hover:underline text-[10px] font-bold"
                            >
                              + Тег
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDeleteCatId === cat.id) {
                                  handleDeleteTagCategory(cat.id);
                                  setConfirmDeleteCatId(null);
                                } else {
                                  setConfirmDeleteCatId(cat.id);
                                }
                              }}
                              className="text-rose-550 hover:underline text-[10px] font-bold"
                            >
                              {confirmDeleteCatId === cat.id ? "Удалить?" : "Удалить"}
                            </button>
                          </div>
                        </div>

                        {/* Inline Tag insertion form */}
                        {isAddingTag && (
                          <div className="flex gap-1 items-center py-1">
                            <input
                              type="text"
                              placeholder="Имя тега..."
                              value={newCatTagName}
                              onChange={(e) => setNewCatTagName(e.target.value.replace(/\s+/g, '-'))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const trimmed = newCatTagName.trim().replace(/#/g, '');
                                  if (trimmed) {
                                    const alreadyInCat = cat.tags && cat.tags.includes(trimmed);
                                    if (!alreadyInCat) {
                                      const updatedTags = cat.tags ? [...cat.tags, trimmed] : [trimmed];
                                      handleUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
                                    }
                                  }
                                  setAddingTagToCatId(null);
                                }
                              }}
                              className="bg-white dark:bg-slate-800 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] w-full focus:outline-none"
                              autoFocus
                            />
                          </div>
                        )}

                        {/* Listed tags */}
                        {!collapsedCategoryIds[cat.id] && cat.tags && cat.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cat.tags.map(t => {
                              const isSelected = node.tags && node.tags.includes(t);
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => handleToggleCategoryTag(t)}
                                  className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-lg transition-all select-none"
                                  style={{
                                    backgroundColor: isSelected ? `${cat.color}20` : '#f1f5f9',
                                    color: isSelected ? cat.color : '#64748b',
                                    border: `1px solid ${isSelected ? cat.color : '#e2e8f0'}`
                                  }}
                                >
                                  {isSelected ? '✓ ' : ''}#{t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[11px] text-slate-400 italic text-center py-6">Нет категорий</p>
                )}
              </div>
            </div>

            {/* FILES & ATTACHMENTS CARD */}
            <div className="h-[180px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs overflow-hidden flex flex-col shrink-0">
              <span className="text-xs font-bold text-slate-505 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0 mb-2">
                <Paperclip className="w-4 h-4 text-indigo-500" />
                Вложения и файлы
              </span>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0">
                {/* Drag drop files */}
                <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition rounded-xl p-2.5 text-center cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={isUploadingFile}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {isUploadingFile ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto text-amber-500" />
                  ) : (
                    <p className="text-[10px] text-slate-500 font-bold">Выбрать файл или вставить (Ctrl+V)</p>
                  )}
                </div>

                {/* Uploaded attachments */}
                <div className="space-y-1">
                  {node.files && node.files.length > 0 ? (
                    node.files.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-slate-950/20 rounded-lg text-[11px]">
                        <span className="truncate font-bold text-slate-700 dark:text-slate-300 max-w-[120px]" title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <a href={file.dataUrl} target="_blank" rel="noreferrer" className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-indigo-500">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => handleRemoveFile(file.id)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 italic text-center py-2">Нет файлов</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 4: DISCUSSIONS (CHAT) & VERSION HISTORY */}
          <div className="flex flex-col gap-4 min-h-0 h-full">
            {/* DISCUSSION CHAT CARD */}
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs overflow-hidden min-h-0">
              <span className="text-xs font-bold text-slate-505 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0 px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                <Send className="w-4 h-4 text-indigo-500" />
                Обсуждение ({ (node.comments || []).length })
              </span>

              {/* Chat scrolling block */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {(node.comments || []).length === 0 ? (
                  <div className="text-center py-10 text-[11px] text-slate-400 italic">Начните обсуждение по задаче...</div>
                ) : (
                  (node.comments || []).map(comment => (
                    <div key={comment.id} className="flex gap-2 items-start text-xs">
                      <div className="w-6.5 h-6.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-[10px] shrink-0 border border-indigo-100">
                        {comment.userName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{comment.userName}</span>
                          <span className="text-[8px] text-slate-400">{new Date(comment.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 break-words">{comment.text}</p>
                      </div>
                      <button onClick={() => handleDeleteComment(comment.id)} className="text-slate-300 hover:text-rose-500 p-1 self-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Comment input */}
              <div className="p-3 border-t border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex gap-2 items-center shrink-0">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendComment();
                    }
                  }}
                  placeholder="Задать вопрос или прокомментировать..."
                  className="flex-1 text-xs bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none dark:text-slate-100 font-sans"
                />
                <button
                  onClick={handleSendComment}
                  disabled={!commentText.trim()}
                  className="p-1.5 px-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-45 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" /> Отправить
                </button>
              </div>
            </div>

            {/* VERSION HISTORY CARD */}
            <div className="h-[180px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs overflow-hidden flex flex-col shrink-0">
              <div className="flex items-center justify-between shrink-0 mb-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-500" />
                  История версий ({ (node.history || []).length })
                </span>
                <button
                  type="button"
                  onClick={handleSaveManualCheckpoint}
                  className="text-[9.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + Снимок
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0">
                {(node.history || []).length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic text-center py-4">Архив снимков пуст</p>
                ) : (
                  (node.history || []).map(ver => (
                    <div key={ver.id} className="p-2 border border-slate-100 dark:border-slate-800/60 rounded-lg bg-slate-50/50 text-[10px] flex justify-between items-center">
                      <div className="truncate pr-1">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block truncate">{ver.description || 'Правка'}</span>
                        <span className="text-[8px] text-slate-400 font-mono">{new Date(ver.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <button
                        onClick={() => handleRestoreVersion(ver)}
                        className="px-2 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-md font-bold text-[9px] cursor-pointer hover:bg-indigo-100"
                      >
                        Откат
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* CONTROLS FOOTER */}
        <div className="h-14 px-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Глобальные действия:</span>
            <button
              type="button"
              onClick={() => handlePropChange('archived', !node.archived)}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer transition ${
                node.archived ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20' : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800'
              }`}
            >
              {node.archived ? 'Разархивировать' : 'В архив'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isCentralRootNode ? (
              <button
                onClick={() => {
                  if (confirmDelete) {
                    onDeleteNode(node.id);
                    onClose();
                    setConfirmDelete(false);
                  } else {
                    setConfirmDelete(true);
                    setTimeout(() => setConfirmDelete(false), 4000);
                  }
                }}
                className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  confirmDelete ? 'bg-rose-605 text-white animate-pulse' : 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/20'
                }`}
              >
                {confirmDelete ? "ПОДТВЕРДИТЕ УДАЛЕНИЕ ЗАДАЧИ!" : "Удалить эту ветвь"}
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 font-mono italic">Корневой узел. Удаление недоступно.</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside 
        onPaste={handleAsidePaste}
        className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-50 transform translate-x-0 transition-transform duration-300 ease-out"
      >
      {/* Header */}
      <div className="h-16 px-6 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            type="text"
            value={node.text}
            onChange={(e) => handlePropChange('text', e.target.value)}
            onFocus={() => {
              setOriginalText(node.text);
              setOriginalNotes(node.notes || '');
            }}
            onBlur={() => {
              if (node.text !== originalText) {
                recordHistoryVersion(originalText, originalNotes, 'Правка названия (боковая панель)');
              }
            }}
            className="w-full text-sm font-semibold bg-transparent border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 focus:bg-slate-50 focus:dark:bg-slate-800 px-2 py-1 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-sans transition-colors"
            placeholder="Введите название задачи..."
          />
        </div>
        <div className="flex items-center gap-1.55">
          {/* Quick header copy link button */}
          <button 
            type="button"
            onClick={handleCopyLink}
            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer ${copied ? 'text-emerald-600 dark:text-emerald-400 font-bold text-[11px]' : 'text-slate-500 hover:text-indigo-500'}`}
            title="Копировать прямую ссылку на эту задачу"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] hidden sm:inline">Ссылка скопирована</span>
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4" />
              </>
            )}
          </button>

          <button 
            type="button"
            onClick={() => {
              if (window.innerWidth >= 768) {
                setIsFullscreen(true);
              }
            }}
            className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-500 transition-colors cursor-pointer"
            title="Открыть во весь экран"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button 
            onClick={onClose}
            className="p-1 px-[5px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            title="Закрыть панель"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-150/80 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-950/20 p-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'details'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-205/50 dark:ring-slate-700/50'
              : 'text-slate-505 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-702 dark:hover:text-slate-350'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Параметры
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 relative cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-205/50 dark:ring-slate-700/50'
              : 'text-slate-505 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-720 dark:hover:text-slate-350'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Чат и Обсуждение
          {node.comments && node.comments.length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-mono animate-pulse">
              {node.comments.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'details' && (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900">


          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {node.parentId && (() => {
               const parentNode = allNodes.find(n => n.id === node.parentId);
               if (parentNode && onSelectNode) {
                 return (
                   <button
                     type="button"
                     onClick={() => onSelectNode(parentNode.id)}
                     className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-50/50 hover:bg-indigo-100/50 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-lg border border-indigo-100/30 dark:border-indigo-900/30 transition-all cursor-pointer mb-2"
                     title={`Вернуться к главной задаче: ${parentNode.text}`}
                   >
                     <ChevronLeft className="w-4 h-4 shrink-0 text-indigo-500" />
                     <span className="truncate">Назад к: <span className="font-semibold">{parentNode.text}</span></span>
                   </button>
                 );
               }
               return null;
             })()}
            {node.mirrorParentId && (() => {
              const parentNode = allNodes.find(n => n.id === node.mirrorParentId);
              if (parentNode && onSelectNode) {
                return (
                  <button
                    type="button"
                    onClick={() => onSelectNode(parentNode.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50/50 hover:bg-purple-100/50 dark:bg-purple-950/20 dark:hover:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-lg border border-purple-100/30 dark:border-purple-900/30 transition-all cursor-pointer mb-2"
                    title={`Перейти к исходной родительской задаче: ${parentNode.text}`}
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="truncate">Родительская: <span className="font-semibold">{parentNode.text}</span></span>
                  </button>
                );
              } else if (node.mirrorParentText) {
                return (
                  <div className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50/50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-450 text-xs font-bold rounded-lg border border-slate-200/50 dark:border-slate-800/50 mb-2">
                    <span className="text-purple-500">🔗</span>
                    <span className="truncate">Родительская: <span className="font-semibold">{node.mirrorParentText}</span></span>
                  </div>
                );
              }
              return null;
            })()}
            {node.mirrorGroupId && (() => {
              const mirrorCopies = allNodes.filter(n => n.mirrorGroupId === node.mirrorGroupId && n.id !== node.id);
              return mirrorCopies.map(mCopy => {
                const mParent = mCopy.parentId ? allNodes.find(n => n.id === mCopy.parentId) : null;
                const placeLabel = mParent ? mParent.text : 'Свободная';
                return (
                  <button
                    key={mCopy.id}
                    type="button"
                    onClick={() => onSelectNode && onSelectNode(mCopy.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-lg border border-purple-100/30 dark:border-purple-900/30 transition-all cursor-pointer mb-2"
                    title={`Перейти к зеркальной копии в "${placeLabel}"`}
                  >
                    <span className="text-purple-500">🪞</span>
                    <span className="truncate">Перейти к зеркалу: <span className="font-semibold">{placeLabel}</span></span>
                  </button>
                );
              });
            })()}

        {/* Quick Access Info Dashboard & Sub-tabs Switcher */}
        <div className="space-y-3 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-xs mb-4 shrink-0">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Быстрый доступ к параметрам
          </div>
          <div className="grid grid-cols-3 gap-2">
            {/* Main Subtab Button */}
            <button
              type="button"
              onClick={() => setDetailsSubTab('main')}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                detailsSubTab === 'main'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <span className="text-base">📊</span>
              <span className="text-[10px] font-bold mt-1 leading-none">Главное</span>
              <span className={`text-[9px] mt-1 font-medium ${detailsSubTab === 'main' ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                {(() => {
                  const subCount = allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle).length;
                  return subCount > 0 ? `${subCount} подзад.` : 'Нет подзад.';
                })()}
              </span>
            </button>

            {/* Dates Subtab Button */}
            <button
              type="button"
              onClick={() => setDetailsSubTab('dates')}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                detailsSubTab === 'dates'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <span className="text-base">📅</span>
              <span className="text-[10px] font-bold mt-1 leading-none">Сроки</span>
              <span className={`text-[9px] mt-1 font-medium truncate max-w-full ${detailsSubTab === 'dates' ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                {node.dueDate ? (
                  node.dueTime ? `${node.dueDate.slice(5)} ${node.dueTime}` : node.dueDate.slice(5)
                ) : (
                  'Не заданы'
                )}
              </span>
            </button>

            {/* Tags Subtab Button */}
            <button
              type="button"
              onClick={() => setDetailsSubTab('tags')}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                detailsSubTab === 'tags'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <span className="text-base">🏷️</span>
              <span className="text-[10px] font-bold mt-1 leading-none">Теги</span>
              <span className={`text-[9px] mt-1 font-medium truncate max-w-full ${detailsSubTab === 'tags' ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>
                {node.tags && node.tags.length > 0 ? (
                  `${node.tags.length} шт.`
                ) : (
                  'Без тегов'
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Main Sub-tab Container */}
        <div className={detailsSubTab === 'main' ? 'space-y-6' : 'hidden'}>
          {/* GTD Decision Tree Assistant */}
          {!node.isContainer && !node.isWorkflowRectangle && (
            <div className="space-y-3 bg-gradient-to-br from-indigo-50/70 to-purple-50/70 dark:from-indigo-950/20 dark:to-purple-950/20 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/50 shadow-xs">
              <div 
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setIsGTDWizardOpen(!isGTDWizardOpen)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                    GTD Помощник Сортировки
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {isGTDWizardOpen ? 'Скрыть' : 'Открыть'}
                  </span>
                  {isGTDWizardOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {isGTDWizardOpen && (
                <div className="pt-2 border-t border-indigo-100/50 dark:border-indigo-900/40 space-y-3 text-xs text-slate-700 dark:text-slate-300">
                  {/* Flow Header with dynamic current place info */}
                  <div className="bg-white/60 dark:bg-slate-900/40 p-2.5 rounded-lg border border-indigo-50 dark:border-indigo-950/50 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Текущий поток:</span>
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold uppercase">
                        {gtdFlow === 'inbox' && 'Входящие 📥'}
                        {gtdFlow === 'next_actions' && 'Следующие действия ⚡'}
                        {gtdFlow === 'waiting' && 'В ожидании ⏳'}
                        {gtdFlow === 'projects' && 'Проекты 📁'}
                        {gtdFlow === 'calendar' && 'Календарь 📅'}
                        {gtdFlow === 'generic' && 'Общий поток 📋'}
                      </span>
                    </div>
                    {node.containerPlace && (
                      <span className="text-[9px] text-slate-500 font-mono mt-1 block">
                        📍 Расположение: {node.containerPlace}
                      </span>
                    )}
                  </div>

                  {/* STEP 1: Inbox standard flow */}
                  {gtdFlow === 'inbox' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Требует ли эта задача какого-либо физического действия в будущем?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setGtdStep('is_multi_step')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да 👍
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('non_actionable')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет 👎
                            </button>
                          </div>
                        </div>
                      )}

                      {gtdStep === 'non_actionable' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Так как действие не требуется, что нужно сделать с этим элементом?
                          </p>
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('trash')}
                              className="w-full text-left p-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              🗑️ Выбросить в Корзину / Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGtdAction('someday')}
                              className="w-full text-left p-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              ⏳ Отложить в Когда-нибудь / Может быть
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGtdAction('reference')}
                              className="w-full text-left p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              📂 Сохранить как Справочный материал
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-2"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'is_multi_step' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Это многошаговое дело (Проект)?
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Требуется ли для достижения желаемого результата более одного физического действия/шага?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('projects')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да (Проект) 📁
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('under_2_mins')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет (1 действие) ⚡
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-2"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'under_2_mins' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Займет ли выполнение действия меньше 2 минут?
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Правило 2 минут: если дело можно сделать быстро, сделайте это немедленно, чтобы не тратить время на учет задачи.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('do_it')}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да (Сделать сейчас)
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('delegate_or_defer')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет (Займет больше)
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('is_multi_step')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-2"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'delegate_or_defer' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Должны ли вы делать это лично?
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Если задачу можно перепоручить другому человеку — делегируйте её.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('waiting')}
                              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет (Делегировать)
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('defer_options')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да (Сделать самому)
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('under_2_mins')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-2"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'defer_options' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Нужно ли сделать это в строго определенный день или время?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setGtdStep('set_date')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да (В Календарь) 📅
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGtdAction('next_actions')}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет (В Следующие действия) ⚡
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('delegate_or_defer')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'set_date' && (
                        <div className="space-y-2.5 bg-white/40 dark:bg-slate-900/40 p-3 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">
                            Установите дату для Календаря:
                          </label>
                          <input
                            type="date"
                            value={selectedGtdDate}
                            onChange={(e) => setSelectedGtdDate(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => handleGtdAction('calendar', selectedGtdDate)}
                            disabled={!selectedGtdDate}
                            className={`w-full py-1.5 rounded-md font-bold text-xs cursor-pointer transition-colors text-center ${
                              selectedGtdDate ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-850 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            Подтвердить и перенести 📅
                          </button>
                          <button
                            type="button"
                            onClick={() => setGtdStep('defer_options')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 2: Next Actions flow */}
                  {gtdFlow === 'next_actions' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Эта задача в списке Следующих действий. Каков текущий статус?
                          </p>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateNode({
                                  ...node,
                                  completed: true,
                                  progress: 100,
                                  status: 'done'
                                });
                                setGtdMoveResult('Отлично! Задача успешно отмечена как выполненная ✓');
                                setGtdStep('done');
                              }}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              ✓ Выполнено прямо сейчас!
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('delegate_or_defer_next')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              ⏳ Отложить / Делегировать / Сдвинуть
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('non_actionable_next')}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-bold rounded-lg cursor-pointer text-center text-[11px]"
                            >
                              🗑️ Потеряла актуальность (В Корзину / Архив)
                            </button>
                          </div>
                        </div>
                      )}

                      {gtdStep === 'delegate_or_defer_next' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Что сделать с этой задачей?
                          </p>
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('waiting')}
                              className="w-full text-left p-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/10 dark:hover:bg-amber-950/20 text-amber-700 dark:text-amber-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              👥 Делегировать (В список Ожидания)
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('set_date_next')}
                              className="w-full text-left p-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              📅 Перенести на конкретную дату (Календарь)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGtdAction('someday')}
                              className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              ✨ Отправить в Когда-нибудь / Может быть
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'set_date_next' && (
                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">
                            Установите новую дату выполнения:
                          </label>
                          <input
                            type="date"
                            value={selectedGtdDate}
                            onChange={(e) => setSelectedGtdDate(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none text-xs dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => handleGtdAction('calendar', selectedGtdDate)}
                            disabled={!selectedGtdDate}
                            className={`w-full py-1.5 rounded-md font-bold text-xs cursor-pointer text-center ${
                              selectedGtdDate ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-850 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            Перенести в Календарь 📅
                          </button>
                          <button
                            type="button"
                            onClick={() => setGtdStep('delegate_or_defer_next')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'non_actionable_next' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Куда отправить потерявшую актуальность задачу?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('trash')}
                              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              В Корзину 🗑️
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handlePropChange('archived', true);
                                setGtdMoveResult('Задача успешно отправлена в архив!');
                                setGtdStep('done');
                              }}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              В Архив 📦
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 3: Waiting Flow */}
                  {gtdFlow === 'waiting' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Задача находится в списке Ожидания. Ответ получен или исполнитель завершил работу?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setGtdStep('received')}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да, готово! 👍
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('not_received')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              Нет, жду ⏳
                            </button>
                          </div>
                        </div>
                      )}

                      {gtdStep === 'received' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Куда направить задачу для дальнейших шагов?
                          </p>
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGtdAction('next_actions')}
                              className="w-full text-left p-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              ⚡ В список Следующих действий
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateNode({
                                  ...node,
                                  completed: true,
                                  progress: 100,
                                  status: 'done'
                                });
                                setGtdMoveResult('Поздравляем! Задача успешно завершена ✓');
                                setGtdStep('done');
                              }}
                              className="w-full text-left p-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              ✓ Полностью закрыть задачу
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}

                      {gtdStep === 'not_received' && (
                        <div className="space-y-2.5 bg-white/40 dark:bg-slate-900/40 p-3 rounded-lg border border-indigo-150/40 dark:border-indigo-900/30">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Хотите добавить примечание/комментарий о текущем статусе ожидания?
                          </p>
                          <textarea
                            value={gtdWaitingComment}
                            onChange={(e) => setGtdWaitingComment(e.target.value)}
                            placeholder="Например: напомнил Сергею 04.07, обещал сделать к среде..."
                            rows={2}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none text-xs dark:text-slate-100 font-sans"
                          />
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (gtdWaitingComment.trim()) {
                                  const user = auth.currentUser;
                                  const commenterName = user?.displayName || user?.email || 'Пользователь';
                                  const commenterPhoto = user?.photoURL || '';
                                  const commenterUid = user?.uid || 'anonymous';

                                  const newComment = {
                                    id: 'comment-' + generateId(),
                                    userId: commenterUid,
                                    userName: commenterName,
                                    userPhoto: commenterPhoto,
                                    text: gtdWaitingComment,
                                    createdAt: new Date().toISOString()
                                  };
                                  onUpdateNode({
                                    ...node,
                                    comments: [...(node.comments || []), newComment]
                                  });
                                }
                                setGtdMoveResult('Статус зафиксирован! Продолжаем ожидать.');
                                setGtdStep('done');
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center text-xs"
                            >
                              Сохранить статус
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('start')}
                              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center text-xs"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 4: Projects Flow */}
                  {gtdFlow === 'projects' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Этот элемент является Проектом. Сформулировано ли следующее конкретное действие для проекта?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setGtdStep('has_action')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              Да 👍
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (onAddChildNode) {
                                  onAddChildNode(node.id, true);
                                  setGtdMoveResult('Подзадача успешно добавлена в структуру проекта! Вы можете переименовать её в списке подзадач ниже.');
                                  setGtdStep('done');
                                }
                              }}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center"
                            >
                              Создать шаг ➕
                            </button>
                          </div>
                        </div>
                      )}

                      {gtdStep === 'has_action' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Где находится это действие сейчас?
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Все подзадачи проекта должны быть распределены по соответствующим спискам (Следующие действия, Календарь и т.д.) для своевременного выполнения.
                          </p>
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setGtdMoveResult('Отлично! Продолжайте регулярно планировать и проводить обзоры этого проекта.');
                                setGtdStep('done');
                              }}
                              className="w-full text-center p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold cursor-pointer"
                            >
                              Они уже в списках! 👍
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('start')}
                              className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                            >
                              ← Назад
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 5: Calendar Flow */}
                  {gtdFlow === 'calendar' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Задача запланирована в Календаре {node.dueDate ? `на ${node.dueDate}` : ''}. Наступил ли запланированный день?
                          </p>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateNode({
                                  ...node,
                                  completed: true,
                                  progress: 100,
                                  status: 'done'
                                });
                                setGtdMoveResult('Ура! Задача успешно выполнена в намеченный срок ✓');
                                setGtdStep('done');
                              }}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              ✓ Да, я выполнил задачу!
                            </button>
                            <button
                              type="button"
                              onClick={() => setGtdStep('reschedule')}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center"
                            >
                              ⏳ Нет, нужно перенести дату
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGtdAction('next_actions')}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg cursor-pointer text-center text-[11px]"
                            >
                              ⚡ Перенести в Следующие действия (без жесткой даты)
                            </button>
                          </div>
                        </div>
                      )}

                      {gtdStep === 'reschedule' && (
                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">
                            Выберите новую дату:
                          </label>
                          <input
                            type="date"
                            value={selectedGtdDate}
                            onChange={(e) => setSelectedGtdDate(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none text-xs dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateNode({
                                ...node,
                                dueDate: selectedGtdDate
                              });
                              setGtdMoveResult(`Дата успешно обновлена на ${selectedGtdDate}!`);
                              setGtdStep('done');
                            }}
                            disabled={!selectedGtdDate}
                            className={`w-full py-1.5 rounded-md font-bold text-xs cursor-pointer text-center ${
                              selectedGtdDate ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-850 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            Обновить дату 📅
                          </button>
                          <button
                            type="button"
                            onClick={() => setGtdStep('start')}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1"
                          >
                            ← Назад
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 6: Generic / Fallback Flow */}
                  {gtdFlow === 'generic' && (
                    <div className="space-y-3">
                      {gtdStep === 'start' && (
                        <div className="space-y-2.5">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Эта задача находится во внесистемной области. Вы хотите провести её классификацию по методу GTD?
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setGtdFlow('inbox');
                              setGtdStep('start');
                            }}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-center font-bold"
                          >
                            Начать классификацию 🚀
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MANUAL CONTAINER MAPPING FALLBACK (If fuzzy matching fails) */}
                  {gtdStep === 'manual_mapping' && (
                    <div className="space-y-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        Контейнер не найден автоматически 🔍
                      </p>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        В текущем проекте не обнаружен контейнер, соответствующий шагу "{pendingGtdType === 'trash' ? 'Корзина' : pendingGtdType === 'someday' ? 'Когда-нибудь / Может быть' : pendingGtdType === 'reference' ? 'Справочник' : pendingGtdType === 'projects' ? 'Проекты' : pendingGtdType === 'waiting' ? 'В ожидании' : pendingGtdType === 'calendar' ? 'Календарь' : 'Следующие действия'}".
                        Пожалуйста, выберите нужную область вручную:
                      </p>
                      <select
                        value={manualContainerId}
                        onChange={(e) => setManualContainerId(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none text-xs dark:text-slate-100 cursor-pointer"
                      >
                        <option value="">-- Выберите контейнер --</option>
                        {allNodes
                          .filter(n => (n.isContainer || n.isWorkflowRectangle) && n.id !== node.id && n.projectId === node.projectId)
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              📥 {c.text || 'Без названия'}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleManualMappingSubmit}
                        disabled={!manualContainerId}
                        className={`w-full py-1.5 rounded-md font-bold text-xs cursor-pointer text-center ${
                          manualContainerId ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Переместить в выбранный контейнер
                      </button>
                      <button
                        type="button"
                        onClick={() => setGtdStep('start')}
                        className="text-[10px] text-slate-400 hover:underline cursor-pointer block mt-1 text-center w-full"
                      >
                        ← Сбросить / Назад
                      </button>
                    </div>
                  )}

                  {/* DONE STATE */}
                  {gtdStep === 'done' && (
                    <div className="space-y-3 bg-emerald-50 dark:bg-emerald-950/15 p-3.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 text-center">
                      <div className="text-emerald-500 text-xl">🎉</div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-[13px]">
                        Отлично! Сортировка шага завершена
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                        {gtdMoveResult}
                      </p>
                      <button
                        type="button"
                        onClick={detectAndResetGTDFlow}
                        className="mt-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                      >
                        Сортировать ещё раз 🚀
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subtasks Section */}
        <div className="space-y-2 bg-[#FAFBFD]/40 dark:bg-slate-800/20 p-3 rounded-lg border border-slate-150 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">
              Подзадачи ({allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle).length})
            </label>
            {onAddChildNode && (
              <button
                type="button"
                onClick={() => onAddChildNode(node.id, true)}
                className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Добавить
              </button>
            )}
          </div>

          {(() => {
            const subtasks = allNodes.filter(n => n.parentId === node.id && !n.isContainer && !n.isWorkflowRectangle);
            const sortedSubtasks = [...subtasks].sort((a, b) => {
              const orderA = a.subtaskOrder !== undefined ? a.subtaskOrder : 1000000;
              const orderB = b.subtaskOrder !== undefined ? b.subtaskOrder : 1000000;
              if (orderA !== orderB) return orderA - orderB;
              return a.id.localeCompare(b.id);
            });

            const handleMoveSubtask = (subtaskId: string, direction: 'up' | 'down') => {
              const index = sortedSubtasks.findIndex(s => s.id === subtaskId);
              if (index === -1) return;

              const targetIndex = direction === 'up' ? index - 1 : index + 1;
              if (targetIndex < 0 || targetIndex >= sortedSubtasks.length) return;

              const itemA = sortedSubtasks[index];
              const itemB = sortedSubtasks[targetIndex];

              // Assign explicit orders if undefined
              sortedSubtasks.forEach((item, idx) => {
                if (item.subtaskOrder === undefined) {
                  item.subtaskOrder = idx * 10;
                }
              });

              const tempOrder = itemA.subtaskOrder!;
              itemA.subtaskOrder = itemB.subtaskOrder!;
              itemB.subtaskOrder = tempOrder;

              onUpdateNode({ ...itemA });
              onUpdateNode({ ...itemB });
            };

            const handleDragStart = (e: React.DragEvent, index: number) => {
              setDraggedIndex(index);
              e.dataTransfer.effectAllowed = 'move';
            };

            const handleDragOver = (e: React.DragEvent, index: number) => {
              e.preventDefault();
              if (draggedIndex === null || draggedIndex === index) return;

              const now = Date.now();
              if (now - lastSwapTimeRef.current < 200) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const mouseY = e.clientY - rect.top;
              const threshold = rect.height / 2;

              if (draggedIndex < index && mouseY < threshold) return;
              if (draggedIndex > index && mouseY > threshold) return;

              const draggedItem = sortedSubtasks[draggedIndex];
              const targetItem = sortedSubtasks[index];

              // Assign explicit orders if undefined
              sortedSubtasks.forEach((item, idx) => {
                if (item.subtaskOrder === undefined) {
                  item.subtaskOrder = idx * 10;
                }
              });

              const tempOrder = draggedItem.subtaskOrder!;
              draggedItem.subtaskOrder = targetItem.subtaskOrder!;
              targetItem.subtaskOrder = tempOrder;

              lastSwapTimeRef.current = now;
              onUpdateNode({ ...draggedItem });
              onUpdateNode({ ...targetItem });
              setDraggedIndex(index);
            };

            const handleDragEnd = () => {
              setDraggedIndex(null);
            };

            const handleTouchStart = (e: React.TouchEvent, index: number) => {
              setActiveTouchIndex(index);
            };

            const handleTouchMove = (e: React.TouchEvent) => {
              if (activeTouchIndex === null) return;
              
              const now = Date.now();
              if (now - lastSwapTimeRef.current < 200) return;

              const touch = e.touches[0];
              const element = document.elementFromPoint(touch.clientX, touch.clientY);
              if (!element) return;

              const container = element.closest('[data-subtask-index]');
              if (container) {
                const targetIndexStr = container.getAttribute('data-subtask-index');
                if (targetIndexStr !== null) {
                  const targetIndex = parseInt(targetIndexStr, 10);
                  if (targetIndex !== activeTouchIndex && !isNaN(targetIndex)) {
                    const rect = container.getBoundingClientRect();
                    const touchY = touch.clientY - rect.top;
                    const threshold = rect.height / 2;

                    if (activeTouchIndex < targetIndex && touchY < threshold) return;
                    if (activeTouchIndex > targetIndex && touchY > threshold) return;

                    const draggedItem = sortedSubtasks[activeTouchIndex];
                    const targetItem = sortedSubtasks[targetIndex];

                    sortedSubtasks.forEach((item, idx) => {
                      if (item.subtaskOrder === undefined) {
                        item.subtaskOrder = idx * 10;
                      }
                    });

                    const tempOrder = draggedItem.subtaskOrder!;
                    draggedItem.subtaskOrder = targetItem.subtaskOrder!;
                    targetItem.subtaskOrder = tempOrder;

                    lastSwapTimeRef.current = now;
                    onUpdateNode({ ...draggedItem });
                    onUpdateNode({ ...targetItem });
                    setActiveTouchIndex(targetIndex);
                  }
                }
              }
            };

            const handleTouchEnd = () => {
              setActiveTouchIndex(null);
            };

            if (sortedSubtasks.length > 0) {
              return (
                <div className="space-y-1.5 mt-1.5 max-h-48 overflow-y-auto pr-1">
                  {sortedSubtasks.map((child, index) => (
                    <motion.div 
                      key={child.id}
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 45 }}
                      data-subtask-index={index}
                      data-subtask-id={child.id}
                      onDragOver={(e) => handleDragOver(e, index)}
                      className={`flex items-center justify-between gap-1.5 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800/50 group hover:border-slate-200 dark:hover:border-slate-700 transition-colors ${
                        draggedIndex === index || activeTouchIndex === index 
                          ? 'opacity-40 border-indigo-500 bg-indigo-50/10' 
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Drag Handle for manual sorting */}
                        <div
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnd={handleDragEnd}
                          onTouchStart={(e) => handleTouchStart(e, index)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          className="p-1 -ml-1 text-slate-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                          title="Перетащить для сортировки"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>

                        {/* Number indicator */}
                        <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 select-none shrink-0 min-w-[14px]">
                          {index + 1}.
                        </span>

                        {/* Completed Checkbox */}
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNode({
                              ...child,
                              completed: !child.completed
                            });
                          }}
                          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex-shrink-0 transition-colors"
                        >
                          {child.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-455" />
                          ) : pomo.isRunning && pomo.nodeId === child.id ? (
                            <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
                              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 opacity-75"></span>
                              <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                            </span>
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>

                        {/* Editable Name */}
                        <input
                          id={`subtask-input-${child.id}`}
                          type="text"
                          value={child.text}
                          onChange={(e) => {
                            onUpdateNode({
                              ...child,
                              text: e.target.value
                            });
                          }}
                          className={`text-xs font-medium bg-transparent border-0 focus:ring-0 focus:outline-none p-0 w-full text-slate-700 dark:text-slate-200 ${
                            child.completed ? 'line-through text-slate-400 dark:text-slate-505 italic' : ''
                          }`}
                        />

                        {child.estimatedTime !== undefined && child.estimatedTime !== null && !isNaN(child.estimatedTime) ? (
                          <button 
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const val = prompt("Изменить ориентировочное время работы подзадачи (в минутах):", child.estimatedTime?.toString() || "30");
                              if (val !== null) {
                                  if (val === "") {
                                    onUpdateNode({ ...child, estimatedTime: undefined });
                                  } else {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      onUpdateNode({ ...child, estimatedTime: num });
                                    }
                                  }
                                }
                            }}
                            className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-150/40 dark:border-indigo-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                            title={`Ориентировочное время: ${child.estimatedTime} мин (нажмите для изменения)`}
                          >
                            <Timer className="w-2.5 h-2.5 text-indigo-500" />
                            {child.estimatedTime} мин
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const val = prompt("Укажите ориентировочное время работы подзадачи (в минутах):", "30");
                              if (val !== null) {
                                  if (val === "") {
                                    onUpdateNode({ ...child, estimatedTime: undefined });
                                  } else {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      onUpdateNode({ ...child, estimatedTime: num });
                                    }
                                  }
                                }
                            }}
                            className="text-[9px] font-bold text-slate-400 dark:text-slate-505 bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 cursor-pointer hover:text-indigo-600 hover:border-indigo-300 dark:hover:text-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all"
                            title="Нажмите, чтобы указать ориентировочное время работы"
                          >
                            <Timer className="w-2.5 h-2.5 text-slate-400" />
                            0 мин
                          </button>
                        )}

                        {(() => {
                          const childStats = getPomoStatsForNode(child, allNodes);
                          return childStats.pomodoroTotalTime > 0 ? (
                            <span 
                              className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-150/30 dark:border-rose-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 select-none"
                              title={`Проведено на Помидоре: ${formatTotalPomoTime(childStats.pomodoroTotalTime)}`}
                            >
                              🍅 {formatTotalPomoTime(childStats.pomodoroTotalTime)}
                            </span>
                          ) : null;
                        })()}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                        {/* Open Subtask Details Button */}
                        {onSelectNode && (
                          <button
                            type="button"
                            onClick={() => onSelectNode(child.id)}
                            title="Открыть свойства подзадачи"
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Edit Subtask Details Button */}
                        {onSelectNode && (
                          <button
                            type="button"
                            onClick={() => onSelectNode(child.id)}
                            title="Редактировать подзадачу"
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete Subtask Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmDeleteSubtaskId === child.id) {
                              onDeleteNode(child.id);
                              setConfirmDeleteSubtaskId(null);
                            } else {
                              setConfirmDeleteSubtaskId(child.id);
                              setTimeout(() => setConfirmDeleteSubtaskId(curr => curr === child.id ? null : curr), 4000);
                            }
                          }}
                          title={confirmDeleteSubtaskId === child.id ? "Нажмите для подтверждения удаления подзадачи" : "Удалить подзадачу"}
                          className={`p-1 rounded transition-all duration-200 cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold ${
                            confirmDeleteSubtaskId === child.id
                              ? "text-white bg-rose-600 hover:bg-rose-700 px-2 animate-pulse"
                              : "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-955/20"
                          }`}
                        >
                          {confirmDeleteSubtaskId === child.id ? (
                            <span>Удалить подзадачу?</span>
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              );
            } else {
              return (
                <p className="text-xs text-slate-400 dark:text-slate-505 italic mt-1 pl-1">
                  Нет дочерних подзадач.
                </p>
              );
            }
          })()}
        </div>

        {/* State / Done badge */}
        {!node.isWorkflowRectangle && (
          <div className="space-y-2">
            {hasActiveBlockers && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-700 dark:text-rose-400 font-medium space-y-1">
                <span className="font-bold flex items-center gap-1">⚠️ Задача заблокирована!</span>
                Вы не можете завершить её, пока не будут выполнены следующие задачи:
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  {activeBlockers.map(b => (
                    <li key={b.id} className="font-semibold">{b.text || 'Без названия'}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between bg-[#FAFBFD]/60 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/50 dark:border-slate-850">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Статус выполнения:</span>
              <select
                value={node.completed ? 'done' : (node.status === 'waiting' ? 'waiting' : (node.progress && node.progress > 0 ? 'progress' : 'todo'))}
                disabled={hasActiveBlockers && !node.completed}
                onChange={(e) => {
                  const val = e.target.value as 'todo' | 'progress' | 'waiting' | 'done';
                  if (val === 'done') {
                    onUpdateNode({
                      ...node,
                      completed: true,
                      progress: 100,
                      status: 'done'
                    });
                  } else if (val === 'waiting') {
                    onUpdateNode({
                      ...node,
                      completed: false,
                      status: 'waiting'
                    });
                  } else if (val === 'progress') {
                    onUpdateNode({
                      ...node,
                      completed: false,
                      progress: node.progress && node.progress > 0 ? node.progress : 50,
                      status: 'progress'
                    });
                  } else {
                    onUpdateNode({
                      ...node,
                      completed: false,
                      progress: 0,
                      status: 'todo'
                    });
                  }
                }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
              >
                <option value="todo">📋 План</option>
                <option value="progress">▶ В работе</option>
                <option value="waiting">⏳ В ожидании</option>
                <option value="done">✓ Готово</option>
              </select>
            </div>
          </div>
        )}

        {/* Container Properties Section */}
        {!node.isWorkflowRectangle && !node.isContainer && (
          <div className="space-y-2.5 bg-[#FAFBFD]/60 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-150 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Свойства области задач
              </span>
              {node.parentId && allNodes.find(p => p.id === node.parentId && p.isContainer) ? (
                <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold uppercase py-0.5 px-2 rounded-full tracking-wider border border-amber-500/20">
                  Внутри области
                </span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-extrabold uppercase py-0.5 px-2 rounded-full tracking-wider">
                  Вне области
                </span>
              )}
            </div>

            {/* Container Selector dropdown */}
            {onUpdateNodeParent && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                  Переместить в область:
                </span>
                <select
                  value={node.parentId || 'no-container'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'no-container') {
                      onUpdateNodeParent(node.id, null);
                    } else {
                      onUpdateNodeParent(node.id, val);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none dark:text-slate-100 cursor-pointer"
                >
                  <option value="no-container">📦 Вне области</option>
                  {allNodes
                    .filter(n => n.isContainer && n.id !== node.id)
                    .map(container => (
                      <option key={container.id} value={container.id}>
                        📥 {container.text || 'Без имени'}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {node.containerPlace && (
              <div className="pt-1.5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                  Место добавления:
                </span>
                <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800/55 break-words">
                  📦 {node.containerPlace}
                </p>
              </div>
            )}

            {node.mirrorParentText && (
              <div className="pt-1.5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                  Связано с родительской задачей:
                </span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800/55 break-words flex items-center gap-1.5">
                  <span>🔗</span>
                  <span className="truncate max-w-[200px]">{node.mirrorParentText}</span>
                  {node.mirrorParentId && allNodes.some(n => n.id === node.mirrorParentId) && (
                    <button
                      type="button"
                      onClick={() => onSelectNode && onSelectNode(node.mirrorParentId!)}
                      className="ml-auto text-[10px] bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-extrabold px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    >
                      Перейти
                    </button>
                  )}
                </p>
              </div>
            )}

            {(() => {
              const mirrorCopies = node.mirrorGroupId 
                ? allNodes.filter(n => n.mirrorGroupId === node.mirrorGroupId && n.id !== node.id)
                : [];
              if (mirrorCopies.length === 0) return null;
              return (
                <div className="pt-1.5 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">
                    Зеркальные копии (переход):
                  </span>
                  <div className="space-y-1.5">
                    {mirrorCopies.map(mCopy => {
                      const mParent = mCopy.parentId ? allNodes.find(n => n.id === mCopy.parentId) : null;
                      const placeLabel = mParent 
                        ? (mParent.isContainer ? `Область: ${mParent.text}` : `Подзадача в: ${mParent.text}`)
                        : 'Свободная задача';

                      return (
                        <div key={mCopy.id} className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-purple-500/5 dark:bg-purple-950/10 p-2 rounded-lg border border-purple-100/30 dark:border-purple-900/40 break-words flex items-center gap-1.5 font-sans">
                          <span>🪞</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate max-w-[170px] font-bold">{mCopy.text}</span>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">{placeLabel}</span>
                          </div>
                          {onSelectNode && (
                            <button
                              type="button"
                              onClick={() => onSelectNode(mCopy.id)}
                              className="text-[10px] bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-800/40 text-purple-700 dark:text-purple-300 font-extrabold px-2 py-1 rounded transition-colors cursor-pointer shrink-0"
                            >
                              Перейти
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

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
                      let val = parseInt(e.target.value);
                      if (hasActiveBlockers && val === 100) {
                        val = 95; // restrict from reaching 100%
                      }
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

        {/* Pomodoro Timer Section */}
        {node.isContainer ? (
          <div className="space-y-3 bg-emerald-500/10 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-500/15 dark:border-emerald-500/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
                Время работы над проектом
              </span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-extrabold uppercase py-0.5 px-2 rounded-full tracking-wider">
                Проект / Область
              </span>
            </div>

            <div className="text-xs space-y-2 py-3 px-3.5 bg-white/50 dark:bg-slate-900/40 rounded-lg border border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-[11.5px]">
                    Общее время по проекту:
                  </span>
                  <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 text-[12px]">
                    {formatTotalPomoTime(getPomoStatsForNode(node, allNodes).pomodoroTotalTime)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-500 dark:text-slate-500 text-[10.5px]">
                  <span>Всего завершенных сессий:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {getPomoStatsForNode(node, allNodes).pomodoroSessionsCount}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-slate-450 dark:text-slate-500 border-t border-slate-100/80 dark:border-slate-800/60 pt-2 mt-2 leading-normal italic">
                💡 Это холст-контейнер. Время рассчитывается динамически как сумма накопленной фокусировки по всем вложенным в него задачам и подветвям.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 bg-[#FAFBFD]/60 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-rose-500 animate-pulse" />
                Фокусировка Pomodoro
              </span>
              {pomo.isRunning && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450">
                  Фокус
                </span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800/60 shadow-xs relative overflow-hidden">
              <div className="text-center z-10">
                <div className="text-3xl font-extrabold font-mono tracking-tight text-slate-850 dark:text-slate-100 tabular-nums">
                  {formatPomoTime(pomo.timeLeft)}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-555 font-medium mt-0.5">
                  {pomo.isRunning 
                    ? `Фокусировка на задаче 🎯` 
                    : `Таймер настроен на ${customPomoMinutes} мин`}
                </p>
              </div>

              {pomo.isRunning && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
                  <div 
                    className="h-full transition-all duration-1000 bg-rose-500"
                    style={{ width: `${(pomo.timeLeft / pomo.duration) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* SESSIONS STATS / ACCUMULATED SAVED TIME */}
            <div className="text-xs space-y-2 py-2 px-2.5 bg-rose-50/20 dark:bg-rose-950/5 rounded-lg border border-rose-100/30 dark:border-rose-950/20">
              {!isEditingPomoTime ? (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-[11px] flex items-center gap-1">
                      Накоплено времени задачи:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold font-mono text-rose-600 dark:text-rose-400 text-[11px]">
                        {formatTotalPomoTime(node.pomodoroTotalTime || 0)}
                      </span>
                      <button 
                        type="button"
                        onClick={() => {
                          const total = node.pomodoroTotalTime || 0;
                          setEditPomoHours(Math.floor(total / 3600));
                          setEditPomoMinutes(Math.floor((total % 3600) / 60));
                          setEditPomoSeconds(total % 60);
                          setEditPomoSessions(node.pomodoroSessionsCount || 0);
                          setIsEditingPomoTime(true);
                        }}
                        className="p-1 hover:bg-rose-100/50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-450 rounded-md transition-all cursor-pointer"
                        title="Редактировать время вручную"
                      >
                        <Edit className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 dark:text-slate-500 text-[10px]">
                    <span>Всего запусков («помидоров»):</span>
                    <span className="font-semibold">{node.pomodoroSessionsCount || 0}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 py-0.5">
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    Редактирование времени фокусировки
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block text-center font-bold">ЧАСЫ</span>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={editPomoHours === 0 ? '' : editPomoHours}
                        placeholder="0"
                        onChange={(e) => setEditPomoHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block text-center font-bold">МИН</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={editPomoMinutes === 0 ? '' : editPomoMinutes}
                        placeholder="0"
                        onChange={(e) => setEditPomoMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                        className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block text-center font-bold">СЕК</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={editPomoSeconds === 0 ? '' : editPomoSeconds}
                        placeholder="0"
                        onChange={(e) => setEditPomoSeconds(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                        className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded px-1.5 py-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Всего «помидоров»:</span>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      value={editPomoSessions === 0 ? '' : editPomoSessions}
                      placeholder="0"
                      onChange={(e) => setEditPomoSessions(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-12 px-1 py-0.5 text-center text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditingPomoTime(false)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-600 dark:text-slate-350 rounded-md transition-all cursor-pointer flex items-center gap-1"
                    >
                      <X className="w-2.5 h-2.5 text-red-500" /> Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const totalSeconds = (editPomoHours * 3600) + (editPomoMinutes * 60) + editPomoSeconds;
                        onUpdateNode({
                          ...node,
                          pomodoroTotalTime: totalSeconds,
                          pomodoroSessionsCount: editPomoSessions
                        });
                        setIsEditingPomoTime(false);
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-2.5 h-2.5" /> Сохранить
                    </button>
                  </div>
                </div>
              )}
            </div>

            {pomo.isRunning && pomo.nodeId !== node.id && (
              <div className="p-2 border border-dashed border-amber-200 dark:border-amber-905/60 bg-amber-50/40 dark:bg-amber-950/10 rounded-lg text-center">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-normal">
                  Запущен таймер для другой задачи:<br />
                  <span className="font-bold">«{pomo.nodeText}»</span>
                </p>
              </div>
            )}

            {/* CUSTOM TIME PICKER INPUT & PRESETS (ONLY WHEN NOT RUNNING) */}
            {!pomo.isRunning && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-lg p-1.5 w-full">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase pl-1.5 shrink-0">
                    Время:
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={customPomoMinutes === 0 ? '' : customPomoMinutes}
                    placeholder="25"
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === '') {
                        setCustomPomoMinutes(0);
                        return;
                      }
                      const val = parseInt(valStr, 10);
                      if (!isNaN(val)) {
                        handleChangeCustomMinutes(val);
                      }
                    }}
                    onBlur={() => {
                      if (customPomoMinutes < 1 || customPomoMinutes > 180) {
                        handleChangeCustomMinutes(25);
                      }
                    }}
                    className="w-16 px-1.5 py-0.5 text-center text-xs font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    минут
                  </span>
                </div>

                {/* Presets */}
                <div className="flex gap-1 justify-end">
                  {[15, 25, 45, 60].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleChangeCustomMinutes(mins)}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                        customPomoMinutes === mins
                          ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900'
                          : 'bg-white dark:bg-slate-800 border-slate-200/60 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-755'
                      }`}
                    >
                      {mins}м
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2 w-full">
                {!pomo.isRunning ? (
                  <button
                    type="button"
                    onClick={() => handleStartFocus(customPomoMinutes * 60)}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" /> Запустить ({customPomoMinutes} мин)
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleTogglePomoPause}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        pomo.isPaused 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' 
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:hover:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900'
                      }`}
                    >
                      {pomo.isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5" /> Продолжить
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5" /> Пауза
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPomo}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-755 dark:text-slate-350 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                      title="Сбросить таймер"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              {/* EARLY COMPLETION BUTTON */}
              {pomo.isRunning && (
                <button
                  type="button"
                  onClick={handleCompletePomoEarly}
                  className="w-full py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-450 border border-rose-200/50 dark:border-rose-900 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                  title="Остановить таймер и сохранить накопленное время фокусировки"
                >
                  💾 Завершить досрочно и сохранить время ({formatTotalPomoTime(pomo.duration - pomo.timeLeft)})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Toggle to exclude task (not considered a task) */}
        <div className="flex items-center justify-between p-3.5 bg-rose-500/5 dark:bg-rose-500/10 rounded-xl border border-rose-100/30 dark:border-rose-950/20">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Исключить из задач
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed max-w-[190px]">
              Не учитывать как задачу и скрыть из всех видов, отчётов и календарей
            </span>
          </div>
          <button
            type="button"
            onClick={() => handlePropChange('isNotTask', !node.isNotTask)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              node.isNotTask ? 'bg-rose-600' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                node.isNotTask ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Priority buttons */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Приоритет задачи
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
              let label = '';
              let activeColor = '';
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
        </div>

        {/* Dates Sub-tab Container */}
        <div className={detailsSubTab === 'dates' ? 'space-y-6' : 'hidden'}>
          {/* Даты и время (Начало и Конец) */}
        <div className="space-y-4 bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Временные рамки и минуты
          </span>

          {/* Ориентировочное время работы */}
          <div className="space-y-1.5 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                Ориентировочное время работы (мин)
              </span>
              {node.estimatedTime !== undefined && node.estimatedTime !== null && !hasSubtaskWithTime && (
                <button
                  type="button"
                  onClick={() => handlePropChange('estimatedTime', undefined)}
                  className="text-[10px] text-rose-550 dark:text-rose-400 font-bold hover:underline"
                >
                  Сбросить
                </button>
              )}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                placeholder={hasSubtaskWithTime ? "Рассчитывается из подзадач" : "Например: 30"}
                disabled={hasSubtaskWithTime}
                value={node.estimatedTime !== undefined && node.estimatedTime !== null ? node.estimatedTime : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  handlePropChange('estimatedTime', val);
                }}
                className={`w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 ${
                  hasSubtaskWithTime ? 'bg-slate-100/50 dark:bg-slate-900/60 cursor-not-allowed font-semibold text-indigo-600 dark:text-indigo-400' : ''
                }`}
              />
              {hasSubtaskWithTime && (
                <span className="absolute right-2.5 top-1.5 text-[10px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                  Σ подзадач
                </span>
              )}
            </div>
            {suggestedTime !== undefined && suggestedTime !== node.estimatedTime && !hasSubtaskWithTime && (
              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center justify-between pt-0.5">
                <span className="flex items-center gap-1">
                  💡 Рекомендуемое время: <strong>{suggestedTime} мин</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handlePropChange('estimatedTime', suggestedTime)}
                  className="font-bold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:underline cursor-pointer"
                >
                  Применить
                </button>
              </div>
            )}
            {hasSubtaskWithTime && (
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold">
                Рассчитано автоматически как сумма подзадач
              </p>
            )}
          </div>
          
          {/* Дата и время начала */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase flex items-center justify-between">
              <span>Дата и время начала</span>
              {(node.startDate || node.startTime) && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateNode({
                      ...node,
                      startDate: undefined,
                      startTime: undefined
                    });
                  }}
                  className="text-[10px] text-rose-550 dark:text-rose-400 font-bold hover:underline"
                >
                  Сбросить
                </button>
              )}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={node.startDate || ''}
                onChange={(e) => handleTimePropChange('startDate', e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
              />
              <input
                type="time"
                value={node.startTime || ''}
                onChange={(e) => handleTimePropChange('startTime', e.target.value)}
                className="w-24 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          {/* Дата и время окончания */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase flex items-center justify-between">
              <span>Срок выполнения (дедлайн)</span>
              {(node.dueDate || node.dueTime) && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateNode({
                      ...node,
                      dueDate: undefined,
                      dueTime: undefined,
                      reminderMinutesBefore: undefined
                    });
                  }}
                  className="text-[10px] text-rose-550 dark:text-rose-400 font-bold hover:underline"
                >
                  Сбросить
                </button>
              )}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={node.dueDate || ''}
                onChange={(e) => handleTimePropChange('dueDate', e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
              />
              <input
                type="time"
                value={node.dueTime || ''}
                onChange={(e) => handleTimePropChange('dueTime', e.target.value)}
                className="w-24 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-mono"
              />
            </div>
            
            {/* Быстрый выбор напоминания прямо под датой дедлайна */}
            {node.dueDate && (
              <div className="flex items-center gap-2 mt-2 bg-indigo-50/20 dark:bg-slate-900/40 p-2 rounded-xl border border-indigo-100/30 dark:border-slate-800">
                <Bell className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Напомнить:</span>
                <select
                  value={
                    node.reminderDate && node.reminderMinutesBefore !== undefined
                      ? String(node.reminderMinutesBefore)
                      : node.reminderDate
                      ? 'custom'
                      : 'none'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'none') {
                      onUpdateNode({
                        ...node,
                        reminderMinutesBefore: undefined,
                        reminderDate: undefined,
                        reminderTime: undefined,
                        reminderDismissed: undefined
                      });
                    } else if (val === 'custom') {
                      onUpdateNode({
                        ...node,
                        reminderMinutesBefore: undefined,
                        reminderDate: node.reminderDate || node.dueDate,
                        reminderTime: node.reminderTime || node.dueTime || '12:00',
                        reminderDismissed: false
                      });
                    } else {
                      handleSetRelativeReminder(Number(val));
                    }
                  }}
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-200 font-medium text-slate-700"
                >
                  <option value="none">Без напоминания</option>
                  <option value="0">В момент срока (в срок)</option>
                  <option value="5">За 5 минут до срока</option>
                  <option value="10">За 10 минут до срока</option>
                  <option value="15">За 15 минут до срока</option>
                  <option value="30">За 30 минут до срока</option>
                  <option value="60">За 1 час до срока</option>
                  <option value="120">За 2 часа до срока</option>
                  <option value="1440">За 1 день до срока</option>
                  <option value="custom">Своё время...</option>
                </select>
              </div>
            )}
          </div>

          {/* Напоминание для задачи */}
          <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-2.5 mt-2">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                Напоминание
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playNotificationChime()}
                  className="text-[10px] text-indigo-650 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                  title="Воспроизвести тестовый сигнал и разблокировать звук в браузере"
                >
                  Проверить звук 🔊
                </button>
                {(node.reminderDate || node.reminderTime) && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode({
                          ...node,
                          reminderDate: undefined,
                          reminderTime: undefined,
                          reminderMinutesBefore: undefined,
                          reminderDismissed: undefined
                        });
                      }}
                      className="text-[10px] text-rose-550 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                    >
                      Сбросить
                    </button>
                  </>
                )}
              </div>
            </label>

            {/* Quick offset selection buttons - only visible when a deadline is set */}
            {node.dueDate && (
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 dark:text-slate-505 font-medium block">
                  Быстрый выбор:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'В срок', val: 0 },
                    { label: 'За 5 мин', val: 5 },
                    { label: 'За 10 мин', val: 10 },
                    { label: 'За 15 мин', val: 15 },
                    { label: 'За 30 мин', val: 30 },
                    { label: 'За 1 час', val: 60 },
                    { label: 'За 1 день', val: 1440 },
                  ].map((item) => {
                    const isCurrent = node.reminderMinutesBefore === item.val;
                    return (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => handleSetRelativeReminder(item.val)}
                        className={`px-2 py-1 text-[10px] font-medium rounded-lg border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                            : 'bg-white dark:bg-slate-805 border-slate-205 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleSetRelativeReminder(undefined)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-lg border transition-all cursor-pointer ${
                      node.reminderDate && node.reminderMinutesBefore === undefined
                        ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                        : 'bg-white dark:bg-slate-805 border-slate-205 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Своё время
                  </button>
                </div>
              </div>
            )}

            {/* Date and Time selectors for reminder */}
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={node.reminderDate || ''}
                onChange={(e) => {
                  onUpdateNode({
                    ...node,
                    reminderDate: e.target.value || undefined,
                    reminderMinutesBefore: undefined, // switched to custom
                    reminderDismissed: false
                  });
                }}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
              />
              <input
                type="time"
                value={node.reminderTime || ''}
                onChange={(e) => {
                  onUpdateNode({
                    ...node,
                    reminderTime: e.target.value || undefined,
                    reminderMinutesBefore: undefined, // switched to custom
                    reminderDismissed: false
                  });
                }}
                className="w-24 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-mono"
              />
            </div>

            {node.reminderDate && node.reminderTime && (
              <div className="p-2 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/40 dark:border-indigo-900/10 rounded-lg">
                <p className="text-[10px] text-indigo-650 dark:text-indigo-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                  <span>Напоминание сработает в {node.reminderDate} в {node.reminderTime}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ГРУППА: БЛОКИРОВКИ (BLOCKED BY) */}
        <div className="space-y-3 bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
          <span className="text-xs font-bold text-rose-650 dark:text-rose-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
            Блокирующие задачи (Blocked By)
          </span>
          
          <div className="space-y-1.5">
            {(() => {
              const currentBlockers = allNodes.filter(n => node.blockedBy?.includes(n.id));
              if (currentBlockers.length === 0) {
                return (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 italic bg-white dark:bg-slate-900 px-2.5 py-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                    Нет блокирующих задач.
                  </div>
                );
              }
              return currentBlockers.map(blocker => (
                <div 
                  key={blocker.id} 
                  className="flex items-center justify-between bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-2.5 rounded-lg"
                >
                  <div 
                    onClick={() => onSelectNode?.(blocker.id)}
                    className="min-w-0 flex-1 cursor-pointer hover:opacity-80 group/blocker-title"
                    title="Открыть свойства задачи"
                  >
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover/blocker-title:text-indigo-600 dark:group-hover/blocker-title:text-indigo-400 group-hover/blocker-title:underline truncate">
                      {blocker.text || 'Без названия'}
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-505 flex items-center gap-1.5">
                      {blocker.completed ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Выполнена</span>
                      ) : (
                        <span className="text-rose-500 dark:text-rose-400 font-bold">● Активный блокер</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updatedBlockedBy = (node.blockedBy || []).filter(id => id !== blocker.id);
                      handlePropChange('blockedBy', updatedBlockedBy);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded hover:bg-rose-50 dark:hover:bg-slate-850 shrink-0 cursor-pointer"
                    title="Удалить блокировку"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ));
            })()}
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-450 uppercase block">
              Добавить блокирующую задачу:
            </label>
            
            {/* Search box */}
            <div className="relative mb-1.5">
              <input
                type="text"
                placeholder="Поиск задачи..."
                value={blockerSearch}
                onChange={(e) => setBlockerSearch(e.target.value)}
                className="w-full text-[11px] pl-7 pr-7 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 dark:text-slate-200"
              />
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {blockerSearch && (
                <button
                  type="button"
                  onClick={() => setBlockerSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const currentBlockedBy = node.blockedBy || [];
                if (!currentBlockedBy.includes(val)) {
                  handlePropChange('blockedBy', [...currentBlockedBy, val]);
                }
                setBlockerSearch('');
              }}
              className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="">
                {blockerSearch ? `Найдено задач: ${
                  allNodes.filter(n => {
                    if (n.id === node.id) return false;
                    if (n.isContainer || n.isWorkflowRectangle) return false;
                    if (node.blockedBy?.includes(n.id)) return false;
                    return (n.text || '').toLowerCase().includes(blockerSearch.toLowerCase());
                  }).length
                }` : '-- Выберите задачу --'}
              </option>
              {allNodes
                .filter(n => {
                  if (n.id === node.id) return false;
                  if (n.isContainer || n.isWorkflowRectangle) return false;
                  if (node.blockedBy?.includes(n.id)) return false;
                  if (blockerSearch) {
                    return (n.text || '').toLowerCase().includes(blockerSearch.toLowerCase());
                  }
                  return true;
                })
                .map(n => (
                  <option key={n.id} value={n.id}>
                    {n.completed ? '✓ ' : '○ '} {n.text || 'Без названия'}
                  </option>
                ))}
            </select>
          </div>
        </div>
        </div>

        {/* Tags Sub-tab Container */}
        <div className={detailsSubTab === 'tags' ? 'space-y-6' : 'hidden'}>
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
              {node.tags.map((tag, index) => {
                const matchedCategory = activeCategories.find(cat => cat.tags && cat.tags.includes(tag));
                const color = matchedCategory?.color;
                const style = color ? {
                  backgroundColor: `${color}18`,
                  color: color,
                  border: `1px solid ${color}35`
                } : undefined;

                return (
                  <span
                    key={`${tag}-${index}`}
                    style={style}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                      color 
                        ? '' 
                        : 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-transparent'
                    }`}
                  >
                    #{tag}
                    <button 
                      onClick={() => handleRemoveTag(index)}
                      className="p-0.5 hover:text-rose-600 text-slate-405 dark:hover:text-rose-450 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Нет тегов.</p>
          )}

          {/* Quick Select Category Tags */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/85 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                Категории тегов и выбор
              </span>
              {onCreateTagCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCatForm(!showNewCatForm);
                    setNewCatName('');
                    setNewCatColor('#6366f1');
                  }}
                  className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3" /> Создать категорию
                </button>
              )}
            </div>

            {/* Inline New Category Form */}
            {showNewCatForm && onCreateTagCategory && (
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-205 dark:border-slate-800/80 p-3 rounded-lg space-y-2.5">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 block mb-1">Название категории</label>
                  <input
                    type="text"
                    placeholder="Например, Срочность, Спринт..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 block mb-1">Цвет категории</label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { hex: '#6366f1', name: 'Индиго' },
                      { hex: '#3b82f6', name: 'Синий' },
                      { hex: '#10b981', name: 'Изумруд' },
                      { hex: '#f59e0b', name: 'Янтарный' },
                      { hex: '#ec4899', name: 'Розовый' },
                      { hex: '#a855f7', name: 'Фиолетовый' }
                    ].map(col => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setNewCatColor(col.hex)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${newCatColor === col.hex ? 'scale-125 ring-2 ring-indigo-500' : 'hover:scale-110'}`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewCatForm(false)}
                    className="px-2 py-1 text-[10px] bg-slate-100 dark:bg-slate-805 border border-slate-200 dark:border-transparent hover:bg-slate-200 rounded text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (newCatName.trim()) {
                        handleCreateTagCategory(newCatName.trim(), newCatColor);
                        setShowNewCatForm(false);
                      }
                    }}
                    className="px-2.5 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-colors cursor-pointer"
                  >
                    Создать
                  </button>
                </div>
              </div>
            )}

            {/* List of categories */}
            <div className="space-y-3">
              {activeCategories && activeCategories.length > 0 ? (
                activeCategories.map(cat => {
                  const isAddingTag = addingTagToCatId === cat.id;
                  return (
                    <div key={cat.id} className="space-y-1.5 bg-slate-50/40 dark:bg-slate-800/10 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/50">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                        <div 
                          className="flex items-center gap-1.5 min-w-0 cursor-pointer select-none py-0.5 hover:bg-slate-100/40 dark:hover:bg-slate-800/20 rounded px-1 -mx-1 flex-1"
                          onClick={() => {
                            setCollapsedCategoryIds(prev => ({
                              ...prev,
                              [cat.id]: !prev[cat.id]
                            }));
                          }}
                        >
                          {collapsedCategoryIds[cat.id] ? (
                            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-slate-700 dark:text-slate-300 font-bold truncate" title={cat.name}>{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                          {onUpdateTagCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                const newAdding = !isAddingTag;
                                setAddingTagToCatId(newAdding ? cat.id : null);
                                setNewCatTagName('');
                                if (newAdding) {
                                  setCollapsedCategoryIds(prev => ({
                                    ...prev,
                                    [cat.id]: false
                                  }));
                                }
                              }}
                              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Добавить тег в эту категорию"
                            >
                              <Plus className="w-2.5 h-2.5" /> Текст
                            </button>
                          )}
                          {onDeleteTagCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDeleteCatId === cat.id) {
                                  handleDeleteTagCategory(cat.id);
                                  setConfirmDeleteCatId(null);
                                } else {
                                  setConfirmDeleteCatId(cat.id);
                                  setTimeout(() => setConfirmDeleteCatId(curr => curr === cat.id ? null : curr), 4000);
                                }
                              }}
                              className={`text-[10px] cursor-pointer font-semibold rounded px-1.5 py-0.5 transition-all ${
                                confirmDeleteCatId === cat.id 
                                  ? "text-white bg-rose-600 animate-pulse font-bold" 
                                  : "text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                              }`}
                              title={confirmDeleteCatId === cat.id ? "Нажмите для подтверждения удаления" : "Удалить категорию"}
                            >
                              {confirmDeleteCatId === cat.id ? "Удалить?" : "Удалить"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Add Inline Tag form for category */}
                      {isAddingTag && onUpdateTagCategory && (
                        <div className="flex gap-1 items-center py-1">
                          <input
                            type="text"
                            placeholder="Название..."
                            value={newCatTagName}
                            onChange={(e) => setNewCatTagName(e.target.value.replace(/\s+/g, '-'))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = newCatTagName.trim().replace(/#/g, '');
                                if (trimmed) {
                                  const alreadyInCat = cat.tags && cat.tags.includes(trimmed);
                                  if (!alreadyInCat) {
                                    const updatedTags = cat.tags ? [...cat.tags, trimmed] : [trimmed];
                                    handleUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
                                  }
                                }
                                setAddingTagToCatId(null);
                              }
                              if (e.key === 'Escape') {
                                setAddingTagToCatId(null);
                              }
                            }}
                            className="bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] focus:ring-1 focus:ring-indigo-500 focus:outline-none flex-1 font-sans text-slate-850 dark:text-slate-100"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = newCatTagName.trim().replace(/#/g, '');
                              if (trimmed) {
                                const alreadyInCat = cat.tags && cat.tags.includes(trimmed);
                                if (!alreadyInCat) {
                                  const updatedTags = cat.tags ? [...cat.tags, trimmed] : [trimmed];
                                  handleUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
                                }
                              }
                              setAddingTagToCatId(null);
                            }}
                            className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9.5px] rounded font-semibold cursor-pointer shrink-0"
                          >
                            Добавить
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingTagToCatId(null)}
                            className="text-slate-455 hover:text-slate-650 dark:hover:text-slate-250 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Display the tags of the category as small click-to-toggle buttons */}
                      {!collapsedCategoryIds[cat.id] && (
                        cat.tags && cat.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cat.tags.map(t => {
                              const isSelected = node.tags && node.tags.includes(t);
                              return (
                                <div key={t} className="inline-flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded-md shadow-2xs border border-slate-100 dark:border-slate-850">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCategoryTag(t)}
                                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-l-md transition-all cursor-pointer border-r border-slate-100 dark:border-slate-850 select-none inline-flex items-center gap-0.5"
                                    style={{
                                      backgroundColor: isSelected ? `${cat.color}15` : 'transparent',
                                      color: isSelected ? cat.color : '#64748b',
                                    }}
                                  >
                                    {isSelected ? '✓ ' : ''}#{t}
                                  </button>
                                  {onUpdateTagCategory && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedTags = cat.tags.filter(tagItem => tagItem !== t);
                                        handleUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
                                      }}
                                      className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-slate-400 hover:text-rose-500 rounded-r-md cursor-pointer shrink-0 transition-colors"
                                      title={`Исключить #${t} из категории`}
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic">Нет тегов в этой категории.</p>
                        )
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-2 text-[11px] text-slate-400 dark:text-slate-500 italic">
                  Категорий пока не создано. Добавьте первую для быстрой фильтрации!
                </div>
              )}
            </div>
          </div>
        </div>

        </div>

        {/* External Link */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Внешняя ссылка
            </label>
            {node.externalLink && (
              <a
                href={node.externalLink.startsWith('http') ? node.externalLink : `https://${node.externalLink}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                title="Открыть в новой вкладке"
              >
                Открыть ссылку <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
              </a>
            )}
          </div>
          <input
            type="text"
            placeholder="https://example.com"
            value={node.externalLink || ''}
            onChange={(e) => handlePropChange('externalLink', e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
          />
        </div>

        {/* Notes with links insertion & preview tabs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-1.5">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Заметки и описание
              </label>
              
              {/* Tab Toggles */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setNotesMode('edit')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    notesMode === 'edit'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-450 dark:hover:text-slate-300'
                  }`}
                >
                  Редактор
                </button>
                <button
                  type="button"
                  onClick={() => setNotesMode('preview')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    notesMode === 'preview'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-450 dark:hover:text-slate-300'
                  }`}
                >
                  Предпросмотр
                </button>
              </div>
            </div>

            {/* Insertion trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsInsertingLink(!isInsertingLink)}
                className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="Связать эту задачу ссылкой с другой задачей"
              >
                <LinkIcon className="w-3 h-3" /> Связать задачу
              </button>

              {isInsertingLink && (
                <div className="absolute right-0 top-6 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 space-y-2 animate-fade-in text-left">
                  <div className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Выберите задачу для ссылки</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsInsertingLink(false);
                        setLinkSearchQuery('');
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Search input inside dialog */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                    <input
                      type="text"
                      placeholder="Поиск по названию..."
                      value={linkSearchQuery}
                      onChange={(e) => setLinkSearchQuery(e.target.value)}
                      className="w-full text-xs pl-7 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1 text-xs">
                    {(() => {
                      const filtered = allNodes
                        .filter(n => n.id !== node.id)
                        .filter(n => n.text.toLowerCase().includes(linkSearchQuery.toLowerCase()));

                      if (filtered.length === 0) {
                        return <div className="text-slate-400 italic text-center py-2 text-[11px]">Задачи не найдены</div>;
                      }

                      return filtered.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleInsertTaskLink(item.id, item.text)}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 truncate block border border-transparent hover:border-slate-105 dark:hover:border-slate-700 transition-all text-[11px] cursor-pointer"
                        >
                          <span className="font-semibold block truncate text-slate-800 dark:text-slate-200">{item.text}</span>
                          <span className="text-[9px] text-slate-400 font-mono truncate block">{item.id.slice(0, 8)}...</span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {notesMode === 'edit' ? (
            <textarea
              ref={notesTextareaRef}
              value={node.notes}
              onChange={(e) => handlePropChange('notes', e.target.value)}
              onFocus={() => {
                setOriginalText(node.text);
                setOriginalNotes(node.notes || '');
              }}
              onBlur={() => {
                if ((node.notes || '') !== originalNotes) {
                  recordHistoryVersion(originalText, originalNotes, 'Правка заметок');
                }
              }}
              className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-100 font-sans"
              rows={5}
              placeholder="Опишите задачу подробнее. Например, [[Название задачи]] или воспользуйтесь кнопкой «Связать задачу»..."
            />
          ) : (
            renderNotesWithLinks(node.notes)
          )}
        </div>

        {/* Version History Section */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-2 bg-[#FAFBFD]/30 dark:bg-slate-800/20">
          <button
            type="button"
            onClick={() => setIsHistorySectionOpen(!isHistorySectionOpen)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-850/80 transition-all select-none cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">
                История изменений
              </span>
              <span className="text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-mono">
                {(node.history || []).length}
              </span>
            </div>
            {isHistorySectionOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {isHistorySectionOpen && (
            <div className="p-4 space-y-4 bg-white dark:bg-slate-900 animate-fade-in">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-normal">
                  Автосохранение при выходе из полей названия и заметок.
                </span>
                <button
                  type="button"
                  onClick={handleSaveManualCheckpoint}
                  className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded-md transition-all cursor-pointer shadow-2xs shrink-0"
                  title="Сохранить текущую версию как снимок"
                >
                  + Снимок
                </button>
              </div>

              {(node.history || []).length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-555 italic font-medium">
                  История изменений пока пуста
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {(node.history || []).map((ver) => {
                    const isExpanded = expandedVersionId === ver.id;
                    const canRestore = ver.text !== node.text || ver.notes !== node.notes;

                    return (
                      <div
                        key={ver.id}
                        className="p-2.5 border border-slate-105 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg hover:border-slate-200 dark:hover:border-slate-700 transition-all flex flex-col gap-1.5"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="space-y-0.5">
                            <div className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                              {ver.description || 'Правка'}
                            </div>
                            <div className="text-[9px] text-slate-400 font-medium font-mono">
                              {new Date(ver.timestamp).toLocaleString()}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setExpandedVersionId(isExpanded ? null : ver.id)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded transition"
                              title="Посмотреть изменения"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                            
                            <button
                              type="button"
                              disabled={!canRestore}
                              onClick={() => handleRestoreVersion(ver)}
                              className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded select-none cursor-pointer transition ${
                                canRestore 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/30 dark:text-emerald-450 border border-emerald-200/45' 
                                  : 'bg-slate-105 text-slate-405 dark:bg-slate-800 dark:text-slate-600 border border-transparent cursor-not-allowed'
                              }`}
                              title={canRestore ? "Восстановить эту версию" : "Текущая версия совпадает"}
                            >
                              Откат
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteVersion(ver.id)}
                              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/20 text-rose-500 rounded transition"
                              title="Удалить запись"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Differences Preview */}
                        {isExpanded && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-150/40 dark:border-slate-800/40 space-y-2">
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans block">
                                Версия названия:
                              </span>
                              <div className="bg-white dark:bg-slate-800/80 p-1.5 rounded text-[10px] font-medium text-slate-700 dark:text-slate-350 border border-slate-100 dark:border-slate-850 break-words font-mono line-clamp-3">
                                {ver.text}
                              </div>
                            </div>
                            
                            {ver.notes ? (
                              <div className="space-y-0.5">
                                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-sans block">
                                  Версия заметок:
                                </span>
                                <div className="bg-white dark:bg-slate-800/80 p-1.5 rounded text-[10px] font-medium text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-850 break-all font-mono line-clamp-4 whitespace-pre-wrap">
                                  {ver.notes}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[9px] text-slate-400 italic">
                                Заметки пусты
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(node.history || []).length > 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-[9px] font-bold text-rose-600 hover:underline transition-colors cursor-pointer"
                  >
                    Очистить всю историю
                  </button>
                </div>
              )}
            </div>
          )}
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
              disabled={isUploadingFile}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            {isUploadingFile ? (
              <div className="flex flex-col items-center justify-center gap-1">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                  Загрузка в Google Диск...
                </p>
              </div>
            ) : (
              <>
                <Paperclip className="w-5 h-5 mx-auto text-slate-400" />
                <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-1.5">
                  Нажмите для выбора файла или вставьте из буфера обмена (Ctrl+V)
                </p>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  {googleToken 
                    ? "✓ Файл загрузится напрямую в облако на ваш Google Диск!"
                    : "До 1.5 МБ локально. Войдите через Google вверху для хранения файлов на Диске без лимитов!"}
                </p>
              </>
            )}
          </div>

          {fileError && (
            <p className="text-xs text-rose-500 font-medium pl-1">{fileError}</p>
          )}

          {node.files && node.files.length > 0 ? (
            <div className="space-y-1.5 mt-3">
              {node.files.map((file) => {
                const isImg = file.type.startsWith('image/');
                const isCloud = !!file.googleDriveId;
                return (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between p-2 bg-[#FAFBFD]/60 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2 flex-1">
                      {isImg ? (
                        <div 
                          onClick={() => setLightboxImage(file)}
                          className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200/50 dark:border-slate-700 cursor-pointer group shadow-sm hover:scale-105 active:scale-95 transition-all"
                          title="Нажмите для предпросмотра"
                        >
                          {file.googleDriveId ? (
                            <GoogleDriveImage 
                              driveId={file.googleDriveId}
                              googleToken={googleToken}
                              alt={file.name}
                              sz="w150"
                              className="w-full h-full"
                            />
                          ) : (
                            <img 
                              src={file.dataUrl} 
                              alt={file.name} 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-indigo-50/50 dark:bg-slate-800/50 flex items-center justify-center border border-slate-100/80 dark:border-slate-800 shrink-0">
                          <FileText className="w-5 h-5 text-indigo-500" />
                        </div>
                      )}
                      
                      <div className="min-w-0 flex-1">
                        <p 
                          onClick={isImg ? () => setLightboxImage(file) : undefined} 
                          className={`text-slate-700 dark:text-slate-300 font-semibold truncate text-xs ${isImg ? 'hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer' : ''}`}
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-450 dark:text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{formatFileSize(file.size)}</span>
                          {isCloud && (
                            <span className="font-extrabold text-[8px] bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded px-1 py-0.2 select-none uppercase tracking-wide">
                              Google Drive
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-shrink-0">
                      {isCloud && file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-600 rounded-lg border border-slate-200 dark:border-slate-600 shadow-xs"
                          title="Просмотреть на Google Диске"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {file.dataUrl && (
                        <a
                          href={file.webContentLink || file.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          download={!isCloud ? file.name : undefined}
                          className="p-1.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-600 rounded-lg border border-slate-200 dark:border-slate-600 shadow-xs"
                          title={isCloud ? "Скачать с Google Диска" : "Скачать файл"}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="p-1.5 bg-white dark:bg-slate-700 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 dark:border-slate-600 shadow-xs"
                        title={isCloud ? "Удалить вложение (также удалится с вашего Google Диска)" : "Удалить файл"}
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
      </div>
      )}

      {/* Elegant Chat/Discussion tab view */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/25 dark:bg-slate-900/50">
          {/* Messages Scroll Panel */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {(node.comments || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400 dark:text-slate-500 animate-fade-in">
                <FileText className="w-10 h-10 mb-3 opacity-40 text-slate-400" />
                <p className="text-xs font-bold uppercase tracking-wider mb-1">
                  Обсуждение пусто
                </p>
                <p className="text-[11px] leading-relaxed max-w-[240px]">
                  Задайте вопрос, оставьте примечание или прикрепите референс.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(node.comments || []).map((comment) => (
                  <div key={comment.id} className="flex gap-3 items-start group animate-fade-in">
                    {comment.userPhoto ? (
                      <img
                        src={comment.userPhoto}
                        alt={comment.userName}
                        className="w-8 h-8 rounded-full border border-slate-200/60 dark:border-slate-800 bg-slate-100 shrink-0 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0 select-none border border-indigo-100/30">
                        {comment.userName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 bg-white dark:bg-slate-850 border border-slate-150/65 dark:border-slate-800/80 rounded-2xl p-3 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate">
                          {comment.userName}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-550 font-mono shrink-0">
                          {new Date(comment.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 break-words whitespace-pre-wrap leading-relaxed selection:bg-indigo-100 dark:selection:bg-indigo-950">
                        {comment.text}
                      </p>

                      {comment.imageUrl && (
                        <div className="mt-2.5">
                          <div
                            onClick={() => setLightboxImage({
                              id: comment.id,
                              name: 'Изображение из обсуждения',
                              type: 'image/jpeg',
                              size: 0,
                              dataUrl: comment.imageUrl || '',
                              googleDriveId: comment.imageGoogleDriveId,
                              webViewLink: comment.imageWebViewLink,
                            })}
                            className="relative w-32 h-32 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200/60 dark:border-slate-755 cursor-pointer group/img shadow-2xs hover:scale-[1.02] hover:border-indigo-400/85 transition-all"
                            title="Нажмите для увеличения"
                          >
                            {comment.imageGoogleDriveId ? (
                              <GoogleDriveImage 
                                driveId={comment.imageGoogleDriveId}
                                googleToken={googleToken}
                                alt="Comment upload"
                                sz="w300"
                                className="w-full h-full"
                              />
                            ) : (
                              <img
                                src={comment.imageUrl}
                                alt="Comment upload"
                                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/15 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye className="w-4 h-4 text-white drop-shadow-sm" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions: delete comment */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                        title="Удалить комментарий"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Composer / Form Area */}
          <div className="p-3 border-t border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900/80 space-y-2">
            
            {/* Image Preview inside composer if uploaded */}
            {commentImagePreview && (
              <div className="relative inline-block border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-850 shrink-0">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={commentImagePreview}
                    alt="Upload thumbnail"
                    className="w-full h-full object-cover"
                  />
                  {isUploadingCommentImage && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCommentImagePreview(null);
                    setUploadedCommentImageInfo(null);
                  }}
                  className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full shadow-md hover:scale-105 transition duration-200"
                  title="Удалить картинку"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Add image trigger */}
              <button
                type="button"
                onClick={() => commentImageInputRef.current?.click()}
                disabled={isUploadingCommentImage}
                className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-xl border border-slate-200/50 dark:border-slate-705/50 shadow-sm transition disabled:opacity-50 shrink-0 cursor-pointer h-10 w-10 flex items-center justify-center"
                title="Прикрепить изображение"
              >
                {isUploadingCommentImage ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                ) : (
                  <Image className="w-4 h-4" />
                )}
              </button>

              <input
                type="file"
                ref={commentImageInputRef}
                onChange={handleCommentImageSelected}
                accept="image/*"
                className="hidden"
              />

              {/* Text Input Row */}
              <div className="flex-1 min-w-0 relative">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendComment();
                    }
                  }}
                  onPaste={handleCommentAreaPaste}
                  placeholder="Напишите комментарий... (Enter, Ctrl+V для вставки изображения)"
                  className="w-full bg-slate-50 dark:bg-slate-850/60 border border-slate-200/85 dark:border-slate-700 text-xs rounded-xl py-2 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-indigo-505/50 focus:border-indigo-500 dark:text-slate-200 resize-none max-h-20 min-h-[38px]"
                  style={{ height: '38px' }}
                />
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSendComment}
                disabled={isUploadingCommentImage || (!commentText.trim() && !uploadedCommentImageInfo?.imageUrl)}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 dark:disabled:text-slate-650 rounded-xl shadow-xs hover:shadow-md transition active:scale-95 disabled:active:scale-100 shrink-0 h-10 w-10 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
                title="Отправить"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            {googleToken ? (
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 pl-1 font-sans">
                ✓ Картинки сохраняются на вашем Google Диске!
              </p>
            ) : (
              <p className="text-[9px] text-amber-600 dark:text-amber-500 pl-1 font-sans">
                До 1 МБ локально. Войдите через Google, чтобы хранить картинки в облаке на Google Диске!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dangerous/Root operations */}
      {activeTab === 'details' ? (
        <div className="p-4 border-t border-slate-250/60 dark:border-slate-800 bg-[#FAFBFD]/60 flex items-stretch gap-2">
          {/* Archive / Restore Button */}
          <button
            onClick={() => {
              onUpdateNode({
                ...node,
                archived: !node.archived
              });
              onClose();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-1 border text-xs font-semibold rounded-lg transition-all duration-300 cursor-pointer ${
              node.archived
                ? "border-amber-200 dark:border-amber-950/40 text-amber-700 dark:text-amber-400 bg-amber-50/30 hover:bg-amber-100/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                : "border-indigo-200 dark:border-indigo-950/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 hover:bg-indigo-100/50 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/20"
            }`}
          >
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{node.archived ? "Восстановить" : "В архив"}</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={() => {
              if (confirmDelete) {
                onDeleteNode(node.id);
                onClose();
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 4000);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-1 border text-xs font-semibold rounded-lg transition-all duration-300 cursor-pointer ${
              confirmDelete
                ? "bg-rose-600 border-rose-600 text-white font-bold animate-pulse scale-[1.02]"
                : "border-rose-250 dark:border-rose-950 text-rose-600 bg-rose-50/50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" /> 
            <span className="truncate">
              {confirmDelete 
                ? 'Уверены?' 
                : (node.isWorkflowRectangle ? 'Удалить workflow-шаг' : node.isContainer ? 'Удалить вложенное' : isCentralRootNode ? 'Удалить главную задачу' : 'Удалить текущую')}
            </span>
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-slate-250/60 dark:border-slate-800 bg-[#FAFBFD]/20 text-center text-slate-400 dark:text-slate-500 text-[10px] font-mono select-none">
          Это корневой узел интеллект-карты. Его нельзя удалить.
        </div>
      )}
    </aside>

    {/* Elegant Attachment Image Lightbox Modal */}
    {lightboxImage && (
      <div className="fixed inset-0 bg-slate-950/90 z-[100] flex flex-col items-center justify-center select-none" onClick={() => setLightboxImage(null)}>
        {/* Lightbox Header */}
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/85 to-transparent px-6 flex items-center justify-between text-white z-10" onClick={e => e.stopPropagation()}>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate max-w-[200px] sm:max-w-md">{lightboxImage.name}</p>
            <p className="text-[10px] text-slate-300 font-mono mt-0.5">
              {formatFileSize(lightboxImage.size)} • {lightboxImage.type}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {/* Zoom Out Button */}
            <button
              type="button"
              onClick={() => setLightboxScale(prev => Math.max(0.5, prev - 0.25))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 hover:text-indigo-400 transition cursor-pointer font-bold text-xs shrink-0 w-8 h-8 flex items-center justify-center"
              title="Уменьшить"
            >
              -
            </button>

            {/* Zoom In Button */}
            <button
              type="button"
              onClick={() => setLightboxScale(prev => Math.min(3, prev + 0.25))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 hover:text-indigo-400 transition cursor-pointer font-bold text-xs shrink-0 w-8 h-8 flex items-center justify-center"
              title="Увеличить"
            >
              +
            </button>

            {/* Rotate Button */}
            <button
              type="button"
              onClick={() => setLightboxRotation(prev => (prev + 90) % 360)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 hover:text-indigo-400 transition cursor-pointer shrink-0 w-8 h-8 flex items-center justify-center"
              title="Повернуть"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Download Button */}
            <a
              href={lightboxImage.webContentLink || lightboxImage.dataUrl}
              target="_blank"
              rel="noreferrer"
              download={!lightboxImage.googleDriveId ? lightboxImage.name : undefined}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 hover:text-indigo-400 transition shrink-0 w-8 h-8 flex items-center justify-center"
              title="Скачать"
            >
              <Download className="w-4 h-4" />
            </a>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="p-2 rounded-lg bg-white/10 hover:bg-rose-600 hover:text-white transition cursor-pointer shrink-0 w-8 h-8 flex items-center justify-center ml-1"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lightbox Body / Image Preview */}
        <div className="flex-1 w-full h-full flex items-center justify-center p-4">
          <div 
            className="transition-transform duration-200 select-none max-w-[90%] max-h-[80vh]"
            style={{
              transform: `scale(${lightboxScale}) rotate(${lightboxRotation}deg)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImage.googleDriveId ? (
              <GoogleDriveImage 
                driveId={lightboxImage.googleDriveId}
                googleToken={googleToken}
                alt={lightboxImage.name}
                sz="w1000"
                className="max-w-full max-h-[80vh]"
                imgClassName="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing"
                fallbackUrl={lightboxImage.dataUrl}
              />
            ) : (
              <img 
                src={lightboxImage.dataUrl} 
                alt={lightboxImage.name} 
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
