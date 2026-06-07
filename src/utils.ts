import { Folder, Project, TaskNode, Priority, WorkspaceState, TagCategory } from './types';

// Helper to generate UUIDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Generate the beautiful default onboarding demo workspace
export function createDemoWorkspace(): WorkspaceState {
  const folders: Folder[] = [
    {
      id: 'f-work',
      name: '📁 Рабочее пространство',
      parentId: null,
    },
    {
      id: 'f-sub-goals',
      name: '🎯 Стратегические цели',
      parentId: 'f-work',
    },
    {
      id: 'f-personal',
      name: '💡 Личное развитие',
      parentId: null,
    }
  ];

  const projects: Project[] = [
    {
      id: 'p-startup',
      name: '🚀 Запуск IT-стартапа',
      folderId: 'f-work',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p-habit',
      name: '🧘 Трекер привычек (Пример)',
      folderId: 'f-personal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  // Build task nodes for p-startup
  const pStartupNodes: TaskNode[] = [
    {
      id: 'node-root',
      projectId: 'p-startup',
      text: '🚀 Наш IT-Стартап',
      x: 0,
      y: 0,
      parentId: null,
      priority: 'high',
      tags: ['Генеральный-план', '2026'],
      notes: 'Главная цель: Выйти на первый раунд финансирования в течение 6 месяцев.\n\nКлючевые вехи:\n- Разработка MVP\n- Маркетинговая кампания\n- Оформление юридических документов',
      completed: false,
      files: [],
      color: '#6366f1', // Indigo
    },
    // Left Wing: Product & Tech
    {
      id: 'node-tech',
      projectId: 'p-startup',
      text: '⚙️ Продуктовая разработка',
      x: -280,
      y: -100,
      parentId: 'node-root',
      priority: 'urgent',
      tags: ['Разработка', 'MVP'],
      notes: 'Создание адаптивного веб-приложения на React + Vite + Tailwind CSS.',
      completed: false,
      files: [],
      color: '#3b82f6', // Blue
      dueDate: '2026-05-30',
    },
    {
      id: 'node-tech-mvp',
      projectId: 'p-startup',
      text: '📐 Проектирование MVP',
      x: -540,
      y: -180,
      parentId: 'node-tech',
      priority: 'high',
      tags: ['Тех-задание'],
      notes: 'Список базовых функций:\n1. Интерактивная интеллект-карта\n2. Управление папками и файлами\n3. Локальное автосохранение и экспорт\n4. Мобильная адаптивность',
      completed: true,
      files: [],
      color: '#3b82f6',
      dueDate: '2026-06-15',
    },
    {
      id: 'node-tech-design',
      projectId: 'p-startup',
      text: '🎨 Figma Клиентский UI',
      x: -540,
      y: -40,
      parentId: 'node-tech',
      priority: 'medium',
      tags: ['Дизайн'],
      notes: 'Спроектировать дизайн-систему: шрифты Inter и Space Grotesk, цветовая палитра Slate / Zinc c яркими контрастными акцентами для приоритетов задач.',
      completed: false,
      files: [
        {
          id: 'figma-spec',
          name: 'figma_mock_v1.png',
          type: 'image/png',
          size: 154820,
          dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%236366f1"/><text x="15" y="55" fill="white" font-family="sans-serif" font-size="12">Figma Placeholder</text></svg>'
        }
      ],
      color: '#3b82f6',
      dueDate: '2026-06-10',
    },
    // Right Wing: Marketing & PR
    {
      id: 'node-marketing',
      projectId: 'p-startup',
      text: '📣 Маркетинг и PR',
      x: 280,
      y: -100,
      parentId: 'node-root',
      priority: 'medium',
      tags: ['Трафик', 'Клиенты'],
      notes: 'Формирование лояльного комьюнити и поиск первых 1000 зарегистрированных пользователей.',
      completed: false,
      files: [],
      color: '#10b981', // Green
    },
    {
      id: 'node-marketing-sm',
      projectId: 'p-startup',
      text: '📱 Социальные сети',
      x: 540,
      y: -180,
      parentId: 'node-marketing',
      priority: 'medium',
      tags: ['SMM', 'PR'],
      notes: 'Запуск Telegram-канала, ведение блогов на VC.ru, Habr и Twitter.',
      completed: false,
      files: [],
      color: '#10b981',
    },
    {
      id: 'node-marketing-sites',
      projectId: 'p-startup',
      text: '🌐 Спец-проект Landing Page',
      x: 540,
      y: -40,
      parentId: 'node-marketing',
      priority: 'high',
      tags: ['Сайт', 'Конверсии'],
      notes: 'Запустить одностраничный лаконичный сайт со сбором листов ожидания (Waiting List).',
      completed: false,
      files: [],
      color: '#10b981',
    },
    // Bottom Left: Legal & Operations
    {
      id: 'node-legal',
      projectId: 'p-startup',
      text: '⚖️ Юридические вопросы',
      x: -240,
      y: 180,
      parentId: 'node-root',
      priority: 'low',
      tags: ['Юридическое', 'Документы'],
      notes: 'Регистрация компании, подготовка соглашения соучредителей (Founders Agreement).',
      completed: false,
      files: [],
      color: '#f59e0b', // Amber
    },
    {
      id: 'node-legal-terms',
      projectId: 'p-startup',
      text: '📄 Документ о NDA',
      x: -480,
      y: 240,
      parentId: 'node-legal',
      priority: 'low',
      tags: ['Безопасность'],
      notes: 'Разработать типовое соглашение о неразглашении конфиденциальной информации.',
      completed: true,
      files: [],
      color: '#f59e0b',
    },
    // Bottom Right: Finance & Investment
    {
      id: 'node-finance',
      projectId: 'p-startup',
      text: '💳 Инвестиции и Финансы',
      x: 240,
      y: 180,
      parentId: 'node-root',
      priority: 'high',
      tags: ['Инвесторы', 'Презентация'],
      notes: 'Сбор финансовой модели на первые 2 года и упаковка презентации.',
      completed: false,
      files: [],
      color: '#ec4899', // Pink
    },
    {
      id: 'node-finance-pitch',
      projectId: 'p-startup',
      text: '📊 Составление Pitch Deck',
      x: 480,
      y: 240,
      parentId: 'node-finance',
      priority: 'high',
      tags: ['Питч', 'Слайды'],
      notes: 'Презентация на 10 слайдов в стиле минимализма. Фокус на продуктовой проблеме, решении и метриках роста.',
      completed: false,
      files: [],
      color: '#ec4899',
    },
  ];

  // Habit tracker nodes
  const pHabitNodes: TaskNode[] = [
    {
      id: 'node-habit-root',
      projectId: 'p-habit',
      text: '🧘 Мой идеальный день',
      x: 0,
      y: 0,
      parentId: null,
      priority: 'medium',
      tags: ['Стиль-жизни'],
      notes: 'Полезные привычки для поддержания баланса работы и личного благополучия разработчика.',
      completed: false,
      files: [],
      color: '#8b5cf6', // Violet
    },
    {
      id: 'node-habit-morning',
      projectId: 'p-habit',
      text: '☀️ Утро (Концентрация)',
      x: -240,
      y: -60,
      parentId: 'node-habit-root',
      priority: 'medium',
      tags: ['Утро'],
      notes: 'Задаем правильный ритм на день.',
      completed: false,
      files: [],
      color: '#f59e0b',
    },
    {
      id: 'node-habit-morning-med',
      projectId: 'p-habit',
      text: '🧘 Медитация 10 мин',
      x: -460,
      y: -120,
      parentId: 'node-habit-morning',
      priority: 'low',
      tags: ['Осознанность'],
      notes: '',
      completed: true,
      files: [],
      color: '#f59e0b',
    },
    {
      id: 'node-habit-morning-code',
      projectId: 'p-habit',
      text: '☕ Чтение / Свои проекты',
      x: -460,
      y: 0,
      parentId: 'node-habit-morning',
      priority: 'high',
      tags: ['Фокус'],
      notes: 'Первые 1.5 часа рабочего дня — без соцсетей. Полный фокус на самых сложных концептуальных задачах.',
      completed: false,
      files: [],
      color: '#f59e0b',
    },
    {
      id: 'node-habit-evening',
      projectId: 'p-habit',
      text: '🌙 Вечер (Восстановление)',
      x: 240,
      y: 60,
      parentId: 'node-habit-root',
      priority: 'medium',
      tags: ['Сон'],
      notes: 'Мягкий офлайн-выход из цифровой рутины.',
      completed: false,
      files: [],
      color: '#ec4899',
    },
    {
      id: 'node-habit-evening-digital',
      projectId: 'p-habit',
      text: '📵 Digital Detox за 1 час до сна',
      x: 460,
      y: 120,
      parentId: 'node-habit-evening',
      priority: 'high',
      tags: ['Здоровье'],
      notes: 'Все гаджеты убираются в другую комнату. Чтение бумажной книги.',
      completed: false,
      files: [],
      color: '#ec4899',
    }
  ];

  const tagCategories: TagCategory[] = [
    {
      id: 'cat-phase',
      name: 'Этап разработки',
      color: '#f59e0b', // Amber
      tags: ['MVP', 'Разработка', 'Трафик', 'Дизайн', 'Тех-задание']
    },
    {
      id: 'cat-department',
      name: 'Отдел/Тематика',
      color: '#3b82f6', // Indigo
      tags: ['Генеральный-план', 'SMM', 'PR', 'Сайт', 'Юридическое', 'Безопасность', 'Инвесторы', 'Презентация', 'Питч', 'Слайды']
    },
    {
      id: 'cat-personal',
      name: 'Личное',
      color: '#10b981', // Emerald
      tags: ['Стиль-жизни', 'Утро', 'Осознанность', 'Фокус', 'Сон', 'Здоровье']
    }
  ];

  return {
    folders,
    projects,
    nodes: {
      'p-startup': pStartupNodes,
      'p-habit': pHabitNodes,
    },
    activeProjectId: 'p-startup',
    tagCategories
  };
}

// Global key for localStorage persistence
const STORAGE_KEY = 'task_mindmaps_state';

// Load workspace from local storage or fallback to demo
export function loadWorkspace(): WorkspaceState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized || serialized === 'null' || serialized === 'undefined') {
      const demo = createDemoWorkspace();
      saveWorkspace(demo);
      return demo;
    }
    const state = JSON.parse(serialized) as WorkspaceState;
    if (!state || typeof state !== 'object') {
      const demo = createDemoWorkspace();
      saveWorkspace(demo);
      return demo;
    }
    
    // Safety fallback in case fields are missing
    if (!state.folders) state.folders = [];
    if (!state.projects) state.projects = [];
    if (!state.nodes) state.nodes = {};
    if (!state.tagCategories || state.tagCategories.length === 0) {
      state.tagCategories = [
        {
          id: 'cat-phase',
          name: 'Этап разработки',
          color: '#f59e0b', // Amber
          tags: ['MVP', 'Разработка', 'Трафик', 'Дизайн', 'Тех-задание']
        },
        {
          id: 'cat-department',
          name: 'Отдел/Тематика',
          color: '#3b82f6', // Indigo
          tags: ['Генеральный-план', 'SMM', 'PR', 'Сайт', 'Юридическое', 'Безопасность', 'Инвесторы', 'Презентация', 'Питч', 'Слайды']
        },
        {
          id: 'cat-personal',
          name: 'Личное',
          color: '#10b981', // Emerald
          tags: ['Стиль-жизни', 'Утро', 'Осознанность', 'Фокус', 'Сон', 'Здоровье']
        }
      ];
    }
    if (!state.activeProjectId && state.projects.length > 0) {
      state.activeProjectId = state.projects[0].id;
    }
    return state;
  } catch (error) {
    console.error('Failed to load workspace, starting clean demo', error);
    return createDemoWorkspace();
  }
}

// Save workspace to local storage
export function saveWorkspace(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save workspace to localStorage:', error);
  }
}

// Sizing / connection lines calculus
export function getBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  // Center midpoints for the curved path
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(dx * 0.45, 50); // organic scaling of curvature
  
  const c1x = x1 + controlOffset * (x2 > x1 ? 1 : -1);
  const c1y = y1;
  const c2x = x2 - controlOffset * (x2 > x1 ? 1 : -1);
  const c2y = y2;
  
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

// Pretty formatting utility for file sizes
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to find all downstream descendants of a node recursively
export function getDescendants(nodeId: string, allNodes: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = [];
  const findDescendants = (parentId: string) => {
    const children = allNodes.filter(n => n.parentId === parentId);
    children.forEach(child => {
      result.push(child);
      findDescendants(child.id);
    });
  };
  findDescendants(nodeId);
  return result;
}

// Helper to calculate progress of a node based on its descendants/subtasks
export function calculateProgress(nodeId: string, allNodes: TaskNode[]): number | null {
  const descendants = getDescendants(nodeId, allNodes);
  if (descendants.length === 0) return null;
  const completedCount = descendants.filter(d => d.completed).length;
  return Math.round((completedCount / descendants.length) * 100);
}

// Function to recursively synchronize completion state of all nodes (bottom-up propagation)
export function syncCompletion(nodesList: TaskNode[]): TaskNode[] {
  let changed = true;
  let current = [...nodesList];
  let iterations = 0;

  while (changed && iterations < 8) {
    changed = false;
    current = current.map(node => {
      // Find direct children
      const children = current.filter(n => n.parentId === node.id);
      if (children.length > 0) {
        // A node/container is marked completed if and only if all its sub-elements/children are completed
        const allCompleted = children.every(c => c.completed);
        if (node.completed !== allCompleted) {
          changed = true;
          return { ...node, completed: allCompleted };
        }
      }
      return node;
    });
    iterations++;
  }
  return current;
}

// Function to toggle a node and recursively match all of its subtask descendants
export function toggleNodeAndDescendants(nodeId: string, completed: boolean, allNodes: TaskNode[]): TaskNode[] {
  const descendants = getDescendants(nodeId, allNodes);
  const idsToToggle = [nodeId, ...descendants.map(d => d.id)];
  
  return allNodes.map(n => {
    if (idsToToggle.includes(n.id)) {
      return { ...n, completed: completed };
    }
    return n;
  });
}

// Function to toggle a node's archived state and recursively match all of its subtask descendants
export function toggleNodeArchive(nodeId: string, archived: boolean, allNodes: TaskNode[]): TaskNode[] {
  const descendants = getDescendants(nodeId, allNodes);
  const idsToToggle = [nodeId, ...descendants.map(d => d.id)];
  
  return allNodes.map(n => {
    if (idsToToggle.includes(n.id)) {
      return { ...n, archived: archived };
    }
    return n;
  });
}

// Function to synthesize a dual-tone pleasant crystal chime for reminder notifications
export function playNotificationChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Create dual-tone bell play wrapper
    const playChimeTone = (time: number, freq: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      // Quick exponential volume profile to mimic a real bell strike
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(volume, time + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    };
    
    const now = ctx.currentTime;
    // Harmonious pair: D5 (587.33Hz) strike followed by high A5 (880.00Hz) strike
    playChimeTone(now, 587.33, 1.2, 0.15);
    playChimeTone(now + 0.12, 880.00, 1.4, 0.12);
  } catch (error) {
    console.warn("Chime playback was blocked or failed:", error);
  }
}


