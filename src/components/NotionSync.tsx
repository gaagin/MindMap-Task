import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Key, 
  ExternalLink, 
  HelpCircle,
  FileSpreadsheet,
  Zap,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { TaskNode, WorkspaceState } from '../types';
import { formatNotionDatabaseId } from '../lib/notionSyncService';

interface NotionSyncProps {
  currentWorkspaceState: WorkspaceState;
  onApplySyncedNodes: (updatedNodes: Record<string, TaskNode[]>) => void;
  activeProjectId: string | null;
}

export default function NotionSync({
  currentWorkspaceState,
  onApplySyncedNodes,
  activeProjectId
}: NotionSyncProps) {
  const [notionKey, setNotionKey] = useState<string>(() => localStorage.getItem('notion_key') || '');
  const [databaseId, setDatabaseId] = useState<string>(() => formatNotionDatabaseId(localStorage.getItem('notion_database_id') || ''));

  const handleDatabaseIdChange = (value: string) => {
    const formatted = formatNotionDatabaseId(value);
    setDatabaseId(formatted);
  };
  const [autoSync, setAutoSync] = useState<boolean>(() => localStorage.getItem('notion_auto_sync') === 'true');
  const [pollInterval, setPollInterval] = useState<number>(30); // seconds

  const [status, setStatus] = useState<'idle' | 'testing' | 'syncing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => localStorage.getItem('notion_last_synced') || null);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [syncStats, setSyncStats] = useState<{
    createdInNotion: number;
    updatedInNotion: number;
    createdFromNotion: number;
    updatedFromNotion: number;
  } | null>(null);

  const isSyncingRef = useRef(false);

  // Save keys to localStorage when changed
  useEffect(() => {
    localStorage.setItem('notion_key', notionKey);
  }, [notionKey]);

  useEffect(() => {
    localStorage.setItem('notion_database_id', databaseId);
  }, [databaseId]);

  useEffect(() => {
    localStorage.setItem('notion_auto_sync', String(autoSync));
  }, [autoSync]);

  // Test Connection to Notion API
  const handleTestConnection = async () => {
    setStatus('testing');
    setStatusMessage('Проверка соединения с Notion API...');

    try {
      const res = await fetch('/api/notion/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionKey, databaseId })
      });
      
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const textError = await res.text();
        setStatus('error');
        setStatusMessage(`Сервер вернул некорректный ответ (HTML вместо JSON). Статус: ${res.status}. ${textError.includes('<!DOCTYPE') || textError.includes('The page') ? 'Возможно, бэкенд перезагружается или путь к API неверен.' : textError.substring(0, 120)}`);
        return;
      }

      const data = await res.json();

      if (data.success) {
        setStatus('success');
        if (data.missingProperties && data.missingProperties.length > 0) {
          setStatusMessage(`Подключено к базы "${data.databaseTitle}", но отсутствуют свойства: ${data.missingProperties.join(', ')}`);
        } else {
          setStatusMessage(`Успешное подключение к Notion базе: "${data.databaseTitle}"! Все свойства валидны.`);
        }
      } else {
        setStatus('error');
        setStatusMessage(data.error || 'Не удалось подключиться к Notion.');
      }
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(`Ошибка сети: ${err.message || err}`);
    }
  };

  // Perform Two-Way Synchronization
  const handleSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setStatus('syncing');
    setStatusMessage('Выполняется двусторонняя синхронизация с Notion...');

    try {
      // Gather all current tasks across projects
      const allTasks: TaskNode[] = Object.values(currentWorkspaceState.nodes || {}).flat().filter(Boolean);

      // Convert TaskNode to lightweight payload for server
      const tasksPayload = allTasks.map(t => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
        status: t.status || (t.completed ? 'done' : 'todo'),
        notionPageId: t.notionPageId,
        updatedAt: t.updatedAt || new Date().toISOString(),
      }));

      const res = await fetch('/api/notion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: tasksPayload,
          notionKey,
          databaseId
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const textError = await res.text();
        setStatus('error');
        setStatusMessage(`Сервер вернул некорректный ответ при синхронизации (HTML вместо JSON). Статус: ${res.status}. ${textError.includes('<!DOCTYPE') || textError.includes('The page') ? 'Возможно, бэкенд перезагружается или не запущен.' : textError.substring(0, 120)}`);
        isSyncingRef.current = false;
        return;
      }

      const data = await res.json();

      if (data.success) {
        setStatus('success');
        const nowIso = new Date().toLocaleTimeString();
        setLastSyncedTime(nowIso);
        localStorage.setItem('notion_last_synced', nowIso);

        setSyncStats({
          createdInNotion: data.createdInNotionCount || 0,
          updatedInNotion: data.updatedInNotionCount || 0,
          createdFromNotion: data.createdFromNotionCount || 0,
          updatedFromNotion: data.updatedFromNotionCount || 0,
        });

        // Map returned tasks back into currentWorkspaceState.nodes
        if (Array.isArray(data.updatedLocalTasks)) {
          const updatedNodesMap: Record<string, TaskNode[]> = JSON.parse(JSON.stringify(currentWorkspaceState.nodes || {}));
          const targetProjId = activeProjectId || currentWorkspaceState.projects[0]?.id || 'default_proj';

          // Index returned tasks by ID
          const returnedTasksMap = new Map<string, any>(data.updatedLocalTasks.map((t: any) => [t.id, t]));

          // Update existing nodes or insert new ones
          Object.keys(updatedNodesMap).forEach(projId => {
            updatedNodesMap[projId] = updatedNodesMap[projId].map(node => {
              const returned = returnedTasksMap.get(node.id);
              if (returned) {
                returnedTasksMap.delete(node.id); // mark as processed
                return {
                  ...node,
                  text: returned.text || node.text,
                  completed: returned.completed,
                  status: returned.status,
                  notionPageId: returned.notionPageId || node.notionPageId,
                  updatedAt: returned.updatedAt || node.updatedAt,
                  notionLastSyncedAt: new Date().toISOString()
                };
              }
              return node;
            });
          });

          // Any remaining unprocessed tasks from Notion belong to new tasks -> append to active project!
          returnedTasksMap.forEach((newNotionTask) => {
            if (!updatedNodesMap[targetProjId]) {
              updatedNodesMap[targetProjId] = [];
            }
            updatedNodesMap[targetProjId].push({
              id: newNotionTask.id,
              projectId: targetProjId,
              text: newNotionTask.text || 'New Notion Task',
              x: 100 + Math.random() * 200,
              y: 100 + Math.random() * 200,
              parentId: null,
              priority: 'none',
              tags: ['Notion'],
              notes: 'Импортировано из Notion Database',
              completed: newNotionTask.completed,
              status: newNotionTask.status,
              files: [],
              notionPageId: newNotionTask.notionPageId,
              updatedAt: newNotionTask.updatedAt || new Date().toISOString(),
              notionLastSyncedAt: new Date().toISOString()
            });
          });

          onApplySyncedNodes(updatedNodesMap);
        }

        setStatusMessage(`Синхронизация завершена успешно в ${nowIso}!`);
      } else {
        setStatus('error');
        setStatusMessage(data.error || 'Ошибка двусторонней синхронизации.');
      }
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(`Ошибка запроса синхронизации: ${err.message || err}`);
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Auto Sync Polling Timer
  useEffect(() => {
    if (!autoSync) return;

    const intervalId = setInterval(() => {
      console.log('[NotionSync] Автоматический опрос Notion API (Polling)...');
      handleSync();
    }, pollInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoSync, pollInterval, currentWorkspaceState, notionKey, databaseId]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-slate-900 text-white rounded-lg dark:bg-white dark:text-slate-900">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">Синхронизация с Notion</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Двусторонний обмен задачами в реальном времени</p>
          </div>
        </div>

        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center space-x-1 font-medium cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Инструкция</span>
        </button>
      </div>

      {/* Instructions Modal / Accordion */}
      {showInstructions && (
        <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg p-4 text-xs space-y-2.5">
          <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 text-sm flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Инструкция по настройке Notion Integration:</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-indigo-950 dark:text-indigo-300 leading-relaxed">
            <li>
              Перейдите в <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="underline font-medium text-indigo-700 dark:text-indigo-300">Notion My Integrations</a> и нажмите <strong>+ New integration</strong>.
            </li>
            <li>Присвойте название интеграции, выберите воркспейс и скопируйте <strong>Internal Integration Secret</strong> (ключ `secret_...`).</li>
            <li>
              В Notion создайте или откройте нужную базу данных (Database) и добавьте 4 свойства:
              <ul className="list-disc list-inside ml-4 my-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                <li><code className="bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.5 rounded">Title</code> (тип Title) — Название задачи</li>
                <li><code className="bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.5 rounded">Status</code> (тип Status или Select) — со значениями "To Do", "In Progress", "Done"</li>
                <li><code className="bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.5 rounded">App_ID</code> (тип Text / Rich Text) — Защита от бесконечных циклов!</li>
                <li><code className="bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.5 rounded">Last_Edited</code> (тип Last edited time)</li>
              </ul>
            </li>
            <li>Откройте страницу вашей Notion базы, нажмите <strong>... (три точки) вверху справа &rarr; Connections &rarr; Add Connections</strong> и выберите созданную интеграцию.</li>
            <li>Скопируйте ID базы данных из URL Notion (32 символа между именем и <code>?v=...</code>).</li>
          </ol>
        </div>
      )}

      {/* Settings inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            NOTION_KEY (Secret Token)
          </label>
          <div className="relative">
            <Key className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="password"
              placeholder="secret_xxxxxxxxxxxxxxxx"
              value={notionKey}
              onChange={(e) => setNotionKey(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            NOTION_DATABASE_ID
          </label>
          <div className="relative">
            <Database className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              onBlur={(e) => setDatabaseId(formatNotionDatabaseId(e.target.value))}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleTestConnection}
            disabled={status === 'testing' || status === 'syncing'}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {status === 'testing' ? 'Проверка...' : 'Проверить связь'}
          </button>

          <button
            onClick={handleSync}
            disabled={status === 'syncing'}
            className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{status === 'syncing' ? 'Синхронизация...' : 'Синхронизировать сейчас'}</span>
          </button>
        </div>

        {/* Polling Toggle */}
        <div className="flex items-center space-x-3 text-xs">
          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
            />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Авто-опрос (Polling)</span>
          </label>

          {autoSync && (
            <select
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs rounded px-2 py-1"
            >
              <option value={15}>15 сек</option>
              <option value={30}>30 сек</option>
              <option value={60}>1 мин</option>
              <option value={300}>5 мин</option>
            </select>
          )}
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
          status === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
            : status === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
          {status === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
          {status === 'error' && <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />}
          {(status === 'syncing' || status === 'testing') && <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />}
          <div className="flex-1 leading-snug">{statusMessage}</div>
        </div>
      )}

      {/* Sync statistics summary */}
      {syncStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs pt-1">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="text-slate-500 dark:text-slate-400 text-[10px]">Создано в Notion</div>
            <div className="font-semibold text-indigo-600 dark:text-indigo-400 text-sm">{syncStats.createdInNotion}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="text-slate-500 dark:text-slate-400 text-[10px]">Обновлено в Notion</div>
            <div className="font-semibold text-indigo-600 dark:text-indigo-400 text-sm">{syncStats.updatedInNotion}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="text-slate-500 dark:text-slate-400 text-[10px]">Импортировано из Notion</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">{syncStats.createdFromNotion}</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="text-slate-500 dark:text-slate-400 text-[10px]">Обновлено из Notion</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">{syncStats.updatedFromNotion}</div>
          </div>
        </div>
      )}

      {lastSyncedTime && (
        <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Последний сеанс синхронизации: {lastSyncedTime}</span>
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1">
            <Zap className="w-3 h-3" />
            <span>Защита от циклов активна</span>
          </span>
        </div>
      )}
    </div>
  );
}
