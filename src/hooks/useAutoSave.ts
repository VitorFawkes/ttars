import { useEffect, useRef, useCallback } from 'react'
import { useProposalBuilder } from './useProposalBuilder'
import { toast } from 'sonner'

const AUTO_SAVE_INTERVAL = 30000 // 30 seconds

export function useAutoSave() {
    const { isDirty, isSaving, save } = useProposalBuilder()
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastAutoSaveRef = useRef<Date | null>(null)

    const performAutoSave = useCallback(async () => {
        if (!isDirty || isSaving) return

        try {
            await save()
            lastAutoSaveRef.current = new Date()
            toast.success('Auto-salvamento', {
                description: 'Alterações salvas automaticamente',
                duration: 2000,
            })
        } catch (error) {
            console.error('Auto-save failed:', error)
            toast.error('Falha ao salvar automaticamente', {
                description: 'Tente salvar manualmente',
            })
        }
    }, [isDirty, isSaving, save])

    // Setup auto-save interval
    useEffect(() => {
        if (isDirty && !isSaving) {
            // Clear any existing timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }

            // Set new timeout for auto-save
            timeoutRef.current = setTimeout(performAutoSave, AUTO_SAVE_INTERVAL)
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [isDirty, isSaving, performAutoSave])

    // Prevent leaving with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault()
                e.returnValue = 'Você tem alterações não salvas. Deseja realmente sair?'
                return e.returnValue
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
        }
    }, [isDirty])

    return {
        lastAutoSave: lastAutoSaveRef.current,
        triggerAutoSave: performAutoSave,
    }
}
