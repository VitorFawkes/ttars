import { useState } from 'react'
import {
  Trash2, GripVertical, Send, Clock, Phone,
  CheckCircle2, Edit3, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MensagemTemplate } from '@/hooks/useMensagemTemplates'

export type StepType = 'enviar_mensagem' | 'aguardar' | 'criar_tarefa' | 'verificar_resposta' | 'atualizar_campo'

export interface JornadaStep {
  id: string
  ordem: number
  tipo: StepType
  config: Record<string, unknown>
}

interface Props {
  steps: JornadaStep[]
  onChange: (steps: JornadaStep[]) => void
  templates: MensagemTemplate[]
}

const STEP_TYPES: Array<{ value: StepType; label: string; icon: typeof Send; color: string }> = [
  { value: 'enviar_mensagem', label: 'Enviar Mensagem', icon: Send, color: 'text-blue-600 bg-blue-50' },
  { value: 'aguardar', label: 'Aguardar', icon: Clock, color: 'text-amber-600 bg-amber-50' },
  { value: 'verificar_resposta', label: 'Verificar Resposta', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  { value: 'criar_tarefa', label: 'Criar Tarefa', icon: Phone, color: 'text-purple-600 bg-purple-50' },
  { value: 'atualizar_campo', label: 'Atualizar Campo', icon: Edit3, color: 'text-slate-600 bg-slate-50' },
]

function generateId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function JornadaStepEditor({ steps, onChange, templates }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const addStep = (tipo: StepType) => {
    const defaultConfigs: Record<StepType, Record<string, unknown>> = {
      enviar_mensagem: { template_id: '' },
      aguardar: { horas: 24, tipo: 'uteis' },
      criar_tarefa: { tipo: 'contato', titulo: '', descricao: '', prioridade: 'alta' },
      verificar_resposta: { se_respondeu: 'parar', se_nao: 'continuar' },
      atualizar_campo: { tabela: 'cards', campo: '', valor: '' },
    }

    const newStep: JornadaStep = {
      id: generateId(),
      ordem: steps.length + 1,
      tipo,
      config: defaultConfigs[tipo],
    }

    onChange([...steps, newStep])
    setExpandedStep(newStep.id)
  }

  const removeStep = (id: string) => {
    const updated = steps
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, ordem: i + 1 }))
    onChange(updated)
  }

  const updateStep = (id: string, config: Record<string, unknown>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, config } : s)))
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === steps.length - 1) return

    const newSteps = [...steps]
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    ;[newSteps[index], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[index]]
    onChange(newSteps.map((s, i) => ({ ...s, ordem: i + 1 })))
  }

  const getStepMeta = (tipo: StepType) => STEP_TYPES.find((t) => t.value === tipo)!

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Passos da Jornada</h3>
        <span className="text-sm text-slate-500">{steps.length} passos</span>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {steps.map((step, index) => {
          const meta = getStepMeta(step.tipo)
          const Icon = meta.icon
          const isExpanded = expandedStep === step.id

          return (
            <div key={step.id} className="relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="absolute left-5 top-14 w-0.5 h-4 bg-slate-200" />
              )}

              <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                {/* Step header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveStep(index, 'up') }}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-30"
                      disabled={index === 0}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveStep(index, 'down') }}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-30"
                      disabled={index === steps.length - 1}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  <GripVertical className="w-4 h-4 text-slate-300" />

                  <div className={`p-1.5 rounded ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900">
                      {index + 1}. {meta.label}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {getStepSummary(step, templates)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeStep(step.id) }}
                    className="text-slate-300 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                    <StepConfig
                      step={step}
                      templates={templates}
                      onChange={(config) => updateStep(step.id, config)}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">Nenhum passo adicionado. Adicione passos abaixo.</p>
        </div>
      )}

      {/* Add step buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        {STEP_TYPES.map(({ value, label, icon: StepIcon, color }) => (
          <Button
            key={value}
            variant="outline"
            size="sm"
            onClick={() => addStep(value)}
            className="gap-2 text-xs"
          >
            <div className={`p-0.5 rounded ${color}`}>
              <StepIcon className="w-3 h-3" />
            </div>
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step summary (one-liner for collapsed view)
// ---------------------------------------------------------------------------
function getStepSummary(step: JornadaStep, templates: MensagemTemplate[]): string {
  const c = step.config
  switch (step.tipo) {
    case 'enviar_mensagem': {
      const tpl = templates.find((t) => t.id === c.template_id)
      return tpl ? `"${tpl.nome}"` : 'Selecionar template...'
    }
    case 'aguardar':
      return `${c.horas || 24}h (${c.tipo === 'uteis' ? 'úteis' : 'corridas'})`
    case 'verificar_resposta':
      return c.se_respondeu === 'parar' ? 'Se respondeu → parar' : 'Se respondeu → continuar'
    case 'criar_tarefa':
      return (c.titulo as string) || 'Definir tarefa...'
    case 'atualizar_campo':
      return `${c.campo || '...'} = ${c.valor || '...'}`
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Step config panel (expanded view)
// ---------------------------------------------------------------------------
function StepConfig({
  step,
  templates,
  onChange,
}: {
  step: JornadaStep
  templates: MensagemTemplate[]
  onChange: (config: Record<string, unknown>) => void
}) {
  const c = step.config

  switch (step.tipo) {
    case 'enviar_mensagem':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-slate-700 text-sm">Template</Label>
            <Select
              value={(c.template_id as string) || ''}
              onChange={(v: string) => onChange({ ...c, template_id: v })}
              options={[
                { value: '', label: 'Selecionar template...' },
                ...templates.map((t) => ({
                  value: t.id,
                  label: `${t.nome} (${t.modo === 'template_fixo' ? 'Fixo' : t.modo === 'template_ia' ? 'IA Assistida' : 'IA Generativa'})`,
                })),
              ]}
              className="mt-1"
            />
          </div>
        </div>
      )

    case 'aguardar':
      return (
        <div className="flex gap-4">
          <div className="flex-1">
            <Label className="text-slate-700 text-sm">Horas</Label>
            <Input
              type="number"
              min={1}
              value={(c.horas as number) || 24}
              onChange={(e) => onChange({ ...c, horas: parseInt(e.target.value) || 24 })}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-slate-700 text-sm">Tipo</Label>
            <Select
              value={(c.tipo as string) || 'uteis'}
              onChange={(v: string) => onChange({ ...c, tipo: v })}
              options={[
                { value: 'uteis', label: 'Horas úteis (seg-sex, 9-18h)' },
                { value: 'corridas', label: 'Horas corridas' },
              ]}
              className="mt-1"
            />
          </div>
        </div>
      )

    case 'verificar_resposta':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-slate-700 text-sm">Se o cliente respondeu</Label>
            <Select
              value={(c.se_respondeu as string) || 'parar'}
              onChange={(v: string) => onChange({ ...c, se_respondeu: v })}
              options={[
                { value: 'parar', label: 'Parar jornada (cliente já interagiu)' },
                { value: 'pular', label: 'Pular para próximo passo' },
              ]}
              className="mt-1"
            />
          </div>
          <p className="text-xs text-slate-500">
            Verifica se houve mensagem inbound do contato desde o início da jornada.
          </p>
        </div>
      )

    case 'criar_tarefa':
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-slate-700 text-sm">Título da tarefa</Label>
            <Input
              value={(c.titulo as string) || ''}
              onChange={(e) => onChange({ ...c, titulo: e.target.value })}
              placeholder="Ex: Ligar para o cliente"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-slate-700 text-sm">Descrição (opcional)</Label>
            <Textarea
              value={(c.descricao as string) || ''}
              onChange={(e) => onChange({ ...c, descricao: e.target.value })}
              placeholder="Detalhes da tarefa..."
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-slate-700 text-sm">Tipo</Label>
              <Select
                value={(c.tipo as string) || 'contato'}
                onChange={(v: string) => onChange({ ...c, tipo: v })}
                options={[
                  { value: 'contato', label: 'Contato' },
                  { value: 'interno', label: 'Interno' },
                  { value: 'follow_up', label: 'Follow-up' },
                ]}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="text-slate-700 text-sm">Prioridade</Label>
              <Select
                value={(c.prioridade as string) || 'alta'}
                onChange={(v: string) => onChange({ ...c, prioridade: v })}
                options={[
                  { value: 'alta', label: 'Alta' },
                  { value: 'media', label: 'Média' },
                  { value: 'baixa', label: 'Baixa' },
                ]}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )

    case 'atualizar_campo':
      return (
        <div className="flex gap-4">
          <div className="flex-1">
            <Label className="text-slate-700 text-sm">Campo</Label>
            <Input
              value={(c.campo as string) || ''}
              onChange={(e) => onChange({ ...c, campo: e.target.value })}
              placeholder="Ex: tags"
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label className="text-slate-700 text-sm">Valor</Label>
            <Input
              value={(c.valor as string) || ''}
              onChange={(e) => onChange({ ...c, valor: e.target.value })}
              placeholder="Ex: follow_up_enviado"
              className="mt-1"
            />
          </div>
        </div>
      )

    default:
      return null
  }
}
