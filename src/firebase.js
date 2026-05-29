import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCEw2I4aQD7kMA7cuQVpQnLG4yruq6KLKo",
  authDomain: "fynlo-290ae.firebaseapp.com",
  projectId: "fynlo-290ae",
  storageBucket: "fynlo-290ae.firebasestorage.app",
  messagingSenderId: "241873379567",
  appId: "1:241873379567:web:e9bb50b0e71671b8bcfb1a",
  measurementId: "G-XN1H82KM1W"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export const addDocument = (col, data) => addDoc(collection(db, col), { ...data, createdAt: new Date() })
export const getDocuments = (col) => getDocs(query(collection(db, col), orderBy('createdAt', 'desc')))
export const updateDocument = (col, id, data) => updateDoc(doc(db, col, id), data)
export const deleteDocument = (col, id) => deleteDoc(doc(db, col, id))