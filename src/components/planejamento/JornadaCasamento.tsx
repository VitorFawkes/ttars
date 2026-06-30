import { Fragment } from 'react'
import { ArrowRight, Lock, PartyPopper, Check, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { useUpdatePlanejamentoEtapa } from '../../hooks/planejamento/useUpdatePlanejamentoEtapa'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJAMENTO_ORDER, PLANEJAMENTO_LABEL, type EtapaPlanejamento, nextEtapa, BLOCO } from '../../hooks/planejamento/types'

// Rótulos curtos pra trilha caber numa linha (o nome completo fica no "você está aqui").
const CURTO: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'Boas-vindas',
  onboarding: '1ª Reunião',
  propostas: 'Definição',
  definicao: 'Reserva',
  passagem: 'Bloqueio',
  aditivo: 'Programação',
}

/**
 * Trilha da jornada — "onde está + por onde passou" num relance. As 6 etapas em
 * sequência: concluídas (✓ verde), a atual ("você está aqui", dourada) e as que
 * faltam (fantasma). No fim, o botão de Avançar (barrado pela trava real). Substitui
 * o cartão "Etapa 5 de 6" + a antiga barra "Marcos/Avançar".
 */
export function JornadaCasamento({ wedding }: { wedding: WeddingPlanejamento }) {
  const update = useUpdatePlanejamentoEtapa()
  const etapa = wedding.planejamentoEtapa
  const curIdx = PLANEJAMENTO_ORDER.indexOf(etapa)
  const next = nextEtapa(etapa)
  const travas = wedding.travaPendentes
  const blocked = travas.length > 0

  const irParaTarefas = () => {
    const el = document.getElementById(BLOCO.spine)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('bloco-flash')
    window.setTimeout(() => el.classList.remove('bloco-flash'), 1400)
  }

  const handleAdvance = () => {
    if (!next) return
    if (blocked) {
      toast.error(`Conclua as tarefas 🔒 desta etapa antes de avançar: ${travas.map(t => t.titulo).join(', ')}`)
      irParaTarefas()
      return
    }
    update.mutate({ cardId: wedding.id, etapa: next })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5">
        {PLANEJAMENTO_ORDER.map((e, i) => {
          const done = i < curIdx
          const atual = i === curIdx
          return (
            <Fragment key={e}>
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#CFC2AE] shrink-0" />}
              {atual ? (
                <span className="inline-flex items-center gap-2 h-9 pl-2 pr-3.5 rounded-full bg-[#BD965C] text-white text-[12.5px] font-bold shadow-[0_1px_2px_rgba(140,100,40,0.25)] shrink-0">
                  <span className="w-5 h-5 rounded-full bg-white/25 grid place-items-center text-[11px] tabular-nums">{i + 1}</span>
                  {PLANEJAMENTO_LABEL[e]}
                  <span className="text-[9.5px] font-semibold text-white/85 uppercase tracking-wide hidden sm:inline">você está aqui</span>
                </span>
              ) : done ? (
                <span className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full bg-[#EFF5EC] text-[#4F7A4A] text-[12px] font-semibold shrink-0">
                  <Check className="w-3.5 h-3.5" /> {CURTO[e]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-[#D9CFC2] text-[#B0A595] text-[12px] font-medium shrink-0">
                  {CURTO[e]}
                </span>
              )}
            </Fragment>
          )
        })}
      </div>

      {next ? (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={update.isPending}
          className={cn(
            'inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-[13px] font-semibold transition-colors shrink-0',
            blocked
              ? 'border border-dashed border-[#D9CFC2] bg-[#F6F0E8] text-[#B0A595] cursor-pointer hover:bg-[#F1E9DD]'
              : 'bg-[#BD965C] text-white hover:bg-[#a37f47] shadow-[0_1px_2px_rgba(140,100,40,0.25)] cursor-pointer',
          )}
          title={blocked ? 'Conclua as tarefas que travam antes de avançar' : `Avançar para ${PLANEJAMENTO_LABEL[next]}`}
        >
          {blocked ? <Lock className="w-[15px] h-[15px]" /> : <ArrowRight className="w-[15px] h-[15px]" />}
          {blocked ? `faltam ${travas.length}` : 'Avançar'}
          <span className="hidden md:inline">{blocked ? '· Avançar' : `para ${CURTO[next]}`}</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-[13px] font-semibold bg-emerald-50 text-emerald-700 shrink-0">
          <PartyPopper className="w-[15px] h-[15px]" /> Pronto para Produção
        </span>
      )}
    </div>
  )
}
