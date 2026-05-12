import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Target, Loader2, Search, Link2, ChevronRight, Plus, Users } from 'lucide-react'
import { useListarPontuacoes, useVincularACard, type DadosLead } from '../../hooks/useSdrQualification'
import { useMeusCardsSdr } from '../../hooks/useMeusLeadsSdr'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet'
import { formatPhoneBR } from '../../utils/normalizePhone'
import { formatBRL } from '../../utils/currencyMask'
import { timeAgo } from '../../utils/timeAgo'
import { SdrQualificationSheet } from '../../components/sdr-qualification/SdrQualificationSheet'
import { NovaPontuacaoModal } from '../../components/sdr-qualification/NovaPontuacaoModal'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

type SessaoSheet = {
    qualificationId?: string | null
    cardId?: string | null
    contatoId?: string | null
    telefone?: string | null
    initialDados?: DadosLead
} | null

type Pontuacao = {
    id: string
    card_id: string | null
    card_titulo: string | null
    contato_id: string | null
    telefone: string | null
    status: string
    version: number
    dados_lead: {
        nome_casal?: string
        telefone?: string
        data_casamento?: string
        num_convidados?: number
        investimento_total?: number
    }
    scoring_inputs: Record<string, boolean>
    score_result: { score?: number; qualificado?: boolean; disqualified?: boolean }
    rules_version: string | null
    sdr_user_id: string
    sdr_nome: string | null
    notas: string | null
    finalized_at: string | null
    created_at: string
}

export default function PontuacoesPage() {
    const [onlyMine, setOnlyMine] = useState(false)
    const [search, setSearch] = useState('')
    const [sessao, setSessao] = useState<SessaoSheet>(null)
    const [vincularFor, setVincularFor] = useState<Pontuacao | null>(null)
    const [novaPontuacaoOpen, setNovaPontuacaoOpen] = useState(false)

    const filtros = useMemo(() => ({ only_mine: onlyMine, produto: 'WEDDING' }), [onlyMine])
    const { data, isLoading, error } = useListarPontuacoes(filtros)
    const { data: meusCards } = useMeusCardsSdr()
    const all = data?.pontuacoes ?? []

    // Cards sem pontuação finalizada — oportunidade pra começar
    const cardsSemPontuacao = useMemo(
        () => (meusCards ?? []).filter((c) => !c.sdr_qualification_score_latest).slice(0, 8),
        [meusCards],
    )

    const filtered = useMemo(() => {
        if (!search.trim()) return all
        const q = search.toLowerCase()
        return all.filter((p) => {
            const nome = (p.dados_lead?.nome_casal ?? '').toLowerCase()
            const card = (p.card_titulo ?? '').toLowerCase()
            const sdr = (p.sdr_nome ?? '').toLowerCase()
            const tel = (p.telefone ?? '').toLowerCase()
            return nome.includes(q) || card.includes(q) || sdr.includes(q) || tel.includes(q)
        })
    }, [all, search])

    const rascunhos = filtered.filter((p) => p.status === 'rascunho')
    const finalizadas = filtered.filter((p) => p.status === 'finalizado')
    const descartadas = filtered.filter((p) => p.status === 'descartado')

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Pontuações SDR</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Pontuações em andamento e histórico — mesma régua que a Estela.
                    </p>
                </div>
                <Button onClick={() => setNovaPontuacaoOpen(true)} className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    Nova pontuação
                </Button>
            </header>

            {/* KPIs */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Kpi label="Total" value={data.total} icon={Target} />
                    <Kpi label="Rascunhos" value={data.rascunhos} icon={Clock} color="text-amber-600" />
                    <Kpi label="Qualificadas" value={data.qualificados} icon={CheckCircle2} color="text-emerald-600" />
                    <Kpi label="Descartadas" value={data.descartados} icon={XCircle} color="text-slate-500" />
                    <Kpi label="Score médio" value={data.score_medio ?? '—'} icon={Target} />
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-end bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-slate-600 mb-1 block">Buscar</label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Nome do casal, card, SDR, telefone..."
                            className="pl-9"
                        />
                    </div>
                </div>
                <Button
                    variant={onlyMine ? 'default' : 'outline'}
                    onClick={() => setOnlyMine(!onlyMine)}
                    className="h-10"
                >
                    {onlyMine ? 'Mostrar todas' : 'Só as minhas'}
                </Button>
            </div>

            {isLoading ? (
                <div className="bg-white border border-slate-200 rounded-lg p-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            ) : error ? (
                <div className="bg-white border border-rose-200 rounded-lg p-6 text-rose-700 text-center">
                    Erro ao carregar pontuações: {(error as Error).message}
                </div>
            ) : (
                <>
                    {/* Rascunhos primeiro, em destaque */}
                    <Secao
                        titulo="Em andamento"
                        descricao="Pontuações que você ainda não registrou. Clique pra continuar onde parou."
                        items={rascunhos}
                        emptyMsg="Nenhuma pontuação em andamento."
                        destaque
                        onContinuar={(p) => setSessao({ qualificationId: p.id })}
                        onVincular={(p) => setVincularFor(p)}
                    />

                    {/* Cards no nome dela esperando primeira pontuação */}
                    {cardsSemPontuacao.length > 0 && (
                        <section>
                            <div className="mb-2">
                                <h2 className="text-sm font-semibold text-slate-900">
                                    Meus cards sem pontuação
                                    <span className="ml-2 text-xs font-normal text-slate-400">
                                        {cardsSemPontuacao.length}
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Cards de Weddings no seu nome que ainda não foram pontuados.
                                </p>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <ul className="divide-y divide-slate-100">
                                    {cardsSemPontuacao.map((c) => (
                                        <li key={c.id}>
                                            <button
                                                onClick={() => setSessao({ cardId: c.id })}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0 flex-1 flex items-center gap-3">
                                                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-slate-900 truncate">
                                                            {c.titulo}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate">
                                                            {c.pessoa_nome ?? '(sem contato)'}
                                                            {c.pessoa_telefone && ` · ${formatPhoneBR(c.pessoa_telefone)}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="shrink-0 text-xs text-indigo-600 font-medium inline-flex items-center gap-1">
                                                    Pontuar <ChevronRight className="w-3 h-3" />
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    {/* Finalizadas */}
                    <Secao
                        titulo="Finalizadas"
                        descricao="Pontuações já registradas."
                        items={finalizadas}
                        emptyMsg="Ainda não há pontuações finalizadas."
                        onContinuar={null}
                        onVincular={(p) => setVincularFor(p)}
                    />

                    {/* Descartadas — colapsado por padrão se vazio */}
                    {descartadas.length > 0 && (
                        <details className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <summary className="px-4 py-3 cursor-pointer text-sm text-slate-600 hover:bg-slate-50">
                                Descartadas ({descartadas.length})
                            </summary>
                            <Tabela items={descartadas} onContinuar={null} onVincular={null} />
                        </details>
                    )}
                </>
            )}

            {sessao && (
                <SdrQualificationSheet
                    open
                    onOpenChange={(next) => !next && setSessao(null)}
                    qualificationId={sessao.qualificationId ?? null}
                    cardId={sessao.cardId ?? null}
                    contatoId={sessao.contatoId ?? null}
                    telefone={sessao.telefone ?? null}
                    initialDados={sessao.initialDados}
                />
            )}

            {vincularFor && (
                <VincularCardSheet
                    pontuacao={vincularFor}
                    onClose={() => setVincularFor(null)}
                />
            )}

            <NovaPontuacaoModal
                open={novaPontuacaoOpen}
                onClose={() => setNovaPontuacaoOpen(false)}
                onStart={(dados) => {
                    setNovaPontuacaoOpen(false)
                    setSessao({
                        telefone: dados.telefone || null,
                        initialDados: {
                            ...(dados.nomeCasal ? { nome_casal: dados.nomeCasal } : {}),
                            ...(dados.telefone ? { telefone: dados.telefone } : {}),
                        },
                    })
                }}
            />
        </div>
    )
}

function Secao({
    titulo,
    descricao,
    items,
    emptyMsg,
    destaque,
    onContinuar,
    onVincular,
}: {
    titulo: string
    descricao: string
    items: Pontuacao[]
    emptyMsg: string
    destaque?: boolean
    onContinuar: ((p: Pontuacao) => void) | null
    onVincular: ((p: Pontuacao) => void) | null
}) {
    return (
        <section className={destaque ? '' : ''}>
            <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-900">
                    {titulo}
                    <span className="ml-2 text-xs font-normal text-slate-400">{items.length}</span>
                </h2>
                <p className="text-xs text-slate-500">{descricao}</p>
            </div>
            <div
                className={
                    'bg-white border rounded-lg overflow-hidden ' +
                    (destaque && items.length > 0 ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-200')
                }
            >
                {items.length === 0 ? (
                    <p className="p-6 text-sm text-slate-400 text-center">{emptyMsg}</p>
                ) : (
                    <Tabela items={items} onContinuar={onContinuar} onVincular={onVincular} />
                )}
            </div>
        </section>
    )
}

function Tabela({
    items,
    onContinuar,
    onVincular,
}: {
    items: Pontuacao[]
    onContinuar: ((p: Pontuacao) => void) | null
    onVincular: ((p: Pontuacao) => void) | null
}) {
    return (
        <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                    <th className="text-left p-3 font-medium">Lead</th>
                    <th className="text-left p-3 font-medium">SDR</th>
                    <th className="text-left p-3 font-medium">Score</th>
                    <th className="text-left p-3 font-medium">Card</th>
                    <th className="text-left p-3 font-medium">Quando</th>
                    <th className="text-right p-3 font-medium">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {items.map((p) => {
                    const score = p.score_result?.score ?? 0
                    const qualificado = p.score_result?.qualificado ?? false
                    const disq = p.score_result?.disqualified ?? false
                    const isDraft = p.status === 'rascunho'
                    const dataExibicao = p.finalized_at ?? p.created_at
                    const nome = p.dados_lead?.nome_casal || p.card_titulo || '(sem nome)'
                    return (
                        <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-3">
                                <div className="font-medium text-slate-900">{nome}</div>
                                <div className="text-xs text-slate-500">
                                    {p.telefone ? formatPhoneBR(p.telefone) : ''}
                                    {p.dados_lead?.investimento_total && p.dados_lead?.num_convidados && (
                                        <span className="ml-2">
                                            · {formatBRL(p.dados_lead.investimento_total)} ÷ {p.dados_lead.num_convidados} conv
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="p-3 text-slate-700">{p.sdr_nome ?? '—'}</td>
                            <td className="p-3">
                                {isDraft && score === 0 ? (
                                    <span className="text-xs text-slate-400">vazio</span>
                                ) : (
                                    <Badge
                                        className={
                                            disq
                                                ? 'bg-rose-100 text-rose-700'
                                                : qualificado
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : isDraft
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-100 text-slate-700'
                                        }
                                    >
                                        {score}
                                        {disq ? ' ✗' : qualificado ? ' ✓' : ''}
                                    </Badge>
                                )}
                            </td>
                            <td className="p-3 text-slate-700">
                                {p.card_id ? (
                                    <a href={`/cards/${p.card_id}`} className="text-indigo-600 hover:underline text-xs">
                                        {p.card_titulo ?? 'Abrir'}
                                    </a>
                                ) : (
                                    <span className="text-xs text-amber-600">sem card</span>
                                )}
                            </td>
                            <td className="p-3 text-xs text-slate-500">{timeAgo(dataExibicao)}</td>
                            <td className="p-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                    {!p.card_id && onVincular && (
                                        <button
                                            onClick={() => onVincular(p)}
                                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 transition"
                                            title="Vincular a um card existente"
                                        >
                                            <Link2 className="w-3 h-3" />
                                            Vincular
                                        </button>
                                    )}
                                    {isDraft && onContinuar && (
                                        <button
                                            onClick={() => onContinuar(p)}
                                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition"
                                        >
                                            Continuar <ChevronRight className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color?: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">{label}</span>
                <Icon className={`w-4 h-4 ${color ?? 'text-slate-400'}`} />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{value}</div>
        </div>
    )
}

type CardSugestao = {
    id: string
    titulo: string
    pessoa_nome: string | null
    pessoa_telefone: string | null
}

function VincularCardSheet({ pontuacao, onClose }: { pontuacao: Pontuacao; onClose: () => void }) {
    const vincular = useVincularACard()
    const [query, setQuery] = useState(pontuacao.telefone || pontuacao.dados_lead?.nome_casal || '')
    const [results, setResults] = useState<CardSugestao[]>([])
    const [loading, setLoading] = useState(false)

    useMemo(() => {
        let cancelled = false
        const run = async () => {
            if (!query.trim() || query.trim().length < 2) {
                setResults([])
                return
            }
            setLoading(true)
            try {
                const onlyDigits = query.replace(/\D/g, '')
                const isPhoneSearch = onlyDigits.length >= 8
                const q = supabase
                    .from('view_cards_acoes')
                    .select('id, titulo, pessoa_nome, pessoa_telefone')
                    .eq('produto', 'WEDDING')
                    .is('archived_at', null)
                    .limit(12)
                const filterStr = isPhoneSearch
                    ? `pessoa_telefone.ilike.%${onlyDigits}%,titulo.ilike.%${query}%`
                    : `titulo.ilike.%${query}%,pessoa_nome.ilike.%${query}%`
                const { data } = await q.or(filterStr)
                if (!cancelled) setResults((data ?? []) as CardSugestao[])
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        const t = setTimeout(run, 250)
        return () => {
            cancelled = true
            clearTimeout(t)
        }
    }, [query])

    return (
        <Sheet open onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <div className="px-6 pt-6 pb-3 border-b border-slate-200">
                    <SheetTitle className="text-lg font-semibold text-slate-900">Vincular a card</SheetTitle>
                    <SheetDescription className="text-sm text-slate-500 mt-1">
                        Busque por nome do casal, telefone ou título do card.
                    </SheetDescription>
                </div>
                <div className="px-6 pt-4 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar..."
                            className="pl-9"
                            autoFocus
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-2">
                    {loading ? (
                        <div className="py-8 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                    ) : results.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">
                            {query.trim().length < 2 ? 'Digite ao menos 2 caracteres.' : 'Nenhum card encontrado.'}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {results.map((c) => (
                                <li key={c.id}>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await vincular.mutateAsync({ qualificationId: pontuacao.id, cardId: c.id })
                                                toast.success('Vinculado!')
                                                onClose()
                                            } catch (err) {
                                                toast.error('Erro: ' + (err as Error).message)
                                            }
                                        }}
                                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition"
                                    >
                                        <div className="text-sm font-medium text-slate-900">{c.titulo}</div>
                                        <div className="text-xs text-slate-500">
                                            {c.pessoa_nome ?? '(sem nome)'} ·{' '}
                                            {c.pessoa_telefone ? formatPhoneBR(c.pessoa_telefone) : '(sem tel)'}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
