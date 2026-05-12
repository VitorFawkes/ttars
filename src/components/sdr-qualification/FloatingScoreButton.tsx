import { useState } from 'react'
import { Target, ClipboardList, Users, UserPlus, Loader2, CheckCircle2, XCircle, Phone } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet'
import { Input } from '../ui/Input'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useMeusRascunhos, useMeusCardsSdr, type MeuRascunho, type MeuCardSdr } from '../../hooks/useMeusLeadsSdr'
import { SdrQualificationSheet } from './SdrQualificationSheet'
import { timeAgo } from '../../utils/timeAgo'
import { formatPhoneBR } from '../../utils/normalizePhone'

type SessaoSheet = {
    qualificationId?: string | null
    cardId?: string | null
    contatoId?: string | null
    telefone?: string | null
} | null

export function FloatingScoreButton() {
    const { product } = useCurrentProductMeta()
    const [paneOpen, setPaneOpen] = useState(false)
    const [sessao, setSessao] = useState<SessaoSheet>(null)

    if (product?.slug !== 'WEDDING') return null

    return (
        <>
            <button
                onClick={() => setPaneOpen(true)}
                className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
                title="Pontuar lead (mesma régua que a Estela)"
            >
                <Target className="h-5 w-5" />
                <span className="text-sm font-semibold">Pontuar lead</span>
            </button>

            <PainelEntrada
                open={paneOpen}
                onClose={() => setPaneOpen(false)}
                onSelectRascunho={(r) => {
                    setSessao({
                        qualificationId: r.id,
                        cardId: r.card_id,
                        contatoId: r.contato_id,
                        telefone: r.telefone_normalizado,
                    })
                    setPaneOpen(false)
                }}
                onSelectCard={(c) => {
                    setSessao({ cardId: c.id })
                    setPaneOpen(false)
                }}
                onLeadNovo={(telefone) => {
                    setSessao({ telefone: telefone || null })
                    setPaneOpen(false)
                }}
            />

            {sessao && (
                <SdrQualificationSheet
                    open
                    onOpenChange={(next) => {
                        if (!next) setSessao(null)
                    }}
                    qualificationId={sessao.qualificationId ?? null}
                    cardId={sessao.cardId ?? null}
                    contatoId={sessao.contatoId ?? null}
                    telefone={sessao.telefone ?? null}
                />
            )}
        </>
    )
}

type PainelProps = {
    open: boolean
    onClose: () => void
    onSelectRascunho: (r: MeuRascunho) => void
    onSelectCard: (c: MeuCardSdr) => void
    onLeadNovo: (telefone: string) => void
}

function PainelEntrada({ open, onClose, onSelectRascunho, onSelectCard, onLeadNovo }: PainelProps) {
    const [tab, setTab] = useState<'rascunhos' | 'cards' | 'novo'>('rascunhos')
    const [telefoneNovo, setTelefoneNovo] = useState('')
    const { data: rascunhos, isLoading: rascunhosLoading } = useMeusRascunhos()
    const { data: cards, isLoading: cardsLoading } = useMeusCardsSdr()

    const rascunhosCount = rascunhos?.length ?? 0
    const cardsCount = cards?.length ?? 0

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <div className="px-6 pt-6 pb-3 border-b border-slate-200">
                    <SheetTitle className="text-lg font-semibold text-slate-900">Pontuar lead</SheetTitle>
                    <SheetDescription className="text-sm text-slate-500 mt-1">
                        De onde você quer começar?
                    </SheetDescription>
                </div>

                <div className="flex border-b border-slate-200">
                    <TabBtn
                        active={tab === 'rascunhos'}
                        onClick={() => setTab('rascunhos')}
                        icon={ClipboardList}
                        label="Continuar"
                        count={rascunhosCount}
                    />
                    <TabBtn
                        active={tab === 'cards'}
                        onClick={() => setTab('cards')}
                        icon={Users}
                        label="Meus cards"
                        count={cardsCount}
                    />
                    <TabBtn active={tab === 'novo'} onClick={() => setTab('novo')} icon={UserPlus} label="Lead novo" />
                </div>

                <div className="flex-1 overflow-y-auto">
                    {tab === 'rascunhos' && (
                        <RascunhosTab rascunhos={rascunhos ?? []} loading={rascunhosLoading} onPick={onSelectRascunho} />
                    )}
                    {tab === 'cards' && (
                        <CardsTab cards={cards ?? []} loading={cardsLoading} onPick={onSelectCard} />
                    )}
                    {tab === 'novo' && (
                        <LeadNovoTab
                            telefone={telefoneNovo}
                            onChangeTelefone={setTelefoneNovo}
                            onSubmit={() => {
                                onLeadNovo(telefoneNovo)
                                setTelefoneNovo('')
                            }}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

function TabBtn({
    active,
    onClick,
    icon: Icon,
    label,
    count,
}: {
    active: boolean
    onClick: () => void
    icon: React.ComponentType<{ className?: string }>
    label: string
    count?: number
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition ' +
                (active
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50')
            }
        >
            <Icon className="w-4 h-4" />
            {label}
            {typeof count === 'number' && count > 0 && (
                <span
                    className={
                        'ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ' +
                        (active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700')
                    }
                >
                    {count}
                </span>
            )}
        </button>
    )
}

function RascunhosTab({
    rascunhos,
    loading,
    onPick,
}: {
    rascunhos: MeuRascunho[]
    loading: boolean
    onPick: (r: MeuRascunho) => void
}) {
    if (loading) {
        return (
            <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
        )
    }
    if (rascunhos.length === 0) {
        return (
            <div className="px-6 py-12 text-center">
                <ClipboardList className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Nenhum rascunho em andamento.</p>
                <p className="text-xs text-slate-400 mt-1">Comece pelo "Meus cards" ou "Lead novo".</p>
            </div>
        )
    }
    return (
        <ul className="divide-y divide-slate-100">
            {rascunhos.map((r) => {
                const nome = r.dados_lead?.nome_casal || r.card_titulo || '(sem nome)'
                const tel = r.dados_lead?.telefone || r.telefone_normalizado
                const score = r.score_result?.score ?? 0
                const hasScore = score > 0
                return (
                    <li key={r.id}>
                        <button
                            onClick={() => onPick(r)}
                            className="w-full text-left px-6 py-3 hover:bg-slate-50 transition flex items-start justify-between gap-3"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{nome}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                    {tel && <span>{formatPhoneBR(tel)}</span>}
                                    {tel && <span>·</span>}
                                    <span>{timeAgo(r.updated_at)}</span>
                                    {!r.card_id && (
                                        <>
                                            <span>·</span>
                                            <span className="text-amber-600">sem card</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            {hasScore ? (
                                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                                    {score} pts
                                </span>
                            ) : (
                                <span className="shrink-0 text-xs text-slate-400">vazio</span>
                            )}
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

function CardsTab({ cards, loading, onPick }: { cards: MeuCardSdr[]; loading: boolean; onPick: (c: MeuCardSdr) => void }) {
    if (loading) {
        return (
            <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
        )
    }
    if (cards.length === 0) {
        return (
            <div className="px-6 py-12 text-center">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Você não tem cards abertos no seu nome.</p>
            </div>
        )
    }
    return (
        <ul className="divide-y divide-slate-100">
            {cards.map((c) => {
                const sdr = c.sdr_qualification_score_latest
                return (
                    <li key={c.id}>
                        <button
                            onClick={() => onPick(c)}
                            className="w-full text-left px-6 py-3 hover:bg-slate-50 transition flex items-start justify-between gap-3"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 truncate">{c.titulo}</div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate">
                                    {c.pessoa_nome ?? '(sem contato)'}
                                    {c.pessoa_telefone && ` · ${formatPhoneBR(c.pessoa_telefone)}`}
                                </div>
                            </div>
                            {sdr ? (
                                <span
                                    className={
                                        'shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ' +
                                        (sdr.disqualified
                                            ? 'bg-rose-100 text-rose-700'
                                            : sdr.qualificado
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-700')
                                    }
                                >
                                    {sdr.score}
                                    {sdr.disqualified ? <XCircle className="w-3 h-3" /> : sdr.qualificado ? <CheckCircle2 className="w-3 h-3" /> : null}
                                </span>
                            ) : (
                                <span className="shrink-0 text-xs text-indigo-600 font-medium">Pontuar</span>
                            )}
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

function LeadNovoTab({
    telefone,
    onChangeTelefone,
    onSubmit,
}: {
    telefone: string
    onChangeTelefone: (s: string) => void
    onSubmit: () => void
}) {
    return (
        <div className="px-6 py-6 space-y-3">
            <div>
                <h3 className="text-sm font-semibold text-slate-900">Pontuar lead que ainda não tem card</h3>
                <p className="text-xs text-slate-500 mt-1">
                    Comece a pontuação agora; quando o card for criado depois com o mesmo telefone, ele é
                    atrelado sozinho. Você também pode atrelar manualmente a qualquer momento.
                </p>
            </div>
            <div>
                <label className="text-xs text-slate-600 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Telefone (opcional)
                </label>
                <Input
                    autoFocus
                    type="tel"
                    value={telefone}
                    onChange={(e) => onChangeTelefone(e.target.value)}
                    placeholder="(11) 99999-9999"
                />
            </div>
            <button
                type="button"
                onClick={onSubmit}
                className="w-full py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition"
            >
                Começar
            </button>
            <p className="text-[11px] text-slate-400 text-center pt-2">
                Você também pode começar sem telefone — atrele depois.
            </p>
        </div>
    )
}
