import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
} as any);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
// Enable Google Drive file access and Google Sheets access
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
// Prioritize user's account and avoid showing "Choose your account" screen
googleProvider.setCustomParameters({
  login_hint: 'adibavtomatika@gmail.com'
});

// Cache the access token in memory and persist in localStorage to survive page refreshes
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = localStorage.getItem('google_oauth_access_token');
} catch (e) {
  console.error('[Firebase Auth] Failed to restore Google access token from localStorage:', e);
}
let isSigningIn = false;

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem('google_oauth_access_token', token);
    } else {
      localStorage.removeItem('google_oauth_access_token');
    }
  } catch (e) {
    console.error('[Firebase Auth] Failed to set Google access token in localStorage:', e);
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      setAccessToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    try {
      localStorage.removeItem('explicit_logout');
    } catch (e) {}
    setAccessToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
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

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  try {
    localStorage.setItem('explicit_logout', 'true');
  } catch (e) {
    console.error('[Firebase Auth] Failed to set explicit_logout state:', e);
  }
  await auth.signOut();
  setAccessToken(null);
};
