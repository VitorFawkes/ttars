import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface GlobalSearchContextType {
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void
}

const GlobalSearchContext = createContext<GlobalSearchContextType | null>(null)

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])
    const toggle = useCallback(() => setIsOpen(prev => !prev), [])

    // Global keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K or Ctrl+K
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                toggle()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [toggle])

    return (
        <GlobalSearchContext.Provider value={{ isOpen, open, close, toggle }}>
            {children}
        </GlobalSearchContext.Provider>
    )
}

export function useGlobalSearchContext() {
    const context = useContext(GlobalSearchContext)
    if (!context) {
        throw new Error('useGlobalSearchContext must be used within GlobalSearchProvider')
    }
    return context
}
