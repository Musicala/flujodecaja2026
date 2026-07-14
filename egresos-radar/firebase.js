"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { browserLocalPersistence, getAuth, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBnd0yBKhBcEyS5XX7BO6WqT9mRET1zJio",
  authDomain: "flujo-de-caja-musicala.firebaseapp.com",
  projectId: "flujo-de-caja-musicala",
  storageBucket: "flujo-de-caja-musicala.firebasestorage.app",
  messagingSenderId: "998009800481",
  appId: "1:998009800481:web:3d36e4b579417657ada060",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

await setPersistence(auth, browserLocalPersistence);
