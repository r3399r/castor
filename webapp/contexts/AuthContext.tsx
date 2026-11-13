'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, provider } from '@/lib/firebase'
import { apiFetch, apiPost } from '@/lib/api'
import type { PostUserSyncResponse, SubscriptionStatus } from '@/types/api'

type AuthContextType = {
  user: User | null
  loading: boolean
  /**
   * The caller's subscription, or null until sync has answered.
   *
   * Comes from the POST /user/sync response, which already carries it --
   * so entitlement costs no request of its own. null therefore means
   * "not known yet", which is not the same as "not subscribed": a gated
   * block should wait rather than flash its locked state while sync is
   * still in flight.
   *
   * Typed as sync's own shape rather than `SubscriptionStatus`, because
   * the two sources of this value do not send the same fields: sync
   * omits `autoRenew`, while `refreshSubscription` below reads
   * GET /subscription/me, which carries it. Four fields is what a
   * consumer can actually rely on. Nothing reads `autoRenew` from here
   * -- the two screens that need it fetch /subscription/me themselves,
   * because being charged again is a question about billing rather
   * than about access. Derived rather than written out, so it widens by
   * itself if sync ever starts sending the fifth field (see AGENTS.md
   * for what that would cost).
   */
  subscription: PostUserSyncResponse['subscription'] | null
  /**
   * Re-reads entitlement without signing in again.
   *
   * Sync runs once per sign-in, so without this the value above stays
   * whatever it was when the session started -- and the moment it is
   * most wrong is right after someone pays, when every gated block
   * would still show them its locked state.
   */
  refreshSubscription: () => Promise<void>
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
  const [subscription, setSubscription] = useState<
    PostUserSyncResponse['subscription'] | null
  >(null)
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
          apiPost<PostUserSyncResponse>('user/sync', {}, token)
            .then((synced) => setSubscription(synced.subscription))
            .catch(console.error)
        }
      } else {
        initialized = false
        setUser(null)
        setSubscription(null)
        sessionStorage.removeItem('idToken')
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Reads /subscription/me rather than re-running sync: sync also
  // upserts the user row, and this only needs to know what they are
  // entitled to. Returns rather than throws on failure, because the
  // caller's job (telling the user their payment went through) is not
  // the same as this one.
  const refreshSubscription = useCallback(async () => {
    if (!auth.currentUser) return
    try {
      setSubscription(await apiFetch<SubscriptionStatus>('subscription/me'))
    } catch (e) {
      console.error('Failed to refresh subscription:', e)
    }
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
    <AuthContext.Provider
      value={{ user, loading, subscription, refreshSubscription, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
