import { useState } from 'react'
import { toast } from 'sonner'
import { ViagemArvore } from './ViagemArvore'
import { ViagemItemEditor } from './ViagemItemEditor'
import { ViagemPreview } from './ViagemPreview'
import { ViagemEditorHeader } from './ViagemEditorHeader'
import { InboxPVPanel } from './InboxPVPanel'
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

        {/* Center — item editor */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-white">
          {selectedItem ? (
            <ViagemItemEditor item={selectedItem} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Selecione um item para editar
            </div>
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
