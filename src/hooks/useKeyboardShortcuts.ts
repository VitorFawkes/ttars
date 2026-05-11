import { useEffect, useCallback } from 'react'
import { useProposalBuilder } from './useProposalBuilder'
import { toast } from 'sonner'

/**
 * useKeyboardShortcuts - Global keyboard shortcuts for the builder
 * 
 * Shortcuts:
 * - ⌘/Ctrl + S: Save
 * - ⌘/Ctrl + Z: Undo (TODO)
 * - ⌘/Ctrl + Shift + Z: Redo (TODO)
 * - ⌘/Ctrl + P: Toggle Preview
 * - Escape: Deselect / Close modal
 * - Delete/Backspace: Delete selected block
 */
interface UseKeyboardShortcutsOptions {
    isPreview?: boolean
    onTogglePreview?: () => void
    onEscape?: () => void
}

export function useKeyboardShortcuts({
    isPreview = false,
    onTogglePreview,
    onEscape,
}: UseKeyboardShortcutsOptions = {}) {
    const {
        save,
        isSaving,
        isDirty,
        selectedSectionId,
        removeSection,
        selectSection,
    } = useProposalBuilder()

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
        const metaKey = isMac ? event.metaKey : event.ctrlKey

        // ⌘/Ctrl + S: Save
        if (metaKey && event.key === 's') {
            event.preventDefault()
            if (isDirty && !isSaving) {
                save()
                toast.success('Salvo!', { duration: 1500 })
            }
            return
        }

        // ⌘/Ctrl + P: Toggle Preview
        if (metaKey && event.key === 'p') {
            event.preventDefault()
            onTogglePreview?.()
            return
        }

        // Escape: Deselect or close
        if (event.key === 'Escape') {
            event.preventDefault()
            if (selectedSectionId) {
                selectSection(null)
            }
            onEscape?.()
            return
        }

        // Delete/Backspace: Delete selected block (only when not in input)
        if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSectionId) {
            const target = event.target as HTMLElement
            const isEditable = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable

            if (!isEditable) {
                event.preventDefault()
                removeSection(selectedSectionId)
                toast.info('Seção removida', { duration: 1500 })
            }
            return
        }

    }, [isDirty, isSaving, save, selectedSectionId, removeSection, selectSection, onTogglePreview, onEscape])

    useEffect(() => {
        if (isPreview) return // Disable shortcuts in preview mode

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown, isPreview])

    return null
}

export default useKeyboardShortcuts
