import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);
export const demoMode =
  !configured &&
  (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true");
export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null;
export const functions = app
  ? getFunctions(app, import.meta.env.VITE_FIREBASE_REGION || "asia-northeast3")
  : null;
if (import.meta.env.VITE_USE_EMULATORS === "true" && auth && db && functions) {
  connectAuthEmulator(auth, "http://127.0.0.1:9387");
  connectFirestoreEmulator(db, "127.0.0.1", 8387);
  connectFunctionsEmulator(functions, "127.0.0.1", 5387);
}
