import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import { Badge } from '../ui/Badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { useEstelaScoringRules, type ScoringRule } from '../../hooks/useEstelaScoringRules'
import {
    useSdrQualificationSession,
    useFinalizarPontuacao,
    useDescartarPontuacao,
    type DadosLead,
    type SdrScoreResult,
} from '../../hooks/useSdrQualification'
import { ProximoPassoModal } from './ProximoPassoModal'
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

function findRule(rules: ScoringRule[], dimension: string): ScoringRule | undefined {
    return rules.find((r) => r.dimension === dimension)
}

function findRulesByGroup(rules: ScoringRule[], group: string): ScoringRule[] {
    return rules.filter((r) => r.exclusion_group === group)
}

function findRuleByType(rules: ScoringRule[], ruleType: 'disqualify' | 'qualify' | 'bonus', dimension?: string): ScoringRule | undefined {
    return rules.find((r) => r.rule_type === ruleType && (!dimension || r.dimension === dimension))
}

/**
 * Encontra a faixa de valor_convidado correspondente ao valor calculado.
 * Replica evaluateDeterministic('value_per_guest') do subjective_evaluator.ts.
 */
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

export function SdrQualificationSheet({ open, onOpenChange, contatoId, cardId, telefone, initialDados, onFinalized }: Props) {
    const { data: scoringData, isLoading: rulesLoading } = useEstelaScoringRules()
    const finalizar = useFinalizarPontuacao()
    const descartar = useDescartarPontuacao()
    const [showProximoPasso, setShowProximoPasso] = useState(false)
    const [finalizedScore, setFinalizedScore] = useState<SdrScoreResult | null>(null)

    const session = useSdrQualificationSession({
        contatoId: contatoId ?? null,
        cardId: cardId ?? null,
        telefone: telefone ?? null,
    })

    // Aplica dados iniciais quando session inicia
    useEffect(() => {
        if (initialDados && session.qualificationId) {
            session.setDados({ ...session.dadosLead, ...initialDados })
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

    // Estado local da seleção de destino: chave da rule_id selecionada, ou 'outro'
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
        // Limpa todos os destinos
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

    // Atualiza valor_convidado quando investimento/convidados mudam
    const aplicarValorConvidado = (dados: DadosLead) => {
        const next = { ...session.scoringInputs }
        // Limpa todas as faixas
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
                <SheetContent
                    side="right"
                    className="w-full sm:max-w-xl p-0 flex flex-col"
                >
                    <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
                        <SheetTitle className="text-slate-900">Qualificar lead</SheetTitle>
                        <SheetDescription className="text-slate-500">
                            Mesmas regras que a Estela aplica.
                            {session.estelaScoreRecente && (
                                <span className="block mt-1 text-xs">
                                    Estela pontuou recentemente: {session.estelaScoreRecente.score} pts.
                                </span>
                            )}
                        </SheetDescription>
                    </SheetHeader>

                    {rulesLoading || session.starting ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 pb-40">
                            {/* A. Identificação */}
                            <section>
                                <h3 className="text-sm font-semibold text-slate-900 mb-3">Identificação do casal</h3>
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
                                    <div>
                                        <Label className="text-xs text-slate-600">Data prevista</Label>
                                        <Input
                                            type="date"
                                            value={session.dadosLead.data_casamento ?? ''}
                                            onChange={(e) => handleDadoChange('data_casamento', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-600">Email</Label>
                                        <Input
                                            type="email"
                                            value={session.dadosLead.email ?? ''}
                                            onChange={(e) => handleDadoChange('email', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-600">Investimento total (R$)</Label>
                                        <Input
                                            type="number"
                                            value={session.dadosLead.investimento_total ?? ''}
                                            onChange={(e) =>
                                                handleDadoChange(
                                                    'investimento_total',
                                                    e.target.value ? Number(e.target.value) : undefined,
                                                )
                                            }
                                            placeholder="280000"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-600">Número de convidados</Label>
                                        <Input
                                            type="number"
                                            value={session.dadosLead.num_convidados ?? ''}
                                            onChange={(e) =>
                                                handleDadoChange(
                                                    'num_convidados',
                                                    e.target.value ? Number(e.target.value) : undefined,
                                                )
                                            }
                                            placeholder="100"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* B. Destino */}
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

                            {/* C. Sinais objetivos */}
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

                            {/* D. Avaliação subjetiva */}
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
                    )}

                    {/* Score readout sticky */}
                    <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
                        <ScoreReadout
                            score={score}
                            threshold={threshold}
                            qualificado={qualificado}
                            disqualified={disqualified}
                            saving={session.saving}
                        />
                        <Button
                            onClick={handleFinalizar}
                            disabled={!session.qualificationId || session.saving || finalizar.isPending}
                            className="w-full"
                        >
                            {finalizar.isPending ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registrando...</>
                            ) : (
                                'Registrar pontuação'
                            )}
                        </Button>
                    </div>
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
        </>
    )
}

function ScoreReadout({
    score,
    threshold,
    qualificado,
    disqualified,
    saving,
}: {
    score: number
    threshold: number
    qualificado: boolean
    disqualified: boolean
    saving: boolean
}) {
    const status = disqualified
        ? { icon: XCircle, color: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Desqualificado' }
        : qualificado
        ? { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Qualificado' }
        : { icon: AlertTriangle, color: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Abaixo do mínimo' }
    const Icon = status.icon
    const pct = Math.min(100, Math.round((score / Math.max(threshold, 1)) * 100))

    return (
        <div>
            <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-slate-900">{score}</span>
                    <span className="text-sm text-slate-500">/ {threshold} mínimo</span>
                </div>
                <Badge className={status.color}>
                    <Icon className="w-3.5 h-3.5 mr-1" />
                    {status.label}
                </Badge>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                    className={
                        'h-full transition-all duration-300 ' +
                        (disqualified ? 'bg-rose-500' : qualificado ? 'bg-emerald-500' : 'bg-slate-400')
                    }
                    style={{ width: `${pct}%` }}
                />
            </div>
            {saving && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Salvando...
                </p>
            )}
        </div>
    )
}
