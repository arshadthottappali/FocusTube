// ========================================
// Firebase Configuration Loader
// ========================================
// This module loads Firebase config from environment variables
// or throws an error if running without proper configuration.

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || window.__FIREBASE_CONFIG__?.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || window.__FIREBASE_CONFIG__?.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || window.__FIREBASE_CONFIG__?.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || window.__FIREBASE_CONFIG__?.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || window.__FIREBASE_CONFIG__?.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || window.__FIREBASE_CONFIG__?.appId,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || window.__FIREBASE_CONFIG__?.measurementId,
};

// Validate that Firebase config is available
const isFirebaseConfigured = Object.values(firebaseConfig).every(val => val && val.length > 0);

if (!isFirebaseConfigured) {
  console.warn(
    'ℹ️  Firebase is not configured. Cloud sync will be disabled.\n' +
    'To enable cloud sync, add your Firebase credentials:\n' +
    '  1. Create a .env file in the project root\n' +
    '  2. Copy the template from .env.example\n' +
    '  3. Add your Firebase Project values from https://console.firebase.google.com\n' +
    '  4. Restart your dev server'
  );
}

export { firebaseConfig, isFirebaseConfigured };
