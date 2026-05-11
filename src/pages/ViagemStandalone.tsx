import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Loader2, AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ViagemEditorLayout } from '@/components/viagem-editor/ViagemEditorLayout'
import { useViagemById, useAtrelarViagemACard } from '@/hooks/viagem/useViagemInterna'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Modal to select a card to attach to
function AtrelarCardModal({
  viagemId,
  onClose,
}: {
  viagemId: string
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const atrelarViagem = useAtrelarViagemACard()

  const { data: cards } = useQuery({
    queryKey: ['cards-sem-viagem', busca],
    queryFn: async () => {
      let q = supabase
        .from('cards')
        .select('id, titulo, pessoa_principal_id')
        .order('updated_at', { ascending: false })
        .limit(30)

      if (busca.trim()) {
        q = q.ilike('titulo', `%${busca.trim()}%`)
      }

      const { data, error } = await q
      if (error) throw error

      // Filter out cards that already have a viagem
      const ids = (data ?? []).map((c) => c.id)
      if (!ids.length) return []

      const { data: existingViagens } = await supabase
        .from('viagens')
        .select('card_id')
        .in('card_id', ids)

      const takenIds = new Set((existingViagens ?? []).map((v) => v.card_id))
      return (data ?? []).filter((c) => !takenIds.has(c.id))
    },
    staleTime: 5_000,
  })

  const handleAtrelar = () => {
    if (!selectedCardId) return
    atrelarViagem.mutate(
      { viagemId, cardId: selectedCardId, hidratar: true },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Atrelar a um card</h2>
          <p className="text-xs text-slate-500">Selecione o card do cliente para esta viagem.</p>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar card..."
              autoFocus
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {(cards ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCardId(c.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedCardId === c.id
                    ? 'bg-indigo-50 text-indigo-900 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.titulo || 'Card sem título'}
              </button>
            ))}
            {cards?.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">Nenhum card disponível</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedCardId || atrelarViagem.isPending}
            onClick={handleAtrelar}
          >
            {atrelarViagem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atrelar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ViagemStandalone() {
  const { id: viagemId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showAtrelarModal, setShowAtrelarModal] = useState(false)

  const { data: viagemData, isLoading, isError } = useViagemById(viagemId)

  // Load card titulo when viagem has a card
  const { data: card } = useQuery({
    queryKey: ['card-titulo', viagemData?.viagem.card_id],
    queryFn: async () => {
      const cardId = viagemData?.viagem.card_id
      if (!cardId) return null
      const { data, error } = await supabase
        .from('cards')
        .select('titulo')
        .eq('id', cardId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!viagemData?.viagem.card_id,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !viagemData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p>Viagem não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/viagens')}>
          Voltar para viagens
        </Button>
      </div>
    )
  }

  return (
    <>
      <ViagemEditorLayout
        viagem={viagemData.viagem}
        items={viagemData.items}
        context="standalone"
        cardTitulo={card?.titulo ?? null}
        onAtrelarClick={() => setShowAtrelarModal(true)}
      />

      {showAtrelarModal && (
        <AtrelarCardModal
          viagemId={viagemData.viagem.id}
          onClose={() => setShowAtrelarModal(false)}
        />
      )}
    </>
  )
}
