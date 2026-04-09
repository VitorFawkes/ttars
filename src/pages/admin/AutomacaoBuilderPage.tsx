import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Zap,
  Clock,
  Database,
  Globe,
  Check,
  ChevronRight,
  X,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useMensagemTemplates, type MensagemTemplate } from '@/hooks/useMensagemTemplates'
import type { TriggerType } from '@/hooks/useAutomacaoRegras'

type AutomacaoType = 'single' | 'jornada'
type ConditionType = 'card' | 'contato' | 'horario' | 'engajamento'
type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'not_null'

interface Condition {
  id: string
  tipo: ConditionType
  campo: string
  operador: Operator
  valor: string | string[] | boolean
}

interface FormData {
  nome: string
  descricao: string
  tipo: AutomacaoType
  trigger_type: TriggerType | ''
  trigger_config: Record<string, unknown>
  condiciones: Condition[]
  template_id: string | null
  template_inline: {
    nome: string
    modo: 'template' | 'ia'
    corpo: string
  }
  max_envios_por_card: number
  janela_dedup_horas: number
  max_mensagens_por_dia: number
  response_aware: boolean
  requer_aprovacao: boolean
  phone_number_id: string
}

const TRIGGER_LABELS: Record<TriggerType | '', string> = {
  stage_enter: 'Card entrou em etapa',
  stage_exit: 'Card saiu de etapa',
  card_won: 'Card ganho',
  card_lost: 'Card perdido',
  card_created: 'Card criado',
  field_changed: 'Campo alterado',
  owner_changed: 'Dono alterado',
  dias_no_stage: 'Dias na etapa',
  dias_sem_contato: 'Dias sem contato',
  sem_resposta_horas: 'Sem resposta',
  dias_antes_viagem: 'Antes da viagem',
  dias_apos_viagem: 'Após a viagem',
  aniversario_contato: 'Aniversário',
  documento_recebido: 'Documento recebido',
  documento_pendente: 'Documento pendente',
  proposta_visualizada: 'Proposta visualizada',
  proposta_aceita: 'Proposta aceita',
  proposta_expirada: 'Proposta expirada',
  voo_alterado: 'Voo alterado',
  pagamento_recebido: 'Pagamento recebido',
  milestone_atingido: 'Milestone atingido',
  webhook_externo: 'Webhook externo',
  '': 'Selecione um trigger',
}

const TRIGGER_CATEGORIES = {
  pipeline: {
    icon: Zap,
    color: 'text-green-600',
    triggers: ['stage_enter', 'stage_exit', 'card_won', 'card_lost', 'card_created', 'owner_changed'] as TriggerType[],
  },
  temporal: {
    icon: Clock,
    color: 'text-amber-600',
    triggers: [
      'dias_no_stage',
      'dias_sem_contato',
      'sem_resposta_horas',
      'dias_antes_viagem',
      'dias_apos_viagem',
      'aniversario_contato',
    ] as TriggerType[],
  },
  dados: {
    icon: Database,
    color: 'text-blue-600',
    triggers: [
      'documento_recebido',
      'documento_pendente',
      'proposta_visualizada',
      'proposta_expirada',
      'voo_alterado',
      'milestone_atingido',
    ] as TriggerType[],
  },
  externo: {
    icon: Globe,
    color: 'text-purple-600',
    triggers: ['webhook_externo'] as TriggerType[],
  },
}

const CARD_CAMPOS = ['status_comercial', 'valor_estimado', 'pipeline_id']
const CONTATO_CAMPOS = ['telefone', 'tipo_pessoa']
const OPERADORES: Operator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'not_null']

export default function AutomacaoBuilderPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = id && id !== 'new'

  const { slug: currentProduct } = useCurrentProductMeta()
  const stagesQuery = usePipelineStages()
  const stages = stagesQuery.data || []
  const { templates } = useMensagemTemplates()

  // Linhas WhatsApp disponíveis
  const [phoneLines, setPhoneLines] = useState<Array<{ phone_number_id: string; phone_number_label: string; produto: string | null }>>([])
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('whatsapp_linha_config')
      .select('phone_number_id, phone_number_label, produto')
      .eq('ativo', true)
      .order('phone_number_label')
      .then(({ data }: { data: Array<{ phone_number_id: string; phone_number_label: string; produto: string | null }> | null }) => {
        if (data) setPhoneLines(data)
      })
  }, [])

  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSaving, setIsSaving] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  const [formData, setFormData] = useState<FormData>({
    nome: '',
    descricao: '',
    tipo: 'single',
    trigger_type: '',
    trigger_config: {},
    condiciones: [],
    template_id: null,
    template_inline: {
      nome: '',
      modo: 'template',
      corpo: '',
    },
    max_envios_por_card: 1,
    janela_dedup_horas: 24,
    max_mensagens_por_dia: 3,
    response_aware: true,
    phone_number_id: '',
    requer_aprovacao: false,
  })

  // Load existing regra if editing
  useEffect(() => {
    if (!isEditing) {
      setIsLoading(false)
      return
    }

    const loadRegra = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('automacao_regras')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error

        if (data) {
          setFormData({
            nome: data.nome || '',
            descricao: data.descricao || '',
            tipo: data.tipo || 'single',
            trigger_type: data.trigger_type || '',
            trigger_config: data.trigger_config || {},
            condiciones: data.condiciones || [],
            template_id: data.template_id || null,
            template_inline: data.template_inline || { nome: '', modo: 'template', corpo: '' },
            max_envios_por_card: data.max_envios_por_card || 1,
            janela_dedup_horas: data.janela_dedup_horas || 24,
            max_mensagens_por_dia: data.max_mensagens_por_dia || 3,
            response_aware: data.response_aware ?? true,
            requer_aprovacao: data.requer_aprovacao ?? false,
            phone_number_id: data.phone_number_id || '',
          })
        }
      } catch (err) {
        console.error('Erro ao carregar automação:', err)
        toast.error('Erro ao carregar automação')
      } finally {
        setIsLoading(false)
      }
    }

    loadRegra()
  }, [id, isEditing])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === formData.template_id),
    [formData.template_id, templates],
  )

  const markStepCompleted = (step: number): void => {
    setCompletedSteps((prev: number[]) => (prev.includes(step) ? prev : [...prev, step]))
  }

  const canContinue = useMemo((): boolean => {
    switch (currentStep) {
      case 1:
        return !!formData.nome.trim() && !!formData.tipo
      case 2:
        return !!formData.trigger_type
      case 3:
        return true // condições são opcionais
      case 4:
        return !!(formData.template_id || formData.template_inline.nome)
      case 5:
        return true
      case 6:
        return true
      default:
        return false
    }
  }, [currentStep, formData])

  const handleNextStep = (): void => {
    if (canContinue && currentStep < 6) {
      markStepCompleted(currentStep)
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevStep = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number): void => {
    if (completedSteps.includes(step) || step === 1 || step === currentStep) {
      setCurrentStep(step)
    }
  }

  const handleSave = async (activate: boolean): Promise<void> => {
    setIsSaving(true)
    try {
      const payload = {
        nome: formData.nome.trim(),
        descricao: formData.descricao.trim(),
        tipo: formData.tipo,
        trigger_type: formData.trigger_type,
        trigger_config: formData.trigger_config,
        condiciones: formData.condiciones,
        template_id: formData.template_id,
        template_inline: formData.template_inline,
        max_envios_por_card: formData.max_envios_por_card,
        janela_dedup_horas: formData.janela_dedup_horas,
        max_mensagens_por_dia: formData.max_mensagens_por_dia,
        response_aware: formData.response_aware,
        requer_aprovacao: formData.requer_aprovacao,
        phone_number_id: formData.phone_number_id || null,
        ativa: activate,
        produto: currentProduct,
      }

      if (isEditing) {
        const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('automacao_regras').update(payload).eq('id', id)
        if (error) throw error
        toast.success('Automação atualizada com sucesso')
      } else {
        const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('automacao_regras').insert([payload])
        if (error) throw error
        toast.success('Automação criada com sucesso')
      }

      navigate('/settings/automacoes')
    } catch (err) {
      console.error('Erro ao salvar automação:', err)
      toast.error('Erro ao salvar automação')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-600">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/settings/automacoes')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isEditing ? 'Editar Automação' : 'Nova Automação'}
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="mb-8 flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <button
                onClick={() => goToStep(step)}
                className={`flex items-center justify-center w-10 h-10 rounded-lg font-medium text-sm transition-colors ${
                  step === currentStep
                    ? 'bg-indigo-600 text-white'
                    : completedSteps.includes(step)
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-slate-200 text-slate-600'
                }`}
                disabled={!completedSteps.includes(step) && step !== 1 && step !== currentStep}
              >
                {completedSteps.includes(step) ? <Check className="w-5 h-5" /> : step}
              </button>
              {step < 6 && <ChevronRight className="w-4 h-4 text-slate-300" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 min-h-96">
          {/* Step 1: Identidade */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Identidade da Automação</h2>

                <div className="space-y-4 mb-8">
                  <div>
                    <Label htmlFor="nome" className="text-slate-700 font-medium">
                      Nome *
                    </Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Lembrete viagem 7 dias antes"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="descricao" className="text-slate-700 font-medium">
                      Descrição
                    </Label>
                    <Textarea
                      id="descricao"
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Descreva o objetivo desta automação..."
                      rows={3}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 font-medium mb-3 block">Tipo de Automação</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { value: 'single' as AutomacaoType, label: 'Single', desc: '1 trigger → 1 mensagem' },
                      { value: 'jornada' as AutomacaoType, label: 'Jornada', desc: 'Sequência de passos' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setFormData({ ...formData, tipo: option.value })}
                        className={`p-4 rounded-lg border-2 text-left transition-colors ${
                          formData.tipo === option.value
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="font-medium text-slate-900">{option.label}</div>
                        <div className="text-sm text-slate-500 mt-1">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Trigger */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Trigger da Automação</h2>

              <div className="space-y-6">
                {Object.entries(TRIGGER_CATEGORIES).map(([categoryKey, category]) => {
                  const IconComponent = category.icon
                  return (
                    <div key={categoryKey}>
                      <div className="flex items-center gap-2 mb-3">
                        <IconComponent className={`w-5 h-5 ${category.color}`} />
                        <h3 className="font-medium text-slate-900 capitalize">
                          {categoryKey === 'pipeline' && 'Pipeline'}
                          {categoryKey === 'temporal' && 'Temporal'}
                          {categoryKey === 'dados' && 'Dados'}
                          {categoryKey === 'externo' && 'Externo'}
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {category.triggers.map((trigger) => (
                          <button
                            key={trigger}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                trigger_type: trigger,
                                trigger_config: {},
                              })
                            }
                            className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors text-left ${
                              formData.trigger_type === trigger
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                            }`}
                          >
                            {TRIGGER_LABELS[trigger]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Dynamic Config based on trigger */}
              {formData.trigger_type && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <h3 className="font-medium text-slate-900 mb-4">Configuração do Trigger</h3>

                  {formData.trigger_type === 'stage_enter' && (
                    <div>
                      <Label className="text-slate-700 font-medium mb-2 block">
                        Selecione as etapas
                      </Label>
                      <div className="space-y-2">
                        {stages.map((stage) => (
                          <label key={stage.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={
                                (formData.trigger_config.stage_ids as string[])?.includes(stage.id) || false
                              }
                              onChange={(e) => {
                                const stageIds = (formData.trigger_config.stage_ids as string[]) || []
                                const updated = e.target.checked
                                  ? [...stageIds, stage.id]
                                  : stageIds.filter((id) => id !== stage.id)
                                setFormData({
                                  ...formData,
                                  trigger_config: { ...formData.trigger_config, stage_ids: updated },
                                })
                              }}
                              className="rounded border-slate-300"
                            />
                            <span className="text-slate-700">{(stage as { name?: string }).name ?? stage.nome}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {['dias_no_stage', 'dias_sem_contato', 'dias_antes_viagem', 'dias_apos_viagem'].includes(
                    formData.trigger_type,
                  ) && (
                    <div>
                      <Label htmlFor="dias" className="text-slate-700 font-medium">
                        Dias
                      </Label>
                      <Input
                        id="dias"
                        type="number"
                        min="0"
                        value={(formData.trigger_config.dias as number) || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            trigger_config: { ...formData.trigger_config, dias: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="mt-2"
                      />
                    </div>
                  )}

                  {formData.trigger_type === 'sem_resposta_horas' && (
                    <div>
                      <Label htmlFor="horas" className="text-slate-700 font-medium">
                        Horas
                      </Label>
                      <Input
                        id="horas"
                        type="number"
                        min="0"
                        value={(formData.trigger_config.horas as number) || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            trigger_config: { ...formData.trigger_config, horas: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="mt-2"
                      />
                    </div>
                  )}

                  {formData.trigger_type === 'proposta_visualizada' && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="min_scroll" className="text-slate-700 font-medium">
                          Min Scroll Depth (%)
                        </Label>
                        <Input
                          id="min_scroll"
                          type="number"
                          min="0"
                          max="100"
                          value={(formData.trigger_config.min_scroll_depth as number) || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              trigger_config: {
                                ...formData.trigger_config,
                                min_scroll_depth: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="min_duration" className="text-slate-700 font-medium">
                          Min Duration (segundos)
                        </Label>
                        <Input
                          id="min_duration"
                          type="number"
                          min="0"
                          value={(formData.trigger_config.min_duration_seconds as number) || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              trigger_config: {
                                ...formData.trigger_config,
                                min_duration_seconds: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          className="mt-2"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Condições */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Condições (Opcional)</h2>

              <div className="text-sm text-slate-500 mb-4">
                Todas as condições devem ser verdadeiras (AND)
              </div>

              <div className="space-y-3">
                {formData.condiciones.map((condition: Condition, idx: number) => (
                  <div key={condition.id} className="flex items-end gap-2 p-3 bg-slate-50 rounded-lg">
                    <Select
                      value={condition.tipo}
                      onChange={(value: string) => {
                        const updated = [...formData.condiciones]
                        updated[idx] = { ...condition, tipo: value as ConditionType, campo: '' }
                        setFormData({ ...formData, condiciones: updated })
                      }}
                      options={[
                        { value: '', label: 'Tipo' },
                        { value: 'card', label: 'Card' },
                        { value: 'contato', label: 'Contato' },
                        { value: 'horario', label: 'Horário' },
                        { value: 'engajamento', label: 'Engajamento' },
                      ]}
                      className="w-24"
                    />

                    {condition.tipo === 'card' && (
                      <>
                        <Select
                          value={condition.campo}
                          onChange={(value: string) => {
                            const updated = [...formData.condiciones]
                            updated[idx] = { ...condition, campo: value }
                            setFormData({ ...formData, condiciones: updated })
                          }}
                          options={[
                            { value: '', label: 'Campo' },
                            ...CARD_CAMPOS.map((campo: string) => ({ value: campo, label: campo })),
                          ]}
                          className="flex-1"
                        />

                        <Select
                          value={condition.operador}
                          onChange={(value: string) => {
                            const updated = [...formData.condiciones]
                            updated[idx] = { ...condition, operador: value as Operator }
                            setFormData({ ...formData, condiciones: updated })
                          }}
                          options={[
                            { value: '', label: 'Operador' },
                            ...OPERADORES.map((op: Operator) => ({ value: op, label: op })),
                          ]}
                          className="w-24"
                        />

                        {condition.operador !== 'not_null' && (
                          <Input
                            value={condition.valor as string}
                            onChange={(e) => {
                              const updated = [...formData.condiciones]
                              updated[idx] = { ...condition, valor: e.target.value }
                              setFormData({ ...formData, condiciones: updated })
                            }}
                            placeholder="Valor"
                            className="flex-1"
                          />
                        )}
                      </>
                    )}

                    {condition.tipo === 'contato' && (
                      <>
                        <Select
                          value={condition.campo}
                          onChange={(value: string) => {
                            const updated = [...formData.condiciones]
                            updated[idx] = { ...condition, campo: value }
                            setFormData({ ...formData, condiciones: updated })
                          }}
                          options={[
                            { value: '', label: 'Campo' },
                            ...CONTATO_CAMPOS.map((campo: string) => ({ value: campo, label: campo })),
                          ]}
                          className="flex-1"
                        />

                        <Select
                          value={condition.operador}
                          onChange={(value: string) => {
                            const updated = [...formData.condiciones]
                            updated[idx] = { ...condition, operador: value as Operator }
                            setFormData({ ...formData, condiciones: updated })
                          }}
                          options={[
                            { value: '', label: 'Operador' },
                            ...OPERADORES.map((op: Operator) => ({ value: op, label: op })),
                          ]}
                          className="w-24"
                        />

                        {condition.operador !== 'not_null' && (
                          <Input
                            value={condition.valor as string}
                            onChange={(e) => {
                              const updated = [...formData.condiciones]
                              updated[idx] = { ...condition, valor: e.target.value }
                              setFormData({ ...formData, condiciones: updated })
                            }}
                            placeholder="Valor"
                            className="flex-1"
                          />
                        )}
                      </>
                    )}

                    {condition.tipo === 'horario' && (
                      <>
                        <label className="flex items-center gap-2 flex-1">
                          <Switch
                            checked={(condition.valor as boolean) || false}
                            onCheckedChange={(checked) => {
                              const updated = [...formData.condiciones]
                              updated[idx] = { ...condition, valor: checked }
                              setFormData({ ...formData, condiciones: updated })
                            }}
                          />
                          <span className="text-sm text-slate-700">Apenas horário comercial</span>
                        </label>
                      </>
                    )}

                    {condition.tipo === 'engajamento' && (
                      <>
                        <Input
                          type="number"
                          placeholder="Horas"
                          value={String(condition.valor || '')}
                          onChange={(e) => {
                            const updated = [...formData.condiciones]
                            updated[idx] = { ...condition, valor: e.target.value }
                            setFormData({ ...formData, condiciones: updated })
                          }}
                          className="w-24"
                        />
                        <span className="text-sm text-slate-600">respondeu nas últimas</span>
                      </>
                    )}

                    <button
                      onClick={() => {
                        const updated = formData.condiciones.filter((_, i) => i !== idx)
                        setFormData({ ...formData, condiciones: updated })
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setFormData({
                    ...formData,
                    condiciones: [
                      ...formData.condiciones,
                      {
                        id: Math.random().toString(36),
                        tipo: 'card',
                        campo: '',
                        operador: 'eq',
                        valor: '',
                      },
                    ],
                  })
                }}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Condição
              </Button>
            </div>
          )}

          {/* Step 4: Mensagem */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Mensagem</h2>

              <div>
                <Label htmlFor="template" className="text-slate-700 font-medium">
                  Template
                </Label>
                <Select
                  value={formData.template_id || ''}
                  onChange={(value: string) => setFormData({ ...formData, template_id: value || null })}
                  options={[
                    { value: '', label: 'Selecione um template existente' },
                    ...templates.map((t: MensagemTemplate) => ({ value: t.id, label: t.nome })),
                  ]}
                  className="mt-2"
                />
              </div>

              {selectedTemplate && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-sm font-medium text-slate-700 mb-2">Preview</div>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap">
                    {selectedTemplate.corpo || selectedTemplate.ia_prompt}
                  </div>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">ou</span>
                </div>
              </div>

              <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <Label htmlFor="inline_nome" className="text-slate-700 font-medium">
                    Nome do Template (inline)
                  </Label>
                  <Input
                    id="inline_nome"
                    value={formData.template_inline.nome}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        template_inline: { ...formData.template_inline, nome: e.target.value },
                      })
                    }
                    placeholder="Ex: Lembrete viagem"
                    className="mt-2"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-slate-700 font-medium">Modo</Label>
                    <div className="flex gap-2">
                      {[
                        { value: 'template', label: 'Template' },
                        { value: 'ia', label: 'IA' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() =>
                            setFormData({
                              ...formData,
                              template_inline: { ...formData.template_inline, modo: option.value as 'template' | 'ia' },
                            })
                          }
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            formData.template_inline.modo === option.value
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="inline_corpo" className="text-slate-700 font-medium">
                    {formData.template_inline.modo === 'template' ? 'Corpo da Mensagem' : 'Prompt IA'}
                  </Label>
                  <Textarea
                    id="inline_corpo"
                    value={formData.template_inline.corpo}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        template_inline: { ...formData.template_inline, corpo: e.target.value },
                      })
                    }
                    placeholder={
                      formData.template_inline.modo === 'template'
                        ? 'Escreva o corpo da mensagem...'
                        : 'Descreva o que a IA deve gerar...'
                    }
                    rows={4}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Controle */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Controle e Limites</h2>

              {/* Linha WhatsApp */}
              <div>
                <Label className="text-slate-700 font-medium">Linha WhatsApp (de qual número enviar)</Label>
                <Select
                  value={formData.phone_number_id}
                  onChange={(v: string) => setFormData({ ...formData, phone_number_id: v })}
                  options={[
                    { value: '', label: 'Automático (resolver pela fase do card)' },
                    ...phoneLines.map((l) => ({ value: l.phone_number_id, label: `${l.phone_number_label}${l.produto ? ` (${l.produto})` : ''}` })),
                  ]}
                  placeholder="Selecionar linha..."
                  className="mt-2"
                />
                <p className="text-xs text-slate-500 mt-1">Se automático, o sistema escolhe com base na fase do pipeline do card.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="max_envios" className="text-slate-700 font-medium">
                    Max Envios por Card
                  </Label>
                  <Input
                    id="max_envios"
                    type="number"
                    min="1"
                    value={formData.max_envios_por_card}
                    onChange={(e) =>
                      setFormData({ ...formData, max_envios_por_card: parseInt(e.target.value) || 1 })
                    }
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="janela_dedup" className="text-slate-700 font-medium">
                    Janela Dedup (horas)
                  </Label>
                  <Input
                    id="janela_dedup"
                    type="number"
                    min="1"
                    value={formData.janela_dedup_horas}
                    onChange={(e) =>
                      setFormData({ ...formData, janela_dedup_horas: parseInt(e.target.value) || 24 })
                    }
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="max_por_dia" className="text-slate-700 font-medium">
                    Max Mensagens por Dia
                  </Label>
                  <Input
                    id="max_por_dia"
                    type="number"
                    min="1"
                    value={formData.max_mensagens_por_dia}
                    onChange={(e) =>
                      setFormData({ ...formData, max_mensagens_por_dia: parseInt(e.target.value) || 3 })
                    }
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-900 font-medium">Response-Aware</Label>
                    <div className="text-sm text-slate-500">Pausa se o cliente responder</div>
                  </div>
                  <Switch
                    checked={formData.response_aware}
                    onCheckedChange={(checked) => setFormData({ ...formData, response_aware: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-900 font-medium">Modo Aprovação</Label>
                    <div className="text-sm text-slate-500">IA gera, agente aprova antes de enviar</div>
                  </div>
                  <Switch
                    checked={formData.requer_aprovacao}
                    onCheckedChange={(checked) => setFormData({ ...formData, requer_aprovacao: checked })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Revisão */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Revisão</h2>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600">Nome</div>
                      <div className="font-medium text-slate-900">{formData.nome}</div>
                    </div>
                    <div>
                      <div className="text-slate-600">Tipo</div>
                      <div className="font-medium text-slate-900 capitalize">{formData.tipo}</div>
                    </div>
                    <div>
                      <div className="text-slate-600">Trigger</div>
                      <div className="font-medium text-slate-900">{TRIGGER_LABELS[formData.trigger_type]}</div>
                    </div>
                    <div>
                      <div className="text-slate-600">Mensagem</div>
                      <div className="font-medium text-slate-900">
                        {selectedTemplate?.nome || formData.template_inline.nome}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-600">Max Envios</div>
                      <div className="font-medium text-slate-900">{formData.max_envios_por_card}</div>
                    </div>
                    <div>
                      <div className="text-slate-600">Response-Aware</div>
                      <div className="font-medium text-slate-900">
                        {formData.response_aware ? 'Ativado' : 'Desativado'}
                      </div>
                    </div>
                  </div>
                </div>

                {formData.descricao && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="text-sm text-slate-600">Descrição</div>
                    <div className="text-slate-900 mt-1">{formData.descricao}</div>
                  </div>
                )}

                {formData.condiciones.length > 0 && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="text-sm font-medium text-slate-900 mb-2">Condições</div>
                    <div className="text-sm text-slate-600">
                      {formData.condiciones.length} condição(ões) configurada(s)
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={handlePrevStep} disabled={currentStep === 1}>
            Anterior
          </Button>

          <div className="flex gap-4">
            {currentStep === 6 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  Salvar como Rascunho
                </Button>
                <Button onClick={() => handleSave(true)} disabled={isSaving} className="gap-2">
                  <Zap className="w-4 h-4" />
                  Salvar e Ativar
                </Button>
              </>
            ) : (
              <Button onClick={handleNextStep} disabled={!canContinue} className="gap-2">
                Próximo
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
