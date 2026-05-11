import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ViagemEditorLayout } from '@/components/viagem-editor/ViagemEditorLayout'
import { useViagemByCardId, useCriarViagem, useHidratarViagem } from '@/hooks/viagem/useViagemInterna'
import { Button } from '@/components/ui/Button'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export default function CardViagem() {
  const { id: cardId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const criarViagem = useCriarViagem()
  const hidratarViagem = useHidratarViagem()
  const autoCreatedRef = useRef(false)

  const { data: viagemData, isLoading, isError } = useViagemByCardId(cardId)

  // Load card titulo for header
  const { data: card } = useQuery({
    queryKey: ['card-titulo', cardId],
    queryFn: async () => {
      if (!cardId) return null
      const { data, error } = await supabase
        .from('cards')
        .select('titulo')
        .eq('id', cardId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!cardId,
    staleTime: 60_000,
  })

  // Auto-create if no viagem
  useEffect(() => {
    if (isLoading || viagemData !== null || autoCreatedRef.current) return
    if (!cardId) return
    if (criarViagem.isPending || criarViagem.isSuccess) return
    autoCreatedRef.current = true
    criarViagem.mutate({ cardId, hidratar: true })
  }, [isLoading, viagemData, cardId, criarViagem])

  // On viagem load (existing), silently pull new items from Produto-Vendas
  const hydrated = useRef<string | null>(null)
  useEffect(() => {
    const id = viagemData?.viagem.id
    if (!id || hydrated.current === id) return
    hydrated.current = id
    hidratarViagem.mutate(id, {
      onSuccess: (result) => {
        if (result.criados > 0) {
          toast.success(
            `${result.criados} ${result.criados === 1 ? 'item novo' : 'itens novos'} do Produto-Vendas`,
            { description: 'Adicionados automaticamente.' },
          )
        }
      },
    })
  }, [viagemData?.viagem.id, hidratarViagem])

  if (isLoading || (!viagemData && !isError)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p>Erro ao carregar a viagem.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/cards/${cardId}`)}>
          Voltar ao card
        </Button>
      </div>
    )
  }

  if (!viagemData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <ViagemEditorLayout
      viagem={viagemData.viagem}
      items={viagemData.items}
      context="card"
      cardTitulo={card?.titulo ?? null}
    />
  )
}
