import { Settings, Building2, DollarSign, BookOpen, Calendar, Users2, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { BusinessConfigInput, AgentTone, PricingModel, FeeTiming, CalendarSystem } from '@/hooks/useAgentBusinessConfig'

const TONE_OPTIONS: Array<{ value: AgentTone; label: string }> = [
  { value: 'formal', label: 'Formal (empresarial, respeitoso)' },
  { value: 'professional', label: 'Profissional (neutro, claro)' },
  { value: 'friendly', label: 'Amigável (próximo, caloroso)' },
  { value: 'casual', label: 'Casual (descontraído)' },
  { value: 'empathetic', label: 'Empático (acolhedor)' },
]

const PRICING_MODEL_OPTIONS: Array<{ value: PricingModel | ''; label: string; hint: string }> = [
  { value: '', label: 'Não configurado — agente não fala de preço', hint: 'Escolha isso quando o preço não é parte da conversa (ex: saúde, suporte, atendimento interno).' },
  { value: 'flat', label: 'Taxa fixa', hint: 'Um valor único (ex: R$ 500 de planejamento).' },
  { value: 'percentage', label: 'Percentual', hint: 'Uma porcentagem sobre outro valor (ex: 10% sobre o valor da viagem).' },
  { value: 'tiered', label: 'Por faixas', hint: 'Valores diferentes conforme faixa (ex: até 10k = R$300; acima = R$500).' },
  { value: 'free', label: 'Gratuito', hint: 'Serviço sem cobrança — agente pode mencionar explicitamente.' },
  { value: 'custom', label: 'Sob cotação', hint: 'Preço depende do caso — agente não apresenta número, explica como funciona.' },
]

const FEE_TIMING_OPTIONS: Array<{ value: FeeTiming; label: string }> = [
  { value: 'immediately', label: 'Imediatamente' },
  { value: 'after_discovery', label: 'Depois da descoberta' },
  { value: 'after_qualification', label: 'Depois de qualificar' },
  { value: 'at_commitment', label: 'Quando cliente já confirmou interesse' },
  { value: 'never', label: 'Nunca (sem taxa)' },
]

const CALENDAR_OPTIONS: Array<{ value: CalendarSystem; label: string }> = [
  { value: 'supabase_rpc', label: 'Interno (agent_check_calendar)' },
  { value: 'calendly', label: 'Calendly' },
  { value: 'google', label: 'Google Calendar' },
  { value: 'n8n', label: 'Via n8n' },
  { value: 'none', label: 'Sem agendamento' },
]

export interface BusinessConfigEditorProps {
  value: BusinessConfigInput
  onChange: (next: BusinessConfigInput) => void
}

function StringArrayInput({ label, value, onChange, placeholder }: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      <Textarea
        rows={3}
        value={value.join('\n')}
        onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        placeholder={placeholder ?? 'Um item por linha'}
        className="font-mono text-sm"
      />
    </div>
  )
}

export function BusinessConfigEditor({ value, onChange }: BusinessConfigEditorProps) {
  const patch = (p: Partial<BusinessConfigInput>) => onChange({ ...value, ...p })
  const pricingJson = (value.pricing_json ?? {}) as Record<string, unknown>

  return (
    <div className="space-y-6">
      {/* Empresa */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Empresa</h3>
            <p className="text-xs text-slate-500">Identidade que o agente apresenta ao cliente.</p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Nome da empresa</Label>
            <Input
              value={value.company_name ?? ''}
              onChange={e => patch({ company_name: e.target.value || null })}
              placeholder="Welcome Trips"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Idioma</Label>
            <Input
              value={value.language ?? 'pt-BR'}
              onChange={e => patch({ language: e.target.value || null })}
              placeholder="pt-BR"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Descrição curta da empresa</Label>
          <Textarea
            rows={2}
            value={value.company_description ?? ''}
            onChange={e => patch({ company_description: e.target.value || null })}
            placeholder="O que sua empresa faz, em 1-2 frases."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Tom de voz</Label>
          <Select
            value={value.tone ?? ''}
            onChange={(v: string) => patch({ tone: (v || null) as AgentTone | null })}
            options={[{ value: '', label: '—' }, ...TONE_OPTIONS]}
          />
        </div>
      </section>

      {/* Preço e taxa — opcional e condicional ao modelo escolhido */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Preço e taxa (opcional)</h3>
            <p className="text-xs text-slate-500">Configure só se o agente precisa falar de cobrança. Nem todo agente cobra taxa — para suporte, atendimento ou casos em que preço não é parte da conversa, deixe como "Não configurado".</p>
          </div>
        </header>

        <PricingEditor
          model={value.pricing_model ?? null}
          pricingJson={pricingJson}
          timing={value.fee_presentation_timing ?? null}
          onModelChange={(model) => {
            // Ao mudar de modelo, limpa o pricing_json para evitar carregar valores de modelo anterior
            patch({
              pricing_model: model,
              pricing_json: {},
              fee_presentation_timing: model === null || model === 'free' ? 'never' : 'after_qualification',
            })
          }}
          onPricingJsonChange={(json) => patch({ pricing_json: json })}
          onTimingChange={(timing) => patch({ fee_presentation_timing: timing })}
        />
      </section>

      {/* Processo */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Processo e metodologia</h3>
            <p className="text-xs text-slate-500">O que o agente oferece e como vende.</p>
          </div>
        </header>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Metodologia / pitch de valor</Label>
          <Textarea
            rows={4}
            value={value.methodology_text ?? ''}
            onChange={e => patch({ methodology_text: e.target.value || null })}
            placeholder="O que faz seu produto especial, em 2-3 parágrafos. O agente usa como referência quando o cliente pergunta 'o que vocês oferecem'."
          />
        </div>
        <StringArrayInput
          label="Passos do processo (um por linha)"
          value={value.process_steps ?? []}
          onChange={next => patch({ process_steps: next })}
          placeholder={'Qualificação\nReunião\nProposta\nFechamento'}
        />
      </section>

      {/* Campos */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Campos do card</h3>
            <p className="text-xs text-slate-500">Quais campos o agente pode ler e atualizar.</p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StringArrayInput
            label="Campos de formulário do marketing (para regra NO-REPEAT)"
            value={value.form_data_fields ?? []}
            onChange={next => patch({ form_data_fields: next })}
            placeholder={'mkt_destino\nmkt_quem_vai_viajar_junto\nmkt_valor_por_pessoa_viagem'}
          />
          <StringArrayInput
            label="Campos de contato que podem ser atualizados"
            value={value.contact_update_fields ?? []}
            onChange={next => patch({ contact_update_fields: next })}
            placeholder={'nome\nsobrenome\nemail\ncpf'}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StringArrayInput
            label="Campos do card atualizáveis automaticamente"
            value={value.auto_update_fields ?? []}
            onChange={next => patch({ auto_update_fields: next })}
            placeholder={'titulo\nai_resumo\nai_contexto\npipeline_stage_id'}
          />
          <StringArrayInput
            label="Campos PROTEGIDOS (nunca atualizar)"
            value={value.protected_fields ?? []}
            onChange={next => patch({ protected_fields: next })}
            placeholder={'pessoa_principal_id\nproduto_data\nvalor_estimado\ncontato.telefone'}
          />
        </div>
      </section>

      {/* Calendário */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-sky-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Calendário</h3>
            <p className="text-xs text-slate-500">De onde o agente busca horários livres para reunião.</p>
          </div>
        </header>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Sistema de calendário</Label>
          <Select
            value={value.calendar_system ?? 'supabase_rpc'}
            onChange={(v: string) => patch({ calendar_system: v as CalendarSystem })}
            options={CALENDAR_OPTIONS}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Configuração (JSON)</Label>
          <Textarea
            rows={3}
            value={JSON.stringify(value.calendar_config ?? {}, null, 2)}
            onChange={e => {
              try { patch({ calendar_config: JSON.parse(e.target.value || '{}') }) } catch { /* deixa usuário corrigir */ }
            }}
            className="font-mono text-xs"
            placeholder={'{\n  "rpc_name": "agent_check_calendar"\n}'}
          />
        </div>
      </section>

      {/* Contatos secundários */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Users2 className="w-5 h-5 text-purple-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Contatos secundários</h3>
            <p className="text-xs text-slate-500">Quando o agente pode falar com outras pessoas além do titular (ex: viajantes, convidados).</p>
          </div>
        </header>
        <div className="flex items-center gap-2">
          <Switch
            checked={value.has_secondary_contacts ?? false}
            onCheckedChange={v => patch({ has_secondary_contacts: v })}
          />
          <span className="text-sm text-slate-700">Habilitar contatos secundários</span>
        </div>
        {value.has_secondary_contacts && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Nome do papel</Label>
              <Input
                value={value.secondary_contact_role_name ?? 'traveler'}
                onChange={e => patch({ secondary_contact_role_name: e.target.value })}
                placeholder="traveler, convidado, paciente…"
              />
            </div>
            <StringArrayInput
              label="Campos que secundários podem fornecer"
              value={value.secondary_contact_fields ?? []}
              onChange={next => patch({ secondary_contact_fields: next })}
              placeholder={'cpf\npassaporte\ndata_nascimento'}
            />
          </>
        )}
      </section>

      {/* Escalação */}
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Gatilhos de escalação customizados (opcional)</h3>
            <p className="text-xs text-slate-500">Para cenários além dos handoff signals padrão. Formato JSON.</p>
          </div>
        </header>
        <Textarea
          rows={4}
          value={JSON.stringify(value.escalation_triggers ?? [], null, 2)}
          onChange={e => {
            try { patch({ escalation_triggers: JSON.parse(e.target.value || '[]') }) } catch { /* deixa usuário corrigir */ }
          }}
          className="font-mono text-xs"
          placeholder={'[\n  { "type": "turn_count", "threshold": 15 }\n]'}
        />
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PricingEditor — condicional ao modelo selecionado. A ideia é que cada modelo
// tem uma UX diferente (flat tem valor+moeda, percentage tem %, tiered tem
// faixas, free tem nada, custom só texto). Nunca mostrar campos de valor se
// não faz sentido pro modelo atual, porque isso confunde quem está configurando
// ("tenho mesmo que preencher um valor?").
// ─────────────────────────────────────────────────────────────────────────────

interface PriceTier {
  label?: string
  min?: number
  max?: number | null
  fee: number
}

interface PricingEditorProps {
  model: PricingModel | null
  pricingJson: Record<string, unknown>
  timing: FeeTiming | null
  onModelChange: (model: PricingModel | null) => void
  onPricingJsonChange: (json: Record<string, unknown>) => void
  onTimingChange: (timing: FeeTiming) => void
}

function PricingEditor({
  model, pricingJson, timing,
  onModelChange, onPricingJsonChange, onTimingChange,
}: PricingEditorProps) {
  const modelHint = PRICING_MODEL_OPTIONS.find(o => o.value === (model ?? ''))?.hint
  // "Quando apresentar" só faz sentido quando há algo a apresentar (não-null e não-free).
  const showTiming = model !== null && model !== 'free'
  // Frase customizada do agente: aplicável em todos os modelos exceto null.
  const showMessage = model !== null

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Modelo de preço</Label>
        <Select
          value={model ?? ''}
          onChange={(v: string) => onModelChange((v || null) as PricingModel | null)}
          options={PRICING_MODEL_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
        {modelHint && <p className="text-[11px] text-slate-500 italic">{modelHint}</p>}
      </div>

      {/* Campos específicos por modelo */}
      {model === 'flat' && <FlatPricingFields pricingJson={pricingJson} onChange={onPricingJsonChange} />}
      {model === 'percentage' && <PercentagePricingFields pricingJson={pricingJson} onChange={onPricingJsonChange} />}
      {model === 'tiered' && <TieredPricingFields pricingJson={pricingJson} onChange={onPricingJsonChange} />}
      {model === 'free' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-xs text-emerald-900">
            O agente pode mencionar explicitamente que o serviço é gratuito. Use a frase abaixo para deixar o tom certo.
          </p>
        </div>
      )}
      {model === 'custom' && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <p className="text-xs text-indigo-900">
            Sem número fixo: o agente explica que o valor é cotado caso a caso. Escreva abaixo como ele explica isso.
          </p>
        </div>
      )}

      {/* Frase que o agente usa — aplicável em todos os modelos configurados */}
      {showMessage && (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">
            {model === 'custom' ? 'Como o agente explica a cobrança' :
             model === 'free' ? 'Como o agente comunica que é gratuito' :
             'Frase que o agente usa ao apresentar a taxa'}
          </Label>
          <Textarea
            rows={2}
            value={(pricingJson.message as string | undefined) ?? ''}
            onChange={e => onPricingJsonChange({ ...pricingJson, message: e.target.value })}
            placeholder={
              model === 'flat' ? 'A taxa de planejamento é R$ 500 e garante dedicação exclusiva...' :
              model === 'percentage' ? 'Cobramos 10% sobre o valor da viagem...' :
              model === 'tiered' ? 'Nossa taxa varia conforme a faixa de orçamento...' :
              model === 'free' ? 'Esse atendimento é gratuito...' :
              model === 'custom' ? 'O valor depende do projeto — combinamos após entender sua necessidade...' :
              ''
            }
          />
        </div>
      )}

      {/* Quando apresentar — só quando faz sentido cobrar */}
      {showTiming && (
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Quando apresentar</Label>
          <Select
            value={timing ?? 'after_qualification'}
            onChange={(v: string) => onTimingChange(v as FeeTiming)}
            options={FEE_TIMING_OPTIONS.filter(o => o.value !== 'never')}
          />
        </div>
      )}

      {model === null && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-600">
            Nada a configurar aqui. O agente não vai abordar preço espontaneamente. Se o cliente perguntar sobre valores, ele pede mais contexto ou passa para o humano.
          </p>
        </div>
      )}
    </div>
  )
}

function FlatPricingFields({ pricingJson, onChange }: { pricingJson: Record<string, unknown>; onChange: (j: Record<string, unknown>) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Valor</Label>
        <Input
          type="number"
          value={(pricingJson.fee as number | undefined) ?? ''}
          onChange={e => onChange({ ...pricingJson, fee: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="500"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Moeda</Label>
        <Input
          value={(pricingJson.currency as string | undefined) ?? 'BRL'}
          onChange={e => onChange({ ...pricingJson, currency: e.target.value })}
          placeholder="BRL"
        />
      </div>
    </div>
  )
}

function PercentagePricingFields({ pricingJson, onChange }: { pricingJson: Record<string, unknown>; onChange: (j: Record<string, unknown>) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Percentual (%)</Label>
        <Input
          type="number"
          step="0.1"
          value={(pricingJson.percent as number | undefined) ?? ''}
          onChange={e => onChange({ ...pricingJson, percent: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="10"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Sobre qual valor</Label>
        <Input
          value={(pricingJson.basis as string | undefined) ?? ''}
          onChange={e => onChange({ ...pricingJson, basis: e.target.value })}
          placeholder="valor da viagem, valor do imóvel, ticket do mês..."
        />
      </div>
    </div>
  )
}

function TieredPricingFields({ pricingJson, onChange }: { pricingJson: Record<string, unknown>; onChange: (j: Record<string, unknown>) => void }) {
  const tiers = (pricingJson.tiers as PriceTier[] | undefined) ?? []
  const currency = (pricingJson.currency as string | undefined) ?? 'BRL'

  const updateTier = (idx: number, patch: Partial<PriceTier>) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t))
    onChange({ ...pricingJson, tiers: next })
  }

  const removeTier = (idx: number) => {
    onChange({ ...pricingJson, tiers: tiers.filter((_, i) => i !== idx) })
  }

  const addTier = () => {
    onChange({ ...pricingJson, tiers: [...tiers, { label: '', min: 0, max: null, fee: 0 } as PriceTier] })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-600">Moeda</Label>
        <Input
          value={currency}
          onChange={e => onChange({ ...pricingJson, currency: e.target.value })}
          placeholder="BRL"
          className="max-w-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-600">Faixas</Label>
        {tiers.length === 0 && (
          <p className="text-xs text-slate-400 italic">Nenhuma faixa. Adicione pelo menos uma.</p>
        )}
        {tiers.map((tier, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-start">
            <Input
              value={tier.label ?? ''}
              onChange={e => updateTier(idx, { label: e.target.value })}
              placeholder="Rótulo (ex: Viagem nacional)"
              className="text-sm"
            />
            <Input
              type="number"
              value={tier.min ?? ''}
              onChange={e => updateTier(idx, { min: e.target.value ? Number(e.target.value) : 0 })}
              placeholder="Mínimo"
              className="text-sm"
            />
            <Input
              type="number"
              value={tier.max ?? ''}
              onChange={e => updateTier(idx, { max: e.target.value ? Number(e.target.value) : null })}
              placeholder="Máximo (vazio = sem teto)"
              className="text-sm"
            />
            <Input
              type="number"
              value={tier.fee ?? ''}
              onChange={e => updateTier(idx, { fee: e.target.value ? Number(e.target.value) : 0 })}
              placeholder="Taxa"
              className="text-sm"
            />
            <Button variant="ghost" size="sm" onClick={() => removeTier(idx)} className="text-red-500 hover:bg-red-50 h-9 w-9 p-0">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addTier} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar faixa
        </Button>
      </div>
    </div>
  )
}
