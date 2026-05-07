import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useOrg } from '../../contexts/OrgContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useCriarAtendimento } from '../../hooks/concierge/useAtendimentoMutations'
import { useConciergeUsers } from '../../hooks/concierge/useConciergeUsers'
import { CATEGORIAS_CONCIERGE, TIPO_LABEL, categoriasParaProduto, type TipoConcierge, type CategoriaConcierge, type CobradoDe } from '../../hooks/concierge/types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

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
  const [cardIdInternal, setCardIdInternal] = useState(lockedCard ?? initialCardId ?? '')
  const [tipo, setTipo] = useState<TipoConcierge>('operacional')
  const [categoriaSelected, setCategoriaSelected] = useState<CategoriaConcierge>('outro')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState('media')
  const [valor, setValor] = useState('')
  const [cobradoDe, setCobradoDe] = useState<CobradoDe | ''>('')
  const [cardSearch, setCardSearch] = useState('')
  // Default: usuário atual (caso seja concierge); senão fica vazio até o
  // usuário escolher um concierge. Em qualquer cenário o operador pode
  // mudar pra qualquer concierge da lista.
  const [responsavelId, setResponsavelId] = useState<string>(profile?.id ?? '')
  const conciergeUsers = useConciergeUsers()
  // Modo múltiplo: usuário marca a caixa, o campo Título vira textarea onde
  // cada linha não-vazia vira um atendimento separado (mesmo Tipo / Categoria
  // / Prazo / Atribuído / Prioridade).
  const [multiplos, setMultiplos] = useState(false)
  const [titulosMulti, setTitulosMulti] = useState('')
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  // Quando lockedCard vem como prop, ele dita o cardId; senão usa o state interno.
  const cardId = lockedCard ?? cardIdInternal
  const setCardId = setCardIdInternal

  const { mutate: criarAtendimento, mutateAsync: criarAtendimentoAsync, isPending } = useCriarAtendimento()

  const categoriasDoProduto = useMemo(() => categoriasParaProduto(produtoAtual), [produtoAtual])

  // Carregar cards para autocomplete
  const { data: cards = [] } = useQuery({
    queryKey: ['cards-autocomplete', cardSearch, org?.id],
    queryFn: async () => {
      if (!cardSearch || !org?.id) return []
      const { data } = await supabase
        .from('cards')
        .select('id, titulo')
        .eq('org_id', org.id)
        .ilike('titulo', `%${cardSearch}%`)
        .limit(10)
      return data ?? []
    },
    enabled: !!cardSearch && !!org?.id,
  })

  const categoriasDoTipo = useMemo(() => {
    return categoriasDoProduto
      .filter(c => c.config.tipo === tipo)
      .map(c => c.key as CategoriaConcierge)
  }, [tipo, categoriasDoProduto])

  // Categoria efetiva: se a selecionada saiu da lista (porque o tipo mudou),
  // cai automaticamente na primeira da lista. Sem effect.
  const categoria: CategoriaConcierge = categoriasDoTipo.includes(categoriaSelected)
    ? categoriaSelected
    : (categoriasDoTipo[0] ?? 'outro')
  const setCategoria = setCategoriaSelected

  const mostraValor = tipo === 'oferta'

  const baseInput = () => ({
    card_id: cardId,
    tipo_concierge: tipo,
    categoria,
    descricao: descricao ?? undefined,
    data_vencimento: prazo ?? undefined,
    responsavel_id: responsavelId || profile?.id,
    prioridade,
    valor: mostraValor && valor ? parseFloat(valor) : null,
    cobrado_de: mostraValor && cobradoDe ? (cobradoDe as CobradoDe) : null,
    source: 'manual' as const,
  })

  const resetAfterCreate = () => {
    setCardId('')
    setTitulo('')
    setDescricao('')
    setPrazo('')
    setValor('')
    setCobradoDe('')
    setTitulosMulti('')
    setMultiplos(false)
    setBatchProgress(null)
    close()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardId) return

    if (!multiplos) {
      // Caminho único — comportamento original
      criarAtendimento(
        { ...baseInput(), titulo: titulo ?? undefined },
        { onSuccess: () => resetAfterCreate() }
      )
      return
    }

    // Modo múltiplo: cada linha não-vazia vira um atendimento.
    const linhas = titulosMulti
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (linhas.length === 0) {
      toast.error('Adicione pelo menos um título (uma linha por atendimento)')
      return
    }

    setBatchProgress({ done: 0, total: linhas.length })
    let success = 0
    const failed: string[] = []
    for (const t of linhas) {
      try {
        await criarAtendimentoAsync({ ...baseInput(), titulo: t })
        success++
      } catch (err) {
        failed.push(`${t}: ${err instanceof Error ? err.message : 'erro'}`)
      }
      setBatchProgress(p => p ? { ...p, done: p.done + 1 } : null)
    }
    setBatchProgress(null)

    if (failed.length === 0) {
      toast.success(`${success} atendimento${success === 1 ? '' : 's'} criado${success === 1 ? '' : 's'}`)
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-slate-900">Novo atendimento</h2>
          <button
            onClick={close}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Card Picker */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Viagem *
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar viagem..."
                value={cardSearch || ''}
                onChange={(e) => {
                  setCardSearch(e.target.value)
                  if (!cardId) setCardId('')
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              {cardSearch && cards.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                  {cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setCardId(card.id)
                        setCardSearch(card.titulo)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700"
                    >
                      {card.titulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {cardId && (
              <div className="mt-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
                ✓ Viagem selecionada
              </div>
            )}
          </div>

          {/* Tipo e Categoria */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tipo *
              </label>
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as TipoConcierge)
                  setCategoria(categoriasDoTipo[0])
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {Object.entries(TIPO_LABEL).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Categoria *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaConcierge)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {categoriasDoTipo.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORIAS_CONCIERGE[cat].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Toggle: criar vários */}
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={multiplos}
                onChange={(e) => setMultiplos(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium">Criar vários atendimentos de uma vez</span>
            </label>
            {multiplos && (
              <p className="mt-1 text-xs text-slate-500">
                Compartilham o mesmo Tipo, Categoria, Prazo, Atribuído e Prioridade. Um título por linha vira um atendimento.
              </p>
            )}
          </div>

          {/* Título — modo único OU múltiplos títulos (textarea) */}
          {!multiplos ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Título
              </label>
              <Input
                type="text"
                placeholder="Ex: Oferecer upgrade de assento"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Títulos * <span className="font-normal text-slate-500 text-xs">(um por linha)</span>
              </label>
              <textarea
                placeholder={'Oferecer upgrade de assento\nVerificar bagagem\nConfirmar transfer'}
                value={titulosMulti}
                onChange={(e) => setTitulosMulti(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-y font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                {(() => {
                  const n = titulosMulti.split('\n').filter(s => s.trim()).length
                  return n === 0 ? 'Nenhum título digitado' : `${n} atendimento${n === 1 ? '' : 's'} a criar`
                })()}
              </p>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Descrição
            </label>
            <textarea
              placeholder="Detalhes adicionais..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none h-24"
            />
          </div>

          {/* Prazo e Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Prazo
              </label>
              <Input
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Prioridade
              </label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          {/* Atribuir a (concierge) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Atribuir a
            </label>
            <select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">Eu mesmo (padrão)</option>
              {conciergeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            {conciergeUsers.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Nenhum concierge cadastrado nesta workspace.
              </p>
            )}
          </div>

          {/* Valor (se oferta) */}
          {mostraValor && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Valor
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-600">R$</span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Cobrado de
                </label>
                <select
                  value={cobradoDe}
                  onChange={(e) => setCobradoDe(e.target.value as CobradoDe)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">Selecionar...</option>
                  <option value="cliente">Cliente</option>
                  <option value="cortesia">Cortesia</option>
                  <option value="incluido_pacote">Incluído pacote</option>
                </select>
              </div>
            </div>
          )}

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
              disabled={!cardId || isPending || !!batchProgress}
            >
              {batchProgress
                ? `Criando ${batchProgress.done}/${batchProgress.total}…`
                : multiplos
                  ? (() => {
                      const n = titulosMulti.split('\n').filter(s => s.trim()).length
                      return n > 0 ? `Criar ${n} atendimento${n === 1 ? '' : 's'}` : 'Criar atendimentos'
                    })()
                  : 'Criar atendimento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { NovoAtendimentoModal }
export default NovoAtendimentoModal
