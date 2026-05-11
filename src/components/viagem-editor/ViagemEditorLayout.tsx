import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ViagemArvore } from './ViagemArvore'
import { ViagemItemEditor } from './ViagemItemEditor'
import { ViagemPreview } from './ViagemPreview'
import { ViagemEditorHeader } from './ViagemEditorHeader'
import { InboxPVPanel } from './InboxPVPanel'
import { ViagemResumo } from './ViagemResumo'
import type { ViagemInternaRow, TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useCreateTripItem, useDeleteTripItem, useHidratarViagem } from '@/hooks/viagem/useViagemInterna'

interface Props {
  viagem: ViagemInternaRow
  items: TripItemInterno[]
  context: 'card' | 'standalone'
  cardTitulo?: string | null
  onAtrelarClick?: () => void
}

export function ViagemEditorLayout({ viagem, items, context, cardTitulo, onAtrelarClick }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const createItem = useCreateTripItem()
  const deleteItem = useDeleteTripItem()
  const hidratarViagem = useHidratarViagem()

  // Auto-selecionar primeiro item não-dia (ou primeiro dia se nada) quando
  // a viagem tem conteúdo e nada está selecionado ainda. Evita a tela vazia
  // "Selecione um item para editar" na primeira abertura.
  useEffect(() => {
    if (selectedId) return
    if (items.length === 0) return
    const firstNonDay = items.find((i) => i.tipo !== 'dia' && !i.deleted_at)
    const firstAny = items.find((i) => !i.deleted_at)
    const pick = firstNonDay ?? firstAny
    if (pick) setSelectedId(pick.id)
    // Só roda uma vez na montagem com items carregados — não queremos re-selecionar
    // quando o usuário deseleciona propositalmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0])

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  const maxOrdem = items.reduce((max, i) => Math.max(max, i.ordem), -1)

  const handleAddDay = () => {
    const dayCount = items.filter((i) => i.tipo === 'dia').length
    createItem.mutate(
      {
        viagem_id: viagem.id,
        tipo: 'dia',
        ordem: maxOrdem + 1,
        comercial: { titulo: `Dia ${dayCount + 1}` },
      },
      {
        onSuccess: (newItem) => setSelectedId(newItem.id),
      },
    )
  }

  const handleAddItem = (parentId: string | null) => {
    const siblingsMaxOrdem = items
      .filter((i) => i.parent_id === parentId)
      .reduce((max, i) => Math.max(max, i.ordem), -1)

    createItem.mutate(
      {
        viagem_id: viagem.id,
        tipo: 'texto',
        parent_id: parentId,
        ordem: siblingsMaxOrdem + 1,
        comercial: {},
      },
      {
        onSuccess: (newItem) => setSelectedId(newItem.id),
      },
    )
  }

  const handleDelete = (itemId: string) => {
    if (selectedId === itemId) setSelectedId(null)
    deleteItem.mutate(itemId)
  }

  const handleHidratar = () => {
    hidratarViagem.mutate(viagem.id, {
      onSuccess: (result) => {
        if (result.criados === 0) {
          toast.info('Nenhum item novo no Produto-Vendas.')
        }
      },
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <ViagemEditorHeader
        viagem={viagem}
        context={context}
        cardTitulo={cardTitulo}
        onAtrelarClick={onAtrelarClick}
      />

      <InboxPVPanel
        viagemId={viagem.id}
        items={items}
        viagemEstado={viagem.estado}
        onFocusItem={setSelectedId}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left — tree */}
        <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <ViagemArvore
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddDay={handleAddDay}
            onAddItem={handleAddItem}
            onDelete={handleDelete}
          />

          {viagem.card_id && (
            <div className="border-t border-slate-200 px-3 py-2">
              <button
                type="button"
                onClick={handleHidratar}
                disabled={hidratarViagem.isPending}
                className="w-full rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
              >
                {hidratarViagem.isPending ? 'Atualizando...' : '↻ Atualizar do Produto-Vendas'}
              </button>
            </div>
          )}
        </div>

        {/* Center — item editor ou resumo */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-white">
          {selectedItem ? (
            <ViagemItemEditor item={selectedItem} />
          ) : (
            <ViagemResumo viagem={viagem} items={items} cardTitulo={cardTitulo} />
          )}
        </div>

        {/* Right — client preview */}
        <div className="hidden w-80 shrink-0 flex-col bg-white xl:flex">
          <ViagemPreview publicToken={viagem.public_token} />
        </div>
      </div>
    </div>
  )
}
