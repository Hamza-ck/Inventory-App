import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { initDefaultAccountingData } from '../lib/accountingDb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  // A demo role is an explicit local choice; real sessions use the role loaded from Supabase.
  const [demoRole, setDemoRoleState] = useState(() => {
    if (!import.meta.env.DEV) {
      localStorage.removeItem('tally_saas_demo_role')
      return null
    }
    const stored = localStorage.getItem('tally_saas_demo_role')
    return stored === 'admin' || stored === 'owner' ? stored : null
  })
  const [role, setRoleState] = useState('owner')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        fetchProfileRole(data.session.user.id)
      } else {
        setRoleState(demoRole || 'owner')
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        // Drop demo privileges while a real account's role is being verified.
        setDemoRoleState(null)
        localStorage.removeItem('tally_saas_demo_role')
        setRoleState('owner')
        setLoading(true)
        fetchProfileRole(newSession.user.id)
      } else {
        setRoleState('owner')
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfileRole(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      if (error) throw error
      // Unknown or missing profile roles must never grant administrator access.
      setRoleState(data?.role === 'admin' ? 'admin' : 'owner')
    } catch (err) {
      console.warn('Could not load account role; using read-only access.', err)
      setRoleState('owner')
    } finally {
      setLoading(false)
    }
  }

  // Used only by the explicit local-demo buttons on the login screen.
  async function setRole(newRole) {
    // Demo access is only available in local development and never alongside a real session.
    if (!import.meta.env.DEV || session) {
      throw new Error('Local demo mode is unavailable while signed in.')
    }
    const demoRoleValue = newRole === 'admin' ? 'admin' : 'owner'
    await initDefaultAccountingData()
    setDemoRoleState(demoRoleValue)
    setRoleState(demoRoleValue)
    localStorage.setItem('tally_saas_demo_role', demoRoleValue)
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } finally {
      setSession(null)
      setDemoRoleState(null)
      setRoleState('owner')
      localStorage.removeItem('tally_saas_demo_role')
      localStorage.removeItem('tally_saas_role')
    }
  }

  const value = {
    session,
    user: session?.user || (demoRole ? {
      id: 'local-demo-user',
      email: demoRole === 'admin' ? 'admin@demo.local' : 'owner@demo.local',
      user_metadata: { full_name: demoRole === 'admin' ? 'Demo Admin' : 'Demo Owner' },
    } : null),
    role,
    setRole,
    isAdmin: role === 'admin',
    isOwner: role === 'owner',
    isDemoMode: !session && Boolean(demoRole),
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
