import React, { useState } from 'react';
import { 
  Folder as FolderIcon, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  Trash2, 
  Edit, 
  Plus, 
  FileText, 
  Download, 
  Upload, 
  RotateCcw,
  X,
  FolderOpen
} from 'lucide-react';
import { Folder, Project } from '../types';

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
  onClose
}: SidebarProps) {
  // Folder tree expansion state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'f-work': true,
    'f-personal': true
  });
  
  // Creation / editing inputs
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState<string | null>(null); // 'root' or folderId
  
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProjectInput, setShowNewProjectInput] = useState<string | null>(null); // folderId or 'root'
  
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

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
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 transition-opacity">
            <button
              onClick={() => {
                setShowNewProjectInput(folder.id);
                setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
              }}
              title="Создать карту в папке"
              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setShowNewFolderInput(folder.id);
                setExpandedFolders(prev => ({ ...prev, [folder.id]: true }));
              }}
              title="Создать подпапку"
              className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setEditingFolderId(folder.id);
                setEditingFolderName(folder.name);
              }}
              title="Переименовать"
              className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Вы уверены, что хотите удалить папку "${folder.name}"? Карты внутри папки останутся.`)) {
                  onDeleteFolder(folder.id);
                }
              }}
              title="Удалить папку"
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
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

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 ml-2 transition-opacity">
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
              if (confirm(`Вы уверены, что хотите окончательно удалить карту задач "${project.name}"?`)) {
                onDeleteProject(project.id);
              }
            }}
            title="Удалить интеллект-карту"
            className="p-0.5 hover:text-rose-600 rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
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
        className={`fixed inset-y-0 left-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-72 flex flex-col z-40 transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:h-full shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="h-16 px-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-indigo-200 dark:shadow-none">
              M
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100 font-sans">
                Интеллект-Карты
              </h1>
              <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold tracking-wider">
                ЗАДАЧИ & ПРОЕКТЫ
              </p>
            </div>
          </div>
          {/* Close button on mobile */}
          <button 
            onClick={onClose}
            className="p-1 px-[5px] rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 lg:hidden"
          >
            <X className="w-5 h-5" />
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

          <button
            onClick={() => {
              if (confirm('Внимание! Это действие заменит все текущие карты на демонстрационный набор данных. Продолжить?')) {
                onResetDemo();
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 text-slate-500 text-[11px] font-medium rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Восстановить демо
          </button>
        </div>
      </aside>
    </>
  );
}
