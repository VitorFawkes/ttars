import { useState } from 'react'
import { useMensagemTemplates, type MensagemTemplate, type TemplateModo, type TemplateCategoria } from '@/hooks/useMensagemTemplates'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Copy, Bot, FileText, Sparkles, X, Save, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORIA_LABELS: Record<TemplateCategoria, string> = {
  follow_up: 'Follow-up',
  nurturing: 'Nurturing',
  lembrete: 'Lembrete',
  reativacao: 'Reativação',
  pos_venda: 'Pós-venda',
  aviso: 'Aviso',
  boas_vindas: 'Boas-vindas',
  confirmacao: 'Confirmação',
  aniversario: 'Aniversário',
  outro: 'Outro',
}

const CATEGORIA_COLORS: Record<TemplateCategoria, string> = {
  follow_up: 'bg-blue-100 text-blue-700',
  nurturing: 'bg-emerald-100 text-emerald-700',
  lembrete: 'bg-amber-100 text-amber-700',
  reativacao: 'bg-rose-100 text-rose-700',
  pos_venda: 'bg-green-100 text-green-700',
  aviso: 'bg-red-100 text-red-700',
  boas_vindas: 'bg-indigo-100 text-indigo-700',
  confirmacao: 'bg-cyan-100 text-cyan-700',
  aniversario: 'bg-pink-100 text-pink-700',
  outro: 'bg-slate-100 text-slate-700',
}

const MODO_LABELS: Record<TemplateModo, string> = {
  template_fixo: 'Fixo',
  template_ia: 'IA Assistida',
  ia_generativa: 'IA Generativa',
}

const MODO_COLORS: Record<TemplateModo, string> = {
  template_fixo: 'bg-slate-100 text-slate-700',
  template_ia: 'bg-blue-100 text-blue-700',
  ia_generativa: 'bg-purple-100 text-purple-700',
}

const VARIABLES_REFERENCE = {
  Contato: ['{{contact.nome}}', '{{contact.sobrenome}}', '{{contact.email}}'],
  Card: ['{{card.titulo}}', '{{card.destino}}', '{{card.valor}}', '{{card.data_viagem}}'],
  Agente: ['{{agent.nome}}', '{{agent.primeiro_nome}}', '{{agent.telefone}}'],
  Sistema: ['{{hoje}}', '{{dia_semana}}'],
  Proposta: ['{{proposta.link}}', '{{proposta.valor_total}}'],
}

interface FormState {
  id?: string
  nome: string
  categoria: TemplateCategoria
  modo: TemplateModo
  corpo: string
  ia_prompt: string
  ia_contexto_config: {
    conversa: boolean
    conversa_limite: number
    briefing: boolean
    observacoes: boolean
    proposta: boolean
    voos: boolean
    historico_viagens: boolean
  }
  ia_restricoes: {
    tom: 'informal_caloroso' | 'profissional' | 'urgente' | ''
    max_caracteres: number
    proibido: string
  }
  is_hsm: boolean
  hsm_template_name: string
  hsm_namespace: string
}

const DEFAULT_FORM: FormState = {
  nome: '',
  categoria: 'outro',
  modo: 'template_fixo',
  corpo: '',
  ia_prompt: '',
  ia_contexto_config: {
    conversa: false,
    conversa_limite: 30,
    briefing: false,
    observacoes: false,
    proposta: false,
    voos: false,
    historico_viagens: false,
  },
  ia_restricoes: {
    tom: '',
    max_caracteres: 1000,
    proibido: '',
  },
  is_hsm: false,
  hsm_template_name: '',
  hsm_namespace: '',
}

export default function MensagemTemplatePage() {
  const { templates, isLoading, error, create, update, remove } = useMensagemTemplates()
  const [filterCategoria, setFilterCategoria] = useState<TemplateCategoria | 'todos'>('todos')
  const [filterModo, setFilterModo] = useState<TemplateModo | 'todos'>('todos')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [expandedIA, setExpandedIA] = useState(false)
  const [expandedRestricts, setExpandedRestricts] = useState(false)

  const filteredTemplates = templates.filter((t) => {
    if (filterCategoria !== 'todos' && t.categoria !== filterCategoria) return false
    if (filterModo !== 'todos' && t.modo !== filterModo) return false
    return true
  })

  const handleOpenCreate = () => {
    setForm(DEFAULT_FORM)
    setExpandedIA(false)
    setExpandedRestricts(false)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (template: MensagemTemplate): void => {
    setForm({
      id: template.id,
      nome: template.nome,
      categoria: template.categoria,
      modo: template.modo,
      corpo: template.corpo || '',
      ia_prompt: template.ia_prompt || '',
      ia_contexto_config: {
        conversa: (template.ia_contexto_config?.conversa as boolean) || false,
        conversa_limite: (template.ia_contexto_config?.conversa_limite as number) || 30,
        briefing: (template.ia_contexto_config?.briefing as boolean) || false,
        observacoes: (template.ia_contexto_config?.observacoes as boolean) || false,
        proposta: (template.ia_contexto_config?.proposta as boolean) || false,
        voos: (template.ia_contexto_config?.voos as boolean) || false,
        historico_viagens: (template.ia_contexto_config?.historico_viagens as boolean) || false,
      },
      ia_restricoes: {
        tom: (template.ia_restricoes?.tom as 'informal_caloroso' | 'profissional' | 'urgente' | '') || '',
        max_caracteres: (template.ia_restricoes?.max_caracteres as number) || 1000,
        proibido: (template.ia_restricoes?.proibido as string) || '',
      },
      is_hsm: template.is_hsm || false,
      hsm_template_name: template.hsm_template_name || '',
      hsm_namespace: template.hsm_namespace || '',
    })
    setExpandedIA(form.modo !== 'template_fixo')
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    const payload: any = {
      nome: form.nome,
      categoria: form.categoria,
      modo: form.modo,
      is_hsm: form.is_hsm,
      hsm_language: 'pt_BR',
    }

    if (form.modo === 'template_fixo') {
      if (!form.corpo.trim()) {
        toast.error('Conteúdo da mensagem é obrigatório para templates fixos')
        return
      }
      payload.corpo = form.corpo
    } else if (form.modo === 'template_ia') {
      payload.corpo = form.corpo
      payload.ia_prompt = form.ia_prompt
      payload.ia_contexto_config = form.ia_contexto_config
      payload.ia_restricoes = form.ia_restricoes
    } else if (form.modo === 'ia_generativa') {
      if (!form.ia_prompt.trim()) {
        toast.error('Prompt da IA é obrigatório para templates generativos')
        return
      }
      payload.ia_prompt = form.ia_prompt
      payload.ia_contexto_config = form.ia_contexto_config
      payload.ia_restricoes = form.ia_restricoes
    }

    if (form.is_hsm) {
      if (!form.hsm_template_name.trim()) {
        toast.error('Nome do template HSM é obrigatório')
        return
      }
      payload.hsm_template_name = form.hsm_template_name
      payload.hsm_namespace = form.hsm_namespace
    }

    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...payload })
        toast.success('Template atualizado com sucesso')
      } else {
        await create.mutateAsync(payload)
        toast.success('Template criado com sucesso')
      }
      setIsModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar template')
    }
  }

  const handleDelete = async (id: string, nome: string): Promise<void> => {
    if (window.confirm(`Tem certeza que deseja deletar "${nome}"?`)) {
      try {
        await remove.mutateAsync(id)
        toast.success('Template deletado com sucesso')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao deletar template')
      }
    }
  }

  const handleDuplicate = (template: MensagemTemplate): void => {
    const newForm = { ...form }
    newForm.id = undefined
    newForm.nome = `${template.nome} (cópia)`
    newForm.categoria = template.categoria
    newForm.modo = template.modo
    newForm.corpo = template.corpo || ''
    newForm.ia_prompt = template.ia_prompt || ''
    setForm(newForm)
    setIsModalOpen(true)
  }

  const getPreview = (template: MensagemTemplate): string => {
    const text = template.modo === 'template_fixo'
      ? template.corpo
      : template.ia_prompt
    return text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : '(vazio)'
  }

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Templates de Mensagem</h1>
            <p className="text-slate-500">Gerencie templates de WhatsApp para automação</p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
          >
            <Plus size={20} />
            Novo Template
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-4 mb-8 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex-1">
            <Label className="block text-sm font-medium text-slate-700 mb-2">Categoria</Label>
            <Select
              value={filterCategoria}
              onChange={(value: string) => setFilterCategoria(value as TemplateCategoria | 'todos')}
              options={[
                { value: 'todos', label: 'Todas as categorias' },
                ...Object.entries(CATEGORIA_LABELS).map(([key, label]) => ({ value: key, label })),
              ]}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <Label className="block text-sm font-medium text-slate-700 mb-2">Modo</Label>
            <Select
              value={filterModo}
              onChange={(value: string) => setFilterModo(value as TemplateModo | 'todos')}
              options={[
                { value: 'todos', label: 'Todos os modos' },
                { value: 'template_fixo', label: 'Fixo' },
                { value: 'template_ia', label: 'IA Assistida' },
                { value: 'ia_generativa', label: 'IA Generativa' },
              ]}
              className="w-full"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-slate-500">Carregando templates...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-red-700">
            Erro ao carregar templates. Tente novamente.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredTemplates.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
            <FileText className="mx-auto mb-4 text-slate-300" size={48} />
            <p className="text-slate-500 mb-4">Nenhum template encontrado</p>
            <Button
              onClick={handleOpenCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Criar primeiro template
            </Button>
          </div>
        )}

        {/* Card grid */}
        {!isLoading && filteredTemplates.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Card header */}
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-slate-900 text-lg">{template.nome}</h3>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${MODO_COLORS[template.modo]}`}>
                        {MODO_LABELS[template.modo]}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${CATEGORIA_COLORS[template.categoria]}`}>
                    {CATEGORIA_LABELS[template.categoria]}
                  </span>
                </div>

                {/* Card body */}
                <div className="p-6 bg-slate-50 min-h-[120px] flex flex-col">
                  <p className="text-sm text-slate-600 mb-4 flex-1 leading-relaxed">
                    {getPreview(template)}
                  </p>
                  {template.is_hsm && (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 mb-3">
                      <Bot size={14} />
                      HSM Template
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                  <p className="text-xs text-slate-500">
                    {formatDate(template.created_at)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDuplicate(template)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                      title="Duplicar"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(template)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id, template.nome)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                      title="Deletar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal header */}
              <div className="sticky top-0 bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">
                  {form.id ? 'Editar Template' : 'Novo Template'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Main form */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Nome */}
                    <div>
                      <Label className="block text-sm font-medium text-slate-900 mb-2">Nome *</Label>
                      <Input
                        value={form.nome}
                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                        placeholder="Ex: Follow-up após proposta"
                        className="w-full"
                      />
                    </div>

                    {/* Categoria */}
                    <div>
                      <Label className="block text-sm font-medium text-slate-900 mb-2">Categoria</Label>
                      <Select
                        value={form.categoria}
                        onChange={(value: string) => setForm({ ...form, categoria: value as TemplateCategoria })}
                        options={Object.entries(CATEGORIA_LABELS).map(([key, label]) => ({ value: key, label }))}
                        className="w-full"
                      />
                    </div>

                    {/* Modo selector */}
                    <div>
                      <Label className="block text-sm font-medium text-slate-900 mb-3">Modo de Template *</Label>
                      <div className="flex gap-3">
                        {(['template_fixo', 'template_ia', 'ia_generativa'] as TemplateModo[]).map((modo) => (
                          <button
                            key={modo}
                            onClick={() => {
                              setForm({ ...form, modo })
                              if (modo === 'template_fixo') setExpandedIA(false)
                            }}
                            className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-colors border-2 ${
                              form.modo === modo
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {MODO_LABELS[modo]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Template fixo content */}
                    {form.modo === 'template_fixo' && (
                      <div>
                        <Label className="block text-sm font-medium text-slate-900 mb-2">Conteúdo da Mensagem *</Label>
                        <Textarea
                          value={form.corpo}
                          onChange={(e) => setForm({ ...form, corpo: e.target.value })}
                          placeholder="Use {{contact.nome}}, {{card.titulo}}, {{agent.nome}} etc."
                          rows={8}
                          className="w-full font-mono text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-2">Use variáveis com {'{{}} '} - veja referência ao lado</p>
                      </div>
                    )}

                    {/* Template IA content */}
                    {form.modo === 'template_ia' && (
                      <div className="space-y-4">
                        <div>
                          <Label className="block text-sm font-medium text-slate-900 mb-2">Esqueleto da Mensagem</Label>
                          <Textarea
                            value={form.corpo}
                            onChange={(e) => setForm({ ...form, corpo: e.target.value })}
                            placeholder="Estrutura base que a IA preencherá"
                            rows={6}
                            className="w-full font-mono text-sm"
                          />
                        </div>
                        <div>
                          <Label className="block text-sm font-medium text-slate-900 mb-2">Prompt da IA</Label>
                          <Textarea
                            value={form.ia_prompt}
                            onChange={(e) => setForm({ ...form, ia_prompt: e.target.value })}
                            placeholder="Instruções para a IA completar a mensagem"
                            rows={6}
                            className="w-full font-mono text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* IA Generativa content */}
                    {form.modo === 'ia_generativa' && (
                      <div>
                        <Label className="block text-sm font-medium text-slate-900 mb-2">Prompt da IA *</Label>
                        <Textarea
                          value={form.ia_prompt}
                          onChange={(e) => setForm({ ...form, ia_prompt: e.target.value })}
                          placeholder="Instruções completas para gerar a mensagem"
                          rows={10}
                          className="w-full font-mono text-sm"
                        />
                      </div>
                    )}

                    {/* IA sections */}
                    {form.modo !== 'template_fixo' && (
                      <div className="space-y-4">
                        {/* Contexto da IA */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedIA(!expandedIA)}
                            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-medium text-slate-900 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Sparkles size={16} className="text-indigo-600" />
                              Contexto da IA
                            </span>
                            {expandedIA ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          {expandedIA && (
                            <div className="p-4 space-y-4 border-t border-slate-200 bg-slate-50">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="conversa" className="text-sm font-medium text-slate-900">
                                  Histórico de Conversa
                                </Label>
                                <Switch
                                  id="conversa"
                                  checked={form.ia_contexto_config.conversa}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, conversa: checked },
                                    })
                                  }
                                />
                              </div>
                              {form.ia_contexto_config.conversa && (
                                <div>
                                  <Label htmlFor="conversa_limite" className="text-sm font-medium text-slate-900">
                                    Últimas N mensagens
                                  </Label>
                                  <Input
                                    id="conversa_limite"
                                    type="number"
                                    value={form.ia_contexto_config.conversa_limite}
                                    onChange={(e) =>
                                      setForm({
                                        ...form,
                                        ia_contexto_config: {
                                          ...form.ia_contexto_config,
                                          conversa_limite: parseInt(e.target.value) || 30,
                                        },
                                      })
                                    }
                                    min="1"
                                    max="100"
                                    className="w-full"
                                  />
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-2">
                                <Label htmlFor="briefing" className="text-sm font-medium text-slate-900">
                                  Briefing da Proposta
                                </Label>
                                <Switch
                                  id="briefing"
                                  checked={form.ia_contexto_config.briefing}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, briefing: checked },
                                    })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <Label htmlFor="observacoes" className="text-sm font-medium text-slate-900">
                                  Observações do Card
                                </Label>
                                <Switch
                                  id="observacoes"
                                  checked={form.ia_contexto_config.observacoes}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, observacoes: checked },
                                    })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <Label htmlFor="proposta" className="text-sm font-medium text-slate-900">
                                  Detalhes da Proposta
                                </Label>
                                <Switch
                                  id="proposta"
                                  checked={form.ia_contexto_config.proposta}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, proposta: checked },
                                    })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <Label htmlFor="voos" className="text-sm font-medium text-slate-900">
                                  Detalhes de Voos
                                </Label>
                                <Switch
                                  id="voos"
                                  checked={form.ia_contexto_config.voos}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, voos: checked },
                                    })
                                  }
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <Label htmlFor="historico_viagens" className="text-sm font-medium text-slate-900">
                                  Histórico de Viagens
                                </Label>
                                <Switch
                                  id="historico_viagens"
                                  checked={form.ia_contexto_config.historico_viagens}
                                  onCheckedChange={(checked) =>
                                    setForm({
                                      ...form,
                                      ia_contexto_config: { ...form.ia_contexto_config, historico_viagens: checked },
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Restrições */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedRestricts(!expandedRestricts)}
                            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-medium text-slate-900 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Bot size={16} className="text-indigo-600" />
                              Restrições
                            </span>
                            {expandedRestricts ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          {expandedRestricts && (
                            <div className="p-4 space-y-4 border-t border-slate-200 bg-slate-50">
                              <div>
                                <Label htmlFor="tom" className="text-sm font-medium text-slate-900">
                                  Tom da Mensagem
                                </Label>
                                <Select
                                  value={form.ia_restricoes.tom}
                                  onChange={(value: string) =>
                                    setForm({
                                      ...form,
                                      ia_restricoes: { ...form.ia_restricoes, tom: value as any },
                                    })
                                  }
                                  options={[
                                    { value: '', label: 'Padrão' },
                                    { value: 'informal_caloroso', label: 'Informal e Caloroso' },
                                    { value: 'profissional', label: 'Profissional' },
                                    { value: 'urgente', label: 'Urgente' },
                                  ]}
                                  className="w-full"
                                />
                              </div>

                              <div>
                                <Label htmlFor="max_caracteres" className="text-sm font-medium text-slate-900">
                                  Máximo de Caracteres
                                </Label>
                                <Input
                                  id="max_caracteres"
                                  type="number"
                                  value={form.ia_restricoes.max_caracteres}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      ia_restricoes: {
                                        ...form.ia_restricoes,
                                        max_caracteres: parseInt(e.target.value) || 1000,
                                      },
                                    })
                                  }
                                  min="50"
                                  className="w-full"
                                />
                              </div>

                              <div>
                                <Label htmlFor="proibido" className="text-sm font-medium text-slate-900">
                                  Palavras Proibidas (separadas por vírgula)
                                </Label>
                                <Input
                                  id="proibido"
                                  value={form.ia_restricoes.proibido}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      ia_restricoes: { ...form.ia_restricoes, proibido: e.target.value },
                                    })
                                  }
                                  placeholder="Ex: urgente, rápido, agora"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* HSM section */}
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-4">
                        <Label htmlFor="is_hsm" className="text-sm font-medium text-slate-900">
                          Ativar como Template HSM (WhatsApp Verificado)
                        </Label>
                        <Switch
                          id="is_hsm"
                          checked={form.is_hsm}
                          onCheckedChange={(checked) => setForm({ ...form, is_hsm: checked })}
                        />
                      </div>

                      {form.is_hsm && (
                        <div className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium text-slate-900">Nome do Template HSM *</Label>
                            <Input
                              value={form.hsm_template_name}
                              onChange={(e) => setForm({ ...form, hsm_template_name: e.target.value })}
                              placeholder="Ex: welcome_template"
                              className="w-full"
                            />
                          </div>

                          <div>
                            <Label className="text-sm font-medium text-slate-900">Namespace</Label>
                            <Input
                              value={form.hsm_namespace}
                              onChange={(e) => setForm({ ...form, hsm_namespace: e.target.value })}
                              placeholder="Ex: default"
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sidebar - Variables Reference */}
                  <div className="lg:col-span-1">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 sticky top-[120px]">
                      <h3 className="font-semibold text-indigo-900 text-sm mb-4 flex items-center gap-2">
                        <Eye size={16} />
                        Variáveis Disponíveis
                      </h3>
                      <div className="space-y-4">
                        {Object.entries(VARIABLES_REFERENCE).map(([category, vars]) => (
                          <div key={category}>
                            <p className="text-xs font-medium text-indigo-700 mb-2">{category}</p>
                            <ul className="space-y-1">
                              {vars.map((v) => (
                                <li key={v} className="text-xs text-indigo-600 font-mono bg-white px-2 py-1 rounded border border-indigo-100">
                                  {v}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-8 py-6 flex items-center justify-end gap-3">
                <Button
                  onClick={() => setIsModalOpen(false)}
                  variant="outline"
                  className="px-6"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={create.isPending || update.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 px-6"
                >
                  <Save size={18} />
                  {form.id ? 'Atualizar' : 'Criar'} Template
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
