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
  ChevronRight,
  ChevronDown,
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
  History
} from 'lucide-react';
import { TaskNode, Priority, AttachmentFile, TagCategory } from '../types';
import { formatFileSize, generateId, calculateProgress, getDescendants, playNotificationChime, getPomoStatsForNode } from '../utils';

interface TaskDetailsPanelProps {
  node: TaskNode | null;
  allNodes: TaskNode[];
  onClose: () => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  onDeleteNode: (id: string) => void;
  onAddChildNode?: (parentId: string) => void;
  onSelectNode?: (id: string | null) => void;
  categories?: TagCategory[];
  onCreateTagCategory?: (name: string, color: string) => void;
  onUpdateTagCategory?: (id: string, name: string, color: string, tags: string[]) => void;
  onDeleteTagCategory?: (id: string) => void;
  googleToken?: string | null;
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
  googleToken = null
}: TaskDetailsPanelProps) {
  const [tagInput, setTagInput] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [copied, setCopied] = useState(false);

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
  };

  const handleChangeCustomMinutes = (mins: number) => {
    const val = Math.max(1, Math.min(180, mins));
    setCustomPomoMinutes(val);
    localStorage.setItem('task_mindmap_pomo_custom_minutes', String(val));
    if (!pomo.isRunning) {
      setPomo(prev => ({
        ...prev,
        duration: val * 60,
        timeLeft: val * 60
      }));
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
        if (remaining <= 0) {
          clearInterval(interval);
          playNotificationChime();
          
          if (!pomo.isBreak) {
            // Completed work session! Record full focus duration
            if (pomo.nodeId) {
              const targetNode = allNodesRef.current.find(n => n.id === pomo.nodeId);
              if (targetNode) {
                onUpdateNodeRef.current({
                  ...targetNode,
                  pomodoroTotalTime: (targetNode.pomodoroTotalTime || 0) + pomo.duration,
                  pomodoroSessionsCount: (targetNode.pomodoroSessionsCount || 0) + 1
                });
              }
            }

            // Go to 5 min break
            const breakDur = 300;
            const nextState: PomodoroState = {
              nodeId: pomo.nodeId,
              nodeText: pomo.nodeText,
              isRunning: true,
              isPaused: false,
              isBreak: true,
              duration: breakDur,
              endTime: Date.now() + breakDur * 1000,
              timeLeft: breakDur
            };
            savePomoState(nextState);
          } else {
            // Completed break. Go to IDLE work
            const nextState: PomodoroState = {
              nodeId: pomo.nodeId,
              nodeText: pomo.nodeText,
              isRunning: false,
              isPaused: false,
              isBreak: false,
              duration: customPomoMinutes * 60,
              endTime: null,
              timeLeft: customPomoMinutes * 60
            };
            savePomoState(nextState);
          }
        } else {
          setPomo(prev => {
            const next = { ...prev, timeLeft: remaining };
            localStorage.setItem('task_mindmap_pomodoro', JSON.stringify(next));
            return next;
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pomo.isRunning, pomo.isPaused, pomo.endTime, pomo.isBreak, pomo.nodeId, pomo.nodeText, customPomoMinutes]);

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
          onUpdateNode({
            ...targetNode,
            pomodoroTotalTime: (targetNode.pomodoroTotalTime || 0) + elapsed,
            pomodoroSessionsCount: (targetNode.pomodoroSessionsCount || 0) + 1
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
    if (!totalSeconds) return '0 сек';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} ч`);
    if (mins > 0) parts.push(`${mins} мин`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} сек`);
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


  const handleUpdateCategories = (newCategories: TagCategory[]) => {
    // Logic as discussed
  };

  const handleCreateTagCategory = (name: string, color: string) => {
    if (onCreateTagCategory) onCreateTagCategory(name, color);
  };

  const handleUpdateTagCategory = (id: string, name: string, color: string, tags: string[]) => {
    if (onUpdateTagCategory) onUpdateTagCategory(id, name, color, tags);
  };

  const handleDeleteTagCategory = (id: string) => {
    if (onDeleteTagCategory) onDeleteTagCategory(id);
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

  // Generic modification helper
  const handlePropChange = <K extends keyof TaskNode>(key: K, value: TaskNode[K]) => {
    onUpdateNode({
      ...node,
      [key]: value
    });
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
      history: [newVersion, ...currentHistory].slice(0, 30)
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
      history: [newVersion, ...currentHistory].slice(0, 30)
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
      history: [backupVersion, ...currentHistory.filter(h => h.id !== version.id)].slice(0, 30)
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
    
    if ((key === 'dueDate' || key === 'dueTime') && updatedNode.reminderMinutesBefore !== undefined) {
      const mBefore = updatedNode.reminderMinutesBefore;
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
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;
    
    setFileError(null);
    const file = filesList[0];

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
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
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
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: file
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Не удалось загрузить тело файла: ${errText}`);
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
          name: file.name,
          type: file.type,
          size: file.size,
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
      if (file.size > MAX_BYTES) {
        setFileError('Размер файла превышает 1.5 МБ. Пожалуйста, авторизуйте Google Sheets в шапке, чтобы разблокировать неограниченные вложения на Google Диск!');
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

  return (
    <aside className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-50 transform translate-x-0 transition-transform duration-300 ease-out">
      {/* Header */}
      <div className="h-16 px-6 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" /> Свойства задачи
        </h3>
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
            onClick={onClose}
            className="p-1 px-[5px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            title="Закрыть панель"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        
        {/* Name / Heading */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Текст задачи (ветвь)
            </label>
            <button
              type="button"
              onClick={handleCopyLink}
              className={`text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:underline transition-colors ${
                copied ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400 font-semibold'
              }`}
              title="Получить прямую ссылку"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" /> Ссылка скопирована!
                </>
              ) : (
                <>
                  <LinkIcon className="w-3 h-3" /> Копировать ссылку на задачу
                </>
              )}
            </button>
          </div>
          <textarea
            value={node.text}
            onChange={(e) => handlePropChange('text', e.target.value)}
            onFocus={() => {
              setOriginalText(node.text);
              setOriginalNotes(node.notes || '');
            }}
            onBlur={() => {
              if (node.text !== originalText) {
                recordHistoryVersion(originalText, originalNotes, 'Правка названия');
              }
            }}
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

        {/* Pomodoro Timer Section */}
        {node.isContainer ? (
          <div className="space-y-3 bg-emerald-500/10 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-500/15 dark:border-emerald-500/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
                Время работы над проектом
              </span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-extrabold uppercase py-0.5 px-2 rounded-full tracking-wider">
                Проект / Контейнер
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
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  pomo.isBreak 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450'
                }`}>
                  {pomo.isBreak ? 'Фокус окончен / Перерыв' : 'Фокус'}
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
                    ? (pomo.isBreak ? 'Фокус окончен! Время расслабиться ☕' : `Фокусировка на задаче 🎯`) 
                    : `Таймер настроен на ${customPomoMinutes} мин`}
                </p>
              </div>

              {pomo.isRunning && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
                  <div 
                    className={`h-full transition-all duration-1000 ${pomo.isBreak ? 'bg-emerald-500' : 'bg-rose-500'}`}
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
                        value={editPomoHours}
                        onChange={(e) => setEditPomoHours(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block text-center font-bold">МИН</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={editPomoMinutes}
                        onChange={(e) => setEditPomoMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="w-full px-1 py-0.5 text-center text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block text-center font-bold">СЕК</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={editPomoSeconds}
                        onChange={(e) => setEditPomoSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
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
                      value={editPomoSessions}
                      onChange={(e) => setEditPomoSessions(Math.max(0, parseInt(e.target.value) || 0))}
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
                    value={customPomoMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 25;
                      handleChangeCustomMinutes(val);
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

                {!pomo.isRunning && (
                  <button
                    type="button"
                    onClick={() => handleStartFocus(300)}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-[10px] font-bold rounded-xl border border-slate-200/50 dark:border-slate-800 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                    title="Запустить короткий перерыв на 5 минут"
                  >
                    <Coffee className="w-3.5 h-3.5 text-emerald-500" /> 5 мин
                  </button>
                )}
              </div>

              {/* EARLY COMPLETION BUTTON */}
              {pomo.isRunning && !pomo.isBreak && (
                <button
                  type="button"
                  onClick={handleCompletePomoEarly}
                  className="w-full py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
                  title="Остановить таймер и сохранить накопленное время фокусировки"
                >
                  💾 Завершить досрочно и сохранить время ({formatTotalPomoTime(pomo.duration - pomo.timeLeft)})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Subtasks Section */}
        <div className="space-y-2 bg-[#FAFBFD]/40 dark:bg-slate-800/20 p-3 rounded-lg border border-slate-150 dark:border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Подзадачи ({allNodes.filter(n => n.parentId === node.id).length})
            </label>
            {onAddChildNode && (
              <button
                type="button"
                onClick={() => onAddChildNode(node.id)}
                className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Добавить
              </button>
            )}
          </div>

          {(() => {
            const subtasks = allNodes.filter(n => n.parentId === node.id);
            if (subtasks.length > 0) {
              return (
                <div className="space-y-1.5 mt-1.5 max-h-48 overflow-y-auto pr-1">
                  {subtasks.map((child) => (
                    <div 
                      key={child.id}
                      className="flex items-center justify-between gap-1.5 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800/50 group hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
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
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-450" />
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
                          type="text"
                          value={child.text}
                          onChange={(e) => {
                            onUpdateNode({
                              ...child,
                              text: e.target.value
                            });
                          }}
                          className={`text-xs font-medium bg-transparent border-0 focus:ring-0 focus:outline-none p-0 w-full text-slate-700 dark:text-slate-200 ${
                            child.completed ? 'line-through text-slate-400 dark:text-slate-500 italic' : ''
                          }`}
                        />
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
                    </div>
                  ))}
                </div>
              );
            } else {
              return (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1 pl-1">
                  Нет дочерних подзадач.
                </p>
              );
            }
          })()}
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

        {/* Даты и время (Начало и Конец) */}
        <div className="space-y-4 bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-150 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Временные рамки и часы
          </span>
          
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
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium block">
                  Быстрый выбор:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'В срок', val: 0 },
                    { label: 'За 5 мин', val: 5 },
                    { label: 'За 15 мин', val: 15 },
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
                            : 'bg-white dark:bg-slate-800 border-slate-205 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300'
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
                        : 'bg-white dark:bg-slate-800 border-slate-205 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300'
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
                const matchedCategory = categories.find(cat => cat.tags && cat.tags.includes(tag));
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
                        onCreateTagCategory(newCatName.trim(), newCatColor);
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
              {categories && categories.length > 0 ? (
                categories.map(cat => {
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
                                  onDeleteTagCategory(cat.id);
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
                                    onUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
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
                                  onUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
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
                                        onUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
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

        {/* Notes (textarea) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Заметки и описание задачи
          </label>
          <textarea
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
            placeholder="Опишите задачу поподробнее (поддерживается текстовая спецификация)..."
          />
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
                  Нажмите для выбора файла
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
                        <p className="text-[10px] text-slate-450 flex items-center gap-1">
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

      {/* Dangerous/Root operations */}
      {!isCentralRootNode ? (
        <div className="p-4 border-t border-slate-250/60 dark:border-slate-800 bg-[#FAFBFD]/60 space-y-2">
          {/* Archive / Restore Button */}
          <button
            onClick={() => {
              onUpdateNode({
                ...node,
                archived: !node.archived
              });
              onClose();
            }}
            className={`w-full flex items-center justify-center gap-2 py-2 border text-xs font-semibold rounded-lg transition-all duration-300 cursor-pointer ${
              node.archived
                ? "border-amber-200 dark:border-amber-950/40 text-amber-700 dark:text-amber-400 bg-amber-50/30 hover:bg-amber-100/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                : "border-indigo-200 dark:border-indigo-950/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 hover:bg-indigo-100/50 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/20"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {node.archived ? "Восстановить из архива" : "Архивировать задачу и подзадачи"}
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
            className={`w-full flex items-center justify-center gap-2 py-2 border text-xs font-semibold rounded-lg transition-all duration-300 cursor-pointer ${
              confirmDelete
                ? "bg-rose-600 border-rose-600 text-white font-bold animate-pulse scale-[1.02]"
                : "border-rose-250 dark:border-rose-950 text-rose-600 bg-rose-50/50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" /> 
            {confirmDelete 
              ? (node.isContainer ? 'Вы уверены? Нажмите ещё раз!' : 'Вы уверены? Нажмите ещё раз!') 
              : (node.isContainer ? 'Удалить контейнер и задачи внутри' : 'Удалить текущую задачу/ветвь')}
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-slate-250/60 dark:border-slate-800 bg-[#FAFBFD]/20 text-center text-slate-400 dark:text-slate-500 text-[10px] font-mono select-none">
          Это корневой узел интеллект-карты. Его нельзя удалить.
        </div>
      )}
    </aside>
  );
}
