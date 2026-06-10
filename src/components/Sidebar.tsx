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
  Move
} from 'lucide-react';
import { Folder, Project, TagCategory, WorkspaceState } from '../types';
import GoogleSheetsSync from './GoogleSheetsSync';

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
  onMoveProject: (id: string, folderId: string | null) => void;
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
  onMoveProject,
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
  version = "2.5.0"
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

  // States for folder movement support (both manual dropdown selection and drag-and-drop feedback)
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

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
    const isDragOver = dragOverFolderId === folder.id;

    return (
      <div 
        key={folder.id} 
        className="select-none mb-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOverFolderId(folder.id);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOverFolderId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverFolderId(null);
          const projectId = e.dataTransfer.getData('text/plain');
          if (projectId) {
            onMoveProject(projectId, folder.id);
            setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
          }
        }}
      >
        <div 
          className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors text-slate-700 dark:text-slate-300 ${
            isDragOver 
              ? 'bg-indigo-100/80 dark:bg-indigo-950/40 ring-2 ring-indigo-505 border-indigo-400' 
              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
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
    const isMoving = movingProjectId === project.id;

    return (
      <div 
        key={project.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', project.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        className={`group flex items-center justify-between py-1.5 px-3 mx-1 mb-0.5 rounded-lg transition-all ${
          isActive 
            ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600 font-medium shadow-sm dark:bg-indigo-950/40 dark:text-indigo-300' 
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-905 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
        } cursor-grab active:cursor-grabbing`}
        style={{ paddingLeft: `${Math.max(depth * 12 + 12, 12)}px` }}
      >
        {isMoving ? (
          <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
            <select
              value={project.folderId || ''}
              onChange={(e) => {
                const targetFolderId = e.target.value === '' ? null : e.target.value;
                onMoveProject(project.id, targetFolderId);
                setMovingProjectId(null);
              }}
              className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-slate-800 dark:text-slate-250 cursor-pointer"
              autoFocus
            >
              <option value="">[ Без папки (Корень) ]</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setMovingProjectId(null)}
              className="p-1 rounded text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-850"
              title="Отмена"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
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
                  setMovingProjectId(project.id);
                }}
                title="Переместить в другую папку"
                className="p-0.5 hover:text-emerald-600 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850"
              >
                <Move className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingProjectId(project.id);
                  setEditingProjectName(project.name);
                }}
                title="Переименовать интеллект-карту"
                className="p-0.5 hover:text-blue-600 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850"
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
                    : "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/45"
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
          </>
        )}
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
          <div 
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDragEnter={() => setDragOverRoot(true)}
            onDragLeave={() => setDragOverRoot(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverRoot(false);
              const projectId = e.dataTransfer.getData('text/plain');
              if (projectId) {
                onMoveProject(projectId, null);
              }
            }}
            className={`space-y-1 p-1.5 rounded-xl transition-all ${
              dragOverRoot 
                ? 'bg-indigo-50/75 dark:bg-indigo-950/20 ring-2 ring-indigo-500 border-indigo-400' 
                : ''
            }`}
          >
            <h2 className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1 mb-2">
              {dragOverRoot ? '👉 Отпустите для переноса в Корень' : 'Проекты'}
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
                                  draggable="true"
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'tag', tag }));
                                    e.dataTransfer.setData('application/task-tag', tag);
                                    e.dataTransfer.setData('text/plain', tag);
                                    e.dataTransfer.effectAllowed = 'copy';
                                  }}
                                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-semibold select-none bg-white dark:bg-slate-800 cursor-grab active:cursor-grabbing hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-2xs active:shadow-none transition-all duration-150 hover:scale-[1.03]"
                                  style={{
                                    color: cat.color,
                                    border: `1px solid ${cat.color}25`
                                  }}
                                  title="Перетащите тег на задачу, чтобы назначить его"
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
        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-2 bg-[#FAFBFD]/30 dark:bg-slate-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400 py-1 font-mono">
            <span>Локальное хранилище</span>
            <span className="text-indigo-500 font-semibold">Активно</span>
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

          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1 select-none">
            <span>Класс версии ПО</span>
            <span className="text-indigo-600 dark:text-indigo-405 font-extrabold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-100/50 dark:border-indigo-900/50 font-sans">
              v{version}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
