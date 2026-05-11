import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useOrg } from '../../contexts/OrgContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useCriarAtendimento } from '../../hooks/concierge/useAtendimentoMutations'
import type { CobradoDe } from '../../hooks/concierge/types'
import { Button } from '../ui/Button'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { AtendimentoFormBlock } from './atendimento-form/AtendimentoFormBlock'
import { makeEmptyBlock, type AtendimentoBlockState } from './atendimento-form/types'

interface NovoAtendimentoModalProps {
  isOpen?: boolean
  open?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  cardId?: string
  cardIdLocked?: string
}

function NovoAtendimentoModal({ isOpen, open, onClose, onOpenChange, cardId: initialCardId, cardIdLocked }: NovoAtendimentoModalProps) {
  const isOpenResolved = open ?? isOpen ?? false
  const close = () => {
    onClose?.()
    onOpenChange?.(false)
  }
  const lockedCard = cardIdLocked ?? null
  const { profile } = useAuth()
  const { org } = useOrg()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const { mutateAsync: criarAtendimentoAsync, isPending } = useCriarAtendimento()

  // Quando há lockedCard, busca o título dele uma vez para mostrar no picker.
  const { data: lockedCardData } = useQuery({
    queryKey: ['locked-card-title', lockedCard],
    queryFn: async () => {
      if (!lockedCard) return null
      const { data } = await supabase
        .from('cards')
        .select('id, titulo')
        .eq('id', lockedCard)
        .maybeSingle()
      return data
    },
    enabled: !!lockedCard,
    staleTime: 5 * 60 * 1000,
  })
  const lockedCardTitulo = lockedCardData?.titulo ?? ''

  const initialBlockSeed = lockedCard
    ? { cardId: lockedCard, cardTitulo: lockedCardTitulo }
    : initialCardId
      ? { cardId: initialCardId, cardTitulo: '' }
      : undefined
  const [blocks, setBlocks] = useState<AtendimentoBlockState[]>([makeEmptyBlock(initialBlockSeed)])
  const [showValidation, setShowValidation] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  const updateBlock = (index: number, next: AtendimentoBlockState) => {
    setBlocks(prev => prev.map((b, i) => (i === index ? next : b)))
  }

  const addBlock = () => {
    // Novo bloco herda a viagem do bloco anterior por conveniência — usuário
    // costuma criar várias tarefas pra mesma viagem; quando quiser outra, é só
    // limpar o picker. Em modo locked (cardIdLocked), a viagem fica fixa.
    setBlocks(prev => {
      const last = prev[prev.length - 1]
      const seed = lockedCard
        ? { cardId: lockedCard, cardTitulo: lockedCardTitulo }
        : last
          ? { cardId: last.cardId, cardTitulo: last.cardTitulo }
          : undefined
      return [...prev, makeEmptyBlock(seed)]
    })
  }

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index))
  }

  const resetAfterCreate = () => {
    setBlocks([makeEmptyBlock(lockedCard ? { cardId: lockedCard, cardTitulo: lockedCardTitulo } : undefined)])
    setShowValidation(false)
    setBatchProgress(null)
    close()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const algumSemViagem = blocks.some(b => !(lockedCard ?? b.cardId))
    const algumSemTitulo = blocks.some(b => !b.titulo.trim())
    if (algumSemViagem || algumSemTitulo) {
      setShowValidation(true)
      if (algumSemViagem) toast.error('Selecione a viagem em todos os atendimentos')
      else toast.error('Preencha o título de todos os atendimentos')
      return
    }

    setBatchProgress({ done: 0, total: blocks.length })
    // Em batch (>1) suprimimos o toast individual do hook e mostramos só o resumo.
    // Em 1 bloco, deixamos o hook mostrar "Atendimento criado" — o modal não duplica.
    const silent = blocks.length > 1
    let success = 0
    const failed: string[] = []
    for (const block of blocks) {
      const mostraValor = block.tipo === 'oferta'
      const cardIdEfetivo = lockedCard ?? block.cardId
      try {
        await criarAtendimentoAsync({
          card_id: cardIdEfetivo,
          tipo_concierge: block.tipo,
          categoria: block.categoria,
          titulo: block.titulo,
          descricao: block.descricao || undefined,
          data_vencimento: block.prazo || undefined,
          responsavel_id: block.responsavelId || profile?.id,
          prioridade: block.prioridade,
          valor: mostraValor && block.valor ? parseFloat(block.valor) : null,
          cobrado_de: mostraValor && block.cobradoDe ? (block.cobradoDe as CobradoDe) : null,
          source: 'manual',
          silent,
        })
        success++
      } catch (err) {
        failed.push(`${block.titulo}: ${err instanceof Error ? err.message : 'erro'}`)
      }
      setBatchProgress(p => p ? { ...p, done: p.done + 1 } : null)
    }
    setBatchProgress(null)

    if (failed.length === 0) {
      if (silent) {
        toast.success(`${success} atendimentos criados`)
      }
      resetAfterCreate()
    } else if (success > 0) {
      toast.warning(`${success} criado${success === 1 ? '' : 's'}, ${failed.length} falhou${failed.length === 1 ? '' : 'ram'}`, {
        description: failed.slice(0, 3).join('\n') + (failed.length > 3 ? `\n+${failed.length - 3} outros` : ''),
      })
    } else {
      toast.error('Nenhum atendimento criado', { description: failed[0] })
    }
  }

  if (!isOpenResolved) return null

  // Cards distintos no batch — informativo no header pra deixar claro
  // quantas viagens diferentes vão ser afetadas.
  const viagensDistintas = new Set(
    blocks
      .map(b => lockedCard ?? b.cardId)
      .filter(Boolean)
  ).size

  const submitLabel = batchProgress
    ? `Criando ${batchProgress.done}/${batchProgress.total}…`
    : blocks.length === 1
      ? 'Criar atendimento'
      : `Criar ${blocks.length} atendimentos`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Novo atendimento</h2>
            {blocks.length > 1 && viagensDistintas > 1 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {blocks.length} atendimentos em {viagensDistintas} viagens diferentes
              </p>
            )}
          </div>
          <button
            onClick={close}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Blocks — cada um é um atendimento independente, com sua própria viagem */}
          <div className="space-y-3">
            {blocks.map((block, idx) => (
              <AtendimentoFormBlock
                key={idx}
                index={idx}
                value={block}
                onChange={(next) => updateBlock(idx, next)}
                onRemove={blocks.length > 1 ? () => removeBlock(idx) : undefined}
                produtoSlug={produtoAtual}
                showError={showValidation}
                orgId={org?.id}
                lockedCardId={lockedCard ?? undefined}
                lockedCardTitulo={lockedCardTitulo || undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addBlock}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Adicionar mais um atendimento
          </button>

          {/* Buttons */}
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={isPending || !!batchProgress}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || !!batchProgress}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { NovoAtendimentoModal }
export default NovoAtendimentoModal
