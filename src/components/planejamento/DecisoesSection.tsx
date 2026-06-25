import { Check, Clock, ExternalLink } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PLANEJ_FIELD } from '../../hooks/planejamento/types'
import { useWeddingDecisoes, type DecisaoTipo } from '../../hooks/planejamento/useWeddingDecisoes'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'

function pd(data: Record<string, unknown> | null, key: string): string {
  const v = data?.[key]
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function fmtData(iso: string): string {
  const d = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return iso
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
}

/** Valor "vivo" de cada decisão — vem de produto_data (single source). */
function valorDecisao(tipo: DecisaoTipo, w: WeddingPlanejamento): string {
  const d = w.produto_data
  switch (tipo) {
    case 'destino':
      return pd(d, PLANEJ_FIELD.regiao) || pd(d, 'ww_destino') || pd(d, 'ww_planej_destino')
    case 'data': {
      const v = pd(d, PLANEJ_FIELD.dataHoraCasamento) || pd(d, 'ww_data_casamento') || (w.wedding_date ?? '')
      return v ? fmtData(v) : ''
    }
    case 'local': {
      const espaco = pd(d, PLANEJ_FIELD.espaco)
      const pacote = pd(d, PLANEJ_FIELD.pacoteNome)
      return [espaco, pacote].filter(Boolean).join(' · ')
    }
    case 'orcamento': {
      const total = pd(d, PLANEJ_FIELD.valorTotal) || pd(d, PLANEJ_FIELD.pacoteValor)
      if (total) {
        const n = Number(total.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
        return Number.isNaN(n) ? total : brl(n)
      }
      return pd(d, 'ww_orcamento_faixa')
    }
  }
}

const DECISOES: { tipo: DecisaoTipo; label: string }[] = [
  { tipo: 'destino', label: 'Destino' },
  { tipo: 'data', label: 'Data do casamento' },
  { tipo: 'local', label: 'Local da cerimônia' },
  { tipo: 'orcamento', label: 'Orçamento' },
]

/**
 * Linha do tempo de DECISÕES (D-P7). O valor de cada decisão vem de produto_data
 * (single source); aqui registramos o estado de ACEITE do casal (proposto/aceito).
 * Pronta pro portal do casal (Edme) escrever o aceite no futuro.
 */
export function DecisoesSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { byTipo, setStatus } = useWeddingDecisoes(wedding.id)

  return (
    <div className="pt-3">
      <p className="text-[12px] text-[#9A9082] mb-4 [font-family:'Roboto',sans-serif]">
        As escolhas que valem (destino, data, local, orçamento) e o aceite do casal. Pronto pro casal confirmar quando o portal conectar.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DECISOES.map(({ tipo, label }) => {
          const valor = valorDecisao(tipo, wedding)
          const row = byTipo[tipo]
          const definido = valor.trim().length > 0
          const aceito = row?.status === 'aceito'

          return (
            <div
              key={tipo}
              className={cn(
                'rounded-xl border p-3.5 flex flex-col gap-2',
                aceito ? 'border-[#DCE7D6] bg-[#F4F8F1]' : definido ? 'border-[#E7D3B3] bg-[#FCF9F2]' : 'border-[#EEE7DA] bg-[#FBF9F5]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A88C57]">{label}</div>
                  <div className={cn('text-[14px] font-semibold mt-0.5 break-words', definido ? 'text-[#211F1D]' : 'text-slate-400 italic font-normal')}>
                    {definido ? valor : 'ainda não definido'}
                  </div>
                </div>
                {aceito ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#E7F3EE] text-[#0f6e5e] border border-[#bfe0d6]">
                    <Check className="w-3 h-3" /> aceito
                  </span>
                ) : definido ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FDF3E7] text-[#b4690e] border border-[#f0d8b4]">
                    <Clock className="w-3 h-3" /> aguardando
                  </span>
                ) : null}
              </div>

              {definido && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#EFE6D6]">
                  <span className="text-[10.5px] text-[#B5ABA0]">
                    {aceito && row?.aceito_em ? `aceito em ${fmtData(row.aceito_em)}` : 'aceite ainda não registrado'}
                  </span>
                  {aceito ? (
                    <button
                      type="button"
                      onClick={() => setStatus.mutate({ tipo, status: 'proposto', valorLabel: valor })}
                      className="text-[11px] font-medium text-[#9A9082] hover:text-[#6F675E]"
                    >
                      desfazer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStatus.mutate({ tipo, status: 'aceito', valorLabel: valor })}
                      disabled={setStatus.isPending}
                      className="text-[11px] font-semibold text-[#0f6e5e] hover:text-[#0b574a] border border-[#bfe0d6] rounded-md px-2 py-0.5 disabled:opacity-50"
                    >
                      Registrar aceite do casal
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <a
        href={`/cards/${wedding.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#8A6A33] hover:text-[#6f531f] mt-4"
      >
        Ver o histórico completo de mudanças no card <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  )
}
