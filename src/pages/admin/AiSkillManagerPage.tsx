import { useState } from 'react'
import { toast } from 'sonner'
import { Wrench, Plus, Trash2, Save, X, Database, Globe, Zap, Code } from 'lucide-react'

import { useAiSkills, type AiSkill, type AiSkillInput, type SkillCategoria, type SkillTipo } from '@/hooks/useAiSkills'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const CATEGORIA_OPTIONS: { value: SkillCategoria; label: string }[] = [
  { value: 'data_retrieval', label: 'Buscar Dados' },
  { value: 'action', label: 'Ação' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'integration', label: 'Integração' },
  { value: 'query', label: 'Consulta' },
]

const TIPO_OPTIONS: { value: SkillTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'supabase_query', label: 'Supabase Query', icon: Database },
  { value: 'n8n_webhook', label: 'n8n Webhook', icon: Zap },
  { value: 'edge_function', label: 'Edge Function', icon: Code },
  { value: 'http_api', label: 'HTTP API', icon: Globe },
]

const TIPO_ICON_MAP: Record<SkillTipo, React.ComponentType<{ className?: string }>> = {
  supabase_query: Database,
  n8n_webhook: Zap,
  edge_function: Code,
  http_api: Globe,
}

interface SkillForm {
  nome: string
  descricao: string
  categoria: SkillCategoria
  tipo: SkillTipo
  config_json: string
  input_schema_json: string
  output_schema_json: string
  rate_limit_per_hour: number
}

const DEFAULT_FORM: SkillForm = {
  nome: '',
  descricao: '',
  categoria: 'data_retrieval',
  tipo: 'supabase_query',
  config_json: '{}',
  input_schema_json: '{"type": "object", "properties": {}, "required": []}',
  output_schema_json: '{"type": "object", "properties": {}}',
  rate_limit_per_hour: 100,
}

export default function AiSkillManagerPage() {
  const { skills, isLoading, create, update, remove } = useAiSkills()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<SkillForm>(DEFAULT_FORM)

  const startCreate = () => {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setIsCreating(true)
  }

  const startEdit = (skill: AiSkill) => {
    setIsCreating(false)
    setEditingId(skill.id)
    setForm({
      nome: skill.nome,
      descricao: skill.descricao || '',
      categoria: skill.categoria,
      tipo: skill.tipo,
      config_json: JSON.stringify(skill.config, null, 2),
      input_schema_json: JSON.stringify(skill.input_schema, null, 2),
      output_schema_json: JSON.stringify(skill.output_schema, null, 2),
      rate_limit_per_hour: skill.rate_limit_per_hour,
    })
  }

  const cancel = () => {
    setEditingId(null)
    setIsCreating(false)
    setForm(DEFAULT_FORM)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    let config: Record<string, unknown>
    let inputSchema: Record<string, unknown>
    let outputSchema: Record<string, unknown>

    try {
      config = JSON.parse(form.config_json)
      inputSchema = JSON.parse(form.input_schema_json)
      outputSchema = JSON.parse(form.output_schema_json)
    } catch {
      toast.error('JSON inválido em um dos campos')
      return
    }

    const input: AiSkillInput = {
      nome: form.nome,
      descricao: form.descricao || null,
      categoria: form.categoria,
      tipo: form.tipo,
      config,
      input_schema: inputSchema,
      output_schema: outputSchema,
      rate_limit_per_hour: form.rate_limit_per_hour,
    }

    try {
      if (isCreating) {
        await create.mutateAsync(input)
        toast.success('Skill criada')
      } else if (editingId) {
        await update.mutateAsync({ id: editingId, ...input })
        toast.success('Skill atualizada')
      }
      cancel()
    } catch {
      toast.error('Erro ao salvar skill')
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta skill?')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Skill excluída')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
      </div>
    )
  }

  const showForm = isCreating || editingId !== null

  return (
    <>
      <AdminPageHeader
        title="Skills de Agentes IA"
        subtitle="Capacidades composíveis que podem ser atribuídas a qualquer agente"
        icon={<Wrench className="w-5 h-5" />}
        stats={[
          { label: 'Total', value: skills.length, color: 'blue' as const },
        ]}
        actions={
          <Button onClick={startCreate} className="gap-2" disabled={showForm}>
            <Plus className="w-4 h-4" />
            Nova Skill
          </Button>
        }
      />

      {/* Form de criação/edição */}
      {showForm && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              {isCreating ? 'Nova Skill' : 'Editar Skill'}
            </h3>
            <Button variant="ghost" size="sm" onClick={cancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="search_knowledge_base"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={form.categoria}
                onChange={(v: string) => setForm(f => ({ ...f, categoria: v as SkillCategoria }))}
                options={CATEGORIA_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Implementação</Label>
              <Select
                value={form.tipo}
                onChange={(v: string) => setForm(f => ({ ...f, tipo: v as SkillTipo }))}
                options={TIPO_OPTIONS.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Busca semântica em FAQ e documentação do produto"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Config (JSON)</Label>
              <Textarea
                value={form.config_json}
                onChange={e => setForm(f => ({ ...f, config_json: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Input Schema (JSON Schema)</Label>
              <Textarea
                value={form.input_schema_json}
                onChange={e => setForm(f => ({ ...f, input_schema_json: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Output Schema (JSON Schema)</Label>
              <Textarea
                value={form.output_schema_json}
                onChange={e => setForm(f => ({ ...f, output_schema_json: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Label>Rate limit/hora:</Label>
              <Input
                type="number"
                value={form.rate_limit_per_hour}
                onChange={e => setForm(f => ({ ...f, rate_limit_per_hour: parseInt(e.target.value) || 100 }))}
                className="w-24"
              />
            </div>
            <Button onClick={handleSave} className="gap-2">
              <Save className="w-4 h-4" />
              Salvar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de skills */}
      {skills.length === 0 && !showForm ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhuma skill criada</p>
          <p className="text-sm text-slate-500 mt-1">
            Skills são capacidades que os agentes podem usar (buscar dados, agendar, criar proposta)
          </p>
          <Button onClick={startCreate} className="mt-6 gap-2">
            <Plus className="w-4 h-4" />
            Criar Skill
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill: AiSkill) => {
            const TipoIcon = TIPO_ICON_MAP[skill.tipo]
            return (
              <div
                key={skill.id}
                className={cn(
                  'bg-white border shadow-sm rounded-xl p-4 space-y-3 transition-colors',
                  editingId === skill.id ? 'border-indigo-300' : 'border-slate-200'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-md">
                      <TipoIcon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{skill.nome}</p>
                      {skill.descricao && (
                        <p className="text-xs text-slate-500 line-clamp-2">{skill.descricao}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">{skill.categoria}</Badge>
                  <Badge variant="outline" className="text-xs">{skill.tipo}</Badge>
                  <Badge variant="outline" className="text-xs text-slate-400">
                    {skill.rate_limit_per_hour}/h
                  </Badge>
                </div>

                <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(skill)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(skill.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
