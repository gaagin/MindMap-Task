import React, { useState } from 'react';
import { 
  Folder as FolderIcon, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  ChevronLeft,
  Trash2, 
  Edit, 
  Plus, 
  FileText, 
  Download, 
  Upload, 
  RotateCcw,
  X,
  FolderOpen,
  AlertCircle,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  RefreshCw,
  User
} from 'lucide-react';
import { Folder, Project, TagCategory, WorkspaceState } from '../types';

interface SidebarProps {
  folders: Folder[];
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onCreateProject: (name: string, folderId: string | null) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onExportData: () => void;
  onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetDemo: () => void;
  isOpen: boolean;
  onClose: () => void;
  tagCategories: TagCategory[];
  onCreateTagCategory: (name: string, color: string) => void;
  onUpdateTagCategory: (id: string, name: string, color: string, tags: string[]) => void;
  onDeleteTagCategory: (id: string) => void;
  currentWorkspaceState: WorkspaceState;
  onApplySyncedState: (state: WorkspaceState) => void;
  version?: string;
  // Firebase Auth additions to prevent "Local vs Cloud" confusion
  currentUser?: any;
  syncStatus?: {
    local: 'saved' | 'saving' | 'error';
    firebase: 'idle' | 'saved' | 'syncing' | 'error';
  };
  onGoogleSignIn?: () => Promise<void>;
  onLogout?: () => Promise<void>;
  onForceSync?: () => Promise<void>;
  unsyncedCount?: number;
}

export default function Sidebar({
  folders,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onExportData,
  onImportData,
  onResetDemo,
  isOpen,
  onClose,
  tagCategories = [],
  onCreateTagCategory,
  onUpdateTagCategory,
  onDeleteTagCategory,
  currentWorkspaceState,
  onApplySyncedState,
  version = "2.5.0",
  currentUser,
  syncStatus,
  onGoogleSignIn,
  onLogout,
  onForceSync,
  unsyncedCount = 0
}: SidebarProps) {
  // Folder tree expansion state, loaded and persisted in localStorage
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('task_mindmap_expanded_folders');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse expanded folders:', e);
    }
    return {
      'f-work': true,
      'f-personal': true
    };
  });

  React.useEffect(() => {
    localStorage.setItem('task_mindmap_expanded_folders', JSON.stringify(expandedFolders));
  }, [expandedFolders]);
  
  // Creation / editing inputs
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState<string | null>(null); // 'root' or folderId
  
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProjectInput, setShowNewProjectInput] = useState<string | null>(null); // folderId or 'root'
  
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Tag Category states
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState('#6366f1');
  const [addingTagToCategoryId, setAddingTagToCategoryId] = useState<string | null>(null);
  const [newCategoryTagName, setNewCategoryTagName] = useState('');
  
  // Tag categories collapse state, loaded and persisted in localStorage
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

  // Safety confirmation states for deleting items (crucial for iframe mode where window.confirm is blocked)
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleCreateFolder = (parentId: string | null) => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), parentId);
    setNewFolderName('');
    setShowNewFolderInput(null);
  };

  const handleCreateProject = (folderId: string | null) => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim(), folderId);
    setNewProjectName('');
    setShowNewProjectInput(null);
  };

  const handleRenameFolderSubmit = (id: string) => {
    if (!editingFolderName.trim()) return;
    onRenameFolder(id, editingFolderName.trim());
    setEditingFolderId(null);
  };

  const handleRenameProjectSubmit = (id: string) => {
    if (!editingProjectName.trim()) return;
    onRenameProject(id, editingProjectName.trim());
    setEditingProjectId(null);
  };

  // Organize project tree by folder hierarchy
  const getSubfolders = (parentId: string | null) => {
    return folders.filter(f => f.parentId === parentId);
  };

  const getProjectsInFolder = (folderId: string | null) => {
    return projects.filter(p => p.folderId === folderId);
  };

  // Recursive renderer for Folders
  const renderFolderNode = (folder: Folder, depth = 0) => {
    const isExpanded = !!expandedFolders[folder.id];
    const subfolders = getSubfolders(folder.id);
    const folderProjects = getProjectsInFolder(folder.id);
    const hasChildren = subfolders.length > 0 || folderProjects.length > 0;

    return (
      <div key={folder.id} className="select-none mb-1">
        <div 
          className="group flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
          style={{ paddingLeft: `${Math.max(depth * 12 + 8, 8)}px` }}
        >
          <div className="flex items-center min-w-0 cursor-pointer flex-1" onClick={() => toggleFolder(folder.id)}>
            <span className="mr-1 text-slate-400">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
            <span className="mr-2 text-indigo-500">
              {isExpanded ? <FolderOpen className="w-4 h-4" /> : <FolderIcon className="w-4 h-4" />}
            </span>

            {editingFolderId === folder.id ? (
              <input
                type="text"
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFolderSubmit(folder.id);
                  if (e.key === 'Escape') setEditingFolderId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                autoFocus
              />
            ) : (
              <span className="text-sm font-medium truncate">{folder.name}</span>
            )}
          </div>

          {/* Folder actions hover */}
          <div className="relative z-50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center gap-1 ml-2 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNewProjectInput(folder.id);
                setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
              }}
              title="Создать карту в папке"
              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNewFolderInput(folder.id);
                setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
              }}
              title="Создать подпапку"
              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingFolderId(folder.id);
                setEditingFolderName(folder.name);
              }}
              title="Переименовать"
              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDeleteFolderId === folder.id) {
                  onDeleteFolder(folder.id);
                  setConfirmDeleteFolderId(null);
                } else {
                  setConfirmDeleteFolderId(folder.id);
                  setTimeout(() => setConfirmDeleteFolderId(curr => curr === folder.id ? null : curr), 4000);
                }
              }}
              title={confirmDeleteFolderId === folder.id ? "Подтвердите удаление (нажмите еще раз)" : "Удалить папку"}
              className={`p-1 rounded transition-all duration-200 ${
                confirmDeleteFolderId === folder.id
                  ? "text-white bg-rose-600 hover:bg-rose-700 font-bold px-2 animate-pulse"
                  : "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              }`}
            >
              {confirmDeleteFolderId === folder.id ? (
                <span className="text-[10px] flex items-center gap-1 font-sans">
                  <AlertCircle className="w-3.5 h-3.5 text-white" /> Удалить?
                </span>
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Inputs local to this folder */}
        {showNewProjectInput === folder.id && (
          <div className="flex gap-1 items-center mt-1 mb-2 px-2" style={{ paddingLeft: `${depth * 12 + 28}px` }}>
            <input
              type="text"
              placeholder="Новая карта задач..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject(folder.id);
                if (e.key === 'Escape') setShowNewProjectInput(null);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
            <button onClick={() => handleCreateProject(folder.id)} className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">ОК</button>
            <button onClick={() => setShowNewProjectInput(null)} className="p-1 rounded text-slate-400 hover:bg-slate-200"><X className="w-4 h-4" /></button>
          </div>
        )}

        {showNewFolderInput === folder.id && (
          <div className="flex gap-1 items-center mt-1 mb-2 px-2" style={{ paddingLeft: `${depth * 12 + 28}px` }}>
            <input
              type="text"
              placeholder="Новая папка..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(folder.id);
                if (e.key === 'Escape') setShowNewFolderInput(null);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
            <button onClick={() => handleCreateFolder(folder.id)} className="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700">ОК</button>
            <button onClick={() => setShowNewFolderInput(null)} className="p-1 rounded text-slate-400 hover:bg-slate-200"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Children (Subfolders & Projects) */}
        {isExpanded && (
          <div className="mt-0.5">
            {subfolders.map(sf => renderFolderNode(sf, depth + 1))}
            {folderProjects.map(p => renderProjectNode(p, depth + 1))}
            {!hasChildren && (
              <div 
                className="text-xs text-slate-400 italic py-1 pl-4"
                style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
              >
                Пустая папка
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderProjectNode = (project: Project, depth = 0) => {
    const isActive = activeProjectId === project.id;
    return (
      <div 
        key={project.id}
        className={`group flex items-center justify-between py-1.5 px-3 mx-1 mb-0.5 rounded-lg transition-all ${
          isActive 
            ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600 font-medium shadow-sm dark:bg-indigo-950/40 dark:text-indigo-300' 
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
        }`}
        style={{ paddingLeft: `${Math.max(depth * 12 + 12, 12)}px` }}
      >
        <div 
          onClick={() => onSelectProject(project.id)}
          className="flex items-center min-w-0 cursor-pointer flex-1 gap-2"
        >
          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
          
          {editingProjectId === project.id ? (
            <input
              type="text"
              value={editingProjectName}
              onChange={(e) => setEditingProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameProjectSubmit(project.id);
                if (e.key === 'Escape') setEditingProjectId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
              autoFocus
            />
          ) : (
            <span className="text-sm truncate">{project.name}</span>
          )}
        </div>

        <div className="relative z-50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center gap-1.5 ml-2 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingProjectId(project.id);
              setEditingProjectName(project.name);
            }}
            title="Переименовать интеллект-карту"
            className="p-0.5 hover:text-blue-600 rounded"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDeleteProjectId === project.id) {
                onDeleteProject(project.id);
                setConfirmDeleteProjectId(null);
              } else {
                setConfirmDeleteProjectId(project.id);
                setTimeout(() => setConfirmDeleteProjectId(curr => curr === project.id ? null : curr), 4000);
              }
            }}
            title={confirmDeleteProjectId === project.id ? "Подтвердите удаление (нажмите еще раз)" : "Удалить интеллект-карту"}
            className={`p-0.5 rounded transition-all duration-200 ${
              confirmDeleteProjectId === project.id
                ? "text-white bg-rose-600 hover:bg-rose-700 font-bold px-1.5 animate-pulse"
                : "hover:text-rose-600"
            }`}
          >
            {confirmDeleteProjectId === project.id ? (
              <span className="text-[9px] flex items-center gap-0.5 font-sans">
                Удалить?
              </span>
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // Build root folder nodes
  const rootFolders = folders.filter(f => f.parentId === null);
  const rootProjects = projects.filter(p => p.folderId === null);

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/45 dark:bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-72 flex flex-col z-40 transform transition-all duration-300 ease-out shrink-0 ${
          isOpen 
            ? 'translate-x-0 lg:translate-x-0 lg:static lg:h-full lg:w-72 opacity-100' 
            : '-translate-x-full lg:-translate-x-full lg:w-0 lg:border-r-0 lg:p-0 overflow-hidden lg:opacity-0'
        }`}
      >
        {/* Header */}
        <div className="h-16 px-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-indigo-200 dark:shadow-none shrink-0 animate-pulse-subtle">
              M
            </div>
            <div className="truncate">
              <h1 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100 font-sans truncate">
                Интеллект-Карты
              </h1>
              <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold tracking-wider truncate">
                ЗАДАЧИ & ПРОЕКТЫ
              </p>
            </div>
          </div>
          {/* Close button that works on both desktop and mobile */}
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
            title="Свернуть панель"
          >
            <span className="hidden lg:inline">
              <ChevronLeft className="w-5 h-5 animate-bounce-horizontal" />
            </span>
            <span className="lg:hidden">
              <X className="w-5 h-5" />
            </span>
          </button>
        </div>

        {/* Create root action shortcuts */}
        <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            onClick={() => setShowNewProjectInput('root')}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors dark:bg-indigo-950/20 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          >
            <Plus className="w-3.5 h-3.5" /> Карту
          </button>
          <button
            onClick={() => setShowNewFolderInput('root')}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700 text-xs font-medium rounded-lg transition-colors dark:bg-teal-950/20 dark:border-teal-900 dark:text-teal-400 dark:hover:bg-teal-950/40"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Папку
          </button>
        </div>

        {/* Tree List container */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          
          {/* Create inputs at root if open */}
          {showNewProjectInput === 'root' && (
            <div className="flex gap-1 items-center bg-indigo-50/70 dark:bg-slate-800/70 border border-indigo-150 rounded-lg p-2 mb-2">
              <input
                type="text"
                placeholder="Название карты..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject(null);
                  if (e.key === 'Escape') setShowNewProjectInput(null);
                }}
                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                autoFocus
              />
              <button onClick={() => handleCreateProject(null)} className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">ОК</button>
              <button onClick={() => setShowNewProjectInput(null)} className="p-1 rounded text-slate-400 hover:bg-slate-200"><X className="w-4 h-4" /></button>
            </div>
          )}

          {showNewFolderInput === 'root' && (
            <div className="flex gap-1 items-center bg-teal-50/70 dark:bg-slate-800/70 border border-teal-150 rounded-lg p-2 mb-2">
              <input
                type="text"
                placeholder="Название папки..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder(null);
                  if (e.key === 'Escape') setShowNewFolderInput(null);
                }}
                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                autoFocus
              />
              <button onClick={() => handleCreateFolder(null)} className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">ОК</button>
              <button onClick={() => setShowNewFolderInput(null)} className="p-1 rounded text-slate-400 hover:bg-slate-200"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Hierarchy folders & projects */}
          <div className="space-y-1">
            <h2 className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1 mb-2">
              Проекты
            </h2>
            
            {/* List folders first */}
            {rootFolders.map(folder => renderFolderNode(folder))}
            
            {/* List root projects next */}
            {rootProjects.map(project => renderProjectNode(project))}

            {folders.length === 0 && projects.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-400">
                Нет папок или карт. Создайте новые выше!
              </div>
            )}
          </div>



          {/* Tag Categories section */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Категории тегов
              </h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewCategoryInput(true);
                  setNewCategoryName('');
                  setNewCategoryColor('#6366f1');
                }}
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                title="Создать категорию тегов"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New Category Input Form */}
            {showNewCategoryInput && (
              <div 
                className="bg-amber-50/50 dark:bg-slate-800/40 border border-amber-200/50 dark:border-slate-800/80 p-2.5 rounded-lg space-y-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <label className="text-[10px] font-medium text-slate-400 block mb-1">Название категории</label>
                  <input
                    type="text"
                    placeholder="Категория (например, Приоритет)..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newCategoryName.trim()) {
                          onCreateTagCategory(newCategoryName.trim(), newCategoryColor);
                          setShowNewCategoryInput(false);
                        }
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowNewCategoryInput(false);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-700 border border-slate-250 dark:border-slate-650 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none dark:text-slate-100"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 block mb-1">Цвет категории</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { hex: '#ef4444', name: 'Красный' },
                      { hex: '#f59e0b', name: 'Янтарный' },
                      { hex: '#10b981', name: 'Изумрудный' },
                      { hex: '#14b8a6', name: 'Бирюзовый' },
                      { hex: '#3b82f6', name: 'Синий' },
                      { hex: '#6366f1', name: 'Индиго' },
                      { hex: '#8b5cf6', name: 'Фиолетовый' },
                      { hex: '#ec4899', name: 'Розовый' }
                    ].map(col => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewCategoryColor(col.hex);
                        }}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${newCategoryColor === col.hex ? 'scale-125 ring-2 ring-indigo-505' : 'hover:scale-110'}`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 justify-end pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNewCategoryInput(false);
                    }}
                    className="px-2 py-1 text-[10px] bg-slate-100 dark:bg-slate-705 border border-slate-200 dark:border-transparent hover:bg-slate-200 rounded text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (newCategoryName.trim()) {
                        onCreateTagCategory(newCategoryName.trim(), newCategoryColor);
                        setShowNewCategoryInput(false);
                      }
                    }}
                    className="px-2.5 py-1 text-[10px] bg-amber-600 hover:bg-amber-700 text-white rounded font-medium transition-colors cursor-pointer"
                  >
                    Создать
                  </button>
                </div>
              </div>
            )}

            {/* List of categories */}
            <div className="space-y-2">
              {tagCategories && tagCategories.length > 0 ? (
                tagCategories.map(cat => {
                  const isEditing = editingCategoryId === cat.id;
                  const isAddingTag = addingTagToCategoryId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="group/cat bg-slate-50/50 dark:bg-slate-800/10 border border-slate-100 dark:border-slate-800/60 pb-2.5 pt-2 px-2.5 rounded-lg transition-all"
                    >
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (editingCategoryName.trim()) {
                                  onUpdateTagCategory(cat.id, editingCategoryName.trim(), editingCategoryColor, cat.tags);
                                  setEditingCategoryId(null);
                                }
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingCategoryId(null);
                              }
                            }}
                            className="w-full bg-white dark:bg-slate-705 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 font-sans dark:text-slate-100"
                            autoFocus
                          />
                          <div className="flex flex-wrap gap-1.5 py-1">
                            {[
                              '#ef4444', '#f59e0b', '#10b981', '#14b8a6',
                              '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
                            ].map(hex => (
                              <button
                                key={hex}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCategoryColor(hex);
                                }}
                                className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${editingCategoryColor === hex ? 'scale-125 ring-2 ring-indigo-505' : 'hover:scale-110'}`}
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(null);
                              }}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-705 dark:hover:bg-slate-650 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (editingCategoryName.trim()) {
                                  onUpdateTagCategory(cat.id, editingCategoryName.trim(), editingCategoryColor, cat.tags);
                                  setEditingCategoryId(null);
                                }
                              }}
                              className="px-1.5 py-0.5 text-[10px] bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 cursor-pointer"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center justify-between cursor-pointer select-none py-0.5 hover:bg-slate-100/40 dark:hover:bg-slate-800/40 rounded px-1 -mx-1" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedCategoryIds(prev => ({
                              ...prev,
                              [cat.id]: !prev[cat.id]
                            }));
                          }}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {collapsedCategoryIds[cat.id] ? (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate font-sans" title={cat.name}>
                              {cat.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddingTagToCategoryId(cat.id);
                                setNewCategoryTagName('');
                                // Automatically expand when adding tag to make it visible
                                setCollapsedCategoryIds(prev => ({
                                  ...prev,
                                  [cat.id]: false
                                }));
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Добавить тег"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                                setEditingCategoryColor(cat.color);
                                // Automatically expand when starting editing of category
                                setCollapsedCategoryIds(prev => ({
                                  ...prev,
                                  [cat.id]: false
                                }));
                              }}
                              className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Редактировать"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirmDeleteCategoryId === cat.id) {
                                  onDeleteTagCategory(cat.id);
                                  setConfirmDeleteCategoryId(null);
                                } else {
                                  setConfirmDeleteCategoryId(cat.id);
                                  setTimeout(() => setConfirmDeleteCategoryId(curr => curr === cat.id ? null : curr), 4000);
                                }
                              }}
                              className={`p-1 rounded transition-all duration-200 cursor-pointer ${
                                confirmDeleteCategoryId === cat.id
                                  ? "text-white bg-rose-600 hover:bg-rose-700 font-bold px-1.5 animate-pulse"
                                  : "text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                              title={confirmDeleteCategoryId === cat.id ? "Подтвердите удаление" : "Удалить категорию"}
                            >
                              {confirmDeleteCategoryId === cat.id ? (
                                <span className="text-[9px] flex items-center font-sans">Удалить?</span>
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Tags inside Category */}
                      {!collapsedCategoryIds[cat.id] && (
                        <div className="mt-1.5 pl-4" onClick={(e) => e.stopPropagation()}>
                          {cat.tags && cat.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {cat.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-semibold select-none bg-white dark:bg-slate-800"
                                  style={{
                                    color: cat.color,
                                    border: `1px solid ${cat.color}25`
                                  }}
                                >
                                  #{tag}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Remove tag from category
                                      const updatedTags = cat.tags.filter(t => t !== tag);
                                      onUpdateTagCategory(cat.id, cat.name, cat.color, updatedTags);
                                    }}
                                    className="p-0.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
                                    title="Исключить из этой категории"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block italic">Нет тегов</span>
                          )}

                          {/* Add inline tag form */}
                          {isAddingTag && (
                            <div className="mt-2 flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                placeholder="Новый тег..."
                                value={newCategoryTagName}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setNewCategoryTagName(e.target.value.replace(/\s+/g, '-'));
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const trimmed = newCategoryTagName.trim().replace(/#/g, '');
                                    if (trimmed) {
                                      const alreadyInCat = cat.tags.includes(trimmed);
                                      if (!alreadyInCat) {
                                        onUpdateTagCategory(cat.id, cat.name, cat.color, [...cat.tags, trimmed]);
                                      }
                                      setAddingTagToCategoryId(null);
                                    }
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setAddingTagToCategoryId(null);
                                  }
                                }}
                                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-[10px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:text-slate-100"
                                autoFocus
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const trimmed = newCategoryTagName.trim().replace(/#/g, '');
                                  if (trimmed) {
                                    const alreadyInCat = cat.tags.includes(trimmed);
                                    if (!alreadyInCat) {
                                      onUpdateTagCategory(cat.id, cat.name, cat.color, [...cat.tags, trimmed]);
                                    }
                                  }
                                  setAddingTagToCategoryId(null);
                                }}
                                className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] rounded shrink-0 font-medium cursor-pointer"
                              >
                                Добавить
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddingTagToCategoryId(null);
                                }}
                                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-2 text-[11px] text-slate-400 dark:text-slate-500 italic">
                  Категории не созданы
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer (Sync, Export/Import, Reset) */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-[#FAFBFD]/30 dark:bg-slate-900/30">
          
          {/* Symmetrical Sync Status & Google Auth Card */}
          <div className="space-y-2 select-none">
            {!currentUser ? (
              <div className="bg-amber-50/50 dark:bg-amber-950/15 border border-amber-200/50 dark:border-amber-900/35 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-extrabold text-[10px] uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>Локальный режим</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-medium font-mono">Без облака</span>
                </div>
                
                <p className="text-[10px] text-slate-500 dark:text-slate-455 leading-normal font-sans">
                  Ваши карты хранятся в браузере. Войдите, чтобы они автоматически синхронизировались на всех устройствах.
                </p>

                {onGoogleSignIn && (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#6366f1] hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-all duration-150 active:scale-[0.98] shadow-xs"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Войти через Google</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-200/40 dark:border-emerald-900/30 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]" />
                    <span>Облако Firebase</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    {syncStatus?.firebase === 'syncing' ? (
                      <span className="text-indigo-500 animate-pulse flex items-center gap-0.5">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        сохранение...
                      </span>
                    ) : syncStatus?.firebase === 'error' ? (
                      <span className="text-rose-500 font-bold">ошибка</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">сохранено</span>
                    )}
                  </div>
                </div>

                {/* Profile info and Sync Controls */}
                <div className="flex items-center justify-between gap-2 bg-white/70 dark:bg-slate-900/40 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    {currentUser.photoURL ? (
                      <img referrerPolicy="no-referrer" src={currentUser.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center font-bold text-[10px] text-indigo-700 dark:text-indigo-400 shrink-0">
                        <User className="w-3 h-3" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-700 dark:text-slate-200 text-[10px] truncate leading-tight flex items-center">
                        {currentUser.displayName || 'Пользователь Google'}
                      </p>
                      <p className="text-[9px] text-slate-400 truncate leading-none mt-0.5 font-mono">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {onForceSync && (
                      <button
                        type="button"
                        onClick={onForceSync}
                        title="Синхронизировать принудительно"
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncStatus?.firebase === 'syncing' ? 'animate-spin text-indigo-500' : ''}`} />
                      </button>
                    )}
                    {onLogout && (
                      <button
                        type="button"
                        onClick={onLogout}
                        title="Выйти из аккаунта Google"
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                
                {unsyncedCount > 0 && (
                  <div className="text-[9px] text-amber-600 dark:text-amber-450 flex items-center gap-1 font-medium bg-amber-50/25 dark:bg-amber-950/10 p-1 rounded-md border border-amber-200/20 font-mono">
                    ⚠️ Несинхронизировано: {unsyncedCount}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExportData}
              title="Экспортировать резервную копию JSON"
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Экспорт
            </button>
            
            <label
              title="Импортировать резервную копию JSON"
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-md cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Импорт
              <input
                type="file"
                accept=".json"
                onChange={onImportData}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={() => {
              if (confirmResetDemo) {
                onResetDemo();
                setConfirmResetDemo(false);
              } else {
                setConfirmResetDemo(true);
                setTimeout(() => setConfirmResetDemo(false), 5000);
              }
            }}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 border hover:text-slate-900 text-[11px] font-medium rounded-md transition-all duration-300 ${
              confirmResetDemo 
                ? "bg-rose-600 border-rose-600 hover:bg-rose-700 text-white font-bold animate-pulse scale-102" 
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            }`}
          >
            {confirmResetDemo ? (
              <>
                <AlertCircle className="w-3.5 h-3.5" /> Точно стереть всё и сбросить?
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> Восстановить демо
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1 select-none">
            <span>Класс версии ПО</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-100/50 dark:border-indigo-900/50 font-sans">
              v{version}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
