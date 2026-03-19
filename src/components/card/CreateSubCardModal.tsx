import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Package, AlertCircle } from 'lucide-react'
import { useSubCards } from '@/hooks/useSubCards'
import { cn } from '@/lib/utils'

interface CreateSubCardModalProps {
    isOpen: boolean
    onClose: () => void
    parentCardId: string
    parentTitle: string
    parentValor?: number | null
    onCreated?: (subCardId: string) => void
}

export default function CreateSubCardModal({
    isOpen,
    onClose,
    parentCardId,
    parentTitle,
    onCreated
}: CreateSubCardModalProps) {
    const { createSubCard, isCreating } = useSubCards()

    const [formData, setFormData] = useState({
        titulo: '',
        descricao: ''
    })

    const [errors, setErrors] = useState<{ titulo?: string }>({})

    const handleSubmit = () => {
        const newErrors: typeof errors = {}
        if (!formData.titulo.trim()) {
            newErrors.titulo = 'Título é obrigatório'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        createSubCard(
            {
                parentId: parentCardId,
                titulo: formData.titulo.trim(),
                descricao: formData.descricao.trim()
            },
            {
                onSuccess: (data) => {
                    handleClose()
                    if (data.sub_card_id && onCreated) onCreated(data.sub_card_id)
                }
            }
        )
    }

    const handleClose = () => {
        setFormData({ titulo: '', descricao: '' })
        setErrors({})
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px] bg-white border-gray-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-gray-900">
                        <Package className="w-5 h-5 text-purple-500" />
                        Novo Item da Viagem
                    </DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        Vinculado a: <span className="font-medium text-gray-700">{parentTitle}</span>
                    </p>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Info Box */}
                    <div className="p-3 rounded-lg text-sm bg-purple-50 text-purple-800 border border-purple-200">
                        <p>
                            O item será criado como um novo card no Planner.
                            O valor será agregado ao card principal automaticamente quando entrar em Pós-venda.
                        </p>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Título <span className="text-red-500">*</span>
                        </label>
                        <Input
                            type="text"
                            value={formData.titulo}
                            onChange={(e) => {
                                setFormData({ ...formData, titulo: e.target.value })
                                if (errors.titulo) setErrors(prev => ({ ...prev, titulo: undefined }))
                            }}
                            placeholder="Ex: Excursão mergulho, Upgrade hotel, Transfer aeroporto"
                            className={cn(errors.titulo && 'border-red-500')}
                        />
                        {errors.titulo && (
                            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.titulo}
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descrição (opcional)
                        </label>
                        <Textarea
                            value={formData.descricao}
                            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                            placeholder="Descreva o que o cliente solicitou..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isCreating}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isCreating}
                        className="text-white bg-purple-600 hover:bg-purple-700"
                    >
                        {isCreating ? 'Criando...' : 'Criar Item'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
