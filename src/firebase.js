import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,,
  authDomain: "fynlo-290ae.firebaseapp.com",
  projectId: "fynlo-290ae",
  storageBucket: "fynlo-290ae.firebasestorage.app",
  messagingSenderId: "241873379567",
  appId: "1:241873379567:web:e9bb50b0e71671b8bcfb1a",
  measurementId: "G-XN1H82KM1W"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Auth helpers
export const registerUser = (email, password) => createUserWithEmailAndPassword(auth, email, password)
export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password)
export const logoutUser = () => signOut(auth)
export const onAuthChange = (cb) => onAuthStateChanged(auth, cb)

// Firestore helpers — uid se user ka apna sub-collection
export const addDocument = (uid, col, data) =>
  addDoc(collection(db, 'users', uid, col), { ...data, createdAt: new Date() })

export const getDocuments = (uid, col) =>
  getDocs(query(collection(db, 'users', uid, col), orderBy('createdAt', 'desc')))

export const updateDocument = (uid, col, id, data) =>
  updateDoc(doc(db, 'users', uid, col, id), data)

export const deleteDocument = (uid, col, id) =>
  deleteDoc(doc(db, 'users', uid, col, id))
