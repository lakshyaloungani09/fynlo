import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthChange } from './firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out

  useEffect(() => {
    const unsub = onAuthChange(u => setUser(u))
    return unsub
  }, [])

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
