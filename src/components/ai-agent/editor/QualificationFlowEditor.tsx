import { useState, useEffect } from 'react'
import { GitBranch, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { SingleFieldPicker, type CRMField } from './CRMFieldPicker'
import type { QualificationStageInput, DisqualificationTrigger } from '@/hooks/useAgentQualificationFlow'

function slugifyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const ADVANCE_OPTIONS = [
  { value: '', label: 'Nenhuma (agente decide)' },
  { value: 'first_lead_message', label: 'Primeira mensagem do lead' },
  { value: 'lead_replied', label: 'Lead respondeu a etapa' },
  { value: 'meeting_confirmed', label: 'Reunião confirmada' },
]

export interface QualificationFlowEditorProps {
  value: QualificationStageInput[]
  onChange: (next: QualificationStageInput[]) => void
  pipelineId?: string
  /** Slug do produto (TRIPS, WEDDING) para filtrar os campos disponíveis. */
  produto?: string
  /** @deprecated antes era usado para popular Select. Hoje o SingleFieldPicker carrega os campos do CRM real. */
  fieldOptions?: Array<{ value: string; label: string }>
}

function emptyStage(order: number): QualificationStageInput {
  return {
    stage_order: order,
    stage_name: '',
    stage_key: '',
    question: '',
    subquestions: [],
    disqualification_triggers: [],
    advance_to_stage_id: null,
    advance_condition: null,
    response_options: null,
    maps_to_field: null,
    skip_if_filled: true,
  }
}

export function QualificationFlowEditor({ value, onChange, pipelineId, produto, fieldOptions }: QualificationFlowEditorProps) {
  const { data: stages } = usePipelineStages(pipelineId)

  // Retrocompat: se alguém ainda passa fieldOptions, converte em extraFields do picker
  // para que essas chaves apareçam no topo da lista com uma seção "Personalizados".
  const extraFields: CRMField[] | undefined = fieldOptions && fieldOptions.length > 0
    ? fieldOptions.map(o => ({
        key: o.value,
        label: o.label,
        type: 'text',
        section: '__custom_options',
        sectionLabel: 'Personalizados',
        origin: 'card' as const,
      }))
    : undefined
  const [local, setLocal] = useState<QualificationStageInput[]>(value)

  useEffect(() => { setLocal(value) }, [value])

  const commit = (next: QualificationStageInput[]) => {
    setLocal(next)
    onChange(next)
  }

  const update = (idx: number, patch: Partial<QualificationStageInput>) => {
    commit(local.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const remove = (idx: number) => {
    const next = local.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stage_order: i + 1 }))
    commit(next)
  }

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= local.length) return
    const next = [...local]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    commit(next.map((s, i) => ({ ...s, stage_order: i + 1 })))
  }

  const add = () => {
    commit([...local, emptyStage(local.length + 1)])
  }

  const stageOptions = [
    { value: '', label: '— (não avançar automaticamente)' },
    ...(stages ?? []).map(s => ({ value: s.id, label: `${s.ordem}. ${s.nome}` })),
  ]

  return (
    <div className="space-y-3">
      {local.length === 0 && (
        <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
          <p className="text-sm text-slate-500">Nenhuma pergunta cadastrada.</p>
          <Button variant="outline" size="sm" onClick={add} className="mt-3 gap-2">
            <Plus className="w-4 h-4" /> Adicionar primeira pergunta
          </Button>
        </div>
      )}

      {local.map((stage, idx) => (
        <div
          key={idx}
          className="border border-slate-200 bg-white rounded-lg p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className={cn('p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30')}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === local.length - 1} className={cn('p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30')}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700">
                {idx + 1}
              </div>
              <Input
                value={stage.stage_name}
                onChange={e => update(idx, { stage_name: e.target.value, stage_key: slugifyKey(e.target.value) })}
                placeholder="Nome da etapa (ex: Destino)"
                className="font-medium"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(idx)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0 flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Campo do card que recebe a resposta</Label>
            <SingleFieldPicker
              value={stage.maps_to_field ?? null}
              onChange={(v) => update(idx, { maps_to_field: v || null })}
              scope="card"
              pipelineId={pipelineId}
              produto={produto}
              extraFields={extraFields}
              allowCustom
              placeholder="Escolha onde salvar esta resposta"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Pergunta principal</Label>
            <Textarea
              value={stage.question}
              onChange={e => update(idx, { question: e.target.value })}
              placeholder="Qual destino vocês estão pensando?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Opções de resposta (separadas por vírgula, deixe vazio para resposta aberta)</Label>
            <Input
              value={(stage.response_options ?? []).join(', ')}
              onChange={e => {
                const parts = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                update(idx, { response_options: parts.length > 0 ? parts : null })
              }}
              placeholder="Próximos 3 meses, 3 a 6 meses, Datas flexíveis"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Condição de avanço</Label>
              <Select
                value={stage.advance_condition ?? ''}
                onChange={(v: string) => update(idx, { advance_condition: v || null })}
                options={ADVANCE_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Etapa do pipeline para avançar</Label>
              <Select
                value={stage.advance_to_stage_id ?? ''}
                onChange={(v: string) => update(idx, { advance_to_stage_id: v || null })}
                options={stageOptions}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={stage.skip_if_filled}
              onCheckedChange={v => update(idx, { skip_if_filled: v })}
            />
            <span className="text-sm text-slate-700">Pular esta pergunta se o campo já estiver preenchido</span>
          </div>

          <DisqualificationEditor
            value={stage.disqualification_triggers}
            onChange={next => update(idx, { disqualification_triggers: next })}
          />
        </div>
      ))}

      {local.length > 0 && (
        <Button variant="outline" onClick={add} className="gap-2 w-full">
          <Plus className="w-4 h-4" /> Adicionar pergunta
        </Button>
      )}
    </div>
  )
}

function DisqualificationEditor({
  value, onChange,
}: { value: DisqualificationTrigger[]; onChange: (next: DisqualificationTrigger[]) => void }) {
  const add = () => onChange([...value, { trigger: '', message: '' }])
  const update = (i: number, patch: Partial<DisqualificationTrigger>) => {
    onChange(value.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-600">Gatilhos de desqualificação (opcional)</Label>
        <Button variant="ghost" size="sm" onClick={add} className="gap-1 h-7 text-xs">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-slate-400 italic">Nenhum gatilho — use handoff signals para cenários genéricos.</p>
      )}
      {value.map((trigger, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
          <Input
            value={trigger.trigger}
            onChange={e => update(i, { trigger: e.target.value })}
            placeholder="Condição (ex: hospedagem_contratada)"
            className="text-sm"
          />
          <Input
            value={trigger.message}
            onChange={e => update(i, { message: e.target.value })}
            placeholder="Mensagem ao cliente"
            className="text-sm"
          />
          <Button variant="ghost" size="sm" onClick={() => remove(i)} className="text-red-500 hover:bg-red-50 h-8 w-8 p-0">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

export function QualificationFlowSection(props: QualificationFlowEditorProps) {
  const enabled = props.value.length
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-indigo-500" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Funil de qualificação</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {enabled > 0
                ? `${enabled} pergunta${enabled > 1 ? 's' : ''} na ordem. O agente segue a ordem e pula quando o campo já foi preenchido.`
                : 'Defina as perguntas que o agente faz antes de agendar reunião.'}
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
        <p className="text-xs text-indigo-900">
          <strong>Como funciona:</strong> uma pergunta por vez, na ordem. Se o cliente já preencheu o campo selecionado, a pergunta é pulada. Use <em>Opções de resposta</em> para faixas predefinidas (ex: orçamento).
        </p>
      </div>

      <QualificationFlowEditor {...props} />
    </section>
  )
}
