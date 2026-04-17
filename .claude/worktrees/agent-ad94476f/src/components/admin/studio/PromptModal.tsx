import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../ui/dialog'
import { Input } from '../../ui/Input'
import { Button } from '../../ui/Button'

interface PromptModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (value: string) => void
    title: string
    description?: string
    placeholder?: string
    defaultValue?: string
    confirmText?: string
    cancelText?: string
    /** Validation function - return error message or empty string if valid */
    validate?: (value: string) => string
    /** Is this a destructive/delete action? */
    variant?: 'default' | 'destructive'
}

/**
 * PromptModal - Premium replacement for window.prompt()
 * 
 * Follows Glassmorphism/Vibe Design System principles.
 * Uses existing Dialog, Input, and Button components for consistency.
 */
export default function PromptModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    placeholder = '',
    defaultValue = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    validate,
    variant = 'default'
}: PromptModalProps) {
    const [value, setValue] = useState(defaultValue)
    const [error, setError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    // Reset value when modal opens with new defaultValue
    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue)
            setError('')
            // Auto-focus input after animation
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen, defaultValue])

    const handleConfirm = () => {
        const trimmedValue = value.trim()

        // Default validation: required
        if (!trimmedValue) {
            setError('Este campo é obrigatório')
            return
        }

        // Custom validation
        if (validate) {
            const validationError = validate(trimmedValue)
            if (validationError) {
                setError(validationError)
                return
            }
        }

        onConfirm(trimmedValue)
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleConfirm()
        }
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && (
                        <DialogDescription>{description}</DialogDescription>
                    )}
                </DialogHeader>

                <div className="py-4">
                    <Input
                        ref={inputRef}
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value)
                            if (error) setError('')
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className={error ? 'border-red-500 focus-visible:ring-red-500' : ''}
                    />
                    {error && (
                        <p className="mt-1.5 text-sm text-red-500 animate-in fade-in-0 slide-in-from-top-1">
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className={variant === 'destructive'
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        }
                    >
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// --- Confirm Modal (replaces window.confirm) ---

interface ConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive'
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'default'
}: ConfirmModalProps) {
    const handleConfirm = () => {
        onConfirm()
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose}>
                        {cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className={variant === 'destructive'
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        }
                    >
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
