import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Package, RefreshCw, AlertCircle } from 'lucide-react'
import { useSubCards, type SubCardCategory } from '@/hooks/useSubCards'
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
        descricao: '',
        category: 'addition' as SubCardCategory,
        valorEstimado: ''
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

        const parsedValor = formData.valorEstimado
            ? parseFloat(formData.valorEstimado.replace(/[^\d,.-]/g, '').replace(',', '.'))
            : 0

        createSubCard(
            {
                parentId: parentCardId,
                titulo: formData.titulo.trim(),
                descricao: formData.descricao.trim(),
                category: formData.category,
                valorEstimado: isNaN(parsedValor) ? 0 : parsedValor
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
        setFormData({ titulo: '', descricao: '', category: 'addition', valorEstimado: '' })
        setErrors({})
        onClose()
    }

    const isAddition = formData.category === 'addition'

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px] bg-white border-gray-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-gray-900">
                        {isAddition
                            ? <Package className="w-5 h-5 text-purple-500" />
                            : <RefreshCw className="w-5 h-5 text-orange-500" />
                        }
                        {isAddition ? 'Novo Produto Extra' : 'Mudança na Viagem'}
                    </DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        Vinculado a: <span className="font-medium text-gray-700">{parentTitle}</span>
                    </p>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Category Selector */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, category: 'addition' }))}
                            className={cn(
                                'p-3 rounded-lg border-2 text-left transition-colors',
                                isAddition
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-gray-200 hover:border-gray-300'
                            )}
                        >
                            <Package className={cn('w-4 h-4 mb-1', isAddition ? 'text-purple-500' : 'text-gray-400')} />
                            <p className={cn('text-sm font-medium', isAddition ? 'text-purple-900' : 'text-gray-700')}>
                                Produto Extra
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Adicionar algo novo
                            </p>
                        </button>

                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, category: 'change' }))}
                            className={cn(
                                'p-3 rounded-lg border-2 text-left transition-colors',
                                !isAddition
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-gray-200 hover:border-gray-300'
                            )}
                        >
                            <RefreshCw className={cn('w-4 h-4 mb-1', !isAddition ? 'text-orange-500' : 'text-gray-400')} />
                            <p className={cn('text-sm font-medium', !isAddition ? 'text-orange-900' : 'text-gray-700')}>
                                Mudança
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Alterar algo já comprado
                            </p>
                        </button>
                    </div>

                    {/* Info Box */}
                    <div className={cn(
                        'p-3 rounded-lg text-sm border',
                        isAddition
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-orange-50 text-orange-800 border-orange-200'
                    )}>
                        <p>
                            {isAddition
                                ? 'O produto será criado como um novo card no Planner. O valor será agregado ao card principal quando entrar em Pós-venda.'
                                : 'A mudança será criada como um card no Planner para replanejar. O Pós-venda será notificado automaticamente.'
                            }
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
                            placeholder={isAddition
                                ? 'Ex: Excursão mergulho, Transfer aeroporto'
                                : 'Ex: Trocar hotel, Alterar voo, Mudar data'
                            }
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

                    {/* Valor Estimado */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Valor estimado (opcional)
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                            <Input
                                type="text"
                                value={formData.valorEstimado}
                                onChange={(e) => setFormData({ ...formData, valorEstimado: e.target.value })}
                                placeholder="0,00"
                                className="pl-9"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isCreating}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isCreating}
                        className={cn(
                            'text-white',
                            isAddition
                                ? 'bg-purple-600 hover:bg-purple-700'
                                : 'bg-orange-600 hover:bg-orange-700'
                        )}
                    >
                        {isCreating ? 'Criando...' : isAddition ? 'Criar Produto' : 'Criar Mudança'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
