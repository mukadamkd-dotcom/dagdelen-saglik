'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Yönetici PIN kodu — değiştirmek için aşağıdaki değeri güncelleyin
export const ADMIN_PIN = '1234'

interface ModeContextType {
  isAdminMode: boolean
  cashierLocationId: string | null
  cashierLocationName: string | null
  enterAdminMode: (pin: string) => boolean
  enterCashierMode: (locationId: string, locationName: string) => void
}

const ModeContext = createContext<ModeContextType>({
  isAdminMode: true,
  cashierLocationId: null,
  cashierLocationName: null,
  enterAdminMode: () => false,
  enterCashierMode: () => {},
})

export function ModeProvider({ children }: { children: ReactNode }) {
  const [isAdminMode, setIsAdminMode] = useState(true)
  const [cashierLocationId, setCashierLocationId] = useState<string | null>(null)
  const [cashierLocationName, setCashierLocationName] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem('dagdelen_mode') === 'cashier') {
        setIsAdminMode(false)
        setCashierLocationId(localStorage.getItem('dagdelen_loc_id'))
        setCashierLocationName(localStorage.getItem('dagdelen_loc_name'))
      }
    } catch {}
  }, [])

  function enterAdminMode(pin: string): boolean {
    if (pin === ADMIN_PIN) {
      setIsAdminMode(true)
      setCashierLocationId(null)
      setCashierLocationName(null)
      try {
        localStorage.setItem('dagdelen_mode', 'admin')
        localStorage.removeItem('dagdelen_loc_id')
        localStorage.removeItem('dagdelen_loc_name')
      } catch {}
      return true
    }
    return false
  }

  function enterCashierMode(locationId: string, locationName: string) {
    setIsAdminMode(false)
    setCashierLocationId(locationId)
    setCashierLocationName(locationName)
    try {
      localStorage.setItem('dagdelen_mode', 'cashier')
      localStorage.setItem('dagdelen_loc_id', locationId)
      localStorage.setItem('dagdelen_loc_name', locationName)
    } catch {}
  }

  return (
    <ModeContext.Provider value={{ isAdminMode, cashierLocationId, cashierLocationName, enterAdminMode, enterCashierMode }}>
      {children}
    </ModeContext.Provider>
  )
}

export const useMode = () => useContext(ModeContext)
