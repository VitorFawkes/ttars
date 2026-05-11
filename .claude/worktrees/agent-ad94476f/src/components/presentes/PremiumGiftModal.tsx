import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Gift, User, Tag, Package, Truck, CheckCircle, Loader2, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContactSearchInput from './ContactSearchInput'
import GiftItemPicker from '@/components/card/gifts/GiftItemPicker'
import GiftBudgetSummary from '@/components/card/gifts/GiftBudgetSummary'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import type { PremiumGiftInput } from '@/hooks/usePremiumGifts'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const occasionPresets = [
    { value: 'Aniversário', icon: '🎂' },
    { value: 'Fidelidade', icon: '⭐' },
    { value: 'Agradecimento', icon: '🙏' },
    { value: 'Boas-vindas', icon: '👋' },
    { value: 'Indicação', icon: '🤝' },
    { value: 'Outro', icon: '🎁' },
]

const deliveryMethods = [
    { value: 'correio', label: 'Correio' },
    { value: 'motoboy', label: 'Motoboy' },
    { value: 'consultora', label: 'Via Consultora' },
    { value: 'hotel', label: 'Hotel/Destino' },
]

interface SelectedContact {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
}

interface KitItem {
    productId: string | null
    productName: string
    customName?: string
    quantity: number
    unitPrice: number
    imagePath?: string | null
}

const steps = [
    { key: 'contato', label: 'Contato', icon: User },
    { key: 'ocasiao', label: 'Ocasião', icon: Tag },
    { key: 'itens', label: 'Itens', icon: Package },
    { key: 'entrega', label: 'Entrega', icon: Truck },
    { key: 'revisao', label: 'Revisão', icon: CheckCircle },
] as const

type Step = typeof steps[number]['key']

interface PremiumGiftModalProps {
    onClose: () => void
    onSubmit: (input: PremiumGiftInput) => Promise<void>
    isSubmitting: boolean
}

export default function PremiumGiftModal({ onClose, onSubmit, isSubmitting }: PremiumGiftModalProps) {
    const [step, setStep] = useState<Step>('contato')
    const [contact, setContact] = useState<SelectedContact | null>(null)
    const [occasion, setOccasion] = useState('')
    const [occasionDetail, setOccasionDetail] = useState('')
    const [items, setItems] = useState<KitItem[]>([])
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [deliveryDate] = useState('')
    const [deliveryMethod, setDeliveryMethod] = useState('')
    const [scheduledShipDate, setScheduledShipDate] = useState('')
    const [budget, setBudget] = useState(0)
    const [notes, setNotes] = useState('')

    const stepIdx = steps.findIndex(s => s.key === step)

    const totalCost = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

    const canNext = () => {
        switch (step) {
            case 'contato': return !!contact
            case 'ocasiao': return !!occasion
            case 'itens': return items.length > 0
            case 'entrega': return true
            case 'revisao': return true
        }
    }

    const goNext = () => {
        const idx = stepIdx + 1
        if (idx < steps.length) setStep(steps[idx].key)
    }

    const goBack = () => {
        const idx = stepIdx - 1
        if (idx >= 0) setStep(steps[idx].key)
    }

    const handleAddStock = (product: InventoryProduct, quantity: number, unitPrice: number) => {
        setItems(prev => [...prev, {
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice,
            imagePath: product.image_path,
        }])
    }

    const handleAddCustom = (name: string, unitPrice: number, quantity: number) => {
        setItems(prev => [...prev, {
            productId: null,
            productName: name,
            customName: name,
            quantity,
            unitPrice,
        }])
    }

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx))
    }

    const handleSubmit = async () => {
        if (!contact) return
        const contatoName = contact.sobrenome ? `${contact.nome} ${contact.sobrenome}` : contact.nome
        await onSubmit({
            contatoId: contact.id,
            contatoName,
            occasion,
            occasionDetail: occasionDetail || undefined,
            items: items.map(i => ({
                productId: i.productId,
                customName: i.customName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
            })),
            deliveryAddress: deliveryAddress || undefined,
            deliveryDate: deliveryDate || undefined,
            deliveryMethod: deliveryMethod || undefined,
            scheduledShipDate: scheduledShipDate || undefined,
            budget: budget || undefined,
            notes: notes || undefined,
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
                    <div className="h-8 w-8 rounded-lg bg-pink-100 flex items-center justify-center">
                        <Gift className="h-4 w-4 text-pink-600" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Novo Presente Premium</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-400" />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-1 px-6 py-3 bg-slate-50 border-b border-slate-100">
                    {steps.map((s, idx) => (
                        <div key={s.key} className="flex items-center gap-1">
                            <button
                                onClick={() => idx <= stepIdx && setStep(s.key)}
                                className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                                    idx < stepIdx && 'bg-emerald-100 text-emerald-700 cursor-pointer',
                                    idx === stepIdx && 'bg-indigo-100 text-indigo-700',
                                    idx > stepIdx && 'bg-slate-100 text-slate-400',
                                )}
                            >
                                <s.icon className="h-3 w-3" />
                                {s.label}
                            </button>
                            {idx < steps.length - 1 && (
                                <ChevronRight className={cn('h-3 w-3', idx < stepIdx ? 'text-emerald-400' : 'text-slate-300')} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* Step: Contato */}
                    {step === 'contato' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Para quem é este presente?</p>
                            <ContactSearchInput onSelect={(c) => setContact(c)} />
                            {contact && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                        <User className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-slate-900">
                                            {contact.sobrenome ? `${contact.nome} ${contact.sobrenome}` : contact.nome}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {[contact.email, contact.telefone].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <button onClick={() => setContact(null)} className="text-xs text-slate-400 hover:text-slate-600">Trocar</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Ocasião */}
                    {step === 'ocasiao' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Qual a ocasião?</p>
                            <div className="grid grid-cols-3 gap-2">
                                {occasionPresets.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setOccasion(opt.value)}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors',
                                            occasion === opt.value
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                        )}
                                    >
                                        <span>{opt.icon}</span>
                                        {opt.value}
                                    </button>
                                ))}
                            </div>
                            {occasion && (
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Detalhe (opcional)</label>
                                    <input
                                        type="text"
                                        value={occasionDetail}
                                        onChange={e => setOccasionDetail(e.target.value)}
                                        placeholder="Ex: Aniversário de 50 anos"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Itens */}
                    {step === 'itens' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Selecione os itens do presente</p>

                            <GiftItemPicker
                                onAddStock={handleAddStock}
                                onAddCustom={handleAddCustom}
                                isAdding={false}
                                existingProductIds={items.filter(i => i.productId).map(i => i.productId!)}
                            />

                            {items.length > 0 && (
                                <div className="space-y-2">
                                    {items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg">
                                            <div className="h-8 w-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                                {item.productId ? <Package className="h-4 w-4 text-slate-300" /> : <PenLine className="h-4 w-4 text-pink-400" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">{item.productName}</p>
                                                <p className="text-xs text-slate-400">{item.quantity}x {formatBRL(item.unitPrice)}</p>
                                            </div>
                                            <span className="text-sm font-medium text-slate-700 tabular-nums">{formatBRL(item.quantity * item.unitPrice)}</span>
                                            <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-lg">
                                        <span className="text-xs text-slate-500">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                                        <span className="text-sm font-semibold text-slate-900">{formatBRL(totalCost)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Entrega */}
                    {step === 'entrega' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Informações de entrega</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Endereço</label>
                                    <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Rua, bairro, cidade..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Data prevista de envio</label>
                                    <input type="date" value={scheduledShipDate} onChange={e => setScheduledShipDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Método</label>
                                    <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                        <option value="">Selecionar...</option>
                                        {deliveryMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Budget (R$)</label>
                                    <input type="number" step="0.01" min="0" value={budget} onChange={e => setBudget(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Observações</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Instruções especiais..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                            </div>
                        </div>
                    )}

                    {/* Step: Revisão */}
                    {step === 'revisao' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Confira os detalhes antes de confirmar</p>

                            {/* Contact */}
                            {contact && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span className="text-sm font-medium text-slate-900">
                                        {contact.sobrenome ? `${contact.nome} ${contact.sobrenome}` : contact.nome}
                                    </span>
                                </div>
                            )}

                            {/* Occasion */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
                                <Tag className="h-4 w-4 text-slate-400" />
                                <span className="text-sm text-slate-700">
                                    {occasion}{occasionDetail ? ` — ${occasionDetail}` : ''}
                                </span>
                            </div>

                            {/* Items */}
                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-sm">
                                        <span className="flex-1 text-slate-700">{item.productName}</span>
                                        <span className="text-slate-400">{item.quantity}x</span>
                                        <span className="font-medium text-slate-700 tabular-nums">{formatBRL(item.quantity * item.unitPrice)}</span>
                                    </div>
                                ))}
                            </div>

                            <GiftBudgetSummary totalCost={totalCost} budget={budget || null} itemCount={items.length} />

                            {/* Delivery */}
                            {(deliveryAddress || scheduledShipDate || deliveryMethod) && (
                                <div className="px-4 py-3 bg-slate-50 rounded-xl space-y-1">
                                    {deliveryAddress && <p className="text-xs text-slate-600">📍 {deliveryAddress}</p>}
                                    {scheduledShipDate && <p className="text-xs text-slate-600">📅 Envio: {new Date(scheduledShipDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
                                    {deliveryMethod && <p className="text-xs text-slate-600">🚚 {deliveryMethods.find(m => m.value === deliveryMethod)?.label}</p>}
                                </div>
                            )}

                            {notes && (
                                <div className="px-4 py-3 bg-slate-50 rounded-xl">
                                    <p className="text-xs text-slate-500 italic">{notes}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                    {stepIdx > 0 && (
                        <button onClick={goBack} className="flex items-center gap-1 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium">
                            <ChevronLeft className="h-4 w-4" />
                            Voltar
                        </button>
                    )}
                    <div className="flex-1" />

                    {step !== 'revisao' ? (
                        <button
                            onClick={goNext}
                            disabled={!canNext()}
                            className="flex items-center gap-1 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            Próximo
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !contact || items.length === 0}
                            className="flex items-center gap-1.5 px-5 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 transition-colors"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                            Criar Presente
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
