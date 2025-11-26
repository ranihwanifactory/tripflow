import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAoXlSX5lcT_KvTBcsaWIsmJTB1ESx-6Z8",
  authDomain: "timetable-6cc8d.firebaseapp.com",
  projectId: "timetable-6cc8d",
  storageBucket: "timetable-6cc8d.firebasestorage.app",
  messagingSenderId: "79235804239",
  appId: "1:79235804239:web:62b5e87a6d47f510604e3a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);