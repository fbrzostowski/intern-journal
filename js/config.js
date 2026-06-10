import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB8A1BfIQ5p0GpIR5Aa3v2ceHc4ysMP_o0",
  authDomain:        "dzienniczek-stazysty.firebaseapp.com",
  projectId:         "dzienniczek-stazysty",
  storageBucket:     "dzienniczek-stazysty.firebasestorage.app",
  messagingSenderId: "147014918847",
  appId:             "1:147014918847:web:ae7040ad5fd383f9ca1c0a",
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
