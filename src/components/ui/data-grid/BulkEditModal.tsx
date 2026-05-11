import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../dialog'
import { Button } from '../Button'
import { Label } from '../label'
import { Input } from '../Input'
import { Select } from '../Select'
import { Loader2 } from 'lucide-react'

export interface BulkEditField {
    id: string
    label: string
    type: 'text' | 'select' | 'date' | 'number'
    options?: { label: string; value: string }[]
}

interface BulkEditModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (fieldId: string, value: any) => Promise<void>
    selectedCount: number
    fields: BulkEditField[]
    title?: string
    description?: string
}

export function BulkEditModal({
    isOpen,
    onClose,
    onConfirm,
    selectedCount,
    fields,
    title = "Editar em Massa",
    description
}: BulkEditModalProps) {
    const [selectedFieldId, setSelectedFieldId] = useState<string>('')
    const [value, setValue] = useState<any>('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const selectedField = fields.find(f => f.id === selectedFieldId)

    const handleConfirm = async () => {
        if (!selectedFieldId || value === '') return

        try {
            setIsSubmitting(true)
            await onConfirm(selectedFieldId, value)
            onClose()
            // Reset state after close
            setTimeout(() => {
                setSelectedFieldId('')
                setValue('')
            }, 300)
        } catch (error) {
            console.error("Bulk edit error:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description || `Você está prestes a editar ${selectedCount} item(s). Esta ação não pode ser desfeita.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="field">Campo para editar</Label>
                        <Select
                            value={selectedFieldId}
                            onChange={(val) => {
                                setSelectedFieldId(val)
                                setValue('') // Reset value when field changes
                            }}
                            options={fields.map(f => ({ label: f.label, value: f.id }))}
                            placeholder="Selecione um campo..."
                            disabled={isSubmitting}
                        />
                    </div>

                    {selectedField && (
                        <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Label htmlFor="value">Novo valor</Label>

                            {selectedField.type === 'select' ? (
                                <Select
                                    value={value}
                                    onChange={setValue}
                                    options={selectedField.options || []}
                                    placeholder="Selecione o novo valor..."
                                    disabled={isSubmitting}
                                />
                            ) : selectedField.type === 'date' ? (
                                <Input
                                    id="value"
                                    type="date"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            ) : selectedField.type === 'number' ? (
                                <Input
                                    id="value"
                                    type="number"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            ) : (
                                <Input
                                    id="value"
                                    type="text"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    disabled={isSubmitting}
                                    placeholder={`Digite o novo ${selectedField.label.toLowerCase()}...`}
                                />
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedFieldId || value === '' || isSubmitting}
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Aplicar Alterações
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
