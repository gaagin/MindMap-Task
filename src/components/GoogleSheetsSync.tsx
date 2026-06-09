import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  RefreshCw, 
  Save, 
  Download, 
  Key, 
  FileSpreadsheet, 
  Sparkles, 
  Grid,
  Lock,
  LogOut,
  HelpCircle,
  Check,
  AlertTriangle,
  Plus
} from 'lucide-react';
import { WorkspaceState } from '../types';
import { 
  createSyncSpreadsheet, 
  saveStateToGoogleSheets, 
  loadStateFromGoogleSheets, 
  listSpreadsheetsFromDrive 
} from '../lib/sheetsService';

interface GoogleSheetsSyncProps {
  currentWorkspaceState: WorkspaceState;
  onApplySyncedState: (state: WorkspaceState) => void;
}

export default function GoogleSheetsSync({
  currentWorkspaceState,
  onApplySyncedState
}: GoogleSheetsSyncProps) {
  // Config state (saved in localStorage safely)
  const [clientId, setClientId] = useState(() => localStorage.getItem('task_sheets_client_id') || '');
  const [spreadsheetId, setSpreadsheetId] = useState(() => localStorage.getItem('task_sheets_spreadsheet_id') || '');
  
  // Synchronize spreadsheetId from currentWorkspaceState (cross-device cloud updates)
  useEffect(() => {
    if (currentWorkspaceState.taskSheetsSpreadsheetId && currentWorkspaceState.taskSheetsSpreadsheetId !== spreadsheetId) {
      setSpreadsheetId(currentWorkspaceState.taskSheetsSpreadsheetId);
      localStorage.setItem('task_sheets_spreadsheet_id', currentWorkspaceState.taskSheetsSpreadsheetId);
    }
  }, [currentWorkspaceState.taskSheetsSpreadsheetId]);
  
  // Auth & Token (stored strictly in memory as per guidelines)
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Lists of sheets from user's Drive once connected
  const [availableSheets, setAvailableSheets] = useState<{ id: string; name: string }[]>([]);
  
  // UI Panels / Loading States
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'success' | 'error' | null }>({ text: '', type: null });
  const [isLoading, setIsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showPullConfirm, setShowPullConfirm] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);

  // Auto-load available spreadsheets on accessToken change
  useEffect(() => {
    if (accessToken) {
      loadSpreadsheetList();
    } else {
      setAvailableSheets([]);
    }
  }, [accessToken]);

  // Persists Client ID and Spreadsheet ID config
  const saveConfigToStorage = (cid: string, sid: string) => {
    localStorage.setItem('task_sheets_client_id', cid);
    localStorage.setItem('task_sheets_spreadsheet_id', sid);
  };

  // Triggers modern Google OAuth implicit login popup
  const handleGoogleLogin = () => {
    if (!clientId.trim()) {
      setStatusMsg({ text: 'Сначала введите ваш Google OAuth Client ID в поле настройки.', type: 'error' });
      return;
    }

    setStatusMsg({ text: 'Инициализация авторизации Google...', type: 'info' });
    setIsLoading(true);

    const redirectUri = window.location.origin;
    const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId.trim())}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=sheets-sync`;

    const popup = window.open(authUrl, 'GoogleSheetsAuth', 'width=600,height=620,left=150,top=100');

    if (!popup) {
      setIsLoading(false);
      setStatusMsg({ 
        text: 'Браузер заблокировал всплывающее окно. Пожалуйста, разрешите всплывающие окна для работы сиронизации или воспользуйтесь ручной вставкой токена.', 
        type: 'error' 
      });
      return;
    }

    const checkPopupInterval = setInterval(() => {
      try {
        if (popup && popup.location && popup.location.origin === window.location.origin) {
          const hash = popup.location.hash;
          if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            if (token) {
              setAccessToken(token);
              saveConfigToStorage(clientId.trim(), spreadsheetId);
              setStatusMsg({ text: 'Успешно подключено к Google API!', type: 'success' });
              popup.close();
              clearInterval(checkPopupInterval);
            }
          }
        }
      } catch (err) {
        // Cross-domain access errors are expected while the user has not finished logging in
      }

      if (popup && popup.closed) {
        setIsLoading(false);
        clearInterval(checkPopupInterval);
      }
    }, 1000);
  };

  const handleManualTokenSubmit = () => {
    if (!manualToken.trim()) return;
    setAccessToken(manualToken.trim());
    saveConfigToStorage(clientId.trim(), spreadsheetId);
    setStatusMsg({ text: 'Токен привязан вручную!', type: 'success' });
    setShowManualPaste(false);
  };

  const handleLogout = () => {
    setAccessToken(null);
    setManualToken('');
    setStatusMsg({ text: 'Сессия отключена.', type: 'info' });
  };

  // List existing sheet files
  const loadSpreadsheetList = async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const list = await listSpreadsheetsFromDrive(accessToken);
      setAvailableSheets(list);
    } catch (err: any) {
      console.error('Drive list spreadsheets error:', err);
      setStatusMsg({ text: `Не удалось загрузить файлы с Google Диска: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Create a new sheet file automatically
  const handleCreateNewSpreadsheet = async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      setStatusMsg({ text: 'Инициализация новой Google Таблицы...', type: 'info' });
      const name = prompt('Введите название таблицы на Google Диске:', 'Синхронизация Интеллект-Карты Задач');
      if (name === null) return;
      
      const newId = await createSyncSpreadsheet(accessToken, name || 'Синхронизация Интеллект-Карты Задач');
      setSpreadsheetId(newId);
      saveConfigToStorage(clientId, newId);
      onApplySyncedState({
        ...currentWorkspaceState,
        taskSheetsSpreadsheetId: newId
      });
      await loadSpreadsheetList();
      setStatusMsg({ text: 'Успешно создана новая таблица с вкладками SyncState и Tasks_View!', type: 'success' });
    } catch (err: any) {
      setStatusMsg({ text: `Не удалось создать таблицу: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Push current local state to cloud sheet
  const handlePushToCloud = async (bypassConfirm = false) => {
    if (!accessToken) {
      setStatusMsg({ text: 'Пожалуйста, сначала войдите через Google.', type: 'error' });
      return;
    }
    if (!spreadsheetId) {
      setStatusMsg({ text: 'Пожалуйста, выберите существующую таблицу или создайте новую.', type: 'error' });
      return;
    }

    if (!bypassConfirm) {
      setShowPushConfirm(true);
      return;
    }

    try {
      setIsLoading(true);
      setStatusMsg({ text: 'Синхронизация данных... Запись на Google Sheets...', type: 'info' });
      await saveStateToGoogleSheets(accessToken, spreadsheetId, currentWorkspaceState);
      setStatusMsg({ text: 'Синхронизация завершена успешно! Локальные данные выгружены на облако.', type: 'success' });
    } catch (err: any) {
      setStatusMsg({ text: `Сбой при выгрузке данных: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Pull cloud state to local app workspace
  const handlePullFromCloud = async (bypassConfirm = false) => {
    if (!accessToken) {
      setStatusMsg({ text: 'Пожалуйста, сначала войдите через Google.', type: 'error' });
      return;
    }
    if (!spreadsheetId) {
      setStatusMsg({ text: 'Пожалуйста, выберите существующую таблицу.', type: 'error' });
      return;
    }

    if (!bypassConfirm) {
      setShowPullConfirm(true);
      return;
    }

    try {
      setIsLoading(true);
      setStatusMsg({ text: 'Чтение данных из Google Sheets...', type: 'info' });
      const newState = await loadStateFromGoogleSheets(accessToken, spreadsheetId);
      onApplySyncedState(newState);
      setStatusMsg({ text: 'Данные успешно загружены и применены на устройстве!', type: 'success' });
    } catch (err: any) {
      setStatusMsg({ text: `Сбой при загрузке: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="google-sheets-sync-panel" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4 shadow-3xs">
      
      {/* Header info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Google Sheets Синхронизация
            </h4>
            <p className="text-[10px] text-slate-400">Синхронизируйте интеллект-карту и списки дел между устройствами!</p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          title="Справка по установке"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* Guide Help info Panel */}
      {showHelp && (
        <div id="sync-help-panel" className="bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-150 dark:border-slate-800 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-2">
          <p className="font-bold text-slate-800 dark:text-slate-200">Как настроить синхронизацию за 3 шага:</p>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>
              Перейдите в <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">Google Cloud Console</a> и создайте новый проект.
            </li>
            <li>
              В меню <b>API & Services → Library</b> найдите и включите <b>Google Sheets API</b> и <b>Google Drive API</b>.
            </li>
            <li>
              В разделе <b>Credentials</b> на панели создайте <b>OAuth Client ID</b> (Тип приложения: Web Application) и добавьте URL вашего приложения в <i>Authorized JavaScript origins</i> и <i>Authorized redirect URIs</i> (e.g., <code className="bg-slate-200/50 dark:bg-slate-800 px-1 rounded">{window.location.origin}</code>).
            </li>
            <li>Скопируйте Client ID, вставьте его в поле ниже, сохраните и нажмите "Подключить"!</li>
          </ol>
          <p className="text-[10px] text-indigo-500 font-medium">Синхронизатор сохраняет полную структуру в ячейку «SyncState» и строит читаемый список задач в таблицу «Tasks_View» для наглядного контроля!</p>
        </div>
      )}

      {/* Status Alert messaging board */}
      {statusMsg.text && (
        <div className={`p-2.5 rounded-lg text-[11px] flex gap-2 items-start ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30'
            : statusMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40'
              : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30'
        }`}>
          {statusMsg.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 font-medium">{statusMsg.text}</span>
          <button 
            type="button" 
            onClick={() => setStatusMsg({ text: '', type: null })}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ×
          </button>
        </div>
      )}

      {/* Config Form and Authentication controllers */}
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">
            1. Настройки Google OAuth API
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-2.5 text-slate-400">
                <Key className="w-3.5 h-3.5" />
              </span>
              <input
                id="sync-client-id-input"
                type="text"
                placeholder="Вставьте ваш Google Client ID..."
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  saveConfigToStorage(e.target.value, spreadsheetId);
                }}
                disabled={!!accessToken}
                className="w-full bg-slate-50 dark:bg-slate-800 disabled:opacity-60 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Auth Buttons */}
        {!accessToken ? (
          <div className="space-y-1.5">
            <button
              id="sync-connect-oauth-btn"
              type="button"
              onClick={handleGoogleLogin}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Lock className="w-4 h-4" />
              <span>Подключить Google аккаунт</span>
            </button>
            <div className="text-center">
              <button
                id="sync-manual-token-toggle"
                type="button"
                onClick={() => setShowManualPaste(!showManualPaste)}
                className="text-[10px] text-slate-400 hover:text-indigo-500 hover:underline cursor-pointer"
              >
                Альтернатива: вставить токен вручную
              </button>
            </div>

            {showManualPaste && (
              <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-[10px] text-slate-400">
                  Вы можете сгенерировать временный Access Token в песочнице Google OAuth Playground и вставить сюда напрямую:
                </p>
                <input
                  id="sync-manual-token-input"
                  type="password"
                  placeholder="Вставьте Bearer ядро токена..."
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-100 font-mono"
                />
                <button
                  id="sync-manual-token-submit"
                  type="button"
                  onClick={handleManualTokenSubmit}
                  className="w-full py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 text-xs font-semibold"
                >
                  Применить токен
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-850 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-ping" />
              <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold truncate">
                Соединение активно
              </p>
            </div>
            <button
              id="sync-logout-btn"
              type="button"
              onClick={handleLogout}
              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
              title="Отключить"
            >
              <LogOut className="w-3 h-3" />
              <span>Выйти</span>
            </button>
          </div>
        )}

        {/* Spreadsheet Selector */}
        {accessToken && (
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/60 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                2. Выбор Google Таблицы
              </label>
              <button
                id="sync-refresh-list-btn"
                type="button"
                onClick={loadSpreadsheetList}
                className="text-indigo-600 dark:text-indigo-400 hover:underline text-[9.5px] font-bold cursor-pointer"
              >
                Обновить список
              </button>
            </div>

            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-2.5 text-slate-400">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </span>
                <select
                  id="sync-spreadsheet-selector"
                  value={spreadsheetId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setSpreadsheetId(sid);
                    saveConfigToStorage(clientId, sid);
                    onApplySyncedState({
                      ...currentWorkspaceState,
                      taskSheetsSpreadsheetId: sid || undefined
                    });
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- Выберите док с Диска --</option>
                  {availableSheets.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.name}</option>
                  ))}
                </select>
              </div>

              <button
                id="sync-create-new-sheet-btn"
                type="button"
                onClick={handleCreateNewSpreadsheet}
                className="px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 border border-slate-200 dark:border-transparent rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center"
                title="Создать новую таблицу"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Direct manual fallback text field for spreadsheet ID */}
            <div>
              <input
                id="sync-direct-sheet-id"
                type="text"
                placeholder="Или введите ID таблицы напрямую..."
                value={spreadsheetId}
                onChange={(e) => {
                  const sid = e.target.value.trim();
                  setSpreadsheetId(sid);
                  saveConfigToStorage(clientId, sid);
                  onApplySyncedState({
                    ...currentWorkspaceState,
                    taskSheetsSpreadsheetId: sid || undefined
                  });
                }}
                className="w-full bg-slate-50/50 dark:bg-slate-850 border border-dashed border-slate-250 dark:border-slate-800 rounded px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>
        )}

        {/* Sync Actions Panel (Push & Pull) */}
        {accessToken && spreadsheetId && (
          <div className="border-t border-slate-100 dark:border-slate-800/65 pt-3 animate-slide-in space-y-3">
            {showPullConfirm && (
              <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 text-xs flex flex-col gap-1.5 animate-in fade-in-50 duration-200">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Внимание! Локальные данные на этом устройстве будут ПОЛНОСТЬЮ ЗАМЕНЕНЫ данными из выбранной Google Таблицы. Применить изменения?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPullConfirm(false)}
                    className="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPullConfirm(false);
                      handlePullFromCloud(true);
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded cursor-pointer transition-colors"
                  >
                    Да, перезаписать
                  </button>
                </div>
              </div>
            )}

            {showPushConfirm && (
              <div className="p-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20 text-xs flex flex-col gap-1.5 animate-in fade-in-50 duration-200">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Внимание! Данные на Google Диске в этой таблице будут перезаписаны текущими локальными данными этого устройства. Продолжить?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPushConfirm(false)}
                    className="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPushConfirm(false);
                      handlePushToCloud(true);
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer transition-colors"
                  >
                    Да, выгрузить
                  </button>
                </div>
              </div>
            )}

            {!showPullConfirm && !showPushConfirm && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="sync-pull-from-cloud"
                  type="button"
                  onClick={() => handlePullFromCloud(false)}
                  disabled={isLoading}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 rounded-lg text-xs font-bold border border-slate-200 dark:border-transparent transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Download className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Загрузить в ПК</span>
                </button>

                <button
                  id="sync-push-to-cloud"
                  type="button"
                  onClick={() => handlePushToCloud(false)}
                  disabled={isLoading}
                  className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>Выгрузить в Облако</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
