import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { initDefaultAccountingData, setAccountingScope, syncOutbox } from '../lib/accountingDb'

const AuthContext = createContext(null)

function companyStorageKey(userId) {
  return `tallyflow_company_${userId}`
}

function normalizeMembership(row) {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
  return {
    companyId: row.company_id,
    companyName: company?.name || 'Company',
    role: row.role === 'admin' ? 'admin' : (row.role === 'employee' ? 'employee' : 'owner'),
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [demoRole, setDemoRoleState] = useState(() => {
    if (!import.meta.env.DEV) {
      localStorage.removeItem('tally_saas_demo_role')
      return null
    }
    const stored = localStorage.getItem('tally_saas_demo_role')
    return stored === 'admin' || stored === 'owner' ? stored : null
  })
  const [role, setRoleState] = useState('owner')
  const [companyMemberships, setCompanyMemberships] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [companyName, setCompanyName] = useState('')

  async function loadCompanyMemberships(userId, preferredCompanyId = null) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('company_memberships')
        .select('company_id, role, companies(id, name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) throw error
      const memberships = (data || []).map(normalizeMembership)
      const storedCompanyId = localStorage.getItem(companyStorageKey(userId))
      const selected = memberships.find((item) => item.companyId === preferredCompanyId)
        || memberships.find((item) => item.companyId === storedCompanyId)
        || memberships[0]
        || null

      setCompanyMemberships(memberships)
      setCompanyId(selected?.companyId || null)
      setCompanyName(selected?.companyName || '')
      setRoleState(selected?.role || 'owner')
      setAccountingScope(selected?.companyId || `no-company-${userId}`)

      if (selected?.companyId) {
        localStorage.setItem(companyStorageKey(userId), selected.companyId)
        syncOutbox().catch((err) => console.warn('Initial sync check failed:', err))
      } else {
        localStorage.removeItem(companyStorageKey(userId))
      }
      return memberships
    } catch (err) {
      console.error('Could not load company memberships:', err)
      setCompanyMemberships([])
      setCompanyId(null)
      setCompanyName('')
      setRoleState('owner')
      setAccountingScope(`no-company-${userId}`)
      throw err
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let disposed = false

    async function applySession(nextSession) {
      if (disposed) return
      setSession(nextSession)
      if (nextSession) {
        setDemoRoleState(null)
        localStorage.removeItem('tally_saas_demo_role')
        setRoleState('owner')
        setLoading(true)
        try {
          await loadCompanyMemberships(nextSession.user.id)
        } catch {
          // Fail closed: ProtectedRoute directs users without a company to setup.
        }
      } else {
        setCompanyMemberships([])
        setCompanyId(null)
        setCompanyName('')
        setRoleState(demoRole || 'owner')
        if (import.meta.env.DEV && demoRole) {
          setAccountingScope('demo')
          await initDefaultAccountingData().catch((err) => console.warn('Demo data initialization failed:', err))
        } else {
          setAccountingScope('anonymous')
        }
        setLoading(false)
      }
    }

    supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession)
    })

    return () => {
      disposed = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function setRole(newRole) {
    if (!import.meta.env.DEV || session) {
      throw new Error('Local demo mode is unavailable outside development or while signed in.')
    }
    const demoRoleValue = newRole === 'admin' ? 'admin' : 'owner'
    setAccountingScope('demo')
    await initDefaultAccountingData()
    setDemoRoleState(demoRoleValue)
    setRoleState(demoRoleValue)
    setCompanyMemberships([])
    setCompanyId(null)
    setCompanyName('')
    localStorage.setItem('tally_saas_demo_role', demoRoleValue)
  }

  async function createCompany(name) {
    if (!session?.user?.id) throw new Error('Please sign in before creating a company.')
    const cleanedName = String(name || '').trim()
    if (cleanedName.length < 2 || cleanedName.length > 100) {
      throw new Error('Company name must be between 2 and 100 characters.')
    }

    const { data, error } = await supabase.rpc('create_company_for_current_user', {
      p_company_name: cleanedName,
    })
    if (error) throw error
    await loadCompanyMemberships(session.user.id, data)
    window.dispatchEvent(new Event('accounting-data-updated'))
    return data
  }

  function setActiveCompany(nextCompanyId) {
    const selected = companyMemberships.find((item) => item.companyId === nextCompanyId)
    if (!selected || !session?.user?.id) return
    setCompanyId(selected.companyId)
    setCompanyName(selected.companyName)
    setRoleState(selected.role)
    setAccountingScope(selected.companyId)
    localStorage.setItem(companyStorageKey(session.user.id), selected.companyId)
    window.dispatchEvent(new Event('accounting-data-updated'))
    syncOutbox().catch((err) => console.warn('Company sync check failed:', err))
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } finally {
      setSession(null)
      setDemoRoleState(null)
      setRoleState('owner')
      setCompanyMemberships([])
      setCompanyId(null)
      setCompanyName('')
      setAccountingScope('anonymous')
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
    isOwner: role !== 'admin',
    isDemoMode: !session && Boolean(demoRole),
    companyId,
    companyName,
    companyMemberships,
    setActiveCompany,
    createCompany,
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
