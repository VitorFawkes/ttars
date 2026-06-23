import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  Globe,
  ExternalLink,
  Loader2,
  Heart,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import './champagne.css'
import { formatDataLonga, daysUntil, addDaysIso } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { EtapaPanel } from '../../components/planejamento/EtapaPanel'
import { RelatorioCasamento } from '../../components/planejamento/RelatorioCasamento'
import { CasalSection } from '../../components/planejamento/CasalSection'
import { WeddingEquipeSection } from '../../components/planejamento/WeddingEquipeSection'
import { LocalHospedagemSection } from '../../components/planejamento/LocalHospedagemSection'
import { CronogramaSpine } from '../../components/planejamento/CronogramaSpine'
import {
  AcaoPromoSection,
  ConvidadosResumoSection,
  NotasSection,
} from '../../components/planejamento/PlanejamentoSections'
import {
  PLANEJAMENTO_LABEL,
  PLANEJAMENTO_ORDER,
  PLANEJ_FIELD,
  BLOCO,
} from '../../hooks/planejamento/types'

// Tema champanhe (design do Vitor no Claude Design) — paleta em champagne.css
const CHAMP_PAGE = "planej-champ min-h-screen bg-[#EAE2D5] px-6 py-5"

function pdStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : String(v)
}
function pdNum(pd: Record<string, unknown> | null, key: string): number | null {
  const s = pdStr(pd, key)
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}
const brlK = (v: number) => v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`

export default function PlanejamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data, isLoading, isError } = usePlanejamentoWeddings()
  const wedding = data.find(w => w.id === cardId) ?? null
  const checklist = useWeddingChecklist(cardId)

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

  const dateLong = formatDataLonga(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)
  const pd = wedding.produto_data
  const tipoLabel = pdStr(pd, 'ww_tipo_casamento') || 'Destination Wedding'
  const gate = wedding.gate
  const gatePct = gate.total > 0 ? Math.round((gate.met / gate.total) * 100) : 0
  const etapaIdx = PLANEJAMENTO_ORDER.indexOf(wedding.planejamentoEtapa) + 1

  // 4 números de convidados (blueprint): contrato · lista · bloqueio · confirmados
  const contrato = pdNum(pd, PLANEJ_FIELD.convidadosContrato)
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado
  const bloqueio = wedding.hotelQuartos

  // Tarefas (medição do planejamento) + prazo dos 45 dias.
  // O início do prazo vem da data da tarefa "Primeira Reunião" (marco
  // onboarding:reuniao1); se ainda não tem data, cai pro sinal.
  const { feitos, atrasados, pendentes } = wedding.checklist
  const primeiraReuniao = checklist.items.find((t) => t.marco === 'onboarding:reuniao1')
  const planStart = (primeiraReuniao?.prazo ?? '') || pdStr(pd, PLANEJ_FIELD.sinalPagoEm)
  const planDeadline = planStart ? addDaysIso(planStart, 45) : null
  const planDias = daysUntil(planDeadline)
  const slaText =
    planDeadline == null ? 'defina a 1ª reunião'
    : planDias == null ? '—'
    : planDias > 0 ? `faltam ${planDias}d dos 45`
    : planDias === 0 ? 'prazo é hoje'
    : `${Math.abs(planDias)}d atrasado`

  // Financeiro por setor
  const valorTotal = pdNum(pd, PLANEJ_FIELD.valorTotal)
  const pacoteValor = pdNum(pd, PLANEJ_FIELD.pacoteValor)
  const evento = valorTotal ?? pacoteValor
  const hosp = wedding.hotelTarifa != null && wedding.hotelQuartos != null ? wedding.hotelTarifa * wedding.hotelQuartos : null
  const sinal = pdNum(pd, PLANEJ_FIELD.sinalValor)

  return (
    <div className={cn(CHAMP_PAGE, 'px-6 py-4 flex flex-col gap-4')}>
      {/* Summary band (visual champanhe — design do Vitor) */}
      <div className="rounded-2xl border border-[#E6DBC9] bg-white overflow-hidden shadow-[0_10px_30px_rgba(78,24,32,0.06)]">
        <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-5 bg-gradient-to-b from-[#FBF3E4] to-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#A88C57]">
              <button onClick={() => navigate('/planejamento')} className="inline-flex items-center gap-1 hover:text-[#BD965C]">
                <ArrowLeft className="w-3.5 h-3.5" /> Planejamento
              </button>
              <span className="text-[#D9CFC2]">/</span>
              <span className="truncate">{tipoLabel}{wedding.local ? ` · ${wedding.local}` : ''}</span>
            </div>
            <h1 className="mt-2 text-[30px] leading-none font-light text-[#211F1D] break-words">{wedding.titulo}</h1>
            {wedding.site_url && (
              <a href={wedding.site_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#a37f47] hover:underline mt-2 [font-family:'Roboto']">
                <Globe className="w-3.5 h-3.5" /> Site do casamento <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {days !== null && (
              <div className="flex items-center gap-3 rounded-xl border border-[#ECD9B5] bg-white px-4 py-2.5">
                <Calendar className="w-5 h-5 text-[#BD965C]" />
                <div>
                  <div className="flex items-baseline gap-1.5"><span className="text-[22px] font-extrabold text-[#8A6A33] leading-none">{Math.abs(days)}</span><span className="text-[13px] font-semibold text-[#A88C57]">{days < 0 ? 'dias atrás' : 'dias p/ o casamento'}</span></div>
                  <div className="text-[12px] text-[#9A9082] mt-0.5 [font-family:'Roboto']">{dateLong ?? '—'}</div>
                </div>
              </div>
            )}
            <button
              onClick={() => navigate(`/convidados/casamento/${wedding.id}`)}
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg border border-[#E0D6C8] bg-white text-[#5C5751] text-[13px] font-semibold hover:bg-[#FCFAF6]"
            >
              <Heart className="w-4 h-4 text-rose-400" /> Convidados
            </button>
            <a
              href={`/cards/${wedding.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg border border-[#BD965C] bg-[#BD965C] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(140,100,40,0.25)]"
            >
              Acessar card <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* stat row — foto rápida alinhada ao blueprint */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 px-6 pb-5 items-stretch">
          {/* Etapa + marcos */}
          <HeaderCard tone="gold">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A88C57]">Etapa · {etapaIdx} de 6</span>
              <span className="text-[11px] font-bold text-[#8A6A33]">{gate.met}/{gate.total} marcos</span>
            </div>
            <div className="text-[14px] font-semibold text-[#211F1D] mt-1.5 leading-tight flex-1">{PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}</div>
            <div className="h-1.5 rounded-full bg-[#EFE3CC] overflow-hidden mt-2.5"><div className="h-full bg-[#BD965C] rounded-full" style={{ width: `${gatePct}%` }} /></div>
          </HeaderCard>

          {/* 4 números de convidados */}
          <HeaderCard>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">Convidados</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 flex-1">
              <MiniNum label="Contrato" value={contrato != null ? String(contrato) : '—'} />
              <MiniNum label="Lista" value={String(listaTotal)} />
              <MiniNum label="Bloqueio" value={bloqueio != null ? String(bloqueio) : '—'} />
              <MiniNum label="Confirmados" value={String(confirmados)} />
            </div>
          </HeaderCard>

          {/* Tarefas (meta 45 dias) */}
          <HeaderCard>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">Tarefas · meta 45 dias</span>
            <div className="grid grid-cols-3 gap-2 mt-2 flex-1">
              <MiniNum label="Feitas" value={String(feitos)} />
              <MiniNum label="Atrasadas" value={String(atrasados)} tone={atrasados > 0 ? 'rose' : undefined} />
              <MiniNum label="Pendentes" value={String(pendentes)} />
            </div>
            <div className="text-[11px] text-[#9A9082] mt-2 [font-family:'Roboto']">{slaText}</div>
          </HeaderCard>

          {/* Financeiro por setor */}
          <HeaderCard>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">Financeiro</span>
            <div className="text-[19px] font-bold text-[#211F1D] mt-1.5 [font-family:'Roboto'] tabular-nums flex-1">{evento != null ? brlK(evento) : '—'}<span className="text-[11px] font-medium text-[#B5ABA0] ml-1">casamento</span></div>
            <div className="text-[11px] text-[#9A9082] mt-1 [font-family:'Roboto'] leading-relaxed">
              Hospedagem {hosp != null ? `~${brlK(hosp)}/noite` : '—'}<br />
              Sinal {sinal != null ? brlK(sinal) : '—'}
            </div>
          </HeaderCard>
        </div>
      </div>

      {/* Marcos da etapa — atalhos pros blocos + concluir na mão */}
      <EtapaPanel wedding={wedding} />

      {/* Casal (clientes) + Equipe do casamento (interno) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div id={BLOCO.casal} className="scroll-mt-6"><CasalSection cardId={wedding.id} /></div>
        <div id={BLOCO.equipe} className="scroll-mt-6"><WeddingEquipeSection cardId={wedding.id} /></div>
      </div>

      {/* Local & Hospedagem (venue + reserva/contrato + hotel — fonte única) */}
      <div id={BLOCO.local} className="scroll-mt-6"><LocalHospedagemSection wedding={wedding} /></div>

      {/* Ação promocional (definição) + Convidados (lista & estimativa) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div id={BLOCO.promo} className="scroll-mt-6"><AcaoPromoSection wedding={wedding} /></div>
        <div id={BLOCO.convidados} className="scroll-mt-6"><ConvidadosResumoSection wedding={wedding} /></div>
      </div>

      {/* Cronograma & Tarefas — a espinha (Etapa → Marco → Tarefa) */}
      <div id={BLOCO.spine} className="scroll-mt-6">
        <CronogramaSpine checklist={checklist} currentEtapa={wedding.planejamentoEtapa} />
      </div>

      {/* Notas da planejadora (texto livre) */}
      <NotasSection wedding={wedding} />

      {/* Relatório do casamento — saúde, financeiro, convidados, prazos */}
      <RelatorioCasamento wedding={wedding} />
    </div>
  )
}

function HeaderCard({ children, tone }: { children: ReactNode; tone?: 'gold' }) {
  return (
    <div className={cn(
      'rounded-xl border p-3.5 flex flex-col',
      tone === 'gold' ? 'border-[#ECDCBE] bg-[#FCF7EE]' : 'border-[#EAE1D3] bg-[#FBF8F3]',
    )}>
      {children}
    </div>
  )
}

function MiniNum({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[18px] font-bold [font-family:\'Roboto\'] tabular-nums leading-none', tone === 'rose' ? 'text-rose-600' : 'text-[#211F1D]')}>{value}</div>
      <div className="text-[10px] text-[#B5ABA0] mt-0.5 uppercase tracking-[0.05em] truncate">{label}</div>
    </div>
  )
}

