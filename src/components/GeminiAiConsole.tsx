import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Cpu, 
  Activity, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Play, 
  X, 
  Database,
  ArrowDownWideNarrow,
  Plus,
  HelpCircle,
  RotateCcw,
  BookOpen
} from 'lucide-react';
import { TaskNode, WorkspaceState } from '../types';
import { generateId } from '../utils';

interface APILogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface QueueStatus {
  queuedRequestsCount: number;
  currentRpm: number;
  currentTpm: number;
  lastRequestTime: number;
  apiLogs: APILogEntry[];
  limits: {
    maxRpm: number;
    maxTpm: number;
    minDelayBetweenRequestsMs: number;
  };
}

interface GeminiAiConsoleProps {
  activeProjectId: string | null;
  allNodes: TaskNode[];
  onAddMultipleNodes: (newNodes: TaskNode[]) => void;
  onUpdateNode: (updatedNode: TaskNode) => void;
  onSelectNode: (id: string | null) => void;
  selectedNode: TaskNode | null;
  onClose: () => void;
}

export default function GeminiAiConsole({
  activeProjectId,
  allNodes,
  onAddMultipleNodes,
  onUpdateNode,
  onSelectNode,
  selectedNode,
  onClose
}: GeminiAiConsoleProps) {
  const [activeTab, setActiveTab] = useState<'copilot' | 'monitor'>('copilot');
  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Realtime Polling state
  const [status, setStatus] = useState<QueueStatus | null>(null);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Poll server-side rate limits and logs every 1.5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/gemini/status');
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (e) {
        console.error('Failed to fetch Gemini status:', e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll console logs to the bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status?.apiLogs]);

  // Generate hierarchial structure for the mind map
  const handleGenerateStructure = async () => {
    if (!activeProjectId) {
      setErrorMsg('Создайте или откройте проект интеллек-карты.');
      return;
    }
    if (!promptInput.trim()) {
      setErrorMsg('Введите тему или описание проекта.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const parentId = selectedNode ? selectedNode.id : null;
      const rootNode = allNodes.find(n => n.parentId === null);
      const targetParentId = parentId || (rootNode ? rootNode.id : null);

      if (!targetParentId) {
        throw new Error('Не найден корневой узел для прикрепления подзадач.');
      }

      const promptMessage = `Используя русский язык, создай структурированное дерево задач (минимум 6 пунктов) на тему: "${promptInput}". 
Мы прикрепим новые ветви к родительской задаче (ID: "${targetParentId}").

Тебе нужно сгенерировать JSON массив объектов, строго соответствующий следующему формату:
[
  {
    "text": "Название подзадачи",
    "notes": "Краткое описание или чек-лист",
    "priority": "low" или "medium" или "high",
    "relativeX": 250, // Смещение по оси X от родителя (обычно в диапазоне 200...280 для первого уровня, 420...500 для вложенных)
    "relativeY": -100 // Смещение по оси Y от родителя (в диапазоне -180...180)
  }
]

Сгенерируй только чистый JSON, без разметки markdown (\`\`\`json) и лишних пояснений. Пусть задачи будут практическими и реалистичными. Наличие относительных смещений relativeX и relativeY обязательно для правильной расстановки на холсте.`;

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptMessage,
          systemInstruction: 'Вы — высококлассный ИИ-планировщик проектов, создающий безупречные, структурированные интеллект-карты. Вы отвечаете строго в формате валидного JSON-массива без форматирования markdown.',
          responseMimeType: 'application/json'
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Ошибка вызова API');
      }

      const data = await response.json();
      const rawText = data.text || '';
      
      // Clean and parse JSON
      let cleanedText = rawText.trim();
      if (cleanedText.startsWith('```json')) cleanedText = cleanedText.substring(7);
      if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);
      cleanedText = cleanedText.trim();

      const taskItems = JSON.parse(cleanedText) as Array<{
        text: string;
        notes: string;
        priority: 'low' | 'medium' | 'high' | 'urgent';
        relativeX: number;
        relativeY: number;
      }>;

      if (!Array.isArray(taskItems)) throw new Error('Данные от ИИ не являются массивом задач.');

      // Position from the parent node coordinate
      const baseNode = allNodes.find(n => n.id === targetParentId);
      const baseX = baseNode ? baseNode.x : 0;
      const baseY = baseNode ? baseNode.y : 0;

      // Construct TaskNodes
      const generatedNodes: TaskNode[] = taskItems.map((item, index) => {
        const newId = 'node-' + generateId();
        return {
          id: newId,
          projectId: activeProjectId,
          text: item.text,
          notes: item.notes || '',
          priority: item.priority || 'low',
          x: baseX + (item.relativeX || (240 * (1 + Math.floor(index / 3)))),
          y: baseY + (item.relativeY || (-150 + (index % 3) * 120)),
          parentId: targetParentId,
          tags: [],
          completed: false,
          files: []
        };
      });

      onAddMultipleNodes(generatedNodes);
      setPromptInput('');
      setActiveTab('monitor'); // Jump to monitor so they can witness the logs
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Сбой импорта ИИ: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhance Selected Node Details (generate auto checklist inside notes)
  const handleEnhanceTask = async () => {
    if (!selectedNode) {
      setErrorMsg('Пожалуйста, выберите задачу на карте для улучшения.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const promptMessage = `Используя русский язык, составь подробный пошаговый план-инструкцию (чек-лист/заметку) для выполнения следующей задачи: "${selectedNode.text}".
Текущие примечания к задаче: "${selectedNode.notes || 'отсутствуют'}".

Твой ответ должен содержать:
1. Краткий обзор важности этой задачи.
2. Подробный чек-лист действий (с использованием символов "- [ ]").
3. Рекомендации по оценке времени.

Отвечай в простом читаемом markdown-формате, вежливо и по делу.`;

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptMessage,
          systemInstruction: 'Вы — продуктивный бизнес-консультант и технический писатель. Пишете кратко, емко на русском языке.'
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Ошибка вызова API');
      }

      const data = await response.json();
      const enhancedText = data.text || '';

      const updatedNode: TaskNode = {
        ...selectedNode,
        notes: enhancedText,
        updatedAt: new Date().toISOString()
      };

      onUpdateNode(updatedNode);
      onSelectNode(updatedNode.id); // refresh
      setActiveTab('monitor');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Не удалось улучшить задачу: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // SIMULATE BULK LOAD TEST: Spawns 5 rapid concurrent requests to show Queue, Throttling & Backoff live
  const handleRunLoadTest = async () => {
    if (!activeProjectId) {
      setErrorMsg('Откройте проект для симуляции.');
      return;
    }

    setErrorMsg(null);

    const simulatedQueries = [
      'Составить план продвижения проекта в SMM',
      'Определить технические риски архитектуры базы данных',
      'Разработать регламент взаимодействия с инвесторами',
      'Написать шаблон юридического соглашения о конфиденциальности (NDA)',
      'Сформировать чек-лист подготовки презентации концепции'
    ];

    simulatedQueries.forEach(async (query, idx) => {
      try {
        const promptMessage = `Сгенерируй три полезных ключевых тега для следующей задачи (на русском языке): "${query}". 
Верни результат в одну строчку через запятую, например: SMM, маркетинг, KPI`;

        const response = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptMessage,
            systemInstruction: 'Отвечать строго в виде списка тегов через запятую, лаконично.'
          })
        });

        if (!response.ok) {
          throw new Error('Сетевая ошибка симуляции');
        }
        
        await response.json();
      } catch (err: any) {
        console.error(`Simalation Request Error for task #${idx + 1}:`, err);
      }
    });

    setActiveTab('monitor');
  };

  // Helper local request to clear Express log queue
  const handleClearLogs = async () => {
    try {
      await fetch('/api/gemini/clear-logs', { method: 'POST' });
      if (status) {
        setStatus({ ...status, apiLogs: [] });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Estimate visual percentage for RPM (15 max) and TPM (1,000,500 max)
  const rpmPercent = Math.min(100, Math.round(((status?.currentRpm || 0) / 15) * 100));
  const tpmPercent = Math.min(100, Math.round(((status?.currentTpm || 0) / 1000000) * 100));

  return (
    <div className="w-80 sm:w-85 border-l border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 flex flex-col h-full shadow-lg z-25 relative animate-fade-in select-none">
      {/* Header */}
      <div className="h-16 border-b border-slate-205 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">
            Gemini AI Копилот
          </span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:bg-slate-150 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('copilot')}
          className={`flex-1 py-3 text-center font-bold cursor-pointer transition-all ${
            activeTab === 'copilot' 
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-white dark:bg-slate-900' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          Копилот ИИ
        </button>
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex-1 py-3 text-center font-bold relative cursor-pointer transition-all ${
            activeTab === 'monitor' 
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-white dark:bg-slate-900' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          Монитор API
          {status && status.queuedRequestsCount > 0 && (
            <span className="absolute top-2 right-4 px-1.5 py-0.5 bg-indigo-550 text-white rounded-full text-[9px] font-mono animate-bounce shrink-0">
              {status.queuedRequestsCount}
            </span>
          )}
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* Error Block */}
        {errorMsg && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 p-3 rounded-lg flex gap-2 text-[11px] text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <p className="leading-relaxed font-medium">{errorMsg}</p>
          </div>
        )}

        {activeTab === 'copilot' ? (
          <div className="space-y-4">
            
            {/* Tool 1: Map Structure Plan generator */}
            <div className="bg-[#FAFBFD]/80 dark:bg-slate-850/30 p-3 rounded-xl border border-slate-150 dark:border-slate-800 space-y-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  ИИ-Генератор ветвей
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-serif">
                Сделайте запрос (напр., «Бизнес-план кофейни», «Поездка в Токио») и Gemini сгенерирует целое структурированное дерево задач, расставив их по холсту в виде ветвей!
              </p>
              
              <div className="space-y-2">
                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 rounded-lg max-h-24 dark:text-slate-100 placeholder:text-slate-400"
                  rows={3}
                  placeholder="О чем генерация? Например: План разработки MVP игры на React..."
                />
                
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
                  <span>
                    {selectedNode ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Ветвь: {selectedNode.text.substring(0, 18)}...
                      </span>
                    ) : (
                      'Будет прикреплено к корню'
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleGenerateStructure}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition duration-200 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isGenerating ? 'Думаю...' : 'Сгенерировать дерево задач'}
                </button>
              </div>
            </div>

            {/* Tool 2: Enhance Current Task */}
            <div className="bg-[#FAFBFD]/80 dark:bg-slate-850/30 p-3 rounded-xl border border-slate-150 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500">
                  <ArrowDownWideNarrow className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Анализатор и Чек-листы
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-serif">
                Выберите любую задачу на холсте и Gemini обогатит её подробными заметками, пошаговыми инструкциями и тайм-менеджментом.
              </p>

              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-150 dark:border-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-400">
                {selectedNode ? (
                  <div className="flex items-center justify-between">
                    <span className="truncate">Текущая задача: <b>{selectedNode.text}</b></span>
                  </div>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Для активации выделите узел дерева задач!
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isGenerating || !selectedNode}
                onClick={handleEnhanceTask}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition duration-200 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 animate-bounce" />
                {isGenerating ? 'В процессе...' : 'Написать чек-лист к задаче'}
              </button>
            </div>

            {/* Test Engine Section */}
            <div className="bg-rose-50/25 dark:bg-rose-950/5 border border-rose-150 dark:border-rose-950/40 p-3 rounded-xl space-y-2.5">
              <h4 className="text-[11px] font-bold text-rose-850 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Тестирование Лимитов (API Bench)
              </h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Нажмите для одновременного запуска 5 запросов к API Gemini Flash 3.5. Вы сможете наглядно увидеть, как встроенная очередь <b>Rate Limiter</b> упорядочит вызовы и как <b>Exponential Backoff</b> плавно ждет разблокировки лимита при ошибке 429!
              </p>
              <button
                type="button"
                onClick={handleRunLoadTest}
                className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold rounded-lg text-[10px] border border-rose-200 dark:border-rose-900/60 transition duration-150 cursor-pointer"
              >
                Запустить стресс-анализ (5 concurrent)
              </button>
            </div>

          </div>
        ) : (
          <div className="space-y-4 flex flex-col h-full">
            
            {/* Rates Dashboard */}
            <div className="grid grid-cols-2 gap-3.5 bg-[#FAFBFD] dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-805">
              
              {/* RPM Meter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="font-bold flex items-center gap-1">
                    <Activity className="w-3 h-3 text-indigo-500" />
                    RPM Частота
                  </span>
                  <span>{status?.currentRpm || 0} / 15</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-550 transition-all duration-300"
                    style={{ width: `${rpmPercent}%` }}
                  />
                </div>
                <p className="text-[8px] text-slate-400">Частота в минуту (Requests)</p>
              </div>

              {/* TPM Meter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="font-bold flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-indigo-500" />
                    TPM Токены
                  </span>
                  <span>{Math.round((status?.currentTpm || 0) / 1000)}k / 1M</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-550 transition-all duration-300"
                    style={{ width: `${tpmPercent}%` }}
                  />
                </div>
                <p className="text-[8px] text-slate-400">Токенов в минуту (Tokens)</p>
              </div>

            </div>

            {/* Queue Counter Info */}
            {status && status.queuedRequestsCount > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-150 dark:border-amber-900/65 py-2 px-3 rounded-lg flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-400 animate-pulse">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-550 animate-spin" />
                  <span>Режим очереди активен</span>
                </div>
                <span className="font-mono font-bold bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full">
                  Ещё запущенных: {status.queuedRequestsCount}
                </span>
              </div>
            )}

            {/* Developer Live Logging Console */}
            <div className="flex-1 min-h-[220px] bg-slate-950 text-slate-200 rounded-xl border border-slate-800 p-2.5 font-mono text-[10px] flex flex-col shadow-inner overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-2">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Логгер Очереди</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="p-1 rounded text-slate-500 hover:text-slate-350 hover:bg-slate-900 cursor-pointer"
                  title="Очистить терминал"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Logs area */}
              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[300px] select-text">
                {status && status.apiLogs && status.apiLogs.length > 0 ? (
                  [...status.apiLogs].reverse().map((log) => {
                    let typeColor = 'text-blue-400';
                    if (log.type === 'warn') typeColor = 'text-amber-400';
                    if (log.type === 'error') typeColor = 'text-rose-400';
                    if (log.type === 'success') typeColor = 'text-emerald-400';
                    
                    return (
                      <div key={log.id} className="leading-relaxed hover:bg-slate-900 px-1 py-0.5 rounded transition">
                        <span className="text-slate-600 mr-1.5 select-none font-bold">[{log.timestamp}]</span>
                        <span className={`${typeColor} break-all font-semibold`}>{log.message}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-655 italic">
                    Запросы отсутствуют. Запустите генерацию!
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>

            </div>

            {/* Policy specifications */}
            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-150 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 tracking-wide uppercase block mb-1">Особенности спецификации:</span>
              <ul className="list-disc list-inside text-[8px] text-slate-500 leading-snug space-y-1 font-sans">
                <li>Сегментирование интервалов (mandatory spacing 5000мс).</li>
                <li>Jitter рандомизация для исключения коллизий API 429.</li>
                <li>Автоматический пересчет токенов через countTokens реквесты.</li>
              </ul>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
