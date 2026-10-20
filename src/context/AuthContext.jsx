import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { accDb, initDefaultAccountingData } from '../lib/accountingDb'

const AuthContext = createContext(null)

const DEFAULT_USERS = [
  {
    id: 'user-owner-1',
    name: 'A. Sharma',
    phone: '+91 98765 43210',
    role: 'owner',
    roleLabel: 'Owner · view only',
    pin: '1234',
    lastSeen: 'Last seen today, 6:48 PM',
  },
  {
    id: 'user-admin-1',
    name: 'You',
    phone: '+91 98111 22334',
    role: 'admin',
    roleLabel: 'Admin',
    pin: '8888',
    lastSeen: 'Full control',
    isSelf: true,
  },
]

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const locked = localStorage.getItem('tallyflow_locked')
    return locked !== 'true'
  })
  const [currentRole, setCurrentRole] = useState(() => {
    const saved = localStorage.getItem('tallyflow_active_role')
    return saved || 'admin'
  })
  const [activeUserName, setActiveUserName] = useState(() => {
    return localStorage.getItem('tallyflow_active_user_name') || ''
  })
  const [ownerPin, setOwnerPin] = useState('1234')
  const [adminPin, setAdminPin] = useState('8888')
  const [teamUsers, setTeamUsers] = useState(DEFAULT_USERS)
  const [shopName, setShopName] = useState('[Shop name]')
  const [ownerPermissions, setOwnerPermissions] = useState({
    sales: true,
    profit: true,
    expenses: true,
    debtors: true,
    creditors: true,
    inventory: true,
    loans: false,
  })
  const [cardOrder, setCardOrder] = useState([
    'sales', 'profit', 'expenses', 'debtors', 'creditors', 'inventory', 'loans'
  ])

  const loadSettingsFromDb = async () => {
    const settings = await accDb.settings.toArray()

    const sName = settings.find((s) => s.key === 'shop_name')?.value
    if (sName) setShopName(sName)

    const oPin = settings.find((s) => s.key === 'owner_pin')?.value
    if (oPin) setOwnerPin(oPin)

    const aPin = settings.find((s) => s.key === 'admin_pin')?.value
    if (aPin) setAdminPin(aPin)

    const savedUsers = settings.find((s) => s.key === 'team_users')?.value
    if (savedUsers) {
      try {
        const parsed = JSON.parse(savedUsers)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTeamUsers(parsed)
        }
      } catch (_) {}
    } else {
      await accDb.settings.put({ key: 'team_users', value: JSON.stringify(DEFAULT_USERS) })
    }

    const perms = settings.find((s) => s.key === 'owner_permissions')?.value
    if (perms) {
      try { setOwnerPermissions(JSON.parse(perms)) } catch (_) {}
    }

    const order = settings.find((s) => s.key === 'card_order')?.value
    if (order) {
      try { setCardOrder(JSON.parse(order)) } catch (_) {}
    }
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        await initDefaultAccountingData()
        if (active) {
          await loadSettingsFromDb()
        }
      } catch (err) {
        console.warn('Accounting DB bootstrap warning:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    const onSettingsUpdate = () => {
      loadSettingsFromDb().catch((e) => console.debug('Settings reload error:', e))
    }

    window.addEventListener('accounting-settings-updated', onSettingsUpdate)
    return () => {
      active = false
      window.removeEventListener('accounting-settings-updated', onSettingsUpdate)
    }
  }, [])

  const setRole = (role, userName = '') => {
    setCurrentRole(role)
    localStorage.setItem('tallyflow_active_role', role)
    if (userName) {
      setActiveUserName(userName)
      localStorage.setItem('tallyflow_active_user_name', userName)
    }
  }

  const unlockWithPin = (enteredPin) => {
    const cleanPin = String(enteredPin).trim()

    // Check against teamUsers first
    const matchedUser = teamUsers.find((u) => String(u.pin).trim() === cleanPin)
    if (matchedUser) {
      const targetRole = matchedUser.role === 'admin' ? 'admin' : 'owner'
      setRole(targetRole, matchedUser.name)
      setIsAuthenticated(true)
      localStorage.removeItem('tallyflow_locked')
      return { success: true, role: targetRole, user: matchedUser }
    }

    if (cleanPin === String(adminPin).trim()) {
      setRole('admin', 'You')
      setIsAuthenticated(true)
      localStorage.removeItem('tallyflow_locked')
      return { success: true, role: 'admin' }
    } else if (cleanPin === String(ownerPin).trim()) {
      setRole('owner', 'A. Sharma')
      setIsAuthenticated(true)
      localStorage.removeItem('tallyflow_locked')
      return { success: true, role: 'owner' }
    } else {
      return {
        success: false,
        error: `Incorrect 4-digit PIN. Try ${ownerPin} (Owner) or ${adminPin} (Admin).`,
      }
    }
  }

  const lockApp = () => {
    setIsAuthenticated(false)
    localStorage.setItem('tallyflow_locked', 'true')
  }

  const updateOwnerPermission = async (key, val) => {
    const updated = { ...ownerPermissions, [key]: val }
    setOwnerPermissions(updated)
    await accDb.settings.put({ key: 'owner_permissions', value: JSON.stringify(updated) })
    window.dispatchEvent(new Event('accounting-settings-updated'))
  }

  const updateCardOrder = async (newOrder) => {
    setCardOrder(newOrder)
    await accDb.settings.put({ key: 'card_order', value: JSON.stringify(newOrder) })
    window.dispatchEvent(new Event('accounting-settings-updated'))
  }

  const updateShopName = async (name) => {
    setShopName(name)
    await accDb.settings.put({ key: 'shop_name', value: name })
    window.dispatchEvent(new Event('accounting-settings-updated'))
  }

  const updatePins = async ({ newOwnerPin, newAdminPin }) => {
    let updatedUsers = [...teamUsers]
    if (newOwnerPin && newOwnerPin.length === 4) {
      setOwnerPin(newOwnerPin)
      await accDb.settings.put({ key: 'owner_pin', value: newOwnerPin })
      updatedUsers = updatedUsers.map((u) =>
        u.id === 'user-owner-1' ? { ...u, pin: newOwnerPin } : u
      )
    }
    if (newAdminPin && newAdminPin.length === 4) {
      setAdminPin(newAdminPin)
      await accDb.settings.put({ key: 'admin_pin', value: newAdminPin })
      updatedUsers = updatedUsers.map((u) =>
        u.id === 'user-admin-1' ? { ...u, pin: newAdminPin } : u
      )
    }
    setTeamUsers(updatedUsers)
    await accDb.settings.put({ key: 'team_users', value: JSON.stringify(updatedUsers) })
    window.dispatchEvent(new Event('accounting-settings-updated'))
  }

  const saveTeamUser = async (userData) => {
    const cleanRole = userData.role === 'admin' ? 'admin' : 'owner'
    const roleLabel = cleanRole === 'admin' ? 'Admin' : 'Owner · view only'
    const pin = String(userData.pin || (cleanRole === 'admin' ? adminPin : ownerPin)).slice(0, 4)

    let nextUsers
    const exists = teamUsers.some((u) => u.id === userData.id)
    if (exists) {
      nextUsers = teamUsers.map((u) =>
        u.id === userData.id
          ? {
              ...u,
              name: userData.name.trim(),
              phone: (userData.phone || '').trim(),
              role: cleanRole,
              roleLabel,
              pin,
            }
          : u
      )
    } else {
      const newUser = {
        id: `user-${Date.now()}`,
        name: userData.name.trim(),
        phone: (userData.phone || '').trim(),
        role: cleanRole,
        roleLabel,
        pin,
        lastSeen: 'Added just now',
      }
      nextUsers = [...teamUsers, newUser]
    }

    setTeamUsers(nextUsers)
    await accDb.settings.put({ key: 'team_users', value: JSON.stringify(nextUsers) })

    // If primary owner or admin pin was changed via user edit, keep in sync
    const primaryOwner = nextUsers.find((u) => u.id === 'user-owner-1')
    if (primaryOwner?.pin && primaryOwner.pin !== ownerPin) {
      setOwnerPin(primaryOwner.pin)
      await accDb.settings.put({ key: 'owner_pin', value: primaryOwner.pin })
    }
    const primaryAdmin = nextUsers.find((u) => u.id === 'user-admin-1')
    if (primaryAdmin?.pin && primaryAdmin.pin !== adminPin) {
      setAdminPin(primaryAdmin.pin)
      await accDb.settings.put({ key: 'admin_pin', value: primaryAdmin.pin })
    }

    window.dispatchEvent(new Event('accounting-settings-updated'))
    return nextUsers
  }

  const removeTeamUser = async (userId) => {
    const nextUsers = teamUsers.filter((u) => u.id !== userId)
    setTeamUsers(nextUsers)
    await accDb.settings.put({ key: 'team_users', value: JSON.stringify(nextUsers) })
    window.dispatchEvent(new Event('accounting-settings-updated'))
  }

  const value = useMemo(() => {
    const isOwner = currentRole === 'owner'
    const isAdmin = currentRole === 'admin'

    const user = isAuthenticated
      ? {
          id: isOwner ? 'owner-user' : 'admin-user',
          name: activeUserName || (isOwner ? 'A. Sharma' : 'You (Admin)'),
          role: currentRole,
        }
      : null

    return {
      isAuthenticated,
      user,
      role: currentRole,
      isAdmin,
      isOwner,
      loading,
      shopName,
      ownerPin,
      adminPin,
      teamUsers,
      ownerPermissions,
      cardOrder,
      setRole,
      unlockWithPin,
      lock: lockApp,
      signOut: lockApp,
      updateOwnerPermission,
      updateCardOrder,
      updateShopName,
      updatePins,
      saveTeamUser,
      removeTeamUser,
    }
  }, [
    isAuthenticated,
    currentRole,
    activeUserName,
    loading,
    shopName,
    ownerPin,
    adminPin,
    teamUsers,
    ownerPermissions,
    cardOrder,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
