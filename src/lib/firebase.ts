// Pure client-side Google OAuth integration completely free of Firebase SDK dependencies.

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous?: boolean;
}

// ----------------- STATE DECLARATIONS -----------------

let authListeners: ((user: User | null, token: string | null) => void)[] = [];
let currentUser: User | null = null;
let cachedAccessToken: string | null = null;

// Load persisted session on boot
try {
  cachedAccessToken = localStorage.getItem('google_oauth_access_token');
  const savedUser = localStorage.getItem('google_user_info');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  } else {
    const guestUser = localStorage.getItem('guest_user_info');
    if (guestUser) {
      currentUser = JSON.parse(guestUser);
    }
  }
} catch (e) {
  console.error('[Auth] Failed to restore session from localStorage:', e);
}

// Dummy db exported to satisfy build signatures while excluding Firestore
export const db = null as any;

// Dummy auth object to satisfy current references to auth.currentUser
export const auth = {
  get currentUser() {
    return currentUser;
  },
  signOut: async () => {
    await logout();
  }
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem('google_oauth_access_token', token);
    } else {
      localStorage.removeItem('google_oauth_access_token');
    }
  } catch (e) {
    console.error('[Auth] Failed to set Google access token in localStorage:', e);
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

function notifyListeners() {
  authListeners.forEach(listener => {
    try {
      listener(currentUser, cachedAccessToken);
    } catch (e) {
      console.error('[Auth] Listener callback crashed:', e);
    }
  });
}

// ----------------- USER INFO RETRIEVAL -----------------

async function fetchUserInfo(accessToken: string): Promise<User> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error('Не удалось получить данные профиля Google');
  }
  const data = await res.json();
  return {
    uid: data.id,
    email: data.email || null,
    displayName: data.name || data.email?.split('@')[0] || 'Google User',
    photoURL: data.picture || null,
    isAnonymous: false
  };
}

// ----------------- API EXPORTS -----------------

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  if (currentUser) {
    if (onAuthSuccess) {
      setTimeout(() => {
        if (currentUser) onAuthSuccess(currentUser, cachedAccessToken);
      }, 0);
    }
  } else {
    if (onAuthFailure) {
      setTimeout(onAuthFailure, 0);
    }
  }

  const listener = (user: User | null, token: string | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  };

  authListeners.push(listener);
  return () => {
    authListeners = authListeners.filter(l => l !== listener);
  };
};

export const googleSignIn = async (providedClientId?: string): Promise<{ user: User; accessToken: string } | null> => {
  let cid = providedClientId || localStorage.getItem('task_sheets_client_id');
  if (!cid || !cid.trim()) {
    throw new Error('CLIENT_ID_REQUIRED');
  }
  localStorage.setItem('task_sheets_client_id', cid.trim());

  const redirectUri = window.location.origin;
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(cid.trim())}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=token&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=sheets-sync` +
    `&login_hint=${encodeURIComponent('adibavtomatika@gmail.com')}`;

  const popup = window.open(authUrl, 'GoogleSheetsAuth', 'width=600,height=620,left=150,top=100');
  if (!popup) {
    throw new Error('Блокировщик всплывающих окон не позволил открыть окно авторизации Google. Пожалуйста, разрешите всплывающие окна.');
  }

  return new Promise<{ user: User; accessToken: string } | null>((resolve, reject) => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_OAUTH_HASH') {
        const hash = event.data.hash;
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        const err = params.get('error');

        if (err) {
          reject(new Error(`Ошибка Google OAuth: ${err}`));
          cleanup();
          return;
        }

        if (token) {
          try {
            const user = await fetchUserInfo(token);
            currentUser = user;
            cachedAccessToken = token;
            localStorage.setItem('google_oauth_access_token', token);
            localStorage.setItem('google_user_info', JSON.stringify(user));
            localStorage.removeItem('explicit_logout');
            localStorage.removeItem('guest_user_info');
            notifyListeners();
            resolve({ user, accessToken: token });
          } catch (fetchErr: any) {
            reject(new Error(`Не удалось загрузить данные пользователя Google: ${fetchErr.message}`));
          }
          cleanup();
        }
      }
    };

    const checkPopupInterval = setInterval(() => {
      if (popup.closed) {
        reject(new Error('Окно авторизации закрыто пользователем.'));
        cleanup();
      }
    }, 1000);

    const cleanup = () => {
      clearInterval(checkPopupInterval);
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);
  });
};

export const signInGuest = async (): Promise<User> => {
  try {
    localStorage.removeItem('explicit_logout');
    localStorage.removeItem('google_oauth_access_token');
    localStorage.removeItem('google_user_info');
    
    const uid = 'guest_' + Math.random().toString(36).substring(2, 9);
    const guest: User = {
      uid,
      email: 'guest@local.info',
      displayName: 'Гость (Локальный)',
      photoURL: null,
      isAnonymous: true
    };
    currentUser = guest;
    cachedAccessToken = null;
    localStorage.setItem('guest_user_info', JSON.stringify(guest));
    notifyListeners();
    return guest;
  } catch (error) {
    console.error('Anonymous guest sign in error:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    localStorage.setItem('explicit_logout', 'true');
    localStorage.removeItem('google_oauth_access_token');
    localStorage.removeItem('google_user_info');
    localStorage.removeItem('guest_user_info');
  } catch (e) {
    console.error('[Auth] Failed to update logout state in localStorage:', e);
  }
  currentUser = null;
  cachedAccessToken = null;
  notifyListeners();
};
