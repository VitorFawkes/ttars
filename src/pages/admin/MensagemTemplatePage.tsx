/**
 * MensagemTemplatePage — biblioteca de templates de mensagem (texto livre).
 *
 * Consumidos pelo builder de Automações quando o gestor escolhe o modo
 * "Template salvo" (em oposição a HSM aprovado Meta). Também usado ad-hoc
 * em chat/respostas.
 *
 * Versão simplificada pós-redesign (2026-04):
 *   - Só modo 'template_fixo' (corpo + variáveis). Modos 'template_ia' e
 *     'ia_generativa' foram deprecated (0 uso em produção). Se templates
 *     legados ainda existirem com esses modos, a página os exibe em
 *     readonly e sugere migração.
 *   - Flag HSM opcional (para templates aprovados pela Meta). Marca-los
 *     aqui serve só de referência — quem efetivamente envia HSM é o
 *     builder de Automações via Echo API.
 *   - Categorias: só as com uso real (boas_vindas, lembrete, follow_up,
 *     pos_venda, aniversario, outro). Removidas: nurturing, reativacao,
 *     aviso, confirmacao.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare, Plus, Pencil, Trash2, Copy, ShieldCheck, Search,
} from 'lucide-react'

import {
  useMensagemTemplates,
  type MensagemTemplate,
  type TemplateCategoria,
} from '@/hooks/useMensagemTemplates'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const CATEGORIAS: Array<{ value: TemplateCategoria; label: string }> = [
  { value: 'boas_vindas', label: 'Boas-vindas' },
  { value: 'lembrete', label: 'Lembrete' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'pos_venda', label: 'Pós-venda' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'outro', label: 'Outro' },
]

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label])
)

const VARIABLES_HINT = ['{{contact.nome}}', '{{contact.primeiro_nome}}', '{{card.titulo}}', '{{card.destino}}']

interface FormState {
  id?: string
  nome: string
  categoria: TemplateCategoria
  corpo: string
  is_hsm: boolean
  hsm_template_name: string
  hsm_namespace: string
}

const DEFAULT_FORM: FormState = {
  nome: '',
  categoria: 'outro',
  corpo: '',
  is_hsm: false,
  hsm_template_name: '',
  hsm_namespace: '',
}

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: MensagemTemplate
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const categoriaLabel = CATEGORIA_LABEL[template.categoria] || template.categoria
  const isLegacyIA = template.modo !== 'template_fixo'

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 truncate">{template.nome}</h3>
            {template.is_hsm && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1">
                <ShieldCheck className="w-3 h-3" />
                HSM
              </Badge>
            )}
            {isLegacyIA && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                Legado IA
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{categoriaLabel}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicar">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Excluir" className="text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {template.corpo ? (
        <p className="text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">{template.corpo}</p>
      ) : (
        <p className="text-sm text-slate-400 italic">Sem corpo configurado</p>
      )}

      {template.is_hsm && template.hsm_template_name && (
        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
          <code className="bg-slate-100 px-1.5 py-0.5 rounded">{template.hsm_template_name}</code>
        </p>
      )}
    </div>
  )
}

export default function MensagemTemplatePage() {
  const { templates, isLoading, create, update, remove } = useMensagemTemplates()
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<TemplateCategoria | 'todos'>('todos')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (filterCategoria !== 'todos' && t.categoria !== filterCategoria) return false
      if (search && !t.nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [templates, search, filterCategoria])

  const stats = useMemo(
    () => [
      { label: 'Total', value: templates.length, color: 'blue' as const },
      { label: 'HSM', value: templates.filter((t) => t.is_hsm).length, color: 'green' as const },
    ],
    [templates]
  )

  const handleOpenCreate = () => {
    setForm(DEFAULT_FORM)
    setIsEditing(true)
  }

  const handleOpenEdit = (template: MensagemTemplate) => {
    setForm({
      id: template.id,
      nome: template.nome,
      categoria: template.categoria,
      corpo: template.corpo || template.ia_prompt || '',
      is_hsm: template.is_hsm || false,
      hsm_template_name: template.hsm_template_name || '',
      hsm_namespace: template.hsm_namespace || '',
    })
    setIsEditing(true)
  }

  const handleDuplicate = (template: MensagemTemplate) => {
    setForm({
      nome: `${template.nome} (cópia)`,
      categoria: template.categoria,
      corpo: template.corpo || '',
      is_hsm: template.is_hsm || false,
      hsm_template_name: template.hsm_template_name || '',
      hsm_namespace: template.hsm_namespace || '',
    })
    setIsEditing(true)
  }

  const handleDelete = async (template: MensagemTemplate) => {
    if (!window.confirm(`Excluir o template "${template.nome}"?`)) return
    try {
      await remove.mutateAsync(template.id)
      toast.success('Template excluído')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
    }
  }

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error('Dê um nome ao template')
      return
    }
    if (!form.corpo.trim()) {
      toast.error('Escreva o conteúdo do template')
      return
    }
    if (form.is_hsm && !form.hsm_template_name.trim()) {
      toast.error('Template HSM exige nome do template aprovado Meta')
      return
    }

    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria,
      modo: 'template_fixo' as const,
      corpo: form.corpo,
      is_hsm: form.is_hsm,
      hsm_template_name: form.is_hsm ? form.hsm_template_name : null,
      hsm_namespace: form.is_hsm ? form.hsm_namespace : null,
    }

    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...payload })
        toast.success('Template atualizado')
      } else {
        await create.mutateAsync(payload)
        toast.success('Template criado')
      }
      setIsEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Templates de Mensagem"
        subtitle="Biblioteca de textos prontos usados nas automações e nas respostas manuais"
        icon={<MessageSquare className="w-5 h-5" />}
        stats={stats}
        actions={
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo template
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setFilterCategoria('todos')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
              filterCategoria === 'todos'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            Todas
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilterCategoria(c.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
                filterCategoria === c.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">
            {templates.length === 0 ? 'Nenhum template criado' : 'Nenhum resultado'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {templates.length === 0
              ? 'Crie o primeiro template pra usar em automações'
              : 'Ajuste a busca ou a categoria'}
          </p>
          {templates.length === 0 && (
            <Button onClick={handleOpenCreate} className="mt-6 gap-2">
              <Plus className="w-4 h-4" />
              Novo template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => handleOpenEdit(t)}
              onDuplicate={() => handleDuplicate(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {/* Modal de edit/create */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar template' : 'Novo template'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Boas-vindas lead novo"
              />
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={form.categoria}
                onChange={(v) => setForm((f) => ({ ...f, categoria: v as TemplateCategoria }))}
                options={CATEGORIAS}
              />
            </div>

            <div>
              <Label>Conteúdo</Label>
              <Textarea
                value={form.corpo}
                onChange={(e) => setForm((f) => ({ ...f, corpo: e.target.value }))}
                rows={6}
                placeholder="Oi {{contact.primeiro_nome}}! ..."
              />
              <p className="text-xs text-slate-500 mt-1">
                Variáveis disponíveis:{' '}
                {VARIABLES_HINT.map((v, i) => (
                  <span key={v}>
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{v}</code>
                    {i < VARIABLES_HINT.length - 1 && ' '}
                  </span>
                ))}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-1 mb-0">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    É template HSM aprovado pela Meta?
                  </Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Marque se esse template foi aprovado no WABA e pode ser usado fora da janela 24h.
                  </p>
                </div>
                <Switch
                  checked={form.is_hsm}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_hsm: v }))}
                />
              </div>

              {form.is_hsm && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Nome do template HSM</Label>
                    <Input
                      value={form.hsm_template_name}
                      onChange={(e) => setForm((f) => ({ ...f, hsm_template_name: e.target.value }))}
                      placeholder="wt_primeiro_contato001"
                    />
                  </div>
                  <div>
                    <Label>Namespace (opcional)</Label>
                    <Input
                      value={form.hsm_namespace}
                      onChange={(e) => setForm((f) => ({ ...f, hsm_namespace: e.target.value }))}
                      placeholder="(em branco se não souber)"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {form.id ? 'Salvar' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
