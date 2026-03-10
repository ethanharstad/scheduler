import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { OrgView, OrgRole } from './org.types'

interface OrgContextValue {
  org: OrgView
  userRole: OrgRole
}

export const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({
  value,
  children,
}: {
  value: OrgContextValue
  children: ReactNode
}) {
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrgContext(): OrgContextValue | null {
  return useContext(OrgContext)
}

// --- Global selected org ---

interface SelectedOrgContextValue {
  selectedOrg: { org: OrgView; userRole: OrgRole } | null
  setSelectedOrg: (value: { org: OrgView; userRole: OrgRole } | null) => void
}

const SelectedOrgContext = createContext<SelectedOrgContextValue | null>(null)

export function SelectedOrgProvider({ children }: { children: ReactNode }) {
  const [selectedOrg, setSelectedOrg] = useState<{ org: OrgView; userRole: OrgRole } | null>(null)
  return (
    <SelectedOrgContext.Provider value={{ selectedOrg, setSelectedOrg }}>
      {children}
    </SelectedOrgContext.Provider>
  )
}

export function useSelectedOrg(): SelectedOrgContextValue {
  const ctx = useContext(SelectedOrgContext)
  if (!ctx) throw new Error('useSelectedOrg must be used inside SelectedOrgProvider')
  return ctx
}
