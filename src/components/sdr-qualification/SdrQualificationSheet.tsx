import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Link2, Search, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { useEstelaScoringRules, type ScoringRule } from '../../hooks/useEstelaScoringRules'
import {
    useSdrQualificationSession,
    useFinalizarPontuacao,
    useDescartarPontuacao,
    useVincularACard,
    useDesvincularDeCard,
    type DadosLead,
    type SdrScoreResult,
} from '../../hooks/useSdrQualification'
import { ProximoPassoModal } from './ProximoPassoModal'
import { PeriodoMesesPicker } from './PeriodoMesesPicker'
import { DatasExatasPicker } from './DatasExatasPicker'
import { maskBRLInput, formatBRL, parseBRLDigits } from '../../utils/currencyMask'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    qualificationId?: string | null
    contatoId?: string | null
    cardId?: string | null
    telefone?: string | null
    initialDados?: DadosLead
    onFinalized?: (result: SdrScoreResult) => void
}

type DataMode = 'exata' | 'mes_ano' | 'indefinido'

function findRule(rules: ScoringRule[], dimension: string): ScoringRule | undefined {
    return rules.find((r) => r.dimension === dimension)
}

function findRulesByGroup(rules: ScoringRule[], group: string): ScoringRule[] {
    return rules.filter((r) => r.exclusion_group === group)
}

function findRuleByType(rules: ScoringRule[], ruleType: 'disqualify' | 'qualify' | 'bonus', dimension?: string): ScoringRule | undefined {
    return rules.find((r) => r.rule_type === ruleType && (!dimension || r.dimension === dimension))
}

type ValorFaixa = { rule: ScoringRule; min: number | null; max: number | null }

function getValorFaixas(rules: ScoringRule[]): ValorFaixa[] {
    return rules
        .filter((r) => r.exclusion_group === 'valor_convidado' && typeof r.condition_value === 'object' && r.condition_value !== null)
        .map((r) => {
            const cv = r.condition_value as { min?: number; max?: number | null }
            return { rule: r, min: cv.min ?? null, max: cv.max ?? null }
        })
        .sort((a, b) => (a.min ?? 0) - (b.min ?? 0))
}

function findValorFaixaRule(rules: ScoringRule[], investimentoTotal: number, numConvidados: number): ScoringRule | null {
    if (!numConvidados || numConvidados <= 0 || !investimentoTotal) return null
    const perGuest = investimentoTotal / numConvidados
    for (const f of getValorFaixas(rules)) {
        const okMin = f.min == null || perGuest >= f.min
        const okMax = f.max == null || perGuest < f.max
        if (okMin && okMax) return f.rule
    }
    return null
}

function detectDataMode(value: string | null | undefined, meses?: string[] | null, datas?: string[] | null): DataMode {
    if (datas && datas.length > 0) return 'exata'
    if (meses && meses.length > 0) return 'mes_ano'
    if (!value) return 'exata'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'exata'
    if (/^\d{4}-\d{2}$/.test(value)) return 'mes_ano'
    if (value === 'indefinido' || value === '__indefinido__') return 'indefinido'
    return 'mes_ano'
}

export function SdrQualificationSheet({ open, onOpenChange, qualificationId, contatoId, cardId, telefone, initialDados, onFinalized }: Props) {
    const { data: scoringData, isLoading: rulesLoading } = useEstelaScoringRules()
    const finalizar = useFinalizarPontuacao()
    const descartar = useDescartarPontuacao()
    const vincular = useVincularACard()
    const desvincular = useDesvincularDeCard()
    const [showProximoPasso, setShowProximoPasso] = useState(false)
    const [finalizedScore, setFinalizedScore] = useState<SdrScoreResult | null>(null)
    const [investimentoText, setInvestimentoText] = useState('')
    const [dataMode, setDataMode] = useState<DataMode>('exata')
    const [showVincular, setShowVincular] = useState(false)

    const session = useSdrQualificationSession({
        qualificationId: qualificationId ?? null,
        contatoId: contatoId ?? null,
        cardId: cardId ?? null,
        telefone: telefone ?? null,
    })

    useEffect(() => {
        if (initialDados && session.qualificationId) {
            session.setDados({ ...session.dadosLead, ...initialDados })
            if (initialDados.investimento_total) {
                setInvestimentoText(formatBRL(initialDados.investimento_total))
            }
            if (initialDados.data_casamento || (initialDados.data_casamento_meses && initialDados.data_casamento_meses.length > 0) || (initialDados.data_casamento_datas && initialDados.data_casamento_datas.length > 0)) {
                setDataMode(detectDataMode(initialDados.data_casamento, initialDados.data_casamento_meses, initialDados.data_casamento_datas))
            }
        } else if (session.qualificationId && session.dadosLead) {
            // Quando retoma rascunho, popula state local visual (mascara R$, modo data)
            if (session.dadosLead.investimento_total) {
                setInvestimentoText(formatBRL(session.dadosLead.investimento_total))
            }
            if (session.dadosLead.data_casamento || (session.dadosLead.data_casamento_meses && session.dadosLead.data_casamento_meses.length > 0) || (session.dadosLead.data_casamento_datas && session.dadosLead.data_casamento_datas.length > 0)) {
                setDataMode(detectDataMode(session.dadosLead.data_casamento, session.dadosLead.data_casamento_meses, session.dadosLead.data_casamento_datas))
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.qualificationId])

    const rules = scoringData?.rules ?? []
    const config = scoringData?.config
    const scoreResult = session.scoreResult
    const score = scoreResult?.score ?? 0
    const threshold = scoreResult?.threshold ?? config?.threshold_qualify ?? 25
    const qualificado = scoreResult?.qualificado ?? false
    const disqualified = scoreResult?.disqualified ?? false

    const destinosSelecionados = useMemo(() => {
        const catalogo = findRulesByGroup(rules, 'destino')
            .filter((r) => session.scoringInputs[r.id] === true)
            .map((r) => r.id)
        return new Set(catalogo)
    }, [rules, session.scoringInputs])

    const outroDestinoMode: 'nenhum' | 'com_flex' | 'sem_flex' = useMemo(() => {
        const disqualifyRule = findRuleByType(rules, 'disqualify', 'destino_fora_catalogo_sem_flex')
        if (disqualifyRule && session.scoringInputs[disqualifyRule.id] === true) return 'sem_flex'
        if (session.scoringInputs['__outro_destino__'] === true) return 'com_flex'
        return 'nenhum'
    }, [rules, session.scoringInputs])

    const toggleDestinoCatalogo = (ruleId: string) => {
        const next: Record<string, boolean> = { ...session.scoringInputs }
        if (next[ruleId] === true) {
            delete next[ruleId]
        } else {
            // Marcar destino do catálogo desativa "sem_flex" (mutuamente exclusivos)
            const disqualifyRule = findRuleByType(rules, 'disqualify', 'destino_fora_catalogo_sem_flex')
            if (disqualifyRule) delete next[disqualifyRule.id]
            next[ruleId] = true
        }
        session.setInputs(next)
    }

    const setOutroDestino = (mode: 'nenhum' | 'com_flex' | 'sem_flex') => {
        const next: Record<string, boolean> = { ...session.scoringInputs }
        const disqualifyRule = findRuleByType(rules, 'disqualify', 'destino_fora_catalogo_sem_flex')
        if (disqualifyRule) delete next[disqualifyRule.id]
        delete next['__outro_destino__']

        if (mode === 'com_flex') {
            next['__outro_destino__'] = true
        } else if (mode === 'sem_flex') {
            // sem_flex desqualifica e desmarca destinos do catálogo
            for (const r of findRulesByGroup(rules, 'destino')) delete next[r.id]
            if (disqualifyRule) next[disqualifyRule.id] = true
        }
        session.setInputs(next)
    }

    const handleSinal = (rule: ScoringRule, value: boolean) => {
        const next = { ...session.scoringInputs }
        if (value) next[rule.id] = true
        else delete next[rule.id]
        session.setInputs(next)
    }

    const handleSubjetivo = (rule: ScoringRule, valor: 'sim' | 'nao' | 'pendente') => {
        const next = { ...session.scoringInputs }
        if (valor === 'sim') next[rule.id] = true
        else delete next[rule.id]
        session.setInputs(next)
    }

    const aplicarValorConvidado = (dados: DadosLead) => {
        const next = { ...session.scoringInputs }
        for (const r of findRulesByGroup(rules, 'valor_convidado')) delete next[r.id]
        const faixa = findValorFaixaRule(
            rules,
            dados.investimento_total ?? 0,
            dados.num_convidados ?? 0,
        )
        if (faixa) next[faixa.id] = true
        session.setInputs(next)
    }

    const handleDadoChange = (campo: keyof DadosLead, valor: string | number | boolean | undefined) => {
        const newDados = { ...session.dadosLead, [campo]: valor }
        session.setDados(newDados)
        if (campo === 'investimento_total' || campo === 'num_convidados') {
            aplicarValorConvidado(newDados)
        }
    }

    const handleInvestimentoInput = (raw: string) => {
        const masked = maskBRLInput(raw)
        setInvestimentoText(masked)
        const numericValue = parseBRLDigits(raw)
        handleDadoChange('investimento_total', numericValue > 0 ? numericValue : undefined)
    }

    const handleFinalizar = async () => {
        if (!session.qualificationId) return
        try {
            await session.flush()
            const res = await finalizar.mutateAsync({ id: session.qualificationId })
            setFinalizedScore(res.score_result)
            setShowProximoPasso(true)
            onFinalized?.(res.score_result)
            toast.success('Pontuação registrada')
        } catch (err) {
            toast.error('Erro ao registrar: ' + (err as Error).message)
        }
    }

    const handleClose = async (next: boolean) => {
        if (!next && session.dirty && session.qualificationId) {
            const ok = window.confirm('Você tem alterações não registradas. Descartar?')
            if (!ok) return
            try {
                await descartar.mutateAsync(session.qualificationId)
            } catch {
                // ignora
            }
        }
        onOpenChange(next)
    }

    const closeProximoPasso = () => {
        setShowProximoPasso(false)
        onOpenChange(false)
    }

    const destinoRules = findRulesByGroup(rules, 'destino').sort((a, b) => a.ordem - b.ordem)
    const sinalViagem = findRule(rules, 'viagem_internacional_recente')
    const sinalFamilia = findRule(rules, 'familia_ajudando')
    const sinalPesquisou = findRule(rules, 'planejamento_avancado')
    const subjetivoPremium = findRule(rules, 'referencia_casamento_premium')

    const valorFaixas = useMemo(() => getValorFaixas(rules), [rules])
    const faixaAtual = useMemo(() => {
        if (!session.dadosLead.investimento_total || !session.dadosLead.num_convidados) return null
        return findValorFaixaRule(rules, session.dadosLead.investimento_total, session.dadosLead.num_convidados)
    }, [rules, session.dadosLead.investimento_total, session.dadosLead.num_convidados])
    const valorPorConvidado = useMemo(() => {
        const inv = session.dadosLead.investimento_total
        const conv = session.dadosLead.num_convidados
        if (!inv || !conv) return null
        return inv / conv
    }, [session.dadosLead.investimento_total, session.dadosLead.num_convidados])
    const [showFaixasModal, setShowFaixasModal] = useState(false)

    return (
        <>
            <Sheet open={open} onOpenChange={handleClose}>
                <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
                    <SheetTitle className="sr-only">Qualificar lead</SheetTitle>
                    <SheetDescription className="sr-only">Pontuação em tempo real, mesmas regras que a Patricia.</SheetDescription>
                    {rulesLoading || session.starting ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <>
                            {/* Header com SCORE DESTACADO no topo */}
                            <ScoreHeader
                                score={score}
                                threshold={threshold}
                                qualificado={qualificado}
                                disqualified={disqualified}
                                saving={session.saving}
                                cardId={session.linkedCardId}
                                onVincular={() => setShowVincular(true)}
                                onDesvincular={
                                    session.linkedCardId
                                        ? async () => {
                                            if (!session.qualificationId) return
                                            if (!window.confirm('Desvincular esta pontuação do card?')) return
                                            try {
                                                await desvincular.mutateAsync(session.qualificationId)
                                                session.setLinkedCardId(null)
                                                toast.success('Pontuação desvinculada')
                                            } catch (err) {
                                                toast.error('Erro ao desvincular: ' + (err as Error).message)
                                            }
                                        }
                                        : undefined
                                }
                            />

                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                                {/* A. Identificação compacta no topo */}
                                <section className="bg-slate-50 -mx-6 px-6 py-4 border-y border-slate-200">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs text-slate-600">Nome da pessoa que está falando</Label>
                                            <Input
                                                value={session.dadosLead.nome_contato ?? ''}
                                                onChange={(e) => handleDadoChange('nome_contato', e.target.value)}
                                                placeholder="João"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-600">Telefone</Label>
                                            <Input
                                                value={session.dadosLead.telefone ?? telefone ?? ''}
                                                onChange={(e) => handleDadoChange('telefone', e.target.value)}
                                                placeholder="(11) 99999-9999"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs text-slate-600">Nome do casal (opcional)</Label>
                                            <Input
                                                value={session.dadosLead.nome_casal ?? ''}
                                                onChange={(e) => handleDadoChange('nome_casal', e.target.value)}
                                                placeholder="João e Maria"
                                            />
                                        </div>
                                        <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <Label className="text-sm font-medium text-slate-700">
                                                        É indicação?
                                                    </Label>
                                                    <p className="text-xs text-slate-500">
                                                        Marque se o casal chegou indicado por alguém.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={session.dadosLead.is_indicacao === true}
                                                    onCheckedChange={(v) => {
                                                        const next: DadosLead = { ...session.dadosLead, is_indicacao: v }
                                                        if (!v) next.indicado_por = undefined
                                                        session.setDados(next)
                                                    }}
                                                />
                                            </div>
                                            {session.dadosLead.is_indicacao === true && (
                                                <div className="mt-3">
                                                    <Label className="text-xs text-slate-600">Quem indicou?</Label>
                                                    <Input
                                                        value={session.dadosLead.indicado_por ?? ''}
                                                        onChange={(e) => handleDadoChange('indicado_por', e.target.value)}
                                                        placeholder="Nome do indicador"
                                                        autoFocus
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="col-span-2">
                                            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                                                <Label className="text-xs text-slate-600">Data prevista do casamento</Label>
                                                <div className="flex gap-1 flex-wrap">
                                                    {(
                                                        [
                                                            ['exata', 'Data exata'],
                                                            ['mes_ano', 'Mês/Ano'],
                                                            ['indefinido', 'Indefinido'],
                                                        ] as const
                                                    ).map(([mode, label]) => (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={() => {
                                                                setDataMode(mode)
                                                                // Trocar de modo limpa o que era do modo anterior pra evitar dado inconsistente.
                                                                const novoDados = {
                                                                    ...session.dadosLead,
                                                                    data_casamento: mode === 'indefinido' ? 'indefinido' : undefined,
                                                                    data_casamento_meses: undefined,
                                                                    data_casamento_datas: undefined,
                                                                }
                                                                session.setDados(novoDados)
                                                            }}
                                                            className={
                                                                'px-2 py-0.5 rounded text-[11px] font-medium transition ' +
                                                                (dataMode === mode
                                                                    ? 'bg-indigo-100 text-indigo-700'
                                                                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300')
                                                            }
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {dataMode === 'exata' && (
                                                <DatasExatasPicker
                                                    selecionadas={(() => {
                                                        if (session.dadosLead.data_casamento_datas && session.dadosLead.data_casamento_datas.length > 0) {
                                                            return session.dadosLead.data_casamento_datas
                                                        }
                                                        const v = session.dadosLead.data_casamento
                                                        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return [v]
                                                        return []
                                                    })()}
                                                    onChange={(datas, textoHumano) => {
                                                        const novoDados = {
                                                            ...session.dadosLead,
                                                            data_casamento_datas: datas.length > 0 ? datas : undefined,
                                                            data_casamento: textoHumano || (datas.length === 1 ? datas[0] : undefined),
                                                        }
                                                        session.setDados(novoDados)
                                                    }}
                                                />
                                            )}
                                            {dataMode === 'mes_ano' && (
                                                <PeriodoMesesPicker
                                                    selecionados={(() => {
                                                        // Prioriza array estruturado de meses; senão tenta extrair de "yyyy-mm"
                                                        if (session.dadosLead.data_casamento_meses && session.dadosLead.data_casamento_meses.length > 0) {
                                                            return session.dadosLead.data_casamento_meses
                                                        }
                                                        const v = session.dadosLead.data_casamento
                                                        if (v && /^\d{4}-\d{2}$/.test(v)) return [v]
                                                        return []
                                                    })()}
                                                    onChange={(meses, textoHumano) => {
                                                        const novoDados = {
                                                            ...session.dadosLead,
                                                            data_casamento_meses: meses.length > 0 ? meses : undefined,
                                                            data_casamento: textoHumano || (meses.length === 1 ? meses[0] : undefined),
                                                        }
                                                        session.setDados(novoDados)
                                                    }}
                                                />
                                            )}
                                            {dataMode === 'indefinido' && (
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-sm text-slate-600">
                                                    <Info className="w-3.5 h-3.5 text-slate-500" />
                                                    <span>Casal ainda não definiu a data.</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* B. Os dois drivers do score: investimento + convidados */}
                                <section>
                                    <div className="flex items-baseline justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-slate-900">Investimento e convidados</h3>
                                        {valorFaixas.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowFaixasModal(true)}
                                                className="text-xs text-indigo-600 hover:underline"
                                            >
                                                Ver faixas de pontuação
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs text-slate-600">Investimento total</Label>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={investimentoText}
                                                onChange={(e) => handleInvestimentoInput(e.target.value)}
                                                placeholder="R$ 0,00"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-600">Número de convidados</Label>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                value={session.dadosLead.num_convidados ?? ''}
                                                onChange={(e) => {
                                                    const onlyDigits = e.target.value.replace(/\D/g, '')
                                                    handleDadoChange('num_convidados', onlyDigits ? Number(onlyDigits) : undefined)
                                                }}
                                                placeholder="0"
                                            />
                                        </div>
                                        {valorPorConvidado != null && (
                                            <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                <span className="text-slate-500">
                                                    Custo por convidado:{' '}
                                                    <span className="font-semibold text-slate-800">
                                                        {formatBRL(valorPorConvidado)}
                                                    </span>
                                                </span>
                                                {faixaAtual ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                                                        +{faixaAtual.weight} pts ({faixaAtual.label?.replace('Valor por convidado: ', '') ?? 'faixa atual'})
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">
                                                        Fora das faixas pontuadas
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* C. Destino */}
                                <section>
                                    <div className="flex items-baseline justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-slate-900">Destino pretendido</h3>
                                        <span className="text-xs text-slate-500">
                                            Marque todos que o casal aceita — conta a maior pontuação.
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {destinoRules.map((r) => {
                                            const selected = destinosSelecionados.has(r.id)
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => toggleDestinoCatalogo(r.id)}
                                                    data-rpc-key={r.dimension}
                                                    className={
                                                        'text-left px-3 py-2 rounded-lg border text-sm transition flex items-start gap-2 ' +
                                                        (selected
                                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300')
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            'mt-0.5 inline-flex w-4 h-4 shrink-0 rounded border items-center justify-center text-[10px] ' +
                                                            (selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent')
                                                        }
                                                        aria-hidden
                                                    >
                                                        ✓
                                                    </span>
                                                    <span className="flex-1">
                                                        <span className="block font-medium">{r.label}</span>
                                                        <span className="text-xs text-slate-500">+{r.weight} pts</span>
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="radio"
                                                name="outro-destino"
                                                checked={outroDestinoMode === 'com_flex'}
                                                onChange={() => setOutroDestino('com_flex')}
                                            />
                                            <span>Outro destino — casal aberto a considerar do catálogo</span>
                                        </label>
                                        {outroDestinoMode === 'com_flex' && (
                                            <div className="ml-6 grid grid-cols-1 gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                                <p className="text-xs text-amber-800">
                                                    Anote o destino original e o que ele aceita do catálogo.
                                                </p>
                                                <div>
                                                    <Label className="text-xs text-slate-600">Qual destino o casal queria?</Label>
                                                    <Input
                                                        value={session.dadosLead.destino_outro_queria ?? ''}
                                                        onChange={(e) => handleDadoChange('destino_outro_queria', e.target.value)}
                                                        placeholder="Ex: Bali, Bora Bora, Tailândia..."
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-600">Está aberto a quais destinos?</Label>
                                                    <Input
                                                        value={session.dadosLead.destino_outro_aberto_a ?? ''}
                                                        onChange={(e) => handleDadoChange('destino_outro_aberto_a', e.target.value)}
                                                        placeholder="Ex: Caribe e Nordeste"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <label className="flex items-center gap-2 text-sm cursor-pointer text-rose-700">
                                            <input
                                                type="radio"
                                                name="outro-destino"
                                                checked={outroDestinoMode === 'sem_flex'}
                                                onChange={() => setOutroDestino('sem_flex')}
                                            />
                                            <span>Outro destino — casal NÃO aceita considerar (desqualifica)</span>
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-600">
                                            <input
                                                type="radio"
                                                name="outro-destino"
                                                checked={outroDestinoMode === 'nenhum'}
                                                onChange={() => setOutroDestino('nenhum')}
                                            />
                                            <span>Nenhuma das opções acima</span>
                                        </label>
                                    </div>
                                </section>

                                {/* D. Sinais objetivos */}
                                <section>
                                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Sinais objetivos</h3>
                                    <div className="space-y-3">
                                        {sinalViagem && (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <Label className="text-sm font-medium text-slate-700">
                                                        Viajou internacionalmente fora da América do Sul no último ano?
                                                    </Label>
                                                    <p className="text-xs text-slate-500">+{sinalViagem.weight} pts</p>
                                                </div>
                                                <Switch
                                                    checked={session.scoringInputs[sinalViagem.id] === true}
                                                    onCheckedChange={(v) => handleSinal(sinalViagem, v)}
                                                />
                                            </div>
                                        )}
                                        {sinalFamilia && (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <Label className="text-sm font-medium text-slate-700">
                                                        Família ajudará a pagar o casamento?
                                                    </Label>
                                                    <p className="text-xs text-slate-500">+{sinalFamilia.weight} pts</p>
                                                </div>
                                                <Switch
                                                    checked={session.scoringInputs[sinalFamilia.id] === true}
                                                    onCheckedChange={(v) => handleSinal(sinalFamilia, v)}
                                                />
                                            </div>
                                        )}
                                        {sinalPesquisou && (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <Label className="text-sm font-medium text-slate-700">
                                                        Casal pesquisou outras produtoras / hotéis?
                                                    </Label>
                                                    <p className="text-xs text-slate-500">Bônus +{sinalPesquisou.weight} pts</p>
                                                </div>
                                                <Switch
                                                    checked={session.scoringInputs[sinalPesquisou.id] === true}
                                                    onCheckedChange={(v) => handleSinal(sinalPesquisou, v)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* E. Avaliação subjetiva */}
                                {subjetivoPremium && (
                                    <section>
                                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Avaliação do SDR</h3>
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Label className="text-sm font-medium text-slate-700">
                                                    Casal demonstra circulação em meio premium / referência cultural?
                                                </Label>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-xs">
                                                            Sinais: menciona casamentos de amigos em destinos top, fala em
                                                            fornecedores conhecidos, usa termos como "destination wedding",
                                                            cita lugares premium que frequenta.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            <div className="flex gap-2">
                                                {(['sim', 'nao', 'pendente'] as const).map((v) => {
                                                    const isSim = v === 'sim'
                                                    const isNao = v === 'nao'
                                                    const selected =
                                                        (isSim && session.scoringInputs[subjetivoPremium.id] === true) ||
                                                        (isNao && session.scoringInputs[subjetivoPremium.id] === false) ||
                                                        (v === 'pendente' && session.scoringInputs[subjetivoPremium.id] === undefined)
                                                    return (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => handleSubjetivo(subjetivoPremium, v)}
                                                            className={
                                                                'flex-1 px-3 py-2 rounded-lg border text-sm transition ' +
                                                                (selected
                                                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300')
                                                            }
                                                        >
                                                            {v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Ainda não avaliei'}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Bônus +{subjetivoPremium.weight} pts apenas se "Sim".
                                            </p>
                                        </div>
                                    </section>
                                )}

                                {/* Notas */}
                                <section>
                                    <Label className="text-xs text-slate-600">Notas internas (opcional)</Label>
                                    <Textarea
                                        value={session.notas}
                                        onChange={(e) => session.setNotas(e.target.value)}
                                        rows={3}
                                        placeholder="Comentários adicionais sobre o lead..."
                                    />
                                </section>
                            </div>

                            {/* Footer com botão único Registrar */}
                            <div className="border-t border-slate-200 bg-white px-6 py-4">
                                <Button
                                    onClick={handleFinalizar}
                                    disabled={!session.qualificationId || session.saving || finalizar.isPending}
                                    className="w-full"
                                    size="lg"
                                >
                                    {finalizar.isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />Registrando...
                                        </>
                                    ) : (
                                        'Registrar pontuação'
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {showProximoPasso && finalizedScore && config && (
                <ProximoPassoModal
                    open={showProximoPasso}
                    onClose={closeProximoPasso}
                    score={finalizedScore.score}
                    qualificado={finalizedScore.qualificado}
                    disqualified={finalizedScore.disqualified}
                    threshold={finalizedScore.threshold}
                    fallbackAction={config.fallback_action}
                />
            )}

            {showVincular && session.qualificationId && (
                <VincularCardModal
                    open={showVincular}
                    onClose={() => setShowVincular(false)}
                    onPick={async (selectedCardId) => {
                        try {
                            await vincular.mutateAsync({ qualificationId: session.qualificationId!, cardId: selectedCardId })
                            session.setLinkedCardId(selectedCardId)
                            toast.success('Pontuação vinculada ao card')
                            setShowVincular(false)
                        } catch (err) {
                            toast.error('Erro ao vincular: ' + (err as Error).message)
                        }
                    }}
                />
            )}

            {showFaixasModal && (
                <FaixasValorModal
                    open={showFaixasModal}
                    onClose={() => setShowFaixasModal(false)}
                    faixas={valorFaixas}
                    faixaAtualId={faixaAtual?.id ?? null}
                    valorPorConvidado={valorPorConvidado}
                />
            )}
        </>
    )
}

function FaixasValorModal({
    open,
    onClose,
    faixas,
    faixaAtualId,
    valorPorConvidado,
}: {
    open: boolean
    onClose: () => void
    faixas: ValorFaixa[]
    faixaAtualId: string | null
    valorPorConvidado: number | null
}) {
    const formatFaixa = (f: ValorFaixa) => {
        const min = f.min != null ? formatBRL(f.min) : null
        const max = f.max != null ? formatBRL(f.max) : null
        if (min && max) return `${min} a ${max}/convidado`
        if (min) return `${min} ou mais/convidado`
        if (max) return `Até ${max}/convidado`
        return '(faixa sem limites)'
    }
    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <div className="px-6 pt-6 pb-3 border-b border-slate-200">
                    <SheetTitle className="text-lg font-semibold text-slate-900">Faixas de pontuação por valor por convidado</SheetTitle>
                    <SheetDescription className="text-sm text-slate-500 mt-1">
                        São as mesmas regras que a Patricia usa. A faixa atual aparece destacada.
                    </SheetDescription>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                    {valorPorConvidado != null && (
                        <div className="mb-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                            <span className="text-slate-600">Valor por convidado calculado:</span>{' '}
                            <span className="font-semibold text-slate-900">{formatBRL(valorPorConvidado)}</span>
                        </div>
                    )}
                    {faixas.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">
                            Nenhuma faixa configurada.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {faixas.map((f) => {
                                const isAtual = f.rule.id === faixaAtualId
                                return (
                                    <li
                                        key={f.rule.id}
                                        className={
                                            'flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ' +
                                            (isAtual
                                                ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                                                : 'bg-white border-slate-200')
                                        }
                                    >
                                        <span className={'text-sm ' + (isAtual ? 'font-semibold text-emerald-900' : 'text-slate-700')}>
                                            {formatFaixa(f)}
                                        </span>
                                        <span className={'text-sm font-semibold ' + (isAtual ? 'text-emerald-700' : 'text-slate-500')}>
                                            +{f.rule.weight} pts
                                            {isAtual && <span className="ml-1 text-xs font-normal">(atual)</span>}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    <p className="text-xs text-slate-500 pt-3 leading-snug">
                        Caso o casal tenha indicado mais de um destino, a Patricia considera a pontuação do destino de maior peso.
                        Aqui também: a faixa de valor por convidado é única por pontuação.
                    </p>
                </div>
                <div className="border-t border-slate-200 bg-white px-6 py-3">
                    <Button variant="outline" onClick={onClose} className="w-full">
                        Fechar
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

function ScoreHeader({
    score,
    threshold,
    qualificado,
    disqualified,
    saving,
    cardId,
    onVincular,
    onDesvincular,
}: {
    score: number
    threshold: number
    qualificado: boolean
    disqualified: boolean
    saving: boolean
    cardId: string | null | undefined
    onVincular: () => void
    onDesvincular?: () => void
}) {
    const status = disqualified
        ? { icon: XCircle, color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', label: 'Desqualificado', barColor: 'bg-rose-500' }
        : qualificado
            ? { icon: CheckCircle2, color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', label: 'Qualificado', barColor: 'bg-emerald-500' }
            : { icon: AlertTriangle, color: 'text-slate-600', bgColor: 'bg-slate-50', borderColor: 'border-slate-200', label: `Abaixo de ${threshold}`, barColor: 'bg-slate-400' }
    const Icon = status.icon
    const pct = Math.min(100, Math.round((score / Math.max(threshold, 1)) * 100))

    return (
        <div className={`relative px-6 pt-6 pb-5 border-b ${status.borderColor} ${status.bgColor}`}>
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h2 className="text-sm font-medium text-slate-600">Qualificar lead</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Mesmas regras que a Patricia aplica.</p>
                </div>
                {!cardId && (
                    <button
                        onClick={onVincular}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:border-indigo-300 hover:text-indigo-700 transition"
                    >
                        <Link2 className="w-3 h-3" />
                        Vincular a card
                    </button>
                )}
                {cardId && (
                    <div className="inline-flex items-center gap-1">
                        <a
                            href={`/cards/${cardId}`}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition"
                            title="Abrir card vinculado"
                        >
                            <Link2 className="w-3 h-3" />
                            Vinculado a card
                        </a>
                        {onDesvincular && (
                            <button
                                onClick={onDesvincular}
                                className="inline-flex items-center text-xs px-1.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition"
                                title="Desvincular pontuação do card"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-end gap-4 mb-3">
                <div className={`text-6xl font-bold ${status.color} leading-none`}>{score}</div>
                <div className="flex-1 pb-1">
                    <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${status.color} mb-1`}>
                        <Icon className="w-4 h-4" />
                        {status.label}
                    </div>
                    <div className="text-xs text-slate-500">mínimo pra qualificar: {threshold} pts</div>
                </div>
            </div>

            <div className="h-2 bg-white rounded-full overflow-hidden border border-slate-200">
                <div className={`h-full transition-all duration-300 ${status.barColor}`} style={{ width: `${pct}%` }} />
            </div>

            <div className="h-5 mt-2 flex items-center" aria-live="polite">
                {saving ? (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Salvando...
                    </p>
                ) : (
                    <span className="text-xs text-transparent select-none">.</span>
                )}
            </div>
        </div>
    )
}

type CardSuggestion = {
    id: string
    titulo: string
    pessoa_nome: string | null
    pessoa_telefone: string | null
}

function VincularCardModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (cardId: string) => void }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<CardSuggestion[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!query.trim() || query.trim().length < 2) {
            setResults([])
            return
        }
        const timer = setTimeout(async () => {
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
                const { data, error } = await q.or(filterStr)
                if (error) throw error
                setResults((data ?? []) as CardSuggestion[])
            } catch {
                setResults([])
            } finally {
                setLoading(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [query])

    return (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <div className="px-6 pt-6 pb-4 border-b border-slate-200">
                    <SheetTitle className="text-lg font-semibold text-slate-900">Vincular a card existente</SheetTitle>
                    <SheetDescription className="text-sm text-slate-500 mt-1">Busque por nome do casal ou telefone.</SheetDescription>
                </div>
                <div className="px-6 pt-4 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Nome do casal ou telefone..."
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
                            {query.trim().length < 2 ? 'Digite ao menos 2 caracteres pra buscar.' : 'Nenhum card encontrado.'}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {results.map((c) => (
                                <li key={c.id}>
                                    <button
                                        onClick={() => onPick(c.id)}
                                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition"
                                    >
                                        <div className="text-sm font-medium text-slate-900">{c.titulo}</div>
                                        <div className="text-xs text-slate-500">
                                            {c.pessoa_nome ?? '(sem nome)'} · {c.pessoa_telefone ?? '(sem telefone)'}
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
