import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, memoryLocalCache } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Intercept console errors and warnings to catch Firestore quota/exhaustion issues immediately
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = function (...args) {
    const msg = args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' ');
    if (
      msg.toLowerCase().includes('quota') || 
      msg.toLowerCase().includes('exhausted') || 
      msg.toLowerCase().includes('resource-exhausted') ||
      msg.toLowerCase().includes('limit')
    ) {
      try {
        localStorage.setItem('milli_firestore_quota_exceeded', String(Date.now()));
        window.dispatchEvent(new CustomEvent('milli-quota-exceeded'));
      } catch (e) {}
    }
    origError.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args) {
    const msg = args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' ');
    if (
      msg.toLowerCase().includes('quota') || 
      msg.toLowerCase().includes('exhausted') || 
      msg.toLowerCase().includes('resource-exhausted') ||
      msg.toLowerCase().includes('limit')
    ) {
      try {
        localStorage.setItem('milli_firestore_quota_exceeded', String(Date.now()));
        window.dispatchEvent(new CustomEvent('milli-quota-exceeded'));
      } catch (e) {}
    }
    origWarn.apply(console, args);
  };
}

const app = initializeApp(firebaseConfig);

// Detect if we are in an iframe or if IndexedDB/localStorage is blocked/restricted
const shouldDisablePersistentCache = (): boolean => {
  if (typeof window === 'undefined') return true;
  
  // 1. Check if inside an iframe
  if (window.self !== window.top) {
    console.log('[Firebase Settings] Inside iframe environment. Opting for memory-only Firestore cache to avoid sandbox lock hangs.');
    return true;
  }

  // 2. Safely probe IndexedDB and localStorage
  try {
    if (!window.indexedDB) return true;
    // Attempt a dummy probe to detect SecurityError or blocking in restricted domains
    const temp = window.localStorage.getItem('__init_probe__');
    window.localStorage.setItem('__init_probe__', '1');
    window.localStorage.removeItem('__init_probe__');
  } catch (e) {
    console.warn('[Firebase Settings] Storage/IndexedDB access restricted or throws SecurityError. Opting for memory-only Firestore cache:', e);
    return true;
  }

  return false;
};

// Check if user is on a mobile device
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
};

const localCacheConfig = shouldDisablePersistentCache() || isMobileDevice()
  ? memoryLocalCache()
  : persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    });

// Configure Firestore with persistentLocalCache/memoryLocalCache for offline-first support and reducing read quota usage,
// and force long polling to bypass iframe/proxy stream network blocks
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    localCache: localCacheConfig
  } as any,
  (firebaseConfig as any).firestoreDatabaseId || '(default)'
);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
// Prioritize user's account and avoid showing "Choose your account" screen
googleProvider.setCustomParameters({
  login_hint: 'adibavtomatika@gmail.com'
});

export const initAuth = (
  onAuthSuccess?: (user: User) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Check if user is on a mobile device or if we are inside an iframe (popups often blocked)
const isMobileOrIframe = (): boolean => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isInsideIframe = window.self !== window.top;
  return isMobile || isInsideIframe;
};

export const googleSignIn = async (): Promise<{ user: User } | null> => {
  try {
    try {
      localStorage.removeItem('explicit_logout');
    } catch (e) {}

    // First, attempt signInWithPopup. This is highly reliable on both desktop and mobile
    // because it executes in the first-party context of the popup window, avoiding
    // third-party cookie restrictions on Chrome, iOS Safari, and other mobile browsers.
    try {
      console.log('[Auth] Attempting Google signInWithPopup...');
      const result = await signInWithPopup(auth, googleProvider);
      return { user: result.user };
    } catch (popupError: any) {
      // If popup fails or is blocked (e.g. by popup blockers or if inside an iframe),
      // we fall back to signInWithRedirect as the secondary mechanism.
      console.warn('[Auth] signInWithPopup failed or was blocked, trying redirect fallback...', popupError);
      
      const isInsideAnIframe = typeof window !== 'undefined' && window.self !== window.top;
      const isPopupBlocked = popupError?.code === 'auth/popup-blocked' || popupError?.code === 'auth/cancelled-popup-request';
      
      if (isInsideAnIframe || isPopupBlocked) {
        console.log('[Auth] Launching signInWithRedirect fallback...');
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw popupError;
    }
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export { getRedirectResult };

export const signInGuest = async (): Promise<User> => {
  try {
    const result = await signInAnonymously(auth);
    try {
      localStorage.removeItem('explicit_logout');
    } catch (e) {}
    return result.user;
  } catch (error) {
    console.error('Anonymous guest sign in error:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    localStorage.setItem('explicit_logout', 'true');
  } catch (e) {
    console.error('[Firebase Auth] Failed to set explicit_logout state:', e);
  }
  await auth.signOut();
};


