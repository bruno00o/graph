import { createContext, useContext } from 'react'

export const PortalContainer = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainer) ?? undefined
}
