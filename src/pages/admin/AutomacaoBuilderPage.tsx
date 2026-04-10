import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Zap,
  Clock,
  Database,
  Globe,
  Plus,
  X,
  ChevronDown,
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
import JornadaStepEditor, { type JornadaStep } from '@/components/automacao/JornadaStepEditor'

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
  jornada_passos: JornadaStep[]
  ativa: boolean
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

  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSaving, setIsSaving] = useState(false)
  const [expandedConditions, setExpandedConditions] = useState(true)

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
    jornada_passos: [],
    requer_aprovacao: false,
    ativa: false,
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
            jornada_passos: [],
            ativa: data.ativa ?? false,
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

  const handleSave = async () => {
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
        ativa: formData.ativa,
        produto: currentProduct,
      }

      let regraId = id

      if (isEditing) {
        const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('automacao_regras').update(payload).eq('id', id)
        if (error) throw error
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error } = await (supabase as any)
          .from('automacao_regras')
          .insert([payload])
          .select('id')
          .single()
        if (error) throw error
        regraId = created?.id
      }

      // Save jornada steps if type=jornada
      if (formData.tipo === 'jornada' && regraId && formData.jornada_passos.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('automacao_regra_passos')
          .delete()
          .eq('regra_id', regraId)

        const passosToInsert = formData.jornada_passos.map((step: JornadaStep, idx: number) => ({
          regra_id: regraId,
          ordem: idx + 1,
          tipo: step.tipo,
          config: step.config,
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: stepsError } = await (supabase as any)
          .from('automacao_regra_passos')
          .insert(passosToInsert)
        if (stepsError) console.error('Erro ao salvar passos:', stepsError)
      }

      toast.success(isEditing ? 'Automação atualizada' : 'Automação criada')
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
    <div className="h-full flex flex-col bg-slate-50">
      {/* Fixed Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings/automacoes')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
            {isEditing ? 'Editar Automação' : 'Nova Automação'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={formData.ativa} onCheckedChange={(checked) => setFormData({ ...formData, ativa: checked })} />
            <span className="text-xs text-slate-600">Ativa</span>
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Section 1: Identidade */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Identidade</h2>

            <div>
              <Label htmlFor="nome" className="text-slate-700 font-medium text-sm">
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
              <Label htmlFor="descricao" className="text-slate-700 font-medium text-sm">
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

            <div>
              <Label className="text-slate-700 font-medium text-sm mb-3 block">Tipo de Automação</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'single' as AutomacaoType, label: 'Single', desc: '1 trigger → 1 mensagem' },
                  { value: 'jornada' as AutomacaoType, label: 'Jornada', desc: 'Sequência de passos' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormData({ ...formData, tipo: option.value })}
                    className={`p-3 rounded-lg border-2 text-left text-sm transition-colors ${
                      formData.tipo === option.value
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-slate-900">{option.label}</div>
                    <div className="text-xs text-slate-500 mt-1">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Trigger */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Trigger</h2>

            <div className="space-y-4">
              {Object.entries(TRIGGER_CATEGORIES).map(([categoryKey, category]) => {
                const IconComponent = category.icon
                return (
                  <div key={categoryKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <IconComponent className={`w-4 h-4 ${category.color}`} />
                      <h3 className="font-medium text-slate-900 text-sm capitalize">
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
                          className={`p-2 rounded-lg border-2 text-xs font-medium transition-colors text-left ${
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

            {/* Dynamic Config */}
            {formData.trigger_type && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                <h3 className="font-medium text-slate-900 text-sm">Configuração do Trigger</h3>

                {formData.trigger_type === 'stage_enter' && (
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium text-sm">Selecione as etapas</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {stages.map((stage) => (
                        <label key={stage.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={
                              (formData.trigger_config.stage_ids as string[])?.includes(stage.id) || false
                            }
                            onChange={(e) => {
                              const stageIds = (formData.trigger_config.stage_ids as string[]) || []
                              const updated = e.target.checked
                                ? [...stageIds, stage.id]
                                : stageIds.filter((s) => s !== stage.id)
                              setFormData({
                                ...formData,
                                trigger_config: { ...formData.trigger_config, stage_ids: updated },
                              })
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="text-slate-700">{stage.nome}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {['dias_no_stage', 'dias_sem_contato', 'dias_antes_viagem', 'dias_apos_viagem'].includes(
                  formData.trigger_type,
                ) && (
                  <div>
                    <Label htmlFor="dias" className="text-slate-700 font-medium text-sm">
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
                    <Label htmlFor="horas" className="text-slate-700 font-medium text-sm">
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
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="min_scroll" className="text-slate-700 font-medium text-sm">
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
                      <Label htmlFor="min_duration" className="text-slate-700 font-medium text-sm">
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

          {/* Section 3: Condições */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <button
              onClick={() => setExpandedConditions(!expandedConditions)}
              className="flex items-center justify-between w-full hover:bg-slate-50 px-1 py-1 rounded transition-colors"
            >
              <h2 className="text-base font-semibold text-slate-900">Condições (Opcional)</h2>
              <ChevronDown
                className={`w-4 h-4 text-slate-600 transition-transform ${
                  expandedConditions ? 'rotate-180' : ''
                }`}
              />
            </button>

            {expandedConditions && (
              <>
                <p className="text-xs text-slate-500">
                  Todas as condições devem ser verdadeiras (AND)
                </p>

                <div className="space-y-2">
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
                              { value: '', label: 'Op' },
                              ...OPERADORES.map((op: Operator) => ({ value: op, label: op })),
                            ]}
                            className="w-16"
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
                              { value: '', label: 'Op' },
                              ...OPERADORES.map((op: Operator) => ({ value: op, label: op })),
                            ]}
                            className="w-16"
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
                        <label className="flex items-center gap-2 flex-1">
                          <Switch
                            checked={(condition.valor as boolean) || false}
                            onCheckedChange={(checked) => {
                              const updated = [...formData.condiciones]
                              updated[idx] = { ...condition, valor: checked }
                              setFormData({ ...formData, condiciones: updated })
                            }}
                          />
                          <span className="text-xs text-slate-700">Apenas comercial</span>
                        </label>
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
                            className="w-20"
                          />
                          <span className="text-xs text-slate-600">respondeu em</span>
                        </>
                      )}

                      <button
                        onClick={() => {
                          const updated = formData.condiciones.filter((_, i) => i !== idx)
                          setFormData({ ...formData, condiciones: updated })
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
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
                  Adicionar
                </Button>
              </>
            )}
          </div>

          {/* Section 4: Mensagem */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Mensagem</h2>

            <div>
              <Label htmlFor="template" className="text-slate-700 font-medium text-sm">
                Template Existente
              </Label>
              <Select
                value={formData.template_id || ''}
                onChange={(value: string) => setFormData({ ...formData, template_id: value || null })}
                options={[
                  { value: '', label: 'Selecione um template' },
                  ...templates.map((t: MensagemTemplate) => ({ value: t.id, label: t.nome })),
                ]}
                className="mt-2"
              />
            </div>

            {selectedTemplate && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                <div className="font-medium text-slate-700 mb-2">Preview</div>
                <div className="text-slate-600 whitespace-pre-wrap text-xs">
                  {selectedTemplate.corpo || selectedTemplate.ia_prompt}
                </div>
              </div>
            )}

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-slate-500">ou</span>
              </div>
            </div>

            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <Label htmlFor="inline_nome" className="text-slate-700 font-medium text-sm">
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
                <Label className="text-slate-700 font-medium text-sm mb-2 block">Modo</Label>
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
                          template_inline: {
                            ...formData.template_inline,
                            modo: option.value as 'template' | 'ia',
                          },
                        })
                      }
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
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

              <div>
                <Label htmlFor="inline_corpo" className="text-slate-700 font-medium text-sm">
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
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Controle */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Controle</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max_envios" className="text-slate-700 font-medium text-sm">
                  Max envios por card
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
                <Label htmlFor="dedup" className="text-slate-700 font-medium text-sm">
                  Dedup (horas)
                </Label>
                <Input
                  id="dedup"
                  type="number"
                  min="0"
                  value={formData.janela_dedup_horas}
                  onChange={(e) =>
                    setFormData({ ...formData, janela_dedup_horas: parseInt(e.target.value) || 24 })
                  }
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="max_msg_dia" className="text-slate-700 font-medium text-sm">
                  Max mensagens/dia
                </Label>
                <Input
                  id="max_msg_dia"
                  type="number"
                  min="1"
                  value={formData.max_mensagens_por_dia}
                  onChange={(e) =>
                    setFormData({ ...formData, max_mensagens_por_dia: parseInt(e.target.value) || 3 })
                  }
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="phone_line" className="text-slate-700 font-medium text-sm">
                  Linha WhatsApp
                </Label>
                <Select
                  value={formData.phone_number_id}
                  onChange={(v: string) => setFormData({ ...formData, phone_number_id: v })}
                  options={[
                    { value: '', label: 'Automático' },
                    ...phoneLines.map((l) => ({
                      value: l.phone_number_id,
                      label: `${l.phone_number_label}${l.produto ? ` (${l.produto})` : ''}`,
                    })),
                  ]}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={formData.response_aware}
                  onCheckedChange={(checked) => setFormData({ ...formData, response_aware: checked })}
                />
                <span className="text-sm text-slate-700">Responder apenas se receber resposta</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={formData.requer_aprovacao}
                  onCheckedChange={(checked) => setFormData({ ...formData, requer_aprovacao: checked })}
                />
                <span className="text-sm text-slate-700">Requer aprovação antes de enviar</span>
              </label>
            </div>
          </div>

          {/* Section 6: Passos da Jornada */}
          {formData.tipo === 'jornada' && (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Passos da Jornada</h2>
              <JornadaStepEditor
                steps={formData.jornada_passos}
                onChange={(steps: JornadaStep[]) => setFormData({ ...formData, jornada_passos: steps })}
                templates={templates}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
