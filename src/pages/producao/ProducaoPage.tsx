import { Link } from 'react-router-dom'
import {
  Hammer,
  Heart,
  Calendar,
  MapPin,
  BedDouble,
  Users,
  ExternalLink,
  Loader2,
  PackageCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatDataCurta } from '../../lib/planejamento/format'
import { useProducaoWeddings, type WeddingProducao, type ProducaoFornecedor } from '../../hooks/planejamento/useProducaoWeddings'

// Cor do chip de fornecedor por status (semente de Produção: foto/make/A&B…).
function fornecedorTone(status: string): string {
  const s = status?.toLowerCase() ?? ''
  if (s.includes('pago')) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (s.includes('contrat') || s.includes('fech')) return 'bg-[#FBF6E8] text-[#8A6A33] border-[#ECD9B5]'
  return 'bg-slate-50 text-slate-500 border-slate-200'
}

function hotelLabel(status: WeddingProducao['hotelStatus']): { label: string; tone: string } {
  if (status === 'confirmado') return { label: 'hotel confirmado', tone: 'text-emerald-600' }
  if (status === 'bloqueado') return { label: 'hotel bloqueado', tone: 'text-[#8A6A33]' }
  return { label: 'hotel a definir', tone: 'text-slate-400' }
}

export default function ProducaoPage() {
  const { data, isLoading } = useProducaoWeddings()

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando produção…
      </div>
    )
  }

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FBF6E8] text-[#8A6A33]">
          <Hammer className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Produção</h1>
          <p className="text-sm text-slate-500">
            {data.length} {data.length === 1 ? 'casamento entregue' : 'casamentos entregues'} pra produção.
          </p>
        </div>
      </header>

      {/* Aviso: área em construção. A LIGAÇÃO está pronta (entrega do Planejamento +
          dados chegando); a tela rica de produção é construída por cima daqui. */}
      <div className="rounded-xl border border-[#ECD9B5] bg-[#FBF6E8] px-4 py-3 text-[13px] text-[#8A6A33] flex items-start gap-2.5">
        <Hammer className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          <b>Área em construção.</b> A passagem do Planejamento já cai aqui com o contexto do casamento
          (venue, hotel, convidados e fornecedores). O fluxo de produção (eventos, blocos de fornecedor,
          prazos a partir da data do casamento) é montado em cima desta base.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">Nenhum casamento na produção ainda</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
            Quando o Planejamento usar o botão <b>“Entregar para Produção”</b> na tela do casamento,
            ele aparece aqui com tudo o que já foi definido.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map((w) => (
            <CasamentoProducaoCard key={w.id} wedding={w} />
          ))}
        </div>
      )}
    </div>
  )
}

function CasamentoProducaoCard({ wedding }: { wedding: WeddingProducao }) {
  const dateLabel = formatDataCurta(wedding.wedding_date)
  const hotel = hotelLabel(wedding.hotelStatus)
  const { confirmado, total } = wedding.counts
  // Setores de fornecedor únicos (semente do que a Produção vai operar).
  const setores = dedupeFornecedores(wedding.fornecedores)

  return (
    <article className="bg-white border border-slate-200 border-l-4 border-l-[#D9BE8C] shadow-sm rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Heart className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-900 break-words flex-1" title={wedding.titulo}>{wedding.titulo}</h3>
      </div>

      <div className="flex flex-col gap-1.5 text-[12px] text-slate-500">
        {dateLabel && (
          <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 shrink-0" /> {dateLabel}</span>
        )}
        {wedding.local && (
          <span className="inline-flex items-center gap-1.5 truncate" title={wedding.local}><MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{wedding.local}</span></span>
        )}
        <span className={cn('inline-flex items-center gap-1.5', hotel.tone)}><BedDouble className="w-3.5 h-3.5 shrink-0" /> {hotel.label}</span>
        <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 shrink-0" />
          {total > 0 ? <span><span className="font-semibold text-emerald-600">{confirmado}</span> / {total} convidados</span> : <span className="italic text-slate-400">sem convidados</span>}
        </span>
      </div>

      {setores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {setores.map((f) => (
            <span key={f.setor} className={cn('text-[10.5px] font-medium px-2 py-0.5 rounded-full border', fornecedorTone(f.status))} title={f.status}>
              {f.setor}
            </span>
          ))}
        </div>
      )}

      <div className="pt-2 mt-auto border-t border-slate-100 flex items-center gap-3">
        <Link to={`/convidados/casamento/${wedding.id}`} className="text-[12px] font-medium text-[#8A6A33] hover:underline inline-flex items-center gap-1">
          Convidados
        </Link>
        <a href={`/cards/${wedding.id}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-slate-500 hover:underline inline-flex items-center gap-1 ml-auto">
          Abrir card <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </article>
  )
}

// Um chip por setor (o mesmo setor pode ter vários fornecedores lançados).
function dedupeFornecedores(fornecedores: ProducaoFornecedor[]): ProducaoFornecedor[] {
  const bySetor = new Map<string, ProducaoFornecedor>()
  for (const f of fornecedores) {
    const cur = bySetor.get(f.setor)
    // Mantém o "mais avançado" (pago > contratado > pendente) só pela cor do chip.
    if (!cur || rank(f.status) > rank(cur.status)) bySetor.set(f.setor, f)
  }
  return [...bySetor.values()]
}
function rank(status: string): number {
  const s = status?.toLowerCase() ?? ''
  if (s.includes('pago')) return 2
  if (s.includes('contrat') || s.includes('fech')) return 1
  return 0
}
