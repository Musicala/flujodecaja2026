"use strict";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "./firebase.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function listenAuth(callback){
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle(){
  return signInWithPopup(auth, provider);
}

export async function logout(){
  return signOut(auth);
}

export function userAudit(user){
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    nombre: user.displayName || "",
  };
}
