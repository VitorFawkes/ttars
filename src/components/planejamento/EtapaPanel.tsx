import { Flag, ArrowRight, Check, Lock, PartyPopper, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'
import { useUpdatePlanejamentoEtapa } from '../../hooks/planejamento/useUpdatePlanejamentoEtapa'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import type { GateCriterion } from '../../hooks/planejamento/planejamentoGate'
import {
  PLANEJAMENTO_LABEL,
  PLANEJAMENTO_OBJETIVO,
  PLANEJ_FIELD,
  BLOCO,
  spineMarcoId,
  nextEtapa,
} from '../../hooks/planejamento/types'

const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl shadow-[0_1px_2px_rgba(78,24,32,0.05)]'

/** Rola até um bloco da tela e dá um "flash" pra guiar o olho (atalho do marco). */
function goToBloco(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.add('bloco-flash')
  window.setTimeout(() => el.classList.remove('bloco-flash'), 1400)
}

function readMarcosFeitos(pd: Record<string, unknown> | null): string[] {
  const v = pd?.[PLANEJ_FIELD.marcosFeitos]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ════════════════════════════════════════════════════════════════════════════
// MARCOS — o portão pra avançar. Cada marco é um atalho pro bloco onde se
// resolve + pode ser concluído na mão (Opção B). Nada de campos duplicados aqui.
// ════════════════════════════════════════════════════════════════════════════

export function EtapaPanel({ wedding }: { wedding: WeddingPlanejamento }) {
  const update = useUpdatePlanejamentoEtapa()
  const { save } = usePlanejamentoCampos()
  const etapa = wedding.planejamentoEtapa
  const gate = wedding.gate
  const next = nextEtapa(etapa)
  const pct = gate.total > 0 ? Math.round((gate.met / gate.total) * 100) : 0
  const marcosFeitos = readMarcosFeitos(wedding.produto_data)

  const setManual = (key: string, done: boolean) => {
    const mk = `${etapa}:${key}`
    const next = done
      ? Array.from(new Set([...marcosFeitos, mk]))
      : marcosFeitos.filter((x) => x !== mk)
    save.mutate({ cardId: wedding.id, values: { [PLANEJ_FIELD.marcosFeitos]: next } })
  }

  const handleAdvance = () => {
    if (!next || !gate.allOk) {
      if (!gate.allOk) toast.error('Cumpra os marcos da etapa antes de avançar.')
      return
    }
    update.mutate({ cardId: wedding.id, etapa: next })
  }

  const liberado = gate.allOk && next != null

  return (
    <section className={cn(CARD, 'p-5 sm:p-6')}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2.5 flex-wrap mb-3">
            <Flag className="w-[18px] h-[18px] text-[#BD965C]" />
            <h2 className="font-bold text-[15px] text-[#3A3633]">Marcos para avançar de etapa</h2>
            <span className="px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-[#F4ECDD] border border-[#E6D3B3] text-[#8A6A33]">
              {gate.met} de {gate.total} cumpridos
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[#EFE3CC] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#C9A468] to-[#BD965C]" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[12px] font-bold text-[#8A6A33] tabular-nums">{pct}%</span>
          </div>
        </div>

        {next ? (
          <button
            type="button"
            onClick={handleAdvance}
            disabled={!liberado || update.isPending}
            className={cn(
              'inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold transition-colors shrink-0',
              liberado
                ? 'bg-[#BD965C] text-white hover:bg-[#a37f47] shadow-[0_1px_2px_rgba(140,100,40,0.25)] cursor-pointer'
                : 'border border-dashed border-[#D9CFC2] bg-[#F6F0E8] text-[#B0A595] cursor-not-allowed',
            )}
          >
            {liberado ? <ArrowRight className="w-[15px] h-[15px]" /> : <Lock className="w-[15px] h-[15px]" />}
            Avançar para {PLANEJAMENTO_LABEL[next]}
          </button>
        ) : gate.allOk ? (
          <span className="inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold bg-[#EDF1EA] border border-[#CFE0C8] text-[#3F6238] shrink-0">
            <PartyPopper className="w-[15px] h-[15px]" /> Pronto para Produção
          </span>
        ) : null}
      </div>

      <p className="text-[12.5px] text-[#9A9082] mt-3 [font-family:'Roboto',sans-serif]">{PLANEJAMENTO_OBJETIVO[etapa]}</p>

      {/* Marcos em blocos lado a lado — cada um é um atalho + concluível na mão */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {gate.criteria.map((c) => (
          <MarcoTile
            key={c.key}
            c={c}
            onJump={() => {
              if (c.anchor === BLOCO.spine) {
                const mid = spineMarcoId(`${etapa}:${c.key}`)
                goToBloco(document.getElementById(mid) ? mid : BLOCO.spine)
              } else if (c.anchor) {
                goToBloco(c.anchor)
              }
            }}
            onManual={(done) => setManual(c.key, done)}
          />
        ))}
      </div>

      <p className="text-[11px] text-[#B0A595] mt-3 [font-family:'Roboto',sans-serif]">
        Cada marco leva ao bloco onde é preenchido. Algo já resolvido por fora? Marque “feito” na mão.
      </p>
    </section>
  )
}

function MarcoTile({
  c,
  onJump,
  onManual,
}: {
  c: GateCriterion
  onJump: () => void
  onManual: (done: boolean) => void
}) {
  const manual = c.ok && !c.auto
  return (
    <div className={cn('rounded-xl border p-3.5 flex flex-col', c.ok ? 'border-[#DCE7D6] bg-[#F4F8F1]' : 'border-[#E7D7A0] bg-[#FBF6E8]')}>
      <div className="flex items-start gap-2.5">
        {c.ok ? (
          <span className="w-[22px] h-[22px] rounded-full bg-[#4F7A4A] text-white grid place-items-center shrink-0">
            <Check className="w-[13px] h-[13px]" />
          </span>
        ) : (
          <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-[#D6BE83] bg-white shrink-0" />
        )}
        <span className={cn("text-[13.5px] font-semibold leading-snug [font-family:'Roboto',sans-serif]", c.ok ? 'text-[#3F6238]' : 'text-[#8A6D1A]')}>
          {c.label}
        </span>
      </div>

      <div className={cn('mt-3 pt-2.5 border-t flex items-center justify-between gap-2', c.ok ? 'border-[#E0EAD9]' : 'border-[#EFE0B3]')}>
        <span className={cn('text-[10.5px] font-bold uppercase tracking-[0.06em]', c.ok ? 'text-[#6F8568]' : 'text-[#A88C57]')}>
          {c.auto ? 'Cumprido' : manual ? 'Feito na mão' : 'Pendente'}
          {c.taskCount > 0 && <span className="font-medium normal-case"> · {c.tasksDone}/{c.taskCount} tarefas</span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {!c.ok && c.anchor && (
            <button
              type="button"
              onClick={onJump}
              className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#8A6A33] hover:text-[#6f531f]"
            >
              Preencher <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {!c.auto &&
            (manual ? (
              <button type="button" onClick={() => onManual(false)} className="text-[11px] font-medium text-[#9A9082] hover:text-[#6F675E]">
                Desfazer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onManual(true)}
                className="text-[11px] font-semibold text-[#4F7A4A] hover:text-[#3F6238] border border-[#CFE0C8] rounded-md px-1.5 py-0.5"
              >
                Marcar feito
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
