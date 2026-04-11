import { useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, Plus, Trash2, Save, X, ChevronRight, FileText } from 'lucide-react'

import {
  useAiKnowledgeBases, useAiKbItems,
  type AiKnowledgeBase, type KbTipo,
} from '@/hooks/useAiKnowledgeBases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const TIPO_OPTIONS: { value: KbTipo; label: string }[] = [
  { value: 'faq', label: 'FAQ' },
  { value: 'product_catalog', label: 'Catálogo de Produtos' },
  { value: 'policies', label: 'Políticas' },
  { value: 'procedures', label: 'Procedimentos' },
  { value: 'custom', label: 'Customizado' },
]

export default function AiKnowledgeBasePage() {
  const { slug: currentProduct } = useCurrentProductMeta()
  const { knowledgeBases, isLoading, create, remove } = useAiKnowledgeBases(currentProduct)

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [isCreatingKb, setIsCreatingKb] = useState(false)
  const [kbForm, setKbForm] = useState<{ nome: string; tipo: KbTipo; descricao: string }>({
    nome: '', tipo: 'faq', descricao: '',
  })

  // Items
  const { items, createItem, removeItem } = useAiKbItems(selectedKbId || undefined)
  const [isCreatingItem, setIsCreatingItem] = useState(false)
  const [itemForm, setItemForm] = useState<{ titulo: string; conteudo: string }>({ titulo: '', conteudo: '' })

  const totalItems = knowledgeBases.reduce((sum, kb) => {
    const count = Array.isArray(kb.ai_knowledge_base_items)
      ? (kb.ai_knowledge_base_items[0] as { count: number } | undefined)?.count ?? 0
      : 0
    return sum + count
  }, 0)

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
    if (!window.confirm('Excluir esta base e todos os itens?')) return
    try {
      await remove.mutateAsync(id)
      if (selectedKbId === id) setSelectedKbId(null)
      toast.success('Base excluída')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const handleCreateItem = async () => {
    if (!itemForm.titulo.trim() || !itemForm.conteudo.trim() || !selectedKbId) {
      toast.error('Título e conteúdo são obrigatórios')
      return
    }
    try {
      await createItem.mutateAsync({
        kb_id: selectedKbId,
        titulo: itemForm.titulo,
        conteudo: itemForm.conteudo,
      })
      setIsCreatingItem(false)
      setItemForm({ titulo: '', conteudo: '' })
      toast.success('Item adicionado')
    } catch {
      toast.error('Erro ao criar item')
    }
  }

  const handleDeleteItem = async (id: string) => {
    try {
      await removeItem.mutateAsync(id)
      toast.success('Item excluído')
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

  return (
    <>
      <AdminPageHeader
        title="Bases de Conhecimento"
        subtitle="FAQs, catálogos e documentação para busca semântica dos agentes (RAG)"
        icon={<BookOpen className="w-5 h-5" />}
        stats={[
          { label: 'Bases', value: knowledgeBases.length, color: 'blue' as const },
          { label: 'Itens totais', value: totalItems, color: 'green' as const },
        ]}
        actions={
          <Button onClick={() => setIsCreatingKb(true)} className="gap-2" disabled={isCreatingKb}>
            <Plus className="w-4 h-4" />
            Nova Base
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar: Lista de bases */}
        <div className="space-y-3">
          {/* Form nova base */}
          {isCreatingKb && (
            <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
              <Input
                value={kbForm.nome}
                onChange={e => setKbForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome da base"
                autoFocus
              />
              <Select
                value={kbForm.tipo}
                onChange={(v: string) => setKbForm(f => ({ ...f, tipo: v as KbTipo }))}
                options={TIPO_OPTIONS}
              />
              <Input
                value={kbForm.descricao}
                onChange={e => setKbForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição (opcional)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateKb} className="gap-1">
                  <Save className="w-3 h-3" /> Criar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsCreatingKb(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Lista */}
          {knowledgeBases.length === 0 && !isCreatingKb ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Nenhuma base criada</p>
            </div>
          ) : (
            knowledgeBases.map((kb: AiKnowledgeBase) => {
              const itemCount = Array.isArray(kb.ai_knowledge_base_items)
                ? (kb.ai_knowledge_base_items[0] as { count: number } | undefined)?.count ?? 0
                : 0
              const isSelected = selectedKbId === kb.id

              return (
                <button
                  key={kb.id}
                  onClick={() => setSelectedKbId(kb.id)}
                  className={cn(
                    'w-full text-left bg-white border rounded-xl p-4 transition-colors',
                    isSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{kb.nome}</p>
                      {kb.descricao && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{kb.descricao}</p>
                      )}
                      <div className="flex gap-1 mt-1.5">
                        <Badge variant="outline" className="text-xs">{kb.tipo}</Badge>
                        <Badge variant="outline" className="text-xs text-slate-400">
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb.id) }}
                        className="text-red-500 hover:text-red-600 h-7 w-7 p-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <ChevronRight className={cn('w-4 h-4 text-slate-400 transition-transform', isSelected && 'rotate-90')} />
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Main: Itens da base selecionada */}
        <div className="lg:col-span-2">
          {!selectedKbId ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Selecione uma base para ver os itens</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Itens ({items.length})
                </h3>
                <Button size="sm" onClick={() => setIsCreatingItem(true)} className="gap-1" disabled={isCreatingItem}>
                  <Plus className="w-3 h-3" />
                  Adicionar Item
                </Button>
              </div>

              {/* Form novo item */}
              {isCreatingItem && (
                <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
                  <Input
                    value={itemForm.titulo}
                    onChange={e => setItemForm(f => ({ ...f, titulo: e.target.value }))}
                    placeholder="Título (ex: Como cancelar uma viagem?)"
                    autoFocus
                  />
                  <Textarea
                    value={itemForm.conteudo}
                    onChange={e => setItemForm(f => ({ ...f, conteudo: e.target.value }))}
                    placeholder="Conteúdo completo da resposta..."
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateItem} className="gap-1">
                      <Save className="w-3 h-3" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsCreatingItem(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de itens */}
              {items.length === 0 && !isCreatingItem ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Nenhum item nesta base</p>
                  <Button size="sm" onClick={() => setIsCreatingItem(true)} className="mt-3 gap-1">
                    <Plus className="w-3 h-3" />
                    Adicionar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900">{item.titulo}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-3">{item.conteudo}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-500 hover:text-red-600 flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
