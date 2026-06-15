import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Users,
  Loader2,
  Store,
  BedDouble,
  ListChecks,
  Plus,
  Heart,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { parseLocalDate } from '../../lib/localDate'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJAMENTO_LABEL, type EtapaPlanejamento } from '../../hooks/planejamento/types'

const MONTH_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = parseLocalDate(iso)
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = parseLocalDate(iso)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const ETAPA_CHIP: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-sky-50 text-sky-700 border-sky-200',
  propostas: 'bg-violet-50 text-violet-700 border-violet-200',
  definicao: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  passagem: 'bg-amber-50 text-amber-700 border-amber-200',
  aditivo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

// Categorias de fornecedores — esqueleto (WIP). Ainda sem modelo de dados;
// quando existir tabela de fornecedores por casamento, trocar pelos dados reais.
// `icon` é um PNG em /public/icons (servido em /icons/...). Categorias sem
// ícone ainda usam um placeholder neutro até receberem o seu.
const FORNECEDOR_CATEGORIAS: { label: string; icon?: string }[] = [
  { label: 'Buffet & Gastronomia', icon: '/icons/food-delivery.png' },
  { label: 'Decoração & Flores', icon: '/icons/bouquet.png' },
  { label: 'Música / DJ / Banda', icon: '/icons/dj.png' },
  { label: 'Fotografia & Vídeo', icon: '/icons/foto.svg' },
  { label: 'Celebrante', icon: '/icons/celebrante.svg' },
  { label: 'Beleza (cabelo & maquiagem)', icon: '/icons/beleza.svg' },
  { label: 'Convites & Papelaria', icon: '/icons/convites.svg' },
  { label: 'Transporte & Logística', icon: '/icons/transporte.svg' },
]

function WipBadge() {
  return (
    <span className="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200">
      WIP
    </span>
  )
}

export default function PlanejamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data, isLoading, isError } = usePlanejamentoWeddings()
  const wedding = data.find(w => w.id === cardId) ?? null

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando casamento…
      </div>
    )
  }

  if (isError || !wedding) {
    return (
      <div className="px-6 py-8">
        <button onClick={() => navigate('/planejamento')} className="text-sm text-indigo-600 hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento no planejamento.
        </div>
      </div>
    )
  }

  const dateLong = longDate(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)
  const { confirmado, total } = wedding.counts

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/planejamento')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-6 h-6 text-indigo-500 shrink-0" />
              <h1 className="text-2xl font-bold text-slate-900 break-words">{wedding.titulo}</h1>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border uppercase tracking-wide',
                  ETAPA_CHIP[wedding.planejamentoEtapa],
                )}
                title={`Etapa de planejamento: ${PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}`}
              >
                {PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-slate-600">
              {dateLong && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {dateLong}
                </span>
              )}
              {wedding.local && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {wedding.local}
                </span>
              )}
              {days !== null && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    days < 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200',
                  )}
                >
                  {days < 0 ? 'Passado' : days === 0 ? 'Hoje' : `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}`}
                </span>
              )}
            </div>
            {wedding.site_url && (
              <a
                href={wedding.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mt-1"
              >
                <Globe className="w-3.5 h-3.5" /> Site do Casamento
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/convidados/casamento/${wedding.id}`)}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
            title="Ver convidados deste casamento"
          >
            <Heart className="w-4 h-4 text-rose-400" /> Convidados
          </button>
          <a
            href={`/cards/${wedding.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir card em nova aba"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Acessar card
          </a>
        </div>
      </div>

      {/* Informações do casamento — o que já existe (vem do funil / AC) */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Informações do casamento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Data" value={dateLong ?? '—'} icon={<Calendar className="w-3.5 h-3.5" />} />
          <InfoItem label="Local / Destino" value={wedding.local ?? '—'} icon={<MapPin className="w-3.5 h-3.5" />} />
          <InfoItem
            label="Convidados"
            value={total > 0 ? `${confirmado} confirmados / ${total}` : '—'}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <InfoItem
            label="Etapa de planejamento"
            value={PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
            icon={<ClipboardList className="w-3.5 h-3.5" />}
          />
        </div>
      </section>

      {/* Fornecedores — esqueleto (WIP) */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Fornecedores</h2>
            <WipBadge />
          </div>
          <button
            type="button"
            disabled
            title="Em construção"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-slate-400 border border-slate-200 rounded-md cursor-not-allowed bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar fornecedor
          </button>
        </header>
        <p className="text-xs text-slate-500 mb-3">
          Em breve dá pra cadastrar e acompanhar cada fornecedor do casamento aqui. Por enquanto são as categorias previstas.
        </p>
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {FORNECEDOR_CATEGORIAS.map((cat) => (
            <li key={cat.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2.5 text-slate-700">
                {cat.icon ? (
                  <img src={cat.icon} alt="" aria-hidden className="w-6 h-6 object-contain shrink-0" />
                ) : (
                  <span className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 inline-flex items-center justify-center shrink-0">
                    <Store className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                )}
                {cat.label}
              </span>
              <span className="text-[11px] text-slate-400 italic">a definir</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Demais blocos de planejamento — esqueleto (WIP) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WipSection icon={<BedDouble className="w-5 h-5 text-slate-500" />} title="Hospedagem">
          Bloqueio de quartos, check-in/check-out e ocupação dos convidados — em construção.
        </WipSection>
        <WipSection icon={<ListChecks className="w-5 h-5 text-slate-500" />} title="Cronograma & Checklist">
          Marcos do planejamento e pendências do casal — em construção.
        </WipSection>
      </div>
    </div>
  )
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="font-medium text-slate-900 mt-0.5 break-words">{value}</p>
    </div>
  )
}

function WipSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <header className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <WipBadge />
      </header>
      <p className="text-sm text-slate-500">{children}</p>
    </section>
  )
}
