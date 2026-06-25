// Estilos e helper compartilhados pelos campos inline do Planejamento. Ficam num
// arquivo .ts (sem componentes) pra não quebrar o fast-refresh do fields.tsx.

export const FIELD = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'
export const LBL = 'text-[10.5px] uppercase tracking-[0.08em] text-slate-500 font-bold'
export const SUB = "text-[11px] font-bold uppercase tracking-[0.1em] text-[#A88C57] [font-family:'Nunito',sans-serif]"

export function readStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : '') : String(v)
}
