import { useEffect } from 'react'

type ShortcutMap = Record<string, () => void>

/**
 * useKeyboardShortcuts — Global keyboard listener
 *
 * Supports Cmd/Ctrl + key combos and standalone keys.
 * Key format: "mod+k" for Cmd+K (Mac) / Ctrl+K (Windows)
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const mod = e.metaKey || e.ctrlKey
            const shift = e.shiftKey
            const key = e.key.toLowerCase()

            // Build key combo string
            let combo = ''
            if (mod) combo += 'mod+'
            if (shift) combo += 'shift+'
            combo += key

            const handler = shortcuts[combo]
            if (handler) {
                e.preventDefault()
                handler()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [shortcuts])
}
