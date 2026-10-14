import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { initDefaultAccountingData } from '../lib/accountingDb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  // Role state: 'admin' (Me as an Admin - Full Data Entry) vs 'owner' (Owner - Read and Track Only)
  const [role, setRoleState] = useState(() => {
    return localStorage.getItem('tally_saas_role') || 'admin'
  })

  useEffect(() => {
    // Initialize default accounting data (ledgers, materials, debtors with UIDs, vouchers)
    initDefaultAccountingData().catch((err) => console.warn('Init DB warning:', err))

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        fetchProfileRole(data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        fetchProfileRole(newSession.user.id)
      } else {
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
      if (!error && data?.role) {
        // Map old roles if needed
        const mappedRole = data.role === 'owner' ? 'owner' : 'admin'
        setRoleState(mappedRole)
        localStorage.setItem('tally_saas_role', mappedRole)
      }
    } catch {
      // offline safe
    } finally {
      setLoading(false)
    }
  }

  function setRole(newRole) {
    setRoleState(newRole)
    localStorage.setItem('tally_saas_role', newRole)
  }

  const value = {
    session,
    user: session?.user || { id: 'local-admin', email: 'admin@tallysaas.com', user_metadata: { full_name: 'Super Admin' } },
    role,
    setRole,
    isAdmin: role === 'admin',
    isOwner: role === 'owner',
    loading,
    signOut: () => {
      supabase.auth.signOut()
      setSession(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
