import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Link2, Search } from 'lucide-react'
import { Sheet, SheetContent } from '../ui/sheet'
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
    type DadosLead,
    type SdrScoreResult,
} from '../../hooks/useSdrQualification'
import { ProximoPassoModal } from './ProximoPassoModal'
import { maskBRLInput, formatBRL, parseBRLDigits } from '../../utils/currencyMask'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
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

function findValorFaixaRule(rules: ScoringRule[], investimentoTotal: number, numConvidados: number): ScoringRule | null {
    if (!numConvidados || numConvidados <= 0 || !investimentoTotal) return null
    const perGuest = investimentoTotal / numConvidados
    const faixas = rules.filter(
        (r) => r.exclusion_group === 'valor_convidado' && typeof r.condition_value === 'object' && r.condition_value !== null,
    )
    for (const r of faixas) {
        const cv = r.condition_value as { min?: number; max?: number | null }
        const min = cv.min ?? null
        const max = cv.max ?? null
        const okMin = min == null || perGuest >= min
        const okMax = max == null || perGuest < max
        if (okMin && okMax) return r
    }
    return null
}

function detectDataMode(value: string | null | undefined): DataMode {
    if (!value) return 'exata'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'exata'
    if (/^\d{4}-\d{2}$/.test(value)) return 'mes_ano'
    return 'indefinido'
}

export function SdrQualificationSheet({ open, onOpenChange, contatoId, cardId, telefone, initialDados, onFinalized }: Props) {
    const { data: scoringData, isLoading: rulesLoading } = useEstelaScoringRules()
    const finalizar = useFinalizarPontuacao()
    const descartar = useDescartarPontuacao()
    const vincular = useVincularACard()
    const [showProximoPasso, setShowProximoPasso] = useState(false)
    const [finalizedScore, setFinalizedScore] = useState<SdrScoreResult | null>(null)
    const [investimentoText, setInvestimentoText] = useState('')
    const [dataMode, setDataMode] = useState<DataMode>('exata')
    const [showVincular, setShowVincular] = useState(false)

    const session = useSdrQualificationSession({
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
            if (initialDados.data_casamento) {
                setDataMode(detectDataMode(initialDados.data_casamento))
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

    const destinoSelecionado = useMemo(() => {
        const destinoRule = findRulesByGroup(rules, 'destino').find((r) => session.scoringInputs[r.id] === true)
        if (destinoRule) return destinoRule.id
        const disqualifyRule = findRuleByType(rules, 'disqualify', 'destino_fora_catalogo_sem_flex')
        if (disqualifyRule && session.scoringInputs[disqualifyRule.id] === true) return 'outro_sem_flex'
        const isOutroLocal = session.scoringInputs['__outro_destino__'] === true
        if (isOutroLocal) return 'outro_com_flex'
        return null
    }, [rules, session.scoringInputs])

    const handleDestino = (ruleId: string | 'outro_com_flex' | 'outro_sem_flex') => {
        const next: Record<string, boolean> = { ...session.scoringInputs }
        for (const r of findRulesByGroup(rules, 'destino')) delete next[r.id]
        const disqualifyRule = findRuleByType(rules, 'disqualify', 'destino_fora_catalogo_sem_flex')
        if (disqualifyRule) delete next[disqualifyRule.id]
        delete next['__outro_destino__']

        if (ruleId === 'outro_com_flex') {
            next['__outro_destino__'] = true
        } else if (ruleId === 'outro_sem_flex') {
            if (disqualifyRule) next[disqualifyRule.id] = true
            next['__outro_destino__'] = true
        } else {
            next[ruleId] = true
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

    const handleDadoChange = (campo: keyof DadosLead, valor: string | number | undefined) => {
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

    return (
        <>
            <Sheet open={open} onOpenChange={handleClose}>
                <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
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
                                cardId={session.qualificationId ? cardId : null}
                                onVincular={() => setShowVincular(true)}
                            />

                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                                {/* A. Identificação compacta no topo */}
                                <section className="bg-slate-50 -mx-6 px-6 py-4 border-y border-slate-200">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs text-slate-600">Nome do casal</Label>
                                            <Input
                                                value={session.dadosLead.nome_casal ?? ''}
                                                onChange={(e) => handleDadoChange('nome_casal', e.target.value)}
                                                placeholder="João e Maria"
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
                                            <div className="flex items-center justify-between mb-1">
                                                <Label className="text-xs text-slate-600">Data prevista do casamento</Label>
                                                <div className="flex gap-1">
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
                                                                handleDadoChange('data_casamento', undefined)
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
                                                <Input
                                                    type="date"
                                                    value={session.dadosLead.data_casamento ?? ''}
                                                    onChange={(e) => handleDadoChange('data_casamento', e.target.value || undefined)}
                                                />
                                            )}
                                            {dataMode === 'mes_ano' && (
                                                <Input
                                                    type="month"
                                                    value={session.dadosLead.data_casamento ?? ''}
                                                    onChange={(e) => handleDadoChange('data_casamento', e.target.value || undefined)}
                                                />
                                            )}
                                            {dataMode === 'indefinido' && (
                                                <p className="text-sm text-slate-500 px-3 py-2 bg-white border border-slate-200 rounded-md">
                                                    Casal ainda não definiu a data.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* B. Os dois drivers do score: investimento + convidados */}
                                <section>
                                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Investimento e convidados</h3>
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
                                        {session.dadosLead.investimento_total && session.dadosLead.num_convidados ? (
                                            <p className="col-span-2 text-xs text-slate-500">
                                                Valor por convidado:{' '}
                                                <span className="font-semibold text-slate-700">
                                                    {formatBRL(
                                                        session.dadosLead.investimento_total /
                                                            session.dadosLead.num_convidados,
                                                    )}
                                                </span>
                                            </p>
                                        ) : null}
                                    </div>
                                </section>

                                {/* C. Destino */}
                                <section>
                                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Destino pretendido</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {destinoRules.map((r) => {
                                            const selected = destinoSelecionado === r.id
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => handleDestino(r.id)}
                                                    data-rpc-key={r.dimension}
                                                    className={
                                                        'text-left px-3 py-2 rounded-lg border text-sm transition ' +
                                                        (selected
                                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300')
                                                    }
                                                >
                                                    <span className="block font-medium">{r.label}</span>
                                                    <span className="text-xs text-slate-500">+{r.weight} pts</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={destinoSelecionado === 'outro_com_flex'}
                                                onChange={() => handleDestino('outro_com_flex')}
                                            />
                                            <span>Outro destino — casal aberto a considerar do catálogo</span>
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer text-rose-700">
                                            <input
                                                type="radio"
                                                checked={destinoSelecionado === 'outro_sem_flex'}
                                                onChange={() => handleDestino('outro_sem_flex')}
                                            />
                                            <span>Outro destino — casal NÃO aceita considerar (desqualifica)</span>
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
                            toast.success('Pontuação vinculada ao card')
                            setShowVincular(false)
                        } catch (err) {
                            toast.error('Erro ao vincular: ' + (err as Error).message)
                        }
                    }}
                />
            )}
        </>
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
}: {
    score: number
    threshold: number
    qualificado: boolean
    disqualified: boolean
    saving: boolean
    cardId: string | null | undefined
    onVincular: () => void
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
                    <p className="text-xs text-slate-500 mt-0.5">Mesmas regras que a Estela aplica.</p>
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
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
                        <Link2 className="w-3 h-3" />
                        Vinculado a card
                    </span>
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

            {saving && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Salvando...
                </p>
            )}
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
                    <h2 className="text-lg font-semibold text-slate-900">Vincular a card existente</h2>
                    <p className="text-sm text-slate-500 mt-1">Busque por nome do casal ou telefone.</p>
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
