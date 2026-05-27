import type { ConvitesStats } from '../../../lib/convidados/calcStatsConvites'

interface Props { stats: ConvitesStats }

export function StatsStrip({ stats }: Props) {
  return (
    <div className="inline-flex items-baseline gap-5 text-xs">
      <Stat label="Convites" value={stats.totalConvites} />
      <Stat label="Convidados" value={stats.totalPessoas} accent />
      <Stat label="Adultos" value={stats.adultos} />
      <Stat label="Crianças" value={stats.criancas} />
      <Stat label="Idosos" value={stats.idosos} />
      <Stat label="Bebês" value={stats.bebes} />
      {stats.semTelefone > 0 && <Stat label="Sem telefone" value={stats.semTelefone} warn />}
    </div>
  )
}

function Stat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className="inline-flex flex-col items-end gap-0 leading-none">
      <strong className={`tabular-nums font-semibold ${warn ? 'text-red-600 text-lg' : accent ? 'text-ww-gold-ink text-xl' : 'text-ww-n700 text-base'}`}>{value}</strong>
      <span className="text-[10px] uppercase tracking-wider text-ww-n500 mt-0.5">{label}</span>
    </div>
  )
}
