import { useMemo, useState } from 'react'
import { Plus, Search, Loader2, Heart } from 'lucide-react'
import { useCasais } from '../../../hooks/convidados/casais/useCasais'
import { useDeleteCasal, useDesvincularCasalDoCard } from '../../../hooks/convidados/casais/useCasalMutations'
import { CasalCard } from './CasalCard'
import { NovoCasalModal } from './NovoCasalModal'
import { EditarCasalModal } from './EditarCasalModal'
import { VincularCardModal } from './VincularCardModal'
import type { CasalAdminRow } from '../../../lib/convidados/types'

export function CasaisAdminBoard() {
  const { data: casais = [], isLoading } = useCasais()
  const delMut = useDeleteCasal()
  const desvincMut = useDesvincularCasalDoCard()
  const [search, setSearch] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [editar, setEditar] = useState<CasalAdminRow | null>(null)
  const [vincular, setVincular] = useState<CasalAdminRow | null>(null)

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return casais
    return casais.filter((c) =>
      c.nome_casal.toLowerCase().includes(q) ||
      c.codigo.toLowerCase().includes(q) ||
      c.whatsapp_digits.includes(q.replace(/\D/g, '')) ||
      (c.card_titulo || '').toLowerCase().includes(q),
    )
  }, [casais, search])

  const totais = useMemo(() => casais.reduce(
    (acc, c) => { acc.casais++; acc.convites += c.total_convites; acc.convidados += c.total_pessoas; return acc },
    { casais: 0, convites: 0, convidados: 0 },
  ), [casais])

  return (
    <section className="bg-ww-paper -mx-6 px-6 py-6 rounded-lg">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold mb-1">
            Painel interno · Welcome Weddings
          </p>
          <h2 className="font-ww-serif italic text-2xl text-ww-n700 leading-tight">Casais cadastrados</h2>
          <p className="text-sm text-ww-n500 mt-1">
            Cada casal recebe um link único para preencher a própria lista de convidados.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <TotalChip n={totais.casais} label="casais" />
          <TotalChip n={totais.convites} label="convites" />
          <TotalChip n={totais.convidados} label="convidados" accent />
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ww-n400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código, WhatsApp ou casamento..."
            className="w-full pl-9 pr-3 h-9 text-sm border border-ww-sand-dk bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold" />
        </div>
        <button type="button" onClick={() => setShowNovo(true)}
          className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Novo casal
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-sm text-ww-n500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando casais...
        </div>
      ) : casais.length === 0 ? (
        <div className="bg-white border border-dashed border-ww-sand rounded-xl py-12 text-center">
          <Heart className="w-10 h-10 mx-auto text-ww-gold mb-3" />
          <p className="text-ww-n700 font-medium mb-1">Nenhum casal cadastrado ainda.</p>
          <p className="text-sm text-ww-n500 mb-4">
            Crie o primeiro casal para gerar o link de lista de convidados.
          </p>
          <button type="button" onClick={() => setShowNovo(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors">
            <Plus className="w-4 h-4" /> Cadastrar o primeiro casal
          </button>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-ww-n500 text-center py-10">Nenhum casal corresponde à busca.</p>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
          {filtrados.map((casal) => (
            <CasalCard
              key={casal.id}
              casal={casal}
              onEditar={setEditar}
              onVincularCard={setVincular}
              onDesvincular={async (c) => {
                if (confirm('Desvincular este casal do casamento?')) {
                  await desvincMut.mutateAsync(c.id)
                }
              }}
              onExcluir={async (c) => {
                if (confirm(`Excluir o casal ${c.nome_casal}? A lista de convidados também será apagada.`)) {
                  await delMut.mutateAsync(c.id)
                }
              }}
            />
          ))}
        </div>
      )}

      <NovoCasalModal open={showNovo} onClose={() => setShowNovo(false)} />
      <EditarCasalModal open={!!editar} casal={editar} onClose={() => setEditar(null)} />
      <VincularCardModal open={!!vincular} casal={vincular} onClose={() => setVincular(null)} />
    </section>
  )
}

function TotalChip({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="inline-flex flex-col items-end">
      <strong className={`tabular-nums text-lg leading-none ${accent ? 'text-ww-gold-ink' : 'text-ww-n700'}`}>{n}</strong>
      <span className="text-[10px] uppercase tracking-wider text-ww-n500 mt-0.5">{label}</span>
    </div>
  )
}
