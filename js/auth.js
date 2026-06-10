import { auth, db } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

// Zwraca rolę użytkownika ("intern" | "admin").
// Przy pierwszym logowaniu tworzy dokument z rolą "intern".
export async function getUserRole(user) {
  const ref  = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      role:      "intern",
      email:     user.email,
      name:      user.displayName,
      createdAt: serverTimestamp(),
    });
    return "intern";
  }
  return snap.data().role;
}

// Guard — wywołaj na początku każdej chronionej strony.
// requiredRole: "intern" | "admin" | null (dowolna rola)
// Zwraca Promise<{ user, role }> lub przekierowuje.
export function requireAuth(requiredRole = null) {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        window.location.href = "login.html";
        return;
      }
      const role = await getUserRole(user);
      if (requiredRole && role !== requiredRole) {
        window.location.href = role === "admin" ? "admin.html" : "index.html";
        return;
      }
      resolve({ user, role });
    });
  });
}
