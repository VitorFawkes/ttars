import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen, Plus, Trash2, Save, X, FileText, Search, ChevronLeft,
  Edit3, ClipboardPaste, FileUp,
} from 'lucide-react'

import {
  useAiKnowledgeBases, useAiKbItems,
  type AiKnowledgeBase, type KbTipo, type KbItem,
} from '@/hooks/useAiKnowledgeBases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const TIPO_OPTIONS: Array<{ value: KbTipo; label: string; color: string }> = [
  { value: 'faq', label: 'FAQ', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'product_catalog', label: 'Catálogo', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'policies', label: 'Políticas', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'procedures', label: 'Procedimentos', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'custom', label: 'Custom', color: 'bg-slate-100 text-slate-700 border-slate-200' },
]

function TipoBadge({ tipo }: { tipo: KbTipo }) {
  const cfg = TIPO_OPTIONS.find((t) => t.value === tipo) || TIPO_OPTIONS[0]
  return (
    <Badge variant="outline" className={cn('text-xs', cfg.color)}>
      {cfg.label}
    </Badge>
  )
}

function getKbItemCount(kb: AiKnowledgeBase): number {
  if (!kb.ai_knowledge_base_items) return 0
  if (Array.isArray(kb.ai_knowledge_base_items)) {
    const first = kb.ai_knowledge_base_items[0] as { count?: number } | undefined
    return first?.count ?? 0
  }
  return 0
}

function ItemRow({ item, onDelete, onSave }: {
  item: KbItem
  onDelete: () => void
  onSave: (titulo: string, conteudo: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [titulo, setTitulo] = useState(item.titulo)
  const [conteudo, setConteudo] = useState(item.conteudo)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(titulo, conteudo)
      setEditing(false)
      toast.success('Item atualizado')
    } catch {
      toast.error('Erro ao atualizar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn(
      'bg-white border rounded-lg transition-shadow',
      expanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200'
    )}>
      <div className="p-3 flex items-start gap-3">
        <button
          onClick={() => { setExpanded((e) => !e); if (expanded) setEditing(false) }}
          className="flex items-start gap-3 flex-1 min-w-0 text-left hover:bg-slate-50 -m-3 p-3 rounded-lg"
        >
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-slate-900 truncate">{item.titulo}</p>
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.conteudo}</p>
          </div>
        </button>
        <div className="flex gap-1 flex-shrink-0">
          {!editing && expanded && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-8 w-8 p-0">
              <Edit3 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0 text-red-500 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {editing ? (
            <>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título"
              />
              <Textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                className="min-h-[100px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditing(false)
                  setTitulo(item.titulo)
                  setConteudo(item.conteudo)
                }}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.conteudo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AiKnowledgeBasePage() {
  const { slug: currentProduct } = useCurrentProductMeta()
  const { knowledgeBases, isLoading, create, remove } = useAiKnowledgeBases(currentProduct)

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [isCreatingKb, setIsCreatingKb] = useState(false)
  const [kbForm, setKbForm] = useState<{ nome: string; tipo: KbTipo; descricao: string }>({
    nome: '', tipo: 'faq', descricao: '',
  })
  const [kbSearch, setKbSearch] = useState('')

  // Items
  const { items, createItem, updateItem, removeItem } = useAiKbItems(selectedKbId || undefined)
  const [itemSearch, setItemSearch] = useState('')
  const [addMode, setAddMode] = useState<'none' | 'manual' | 'bulk'>('none')
  const [manualTitulo, setManualTitulo] = useState('')
  const [manualConteudo, setManualConteudo] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  const filteredKbs = useMemo(() => {
    const q = kbSearch.trim().toLowerCase()
    if (!q) return knowledgeBases
    return knowledgeBases.filter((kb) =>
      kb.nome.toLowerCase().includes(q) ||
      (kb.descricao || '').toLowerCase().includes(q)
    )
  }, [knowledgeBases, kbSearch])

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      item.titulo.toLowerCase().includes(q) ||
      item.conteudo.toLowerCase().includes(q)
    )
  }, [items, itemSearch])

  const selectedKb = knowledgeBases.find((kb) => kb.id === selectedKbId)
  const totalItems = knowledgeBases.reduce((sum, kb) => sum + getKbItemCount(kb), 0)

  const handleCreateKb = async () => {
    if (!kbForm.nome.trim()) { toast.error('Nome obrigatório'); return }
    try {
      const result = await create.mutateAsync({
        nome: kbForm.nome,
        tipo: kbForm.tipo,
        descricao: kbForm.descricao || null,
        produto: currentProduct,
      })
      setIsCreatingKb(false)
      setSelectedKbId(result.id)
      setKbForm({ nome: '', tipo: 'faq', descricao: '' })
      toast.success('Base criada')
    } catch {
      toast.error('Erro ao criar base')
    }
  }

  const handleDeleteKb = async (id: string) => {
    if (!window.confirm('Excluir esta base e TODOS os itens? Esta ação não pode ser desfeita.')) return
    try {
      await remove.mutateAsync(id)
      if (selectedKbId === id) setSelectedKbId(null)
      toast.success('Base excluída')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const handleAddManual = async () => {
    if (!manualTitulo.trim() || !manualConteudo.trim() || !selectedKbId) return
    setAddingItem(true)
    try {
      await createItem.mutateAsync({ kb_id: selectedKbId, titulo: manualTitulo, conteudo: manualConteudo })
      setManualTitulo(''); setManualConteudo(''); setAddMode('none')
      toast.success('Item adicionado')
    } catch {
      toast.error('Erro ao adicionar')
    } finally { setAddingItem(false) }
  }

  const handleAddBulk = async () => {
    if (!bulkText.trim() || !selectedKbId) return
    const blocks = bulkText.split('\n\n').map((b) => b.trim()).filter(Boolean)
    const items = blocks.map((block) => {
      const lines = block.split('\n').filter(Boolean)
      return { titulo: lines[0] || '', conteudo: lines.slice(1).join('\n') }
    }).filter((i) => i.titulo && i.conteudo)

    if (items.length === 0) { toast.error('Nenhum item válido detectado'); return }

    setAddingItem(true)
    try {
      for (const it of items) {
        await createItem.mutateAsync({ kb_id: selectedKbId, titulo: it.titulo, conteudo: it.conteudo })
      }
      setBulkText(''); setAddMode('none')
      toast.success(`${items.length} item${items.length === 1 ? '' : 's'} adicionado${items.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('Erro durante importação')
    } finally { setAddingItem(false) }
  }

  const handleItemDelete = async (id: string) => {
    if (!window.confirm('Excluir este item?')) return
    try {
      await removeItem.mutateAsync(id)
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const handleItemSave = async (id: string, titulo: string, conteudo: string) => {
    await updateItem.mutateAsync({ id, titulo, conteudo })
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-12 bg-slate-200 rounded-lg w-64 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <AdminPageHeader
        title="Conhecimento dos agentes"
        subtitle="FAQs, catálogos e documentos que os agentes consultam para responder clientes"
        icon={<BookOpen className="w-5 h-5" />}
        stats={[
          { label: 'Bases', value: knowledgeBases.length, color: 'blue' as const },
          { label: 'Itens totais', value: totalItems, color: 'green' as const },
        ]}
        actions={
          selectedKbId ? (
            <Button onClick={() => setSelectedKbId(null)} variant="outline" className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Voltar às bases
            </Button>
          ) : (
            <Button onClick={() => setIsCreatingKb(true)} className="gap-2" disabled={isCreatingKb}>
              <Plus className="w-4 h-4" />
              Nova base
            </Button>
          )
        }
      />

      {!selectedKbId ? (
        /* KB grid view */
        <div className="space-y-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={kbSearch}
              onChange={(e) => setKbSearch(e.target.value)}
              placeholder="Buscar base de conhecimento..."
              className="pl-9"
            />
          </div>

          {isCreatingKb && (
            <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={kbForm.nome}
                    onChange={(e) => setKbForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: FAQ geral, Catálogo 2026..."
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo</Label>
                  <select
                    value={kbForm.tipo}
                    onChange={(e) => setKbForm((f) => ({ ...f, tipo: e.target.value as KbTipo }))}
                    className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {TIPO_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição (opcional)</Label>
                <Input
                  value={kbForm.descricao}
                  onChange={(e) => setKbForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Para que serve essa base?"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateKb} className="gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Criar base
                </Button>
                <Button variant="ghost" onClick={() => setIsCreatingKb(false)}>
                  <X className="w-4 h-4" /> Cancelar
                </Button>
              </div>
            </div>
          )}

          {filteredKbs.length === 0 && !isCreatingKb ? (
            <div className="p-16 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900">Nenhuma base de conhecimento</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Crie bases com FAQs e informações que os agentes vão consultar para responder clientes com precisão.
              </p>
              <Button onClick={() => setIsCreatingKb(true)} className="mt-4 gap-2">
                <Plus className="w-4 h-4" /> Criar primeira base
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKbs.map((kb) => {
                const itemCount = getKbItemCount(kb)
                return (
                  <div
                    key={kb.id}
                    onClick={() => setSelectedKbId(kb.id)}
                    className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb.id) }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-slate-900 truncate">{kb.nome}</h3>
                    {kb.descricao && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{kb.descricao}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-3">
                      <TipoBadge tipo={kb.tipo} />
                      <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Items view for selected KB */
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                {selectedKb?.nome}
                {selectedKb && <TipoBadge tipo={selectedKb.tipo} />}
              </h2>
              {selectedKb?.descricao && (
                <p className="text-sm text-slate-500 mt-1">{selectedKb.descricao}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAddMode(addMode === 'bulk' ? 'none' : 'bulk')}
                className="gap-1.5"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Colar texto
              </Button>
              <Button
                onClick={() => setAddMode(addMode === 'manual' ? 'none' : 'manual')}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Novo item
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Testar busca (como se fosse cliente)..."
              className="pl-9"
            />
          </div>

          {/* Add forms */}
          {addMode === 'manual' && (
            <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título (pergunta ou tema)</Label>
                <Input
                  value={manualTitulo}
                  onChange={(e) => setManualTitulo(e.target.value)}
                  placeholder="Ex: Qual o prazo de resposta?"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conteúdo (resposta ou informação)</Label>
                <Textarea
                  value={manualConteudo}
                  onChange={(e) => setManualConteudo(e.target.value)}
                  placeholder="Respondemos em até 4 horas nos dias úteis..."
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddManual}
                  disabled={addingItem || !manualTitulo.trim() || !manualConteudo.trim()}
                  className="gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {addingItem ? 'Salvando...' : 'Adicionar'}
                </Button>
                <Button variant="ghost" onClick={() => setAddMode('none')}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {addMode === 'bulk' && (
            <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
                <FileUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Cole vários itens separados por linha em branco. Primeira linha = título, resto = conteúdo.</span>
              </div>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Prazo de resposta\nRespondemos em até 4 horas nos dias úteis.\n\nAceita parcelamento?\nSim, aceitamos até 12x sem juros.`}
                className="min-h-[180px] font-mono text-xs"
                autoFocus
              />
              <div className="flex gap-2 items-center">
                <Button onClick={handleAddBulk} disabled={addingItem || !bulkText.trim()} className="gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  {addingItem ? 'Importando...' : 'Importar'}
                </Button>
                <Button variant="ghost" onClick={() => setAddMode('none')}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">
                {itemSearch ? 'Nenhum item encontrado' : 'Nenhum item ainda'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {itemSearch ? 'Tente outra busca' : 'Adicione itens para o agente consultar'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {itemSearch && (
                <p className="text-xs text-slate-500">
                  {filteredItems.length} de {items.length} item{items.length === 1 ? '' : 's'}
                </p>
              )}
              {filteredItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onDelete={() => handleItemDelete(item.id)}
                  onSave={(titulo, conteudo) => handleItemSave(item.id, titulo, conteudo)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
