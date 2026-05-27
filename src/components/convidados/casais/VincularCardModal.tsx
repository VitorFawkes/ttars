import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Search, Heart, Calendar, Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useCardsDisponiveis } from '../../../hooks/convidados/casais/useCardsDisponiveis'
import { useVincularCasalAoCard } from '../../../hooks/convidados/casais/useCasalMutations'
import type { CasalAdminRow } from '../../../lib/convidados/types'

interface Props {
  open: boolean
  onClose: () => void
  casal: CasalAdminRow | null
}

export function VincularCardModal({ open, onClose, casal }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const { data: cards = [], isLoading } = useCardsDisponiveis()
  const vincular = useVincularCasalAoCard()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cards
    return cards.filter((c) => c.titulo.toLowerCase().includes(q))
  }, [cards, search])

  if (!open || !casal) return null

  const handleConfirm = async () => {
    if (!selected) return
    await vincular.mutateAsync({ casal_id: casal.id, card_id: selected })
    onClose()
  }

  const node = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true">
      <div className="w-full max-w-[560px] max-h-[90vh] bg-white rounded-xl shadow-ww-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <div>
            <h2 className="font-ww-serif italic text-lg text-ww-n700">Vincular ao casamento</h2>
            <p className="text-xs text-ww-n500 mt-0.5">
              Selecione um card WEDDING para vincular o casal{' '}
              <strong className="text-ww-n700">{casal.nome_casal}</strong>.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 border-b border-ww-sand">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ww-n400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar casamento pelo título..." autoFocus
              className="w-full pl-8 pr-3 py-2 text-sm border border-ww-sand-dk rounded-md focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 max-h-[50vh]">
          {isLoading ? (
            <div className="text-center py-6 text-sm text-ww-n500">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ww-n500 text-center py-6">
              {cards.length === 0 ? 'Nenhum card WEDDING sem casal vinculado.' : 'Nenhum casamento corresponde à busca.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected(c.id)}
                    className={cn('w-full text-left px-3 py-2 rounded-md border transition-colors flex items-start gap-2.5',
                      selected === c.id ? 'border-ww-gold bg-ww-gold-soft' : 'border-ww-sand bg-white hover:bg-ww-cream')}>
                    <Heart className={cn('w-4 h-4 mt-0.5 shrink-0', selected === c.id ? 'text-ww-gold fill-ww-gold' : 'text-ww-n400')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ww-n700 truncate">{c.titulo}</p>
                      {c.wedding_date && (
                        <p className="text-[11px] text-ww-n500 inline-flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />{new Date(c.wedding_date).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    {selected === c.id && <Check className="w-4 h-4 text-ww-gold" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ww-sand">
          <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Cancelar</button>
          <button type="button" onClick={handleConfirm} disabled={!selected || vincular.isPending}
            className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {vincular.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Vincular
          </button>
        </footer>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}
