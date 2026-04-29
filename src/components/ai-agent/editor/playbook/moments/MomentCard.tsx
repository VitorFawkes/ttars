import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Trash2, Save, Loader2, X, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAgentMoments, type PlaybookMoment, type DiscoveryConfig } from '@/hooks/playbook/useAgentMoments'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'
import { DiscoveryConfigEditor } from './DiscoveryConfigEditor'

const ANCHOR_VARIABLES: Array<{ token: string; label: string; hint?: string }> = [
  { token: '{contact_name}', label: 'Nome do lead' },
  { token: '{agent_name}', label: 'Nome do agente' },
  { token: '{company_name}', label: 'Nome da empresa' },
  { token: '{saudacao}', label: 'Saudação contextual', hint: 'Vira "Boa noite", "Boa tarde" ou "Bom dia" se o lead saudou assim. Senão "Olá".' },
  { token: '{saudacao_horario}', label: 'Saudação por horário', hint: 'Vira "Bom dia/Boa tarde/Boa noite" baseado SÓ no horário (BR). Útil se você não quer espelhar o lead.' },
  { token: '{responsavel_name}', label: 'Wedding Planner', hint: 'Nome do closer configurado em Handoff > Agendar reunião automática' },
  { token: '{slots_disponiveis}', label: 'Lista de horários', hint: 'Próximos 3 horários livres na agenda do closer (ex: "quarta 30/04 às 14h, quinta 01/05 às 10h ou 16h")' },
  { token: '{slot_1}', label: '1º horário livre', hint: 'Primeiro horário disponível (ex: "quarta 30/04 às 14h")' },
  { token: '{slot_2}', label: '2º horário livre' },
  { token: '{slot_3}', label: '3º horário livre' },
]

interface Props {
  agentId: string
  agentName: string
  companyName: string
  moment: PlaybookMoment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: { attributes?: any; listeners?: any }
}

const TRIGGER_OPTIONS: Array<{ value: PlaybookMoment['trigger_type']; label: string }> = [
  { value: 'primeiro_contato', label: 'Primeira mensagem do lead' },
  { value: 'lead_respondeu', label: 'Lead respondeu' },
  { value: 'keyword', label: 'Contém palavras-chave' },
  { value: 'score_threshold', label: 'Score atingiu valor' },
  { value: 'always', label: 'Sempre disponível (fallback)' },
]

const MODE_OPTIONS: Array<{ value: PlaybookMoment['message_mode']; label: string; subtitle: string }> = [
  { value: 'literal', label: 'Texto exato', subtitle: 'Envia palavra por palavra. Só pula um trecho se o lead já mencionou esse fato específico (ex: já citou os prêmios). Resto fica literal.' },
  { value: 'faithful', label: 'Diretriz fiel', subtitle: 'Mantém o texto quase todo igual (até 10% de palavras pode trocar pra fluir). Ordem, tom e perguntas ficam como você escreveu.' },
  { value: 'free', label: 'Estilo livre', subtitle: 'A agente cria a resposta usando o texto como objetivo. Liberdade pra adaptar tudo conforme o contexto.' },
]

const DELIVERY_OPTIONS: Array<{ value: PlaybookMoment['delivery_mode']; label: string; subtitle: string }> = [
  { value: 'all_at_once', label: 'Tudo de uma vez', subtitle: 'Manda saudação + apresentação + pergunta numa rajada (até 3 mensagens seguidas)' },
  { value: 'wait_for_reply', label: 'Uma de cada vez', subtitle: 'Manda UMA mensagem e espera o lead responder antes de continuar (mais natural na abertura)' },
]

export function MomentCard({ agentId, agentName, companyName, moment, dragHandleProps }: Props) {
  const { upsert, remove } = useAgentMoments(agentId)
  const meta = useCurrentProductMeta()
  const pipelineId: string | undefined = meta?.pipelineId ?? undefined
  const produtoSlug: string | undefined = meta?.slug ?? undefined
  const [expanded, setExpanded] = useState(false)
  const [label, setLabel] = useState(moment.moment_label)
  const [triggerType, setTriggerType] = useState(moment.trigger_type)
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(moment.trigger_config ?? {})
  const [mode, setMode] = useState(moment.message_mode)
  const [deliveryMode, setDeliveryMode] = useState<PlaybookMoment['delivery_mode']>(moment.delivery_mode ?? 'all_at_once')
  const [intent, setIntent] = useState(moment.intent ?? '')
  const [anchor, setAnchor] = useState(moment.anchor_text ?? '')
  const [redLines, setRedLines] = useState<string[]>(moment.red_lines ?? [])
  const [discoveryConfig, setDiscoveryConfig] = useState<DiscoveryConfig | null>(moment.discovery_config ?? null)
  const [newRedLine, setNewRedLine] = useState('')
  const [dirty, setDirty] = useState(false)
  const anchorRef = useRef<HTMLTextAreaElement | null>(null)

  /** Só fases (kind=flow) podem ter slots de descoberta. Jogadas situacionais (play) não. */
  const canHaveDiscovery = moment.kind === 'flow'
  const hasDiscovery = canHaveDiscovery && discoveryConfig !== null

  const enableDiscovery = () => {
    setDiscoveryConfig({ slots: [] })
    markDirty()
  }
  const removeDiscovery = () => {
    if (!confirm('Remover toda a configuração de informações coletadas? As perguntas escritas serão perdidas.')) return
    setDiscoveryConfig(null)
    markDirty()
  }

  const markDirty = () => setDirty(true)

  const insertVariable = (token: string) => {
    const el = anchorRef.current
    if (!el) {
      setAnchor((prev) => (prev ?? '') + token)
      markDirty()
      return
    }
    const start = el.selectionStart ?? anchor.length
    const end = el.selectionEnd ?? anchor.length
    const next = anchor.slice(0, start) + token + anchor.slice(end)
    setAnchor(next)
    markDirty()
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const handleSave = async () => {
    try {
      await upsert.mutateAsync({
        id: moment.id,
        moment_key: moment.moment_key,
        moment_label: label.trim(),
        display_order: moment.display_order,
        kind: moment.kind,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        message_mode: mode,
        intent: intent.trim() || null,
        anchor_text: (mode === 'literal' || mode === 'faithful') ? anchor.trim() : (anchor.trim() || null),
        red_lines: redLines,
        collects_fields: moment.collects_fields ?? [],
        discovery_config: canHaveDiscovery ? discoveryConfig : null,
        delivery_mode: deliveryMode,
        enabled: moment.enabled,
      })
      toast.success('Momento salvo'); setDirty(false)
    } catch (err) { console.error(err); toast.error('Não consegui salvar.') }
  }

  const handleRemove = async () => {
    if (!confirm(`Apagar o momento "${moment.moment_label}"?`)) return
    try { await remove.mutateAsync(moment.id); toast.success('Momento removido') }
    catch (err) { console.error(err); toast.error('Não consegui remover.') }
  }

  const addRedLine = () => {
    if (newRedLine.trim()) { setRedLines([...redLines, newRedLine.trim()]); setNewRedLine(''); markDirty() }
  }

  const isFlow = moment.kind === 'flow'

  return (
    <div className={cn(
      'bg-white border rounded-lg',
      expanded
        ? (isFlow ? 'border-indigo-200' : 'border-rose-200')
        : 'border-slate-200',
    )}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        {isFlow ? (
          <button type="button" {...(dragHandleProps?.attributes ?? {})} {...(dragHandleProps?.listeners ?? {})}
            className="text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
            title="Arraste pra mudar a ordem da fase">
            <GripVertical className="w-4 h-4" />
          </button>
        ) : (
          <span className="text-rose-400" title="Jogada situacional — ordem não importa">⚡</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{label || moment.moment_key}</div>
          <div className="text-xs text-slate-500 truncate">
            {TRIGGER_OPTIONS.find(t => t.value === triggerType)?.label ?? triggerType}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-700 p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </header>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nome {isFlow ? 'da fase' : 'da jogada'}
            </label>
            <input value={label} onChange={(e) => { setLabel(e.target.value); markDirty() }}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isFlow ? 'Quando essa fase começa' : 'Como detectar essa situação'}
            </label>
            <select value={triggerType} onChange={(e) => { setTriggerType(e.target.value as PlaybookMoment['trigger_type']); setTriggerConfig({}); markDirty() }}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {triggerType === 'keyword' && (
              <input
                value={Array.isArray(triggerConfig.keywords) ? (triggerConfig.keywords as string[]).join(', ') : ''}
                onChange={(e) => { setTriggerConfig({ keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }); markDirty() }}
                placeholder="preço, quanto custa, valor"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            )}
            {triggerType === 'score_threshold' && (
              <div className="mt-2 flex gap-2 items-center text-sm">
                <select
                  value={(triggerConfig.operator as string) ?? 'gte'}
                  onChange={(e) => { setTriggerConfig({ ...triggerConfig, operator: e.target.value }); markDirty() }}
                  className="rounded-lg border border-slate-200 px-2 py-1">
                  <option value="gte">≥</option><option value="lte">≤</option>
                  <option value="gt">&gt;</option><option value="lt">&lt;</option>
                </select>
                <input type="number"
                  value={(triggerConfig.value as number) ?? 0}
                  onChange={(e) => { setTriggerConfig({ ...triggerConfig, value: Number(e.target.value) }); markDirty() }}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1" />
                <span className="text-xs text-slate-500">(threshold do score)</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Por quê dessa fase? <span className="text-slate-400 font-normal">(opcional, ajuda a agente a entender a intenção mesmo se você mudar o modo)</span>
            </label>
            <textarea
              value={intent}
              onChange={(e) => { setIntent(e.target.value); markDirty() }}
              placeholder="Ex: descobrir a visão dos noivos sobre o casamento e o que é importante pra eles."
              className="w-full min-h-[60px] rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50/50"
              rows={2}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              💡 A agente lê isso como contexto. Em <strong>Texto exato</strong> serve como guarda-corpo (ela não sai do texto, mas sabe o objetivo). Em <strong>Diretriz fiel</strong> e <strong>Estilo livre</strong>, ela usa pra adaptar com sentido.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Como a agente responde</label>
            <div className="space-y-1">
              {MODE_OPTIONS.map(o => (
                <label key={o.value} className="flex items-start gap-2 text-sm p-2 rounded border border-slate-100 hover:border-slate-200 cursor-pointer">
                  <input type="radio" checked={mode === o.value} onChange={() => { setMode(o.value); markDirty() }} className="mt-0.5" />
                  <div>
                    <div className="font-medium text-slate-700">{o.label}</div>
                    <div className="text-xs text-slate-500">{o.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Ritmo de envio nesta fase</label>
            <div className="space-y-1">
              {DELIVERY_OPTIONS.map(o => (
                <label key={o.value} className="flex items-start gap-2 text-sm p-2 rounded border border-slate-100 hover:border-slate-200 cursor-pointer">
                  <input
                    type="radio"
                    checked={deliveryMode === o.value}
                    onChange={() => { setDeliveryMode(o.value); markDirty() }}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-slate-700">{o.label}</div>
                    <div className="text-xs text-slate-500">{o.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-600">
                {mode === 'free' ? 'Objetivo desta fase (a agente improvisa baseado nisso)' : 'Texto que a agente vai usar'}
              </label>
              <SuggestVariationsButton
                text={anchor}
                fieldType="anchor_text"
                context={{ agent_nome: agentName, company_name: companyName, related_moment_label: label }}
                onSelect={(t) => { setAnchor(t); markDirty() }}
              />
            </div>
            <textarea
              ref={anchorRef}
              value={anchor}
              onChange={(e) => { setAnchor(e.target.value); markDirty() }}
              placeholder={
                mode === 'free'
                  ? 'Descreva o objetivo'
                  : deliveryMode === 'wait_for_reply'
                    ? 'Mensagem 1\n\n---\n\nMensagem 2 (depois que o lead responder)\n\n---\n\nMensagem 3'
                    : 'Use {contact_name} para o nome do lead'
              }
              className="w-full min-h-[120px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {deliveryMode === 'wait_for_reply' && mode !== 'free' && (
              <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2.5 py-1.5 mt-1.5 leading-relaxed">
                ✨ <span className="font-medium">Sequência de mensagens:</span> separe cada mensagem com uma linha contendo só <code className="font-mono px-1 bg-white border border-indigo-200 rounded">---</code>.
                A agente manda a primeira, espera o lead responder, manda a próxima, e assim por diante. Quando acabarem os blocos, ela avança pra próxima fase do funil.
              </p>
            )}
            {mode !== 'free' && (
              <div className="mt-1.5">
                <div className="text-[11px] text-slate-500 mb-1">
                  Variáveis disponíveis (clique pra inserir onde o cursor está):
                </div>
                <div className="flex flex-wrap gap-1">
                  {ANCHOR_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token)}
                      className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 font-mono"
                      title={v.hint ? `${v.label} — ${v.hint}` : v.label}
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  💡 <span className="font-medium">Horários ({'{slot_1}'}, {'{slots_disponiveis}'}, etc)</span> só aparecem
                  quando "Agendar reunião automática" está ativa em <strong>Handoff</strong>. Se não estiver, a agente improvisa horário pelo objetivo.
                </p>
              </div>
            )}
          </div>

          {canHaveDiscovery && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-medium text-slate-900">Configuração de Sondagem</span>
                </div>
                {hasDiscovery ? (
                  <button onClick={removeDiscovery} className="text-[11px] text-slate-500 hover:text-rose-600">
                    desativar
                  </button>
                ) : (
                  <button onClick={enableDiscovery} className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">
                    + ativar
                  </button>
                )}
              </div>
              {hasDiscovery ? (
                <DiscoveryConfigEditor
                  value={discoveryConfig}
                  onChange={(next) => { setDiscoveryConfig(next); markDirty() }}
                  pipelineId={pipelineId}
                  produtoSlug={produtoSlug}
                />
              ) : (
                <p className="text-[11px] text-slate-500">
                  Ative se esta fase é onde a agente coleta informações estruturadas (data, destino, orçamento, etc.).
                  Sem isso, a agente improvisa baseado só no objetivo escrito acima.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Coisas que ela NÃO pode fazer {isFlow ? 'nesta fase' : 'nesta jogada'}
            </label>
            {redLines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {redLines.map((rl, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-md bg-rose-50 border border-rose-100 text-rose-700 inline-flex items-center gap-1.5">
                    {rl}<button onClick={() => { setRedLines(redLines.filter((_, j) => j !== i)); markDirty() }}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newRedLine} onChange={(e) => setNewRedLine(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRedLine() } }}
                placeholder="Ex: Não pedir email ainda"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
              <Button size="sm" variant="outline" onClick={addRedLine} className="gap-1"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <div className="flex justify-between pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={handleRemove} disabled={remove.isPending}
              className="gap-1.5 text-slate-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </Button>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs text-amber-600">• não salvo</span>}
              <Button onClick={handleSave} disabled={!dirty || upsert.isPending} size="sm" className="gap-1.5">
                {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
