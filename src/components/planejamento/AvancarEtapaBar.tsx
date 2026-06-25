import { ArrowRight, Lock, PartyPopper, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { useUpdatePlanejamentoEtapa } from '../../hooks/planejamento/useUpdatePlanejamentoEtapa'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJAMENTO_LABEL, PLANEJAMENTO_ORDER, nextEtapa, BLOCO } from '../../hooks/planejamento/types'

/**
 * Barra enxuta de "avançar de etapa" — SUBSTITUI a antiga seção "Marcos para
 * avançar" (grade de tiles), que era uma 3ª cópia das tarefas/campos e cujo placar
 * NÃO batia com o que realmente trava. Aqui a fonte é uma só: as tarefas 🔒 não-
 * feitas (a mesma trava do banco). Uma resposta, num lugar só.
 */
export function AvancarEtapaBar({ wedding }: { wedding: WeddingPlanejamento }) {
  const update = useUpdatePlanejamentoEtapa()
  const etapa = wedding.planejamentoEtapa
  const next = nextEtapa(etapa)
  const idx = PLANEJAMENTO_ORDER.indexOf(etapa) + 1
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
    <section className="rounded-2xl border border-[#E6DBC9] bg-white shadow-[0_1px_2px_rgba(78,24,32,0.04)] px-4 sm:px-5 py-3.5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FBF6EC] ring-1 ring-[#EAD9BE] text-[12px] font-bold text-[#8A6A33] tabular-nums shrink-0">{idx}</span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A88C57]">Etapa {idx} de 6 · você está aqui</div>
            <div className="text-[14.5px] font-bold text-[#211F1D] tracking-tight truncate">{PLANEJAMENTO_LABEL[etapa]}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {blocked ? (
            <button
              type="button"
              onClick={irParaTarefas}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-50 text-amber-700 text-[11.5px] font-semibold hover:bg-amber-100 transition-colors"
            >
              <Lock className="w-3 h-3" /> falta{travas.length === 1 ? '' : 'm'} {travas.length} pra avançar
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-[11.5px] font-semibold">
              <Check className="w-3 h-3" /> pronto pra avançar
            </span>
          )}

          {next ? (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={update.isPending}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-[13px] font-semibold transition-colors',
                blocked
                  ? 'border border-dashed border-[#D9CFC2] bg-[#F6F0E8] text-[#B0A595] cursor-not-allowed'
                  : 'bg-[#BD965C] text-white hover:bg-[#a37f47] shadow-[0_1px_2px_rgba(140,100,40,0.25)] cursor-pointer',
              )}
              title={blocked ? 'Conclua as tarefas que travam antes de avançar' : undefined}
            >
              {blocked ? <Lock className="w-[15px] h-[15px]" /> : <ArrowRight className="w-[15px] h-[15px]" />}
              Avançar para {PLANEJAMENTO_LABEL[next]}
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 h-9 px-4 rounded-[10px] text-[13px] font-semibold bg-emerald-50 text-emerald-700">
              <PartyPopper className="w-[15px] h-[15px]" /> Pronto para Produção
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
