import { createContext, useContext } from 'react'
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
  children: React.ReactNode
}) {
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrgContext(): OrgContextValue | null {
  return useContext(OrgContext)
}
