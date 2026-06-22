import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configure Firestore with experimentalForceLongPolling for iframe sandboxes
// and persistentLocalCache for offline-first support and reducing read quota usage (Notion style)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
} as any);

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

export const googleSignIn = async (): Promise<{ user: User } | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    try {
      localStorage.removeItem('explicit_logout');
    } catch (e) {}
    return { user: result.user };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
};

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

