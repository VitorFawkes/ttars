import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Gift, User, Tag, Package, Truck, CheckCircle, Loader2, PenLine, Users, Plane, Calendar, Check, ExternalLink, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import ContactSearchInput from './ContactSearchInput'
import GiftItemPicker from '@/components/card/gifts/GiftItemPicker'
import GiftBudgetSummary from '@/components/card/gifts/GiftBudgetSummary'
import type { InventoryProduct } from '@/hooks/useInventoryProducts'
import type { PremiumGiftInput } from '@/hooks/usePremiumGifts'
import { useContactAvailableCards, type AvailableCardTraveler } from '@/hooks/useContactAvailableCards'

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
    { key: 'contato', label: 'Pessoas', icon: User },
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

const displayName = (c: SelectedContact) =>
    c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome

const formatDateRange = (start: string | null, end: string | null): string | null => {
    if (!start && !end) return null
    const parse = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00')
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    if (start && end) {
        const a = parse(start)
        const b = parse(end)
        if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
            return `${a.getDate().toString().padStart(2, '0')}–${fmt(b)}`
        }
        return `${fmt(a)} → ${fmt(b)}`
    }
    if (start) return fmt(parse(start))
    if (end) return fmt(parse(end))
    return null
}

const travelerName = (t: AvailableCardTraveler): string =>
    t.sobrenome ? `${t.nome} ${t.sobrenome}` : t.nome

export default function PremiumGiftModal({ onClose, onSubmit, isSubmitting }: PremiumGiftModalProps) {
    const [step, setStep] = useState<Step>('contato')
    const [contacts, setContacts] = useState<SelectedContact[]>([])
    /** Mapa contatoId → cardId vinculado (ou null = avulso). Default: null pra cada novo contato. */
    const [cardLinks, setCardLinks] = useState<Record<string, string | null>>({})
    const [occasion, setOccasion] = useState('')
    const [occasionDetail, setOccasionDetail] = useState('')
    const [items, setItems] = useState<KitItem[]>([])
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [deliveryDate] = useState('')
    const [deliveryMethod, setDeliveryMethod] = useState('')
    const [scheduledShipDate, setScheduledShipDate] = useState('')
    const [budget, setBudget] = useState(0)
    const [notes, setNotes] = useState('')

    // Modo histórico (backfill de presentes já enviados)
    const todayStr = new Date().toISOString().slice(0, 10)
    const [isHistorical, setIsHistorical] = useState(false)
    const [historicalShippedAt, setHistoricalShippedAt] = useState(todayStr)
    const [historicalDeliveredAt, setHistoricalDeliveredAt] = useState(todayStr)
    const historicalDatesInvalid = isHistorical && historicalDeliveredAt < historicalShippedAt

    const stepIdx = steps.findIndex(s => s.key === step)

    const totalCost = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const totalCostAll = totalCost * Math.max(contacts.length, 1)

    // Busca cards disponíveis pra cada contato selecionado
    const { data: availableCardsByContact = {}, isLoading: loadingCards } =
        useContactAvailableCards(contacts.map(c => c.id))

    const canNext = () => {
        switch (step) {
            case 'contato': return contacts.length > 0
            case 'ocasiao': return !!occasion
            case 'itens': return items.length > 0
            case 'entrega': return !historicalDatesInvalid
            case 'revisao': return !historicalDatesInvalid
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

    const addContact = (c: SelectedContact) => {
        setContacts(prev => prev.find(p => p.id === c.id) ? prev : [...prev, c])
        setCardLinks(prev => prev[c.id] !== undefined ? prev : { ...prev, [c.id]: null })
    }

    const removeContact = (id: string) => {
        setContacts(prev => prev.filter(p => p.id !== id))
        setCardLinks(prev => {
            const next = { ...prev }
            delete next[id]
            return next
        })
    }

    const setLinkForContact = (contatoId: string, cardId: string | null) => {
        setCardLinks(prev => ({ ...prev, [contatoId]: cardId }))
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
        if (contacts.length === 0) return
        if (historicalDatesInvalid) return
        const historical = isHistorical
            ? { shippedAt: historicalShippedAt, deliveredAt: historicalDeliveredAt }
            : undefined
        await onSubmit({
            recipients: contacts.map(c => ({
                contatoId: c.id,
                contatoName: displayName(c),
                cardId: cardLinks[c.id] ?? null,
            })),
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
            scheduledShipDate: historical ? undefined : (scheduledShipDate || undefined),
            budget: budget || undefined,
            notes: notes || undefined,
            historical,
        })
    }

    const linkedCount = contacts.filter(c => !!cardLinks[c.id]).length
    const avulsoCount = contacts.length - linkedCount

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
                    <div className="h-8 w-8 rounded-lg bg-pink-100 flex items-center justify-center">
                        <Gift className="h-4 w-4 text-pink-600" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Novo Presente</h2>
                        {contacts.length > 0 && (
                            <p className="text-xs text-slate-500">
                                {contacts.length} {contacts.length === 1 ? 'pessoa' : 'pessoas'}
                                {linkedCount > 0 && ` · ${linkedCount} vinculado${linkedCount > 1 ? 's' : ''} a viagem`}
                                {isHistorical && ' · histórico'}
                            </p>
                        )}
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
                    {/* Step: Pessoas */}
                    {step === 'contato' && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-slate-700 font-medium">Para quem é este presente?</p>
                                <p className="text-xs text-slate-500 mt-0.5">Você pode adicionar quantas pessoas quiser. Cada uma recebe o mesmo presente.</p>
                            </div>

                            <ContactSearchInput
                                onSelect={addContact}
                                excludeIds={contacts.map(c => c.id)}
                                placeholder="Buscar pessoa por nome, email ou telefone..."
                            />

                            {contacts.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                        <Users className="h-3.5 w-3.5" />
                                        {contacts.length} {contacts.length === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}
                                    </div>
                                    <div className="space-y-3">
                                        {contacts.map(c => {
                                            const personCards = availableCardsByContact[c.id] || []
                                            const eligibleCards = personCards.filter(card => !card.hasGift)
                                            const linkedCardId = cardLinks[c.id] ?? null
                                            const linkedCard = linkedCardId ? personCards.find(pc => pc.id === linkedCardId) : null
                                            // Co-viajantes do card vinculado que ainda não foram adicionados como recipient
                                            const suggestedTravelers: AvailableCardTraveler[] = linkedCard
                                                ? linkedCard.travelers.filter(t => !contacts.find(existing => existing.id === t.id))
                                                : []
                                            return (
                                                <div key={c.id} className="bg-indigo-50 border border-indigo-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center gap-3 px-4 py-3">
                                                        <div className="h-11 w-11 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                                            <span className="text-sm font-semibold text-indigo-700">
                                                                {`${c.nome[0] ?? ''}${c.sobrenome?.[0] ?? ''}`.toUpperCase() || '?'}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-base font-semibold text-slate-900 truncate">{displayName(c)}</p>
                                                            <p className="text-sm text-slate-500 truncate">
                                                                {[c.email, c.telefone].filter(Boolean).join(' · ') || 'Sem contato'}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => removeContact(c.id)}
                                                            className="p-2 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                                                            aria-label="Remover"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    {/* Picker de viagem (opcional) */}
                                                    <div className="px-4 pb-4 pt-2 border-t border-indigo-100/70 bg-white/50">
                                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
                                                            <Plane className="h-3.5 w-3.5" />
                                                            Vincular a uma viagem
                                                            <span className="text-slate-400 font-normal">(opcional)</span>
                                                        </div>

                                                        {loadingCards ? (
                                                            <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                Buscando viagens...
                                                            </div>
                                                        ) : eligibleCards.length === 0 ? (
                                                            <p className="text-xs text-slate-500 py-1">
                                                                Sem viagens disponíveis. Será criado como presente avulso.
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                {/* Opção "sem viagem" */}
                                                                <button
                                                                    onClick={() => setLinkForContact(c.id, null)}
                                                                    className={cn(
                                                                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors',
                                                                        linkedCardId === null
                                                                            ? 'bg-slate-100 border-slate-300'
                                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        'h-4 w-4 rounded-full border flex items-center justify-center shrink-0',
                                                                        linkedCardId === null ? 'border-slate-500 bg-slate-500' : 'border-slate-300'
                                                                    )}>
                                                                        {linkedCardId === null && <Check className="h-2.5 w-2.5 text-white" />}
                                                                    </div>
                                                                    <span className="text-sm text-slate-700 font-medium">Sem viagem (presente avulso)</span>
                                                                </button>

                                                                {/* Lista de viagens */}
                                                                {eligibleCards.map(card => {
                                                                    const isActive = linkedCardId === card.id
                                                                    const dateRange = formatDateRange(card.dataInicio, card.dataFim)
                                                                    return (
                                                                        <div
                                                                            key={card.id}
                                                                            className={cn(
                                                                                'flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors',
                                                                                isActive
                                                                                    ? 'bg-emerald-50 border-emerald-300'
                                                                                    : 'bg-white border-slate-200 hover:border-emerald-300'
                                                                            )}
                                                                        >
                                                                            <button
                                                                                onClick={() => setLinkForContact(c.id, isActive ? null : card.id)}
                                                                                className="flex items-start gap-2.5 flex-1 min-w-0 text-left"
                                                                            >
                                                                                <div className={cn(
                                                                                    'h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
                                                                                    isActive ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                                                                                )}>
                                                                                    {isActive && <Check className="h-2.5 w-2.5 text-white" />}
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className="text-sm font-medium text-slate-900 truncate">{card.titulo}</span>
                                                                                        {card.produto && (
                                                                                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                                                {card.produto}
                                                                                            </span>
                                                                                        )}
                                                                                        {card.role === 'primary' && (
                                                                                            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                                                                titular
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {(dateRange || card.travelers.length > 0) && (
                                                                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                                                                            {dateRange && (
                                                                                                <span className="flex items-center gap-1">
                                                                                                    <Calendar className="h-3 w-3" />
                                                                                                    {dateRange}
                                                                                                </span>
                                                                                            )}
                                                                                            {card.travelers.length > 0 && (
                                                                                                <span className="flex items-center gap-1">
                                                                                                    <Users className="h-3 w-3" />
                                                                                                    +{card.travelers.length} {card.travelers.length === 1 ? 'pessoa' : 'pessoas'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </button>
                                                                            <a
                                                                                href={`/cards/${card.id}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={e => e.stopPropagation()}
                                                                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                                                                                title="Abrir viagem em outra aba"
                                                                            >
                                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                                            </a>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Sugestão de co-viajantes do card vinculado */}
                                                        {linkedCard && suggestedTravelers.length > 0 && (
                                                            <div className="mt-3 pt-3 border-t border-dashed border-emerald-200">
                                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-1.5">
                                                                    <UserPlus className="h-3.5 w-3.5" />
                                                                    Adicionar outras pessoas desta viagem
                                                                </div>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {suggestedTravelers.map(t => (
                                                                        <button
                                                                            key={t.id}
                                                                            onClick={() => {
                                                                                addContact({
                                                                                    id: t.id,
                                                                                    nome: t.nome,
                                                                                    sobrenome: t.sobrenome,
                                                                                    email: t.email,
                                                                                    telefone: t.telefone,
                                                                                })
                                                                                // Auto-vincula à mesma viagem
                                                                                setLinkForContact(t.id, linkedCard.id)
                                                                            }}
                                                                            disabled={t.hasGift}
                                                                            title={t.hasGift ? 'Esta pessoa já tem presente neste card' : 'Adicionar à lista'}
                                                                            className={cn(
                                                                                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                                                                t.hasGift
                                                                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                                                                                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                                                            )}
                                                                        >
                                                                            {!t.hasGift && <UserPlus className="h-3 w-3" />}
                                                                            {travelerName(t)}
                                                                            {t.role === 'primary' && !t.hasGift && (
                                                                                <span className="text-[9px] font-medium uppercase tracking-wide text-indigo-600">titular</span>
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {(linkedCount > 0 || avulsoCount > 0) && contacts.length > 1 && (
                                        <div className="text-[11px] text-slate-500 pt-1">
                                            {linkedCount > 0 && <>📦 {linkedCount} vinculado{linkedCount > 1 ? 's' : ''} a viagem </>}
                                            {linkedCount > 0 && avulsoCount > 0 && '· '}
                                            {avulsoCount > 0 && <>🎁 {avulsoCount} avulso{avulsoCount > 1 ? 's' : ''}</>}
                                        </div>
                                    )}
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
                            <p className="text-sm text-slate-600">
                                Selecione os itens do presente
                                {contacts.length > 1 && (
                                    <span className="text-xs text-slate-400 ml-1">(estes itens serão enviados para cada uma das {contacts.length} pessoas)</span>
                                )}
                            </p>

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
                                        <span className="text-xs text-slate-500">
                                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                                            {contacts.length > 1 && ` × ${contacts.length} pessoas`}
                                        </span>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold text-slate-900">{formatBRL(totalCostAll)}</span>
                                            {contacts.length > 1 && (
                                                <p className="text-[10px] text-slate-400">{formatBRL(totalCost)} por pessoa</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Entrega */}
                    {step === 'entrega' && (
                        <div className="space-y-4">
                            {/* Toggle de modo histórico (backfill) */}
                            <div className={cn(
                                'flex items-start gap-2.5 p-3 rounded-xl border transition-colors',
                                isHistorical ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                            )}>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isHistorical}
                                    onClick={() => setIsHistorical(v => !v)}
                                    className={cn(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-0.5',
                                        isHistorical ? 'bg-emerald-600' : 'bg-slate-300'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                                            isHistorical ? 'translate-x-5' : 'translate-x-1'
                                        )}
                                    />
                                </button>
                                <div className="flex-1 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setIsHistorical(v => !v)}
                                        className="text-left w-full"
                                    >
                                        <p className="text-sm font-semibold text-slate-700">
                                            Este presente JÁ foi entregue (registro histórico)
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {isHistorical
                                                ? 'Os itens NÃO serão descontados do estoque atual e não criamos tarefa de envio.'
                                                : 'Use ao subir cards antigos pra registrar presentes que já foram enviados no passado.'}
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {isHistorical && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Quando aconteceu
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-slate-500 mb-1 block">Data de envio</label>
                                            <input
                                                type="date"
                                                value={historicalShippedAt}
                                                max={todayStr}
                                                onChange={e => setHistoricalShippedAt(e.target.value)}
                                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-500 mb-1 block">Data de entrega</label>
                                            <input
                                                type="date"
                                                value={historicalDeliveredAt}
                                                max={todayStr}
                                                onChange={e => setHistoricalDeliveredAt(e.target.value)}
                                                className={cn(
                                                    'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2',
                                                    historicalDatesInvalid
                                                        ? 'border-red-300 focus:ring-red-500'
                                                        : 'border-slate-200 focus:ring-emerald-500'
                                                )}
                                            />
                                        </div>
                                    </div>
                                    {historicalDatesInvalid && (
                                        <p className="text-[11px] text-red-600">A data de entrega não pode ser anterior à de envio.</p>
                                    )}
                                </div>
                            )}

                            <p className="text-sm text-slate-600">Informações de entrega</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Endereço</label>
                                    <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Rua, bairro, cidade..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                {!isHistorical && (
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">Data prevista de envio</label>
                                        <input type="date" value={scheduledShipDate} onChange={e => setScheduledShipDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Método</label>
                                    <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                        <option value="">Selecionar...</option>
                                        {deliveryMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Budget por pessoa (R$)</label>
                                    <input type="number" step="0.01" min="0" value={budget} onChange={e => setBudget(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Observações</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Instruções especiais..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                            </div>
                            {contacts.length > 1 && deliveryAddress && (
                                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-xs text-amber-700">
                                        ⚠️ O mesmo endereço será usado para as {contacts.length} pessoas. Se cada uma tem endereço diferente, deixe em branco e ajuste depois em cada presente.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Revisão */}
                    {step === 'revisao' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">Confira os detalhes antes de confirmar</p>

                            {/* Recipients */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                    <Users className="h-3.5 w-3.5" />
                                    {contacts.length} {contacts.length === 1 ? 'pessoa' : 'pessoas'}
                                </div>
                                <div className="space-y-1">
                                    {contacts.map(c => {
                                        const linkedCardId = cardLinks[c.id] ?? null
                                        const linkedCard = linkedCardId
                                            ? (availableCardsByContact[c.id] || []).find(card => card.id === linkedCardId)
                                            : null
                                        return (
                                            <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                                                <User className="h-4 w-4 text-slate-400 shrink-0" />
                                                <span className="text-sm font-medium text-slate-900 truncate flex-1">{displayName(c)}</span>
                                                {linkedCard ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full max-w-[180px]">
                                                        <Plane className="h-2.5 w-2.5 shrink-0" />
                                                        <span className="truncate">{linkedCard.titulo}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-medium text-slate-400 px-2 py-0.5 bg-slate-200 rounded-full">avulso</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

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

                            {contacts.length > 1 && (
                                <div className="px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                                    <p className="text-xs text-indigo-700">
                                        💡 Será criado <strong>1 presente para cada pessoa</strong> ({contacts.length} no total).
                                        Custo total: <strong>{formatBRL(totalCostAll)}</strong>
                                    </p>
                                </div>
                            )}

                            {/* Delivery */}
                            {(deliveryAddress || scheduledShipDate || deliveryMethod || isHistorical) && (
                                <div className="px-4 py-3 bg-slate-50 rounded-xl space-y-1">
                                    {deliveryAddress && <p className="text-xs text-slate-600">📍 {deliveryAddress}</p>}
                                    {!isHistorical && scheduledShipDate && <p className="text-xs text-slate-600">📅 Envio: {new Date(scheduledShipDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}
                                    {deliveryMethod && <p className="text-xs text-slate-600">🚚 {deliveryMethods.find(m => m.value === deliveryMethod)?.label}</p>}
                                    {isHistorical && (
                                        <p className="text-xs text-emerald-700">
                                            🕒 Histórico — enviado {new Date(historicalShippedAt + 'T12:00:00').toLocaleDateString('pt-BR')}, entregue {new Date(historicalDeliveredAt + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </p>
                                    )}
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
                            disabled={isSubmitting || contacts.length === 0 || items.length === 0 || historicalDatesInvalid}
                            className={cn(
                                'flex items-center gap-1.5 px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors',
                                isHistorical
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-pink-600 hover:bg-pink-700'
                            )}
                        >
                            {isSubmitting
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : isHistorical ? <Check className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                            {isHistorical
                                ? (contacts.length > 1 ? `Registrar ${contacts.length} presentes entregues` : 'Registrar presente entregue')
                                : (contacts.length > 1 ? `Criar ${contacts.length} presentes` : 'Criar presente')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
