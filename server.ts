import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

// Transparent Google API Proxy parser to handle Google Drive and Sheets payloads securely without CORS/Sandboxing limits
app.all('/api/google-proxy', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  const targetUrl = req.headers['x-target-url'] as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing x-target-url header' });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    if (!parsedTarget.hostname.endsWith('googleapis.com')) {
      return res.status(403).json({ error: 'Only googleapis.com subdomains are allowed' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid x-target-url' });
  }

  const headers: Record<string, string> = {};
  const headersToForward = ['authorization', 'content-type', 'accept', 'range'];
  for (const h of headersToForward) {
    if (req.headers[h]) {
      headers[h] = req.headers[h] as string;
    }
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      fetchOptions.body = req.body;
    }

    const googleRes = await fetch(targetUrl, fetchOptions);
    
    // Copy headers from response
    googleRes.headers.forEach((value, name) => {
      if (name !== 'transfer-encoding' && name !== 'content-encoding') {
        res.setHeader(name, value);
      }
    });

    res.status(googleRes.status);
    const buffer = await googleRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('Proxy request to Google failed:', error);
    res.status(500).json({ error: `Proxy request failed: ${error.message || error}` });
  }
});

app.use(express.json());

// Lazy-initialized Gemini-client to avoid crashing if key is missing on startup
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY environment variable is not configured. Please add it in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Global state for Gemini API rate limiting
interface APILogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

const LIMITS = {
  maxRpm: 15, // Free tier Gemini 3.5 Flash limit
  maxTpm: 1000000,
  minDelayBetweenRequestsMs: 5000 // Mandatory 5s pause to avoid burst 429 errors
};

const queueState = {
  apiLogs: [] as APILogEntry[],
  queuedRequestsCount: 0,
  currentRpm: 0,
  currentTpm: 0,
  lastRequestTime: 0,
  recentRequests: [] as { timestamp: number; tokens: number }[]
};

function logEvent(type: 'info' | 'warn' | 'error' | 'success', message: string) {
  const entry: APILogEntry = {
    id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  };
  queueState.apiLogs.unshift(entry);
  if (queueState.apiLogs.length > 100) queueState.apiLogs.pop();
  console.log(`[Gemini Queue] [${type.toUpperCase()}] ${message}`);
}

// Function to update current TPM & RPM indicators based on a 60-second window
function updateTokensWindow() {
  const now = Date.now();
  queueState.recentRequests = queueState.recentRequests.filter(r => now - r.timestamp < 60000);
  
  const currentTokensTotal = queueState.recentRequests.reduce((sum, r) => sum + r.tokens, 0);
  queueState.currentTpm = currentTokensTotal;
  queueState.currentRpm = queueState.recentRequests.length;
  
  return currentTokensTotal;
}

// Concurrency-safe queue for processing API requests sequentionally
const requestQueue: Array<() => Promise<void>> = [];
let queueProcessing = false;

async function processQueue() {
  if (queueProcessing) return;
  queueProcessing = true;
  
  while (requestQueue.length > 0) {
    const task = requestQueue.shift()!;
    queueState.queuedRequestsCount = requestQueue.length;
    try {
      await task();
    } catch (e) {
      console.error('Error processing queued task:', e);
    }
  }
  queueState.queuedRequestsCount = 0;
  queueProcessing = false;
}

function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    queueState.queuedRequestsCount = requestQueue.length;
    processQueue();
  });
}

// ----------------- API ROUTES -----------------

// Status route for the React frontend to poll
app.get('/api/gemini/status', (req, res) => {
  updateTokensWindow();
  res.json({
    queuedRequestsCount: queueState.queuedRequestsCount,
    currentRpm: queueState.currentRpm,
    currentTpm: queueState.currentTpm,
    lastRequestTime: queueState.lastRequestTime,
    apiLogs: queueState.apiLogs,
    limits: LIMITS
  });
});

// Clear log queue route
app.post('/api/gemini/clear-logs', (req, res) => {
  queueState.apiLogs = [];
  logEvent('info', 'Консоль логов очищена пользователем.');
  res.json({ success: true });
});

// Main request proxy route
app.post('/api/gemini/generate', async (req, res) => {
  const { prompt, systemInstruction, responseMimeType, responseSchema } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Пожалуйста, укажите prompt.' });
  }

  logEvent('info', `Запрос добавлен в очередь: "${prompt.substring(0, 45)}..."`);

  try {
    const result = await enqueueRequest(async () => {
      const client = getGeminiClient();
      
      // Token management: Count tokens of the request
      let tokens = 300; // conservative default fallback
      try {
        const tokenRes = await client.models.countTokens({
          model: 'gemini-3.5-flash',
          contents: prompt
        });
        tokens = tokenRes.totalTokens || 300;
        logEvent('info', `Подсчет токенов: Запрос содержит ~${tokens} токенов.`);
      } catch (err) {
        // Fallback to characters calculation
        tokens = Math.ceil(prompt.length / 4) + 100;
        logEvent('warn', `Не удалось вызвать API подсчета токенов, используется оценка: ~${tokens} токенов.`);
      }

      // Throttle: Space out requests sequentially with min pause
      const now = Date.now();
      const timeSinceLast = now - queueState.lastRequestTime;
      if (timeSinceLast < LIMITS.minDelayBetweenRequestsMs) {
        const pauseTime = LIMITS.minDelayBetweenRequestsMs - timeSinceLast;
        logEvent('info', `Rate Limiter: Пауза ${Math.round(pauseTime)}мс для сдерживания RPM...`);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
      }

      // TPM monitoring block: If we are close or exceeds TPM limit, wait
      let currentTokensTotal = updateTokensWindow();
      while (currentTokensTotal + tokens > LIMITS.maxTpm) {
        const oldestTime = queueState.recentRequests[0]?.timestamp || Date.now();
        const waitTime = Math.max(2000, 60000 - (Date.now() - oldestTime));
        logEvent('warn', `Срабатывание Token Manager: Ожидаемый лимит TPM превышен (${currentTokensTotal + tokens} токенов). Задержка ${Math.round(waitTime / 1000)} сек...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        currentTokensTotal = updateTokensWindow();
      }

      // Exponential Backoff implementation
      let attempt = 0;
      const maxRetries = 5;
      const initialDelayMs = 2000;

      while (true) {
        try {
          queueState.lastRequestTime = Date.now();
          queueState.recentRequests.push({ timestamp: queueState.lastRequestTime, tokens });
          updateTokensWindow();

          logEvent('info', `Отправка запроса к API Gemini. Попытка ${attempt + 1}...`);
          
          const response = await client.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType,
              responseSchema
            }
          });

          logEvent('success', `Успешный ответ от Gemini. Длина ответа: ${response.text?.length || 0} символов.`);
          return {
            text: response.text,
            tokensEstimate: tokens,
            attempts: attempt + 1
          };
        } catch (error: any) {
          attempt++;
          const status = error.status || error.statusCode;
          const is429 = status === 429 || (error.message && error.message.includes('429'));
          
          logEvent('error', `Ошибка во время вызова API: ${error.message || error}`);

          if (attempt > maxRetries || !is429) {
            logEvent('error', `Запрос отклонен окончательно после ${attempt} попыток.`);
            throw error;
          }

          // delay = initialDelay * 2^(attempt - 1) + Jitter
          const exponentialDelay = initialDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 1000; // Add Jitter to prevent concurrent collisions
          const totalDelay = exponentialDelay + jitter;

          logEvent('warn', `Статус 429 Too Many Requests (RPM/TPM limit). Запуск Exponential Backoff: охлаждение ${Math.round(totalDelay)}мс перед попыткой ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Ошибка обработки запроса к Gemini API.' });
  }
});

// ----------------- VITE SERVING MIDDLEWARE -----------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
