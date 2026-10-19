import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { initDefaultAccountingData } from '../lib/accountingDb'

const AuthContext = createContext(null)
const isDevDemo = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true' && !supabaseConfigured
const demoRole = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'owner' ? 'owner' : 'admin'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profileRole, setProfileRole] = useState('owner')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function bootstrap() {
      if (isDevDemo) {
        try { await initDefaultAccountingData() } catch (error) { console.warn('Demo data initialization:', error) }
        if (active) setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      if (error) console.warn('Session lookup failed:', error.message)
      setSession(data?.session || null)
      if (data?.session?.user?.id) await fetchProfileRole(data.session.user.id)
      else { setProfileRole('owner'); setLoading(false) }
    }
    bootstrap()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user?.id) fetchProfileRole(newSession.user.id)
      else { setProfileRole('owner'); setLoading(false) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function fetchProfileRole(userId) {
    try {
      const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      // Unknown roles and failed profile reads fail closed as read-only.
      setProfileRole(!error && data?.role === 'admin' ? 'admin' : 'owner')
    } catch (error) {
      console.warn('Unable to load role; applying read-only access:', error)
      setProfileRole('owner')
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(() => {
    const user = session?.user || (isDevDemo ? { id: 'local-demo', email: 'local-demo@tallyflow.local', user_metadata: { full_name: demoRole === 'owner' ? 'Demo Owner' : 'Demo Admin' } } : null)
    const role = session ? profileRole : isDevDemo ? demoRole : 'owner'
    return {
      session, user, role, isAdmin: role === 'admin', isOwner: role !== 'admin',
      isDemo: isDevDemo, loading,
      signOut: async () => {
        if (session) await supabase.auth.signOut()
        setSession(null)
        setProfileRole('owner')
      },
    }
  }, [session, profileRole, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
