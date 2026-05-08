// frontend/src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    // --- NEW IMPORTS REQUIRED FOR FACULTY DASHBOARD ---
    collection,
    query,
    where,
    getDocs,
    addDoc,
    deleteDoc
    // --- END NEW IMPORTS ---
} from 'firebase/firestore';

// Replace the entire firebaseConfig object with your own.
const firebaseConfig = {
  apiKey: "AIzaSyCgG8Fua82F9dP60s3OM3wl-p3cBm9V6W8",
  authDomain: "placementdrive-af8a8.firebaseapp.com",
  projectId: "placementdrive-af8a8",
  storageBucket: "placementdrive-af8a8.firebasestorage.app",
  messagingSenderId: "1050256845092",
  appId: "1:1050256845092:web:381b43d3c12c2aa3f0abb1",
  measurementId: "G-YCZ25E1YGC"
};



// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export all necessary authentication and Firestore functions
export { 
    auth, 
    db, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    getDoc, 
    setDoc, 
    doc,
    // --- NEW EXPORTS ---
    collection,
    query,
    where,
    getDocs,
    addDoc,
    deleteDoc
    // --- END NEW EXPORTS ---
};
