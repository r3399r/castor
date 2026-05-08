'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, provider } from '@/lib/firebase'
import { apiPost } from '@/lib/api'

type AuthContextType = {
  user: User | null
  loading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    ua.includes('FBAN') ||
    ua.includes('FBAV') ||
    ua.includes('Instagram') ||
    ua.includes('Line') ||
    ua.includes('Messenger') ||
    ua.includes('Twitter') ||
    ua.includes('WhatsApp') ||
    ua.includes('Snapchat')
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let initialized = false
    const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        if (!initialized) {
          initialized = true
          const token = await firebaseUser.getIdToken()
          sessionStorage.setItem('idToken', token)
          apiPost('user/sync', {}, token).catch(console.error)
        }
      } else {
        initialized = false
        setUser(null)
        sessionStorage.removeItem('idToken')
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const login = async () => {
    if (isInAppBrowser()) {
      alert('為了安全性，Google 登入不支援 App 內建瀏覽器。請改用系統瀏覽器後再試一次，如 Chrome 或 Safari')
      return
    }
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      console.error('Login failed:', e)
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (e) {
      console.error('Logout failed:', e)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
