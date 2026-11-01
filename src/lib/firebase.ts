// Optional Firebase backend. If the VITE_FIREBASE_* env vars are present the
// app uses Firebase Auth + Firestore; otherwise the app falls back to
// localStorage and everything still works. Never throws because of missing config.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  onSnapshot,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export function isFirebaseReady(): boolean {
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function ensure() {
  if (!isFirebaseReady()) return;
  if (!app) app = getApps()[0] ?? initializeApp(cfg);
  if (!auth) auth = getAuth(app);
  if (!db) db = getFirestore(app);
}

/* ---- Auth ---- */
export function FirebaseAuth() {
  ensure();
  return auth;
}

export async function firebaseLogin(email: string, password: string): Promise<User> {
  ensure();
  if (!auth) throw new Error("Firebase configured nahi hai.");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function firebaseRegister(email: string, password: string): Promise<User> {
  ensure();
  if (!auth) throw new Error("Firebase configured nahi hai.");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function firebaseLogout() {
  ensure();
  if (auth) await fbSignOut(auth);
}

export async function firebaseGoogleLogin(): Promise<User> {
  ensure();
  if (!auth) throw new Error("Firebase configured nahi hai.");
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export function watchFirebaseAuth(cb: (user: User | null) => void): () => void {
  ensure();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

/* ---- Generic Firestore helpers (top-level collections) ---- */
export type CloudDoc = { id: string; data: Record<string, unknown> };

export function cloudSet(col: string, id: string, data: Record<string, unknown>) {
  ensure();
  if (!db) return Promise.resolve();
  return setDoc(doc(db, col, id), data);
}

export function cloudDelete(col: string, id: string) {
  ensure();
  if (!db) return Promise.resolve();
  return deleteDoc(doc(db, col, id));
}

export async function cloudGet(col: string, id: string): Promise<Record<string, unknown> | null> {
  ensure();
  if (!db) return null;
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? snap.data() : null;
}

export function cloudWatch(col: string, cb: (docs: CloudDoc[]) => void): Unsubscribe | (() => void) {
  ensure();
  if (!db) return () => {};
  return onSnapshot(collection(db, col), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
  });
}

