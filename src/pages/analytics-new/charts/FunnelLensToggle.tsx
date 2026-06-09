import { cn } from '@/lib/utils'
import type { FunnelLens } from '@/hooks/analytics/useFunnelStagesLens'

const OPTIONS: { value: FunnelLens; label: string; hint: string }[] = [
  {
    value: 'now',
    label: 'Agora',
    hint: 'Foto do momento: quantos cards estão em cada etapa neste instante (não depende do período).',
  },
  {
    value: 'created',
    label: 'Por safra',
    hint: 'A turma de leads que ENTROU no período (data de criação) e até onde ela chegou no funil.',
  },
  {
    value: 'stage',
    label: 'Por atividade',
    hint: 'O que ACONTECEU no período: cards que entraram em cada etapa dentro da janela, mesmo de leads antigos.',
  },
]

interface Props {
  value: FunnelLens
  onChange: (v: FunnelLens) => void
}

/**
 * Toggle 3-vias do funil (SDR/Planner) — Leva D. 'Agora' é o padrão (foto do momento);
 * 'Por safra'/'Por atividade' recortam por período usando o motor de cohort do Funil principal.
 */
export default function FunnelLensToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 w-fit">
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Funil</span>
      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.hint}
            className={cn(
              'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              value === opt.value
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
