import { memo, useCallback, useState, type CSSProperties, type MouseEvent } from 'react'
import type { WwDiretoriaDeal, WwDiretoriaFase, WwDiretoriaFaseKey } from '@/hooks/analyticsWeddings/useWw2'
import { formatCurrency, formatNumber } from '../lib/format'
import { FASE_UI } from './diretoriaColors'

// Escada: cada barra desce e indenta um pouco à direita (só no desktop).
const OFFSET = ['lg:ml-0', 'lg:ml-12', 'lg:ml-24', 'lg:ml-36'] as const

type HoverState = { deal: WwDiretoriaDeal; fase: WwDiretoriaFaseKey; label: string; x: number; y: number }

export function DiretoriaSnapshot({ fases, onSelectCard }: { fases: WwDiretoriaFase[]; onSelectCard: (cardId: string) => void }) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const onHover = useCallback((deal: WwDiretoriaDeal, fase: WwDiretoriaFaseKey, label: string, e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover({ deal, fase, label, x: r.left + r.width / 2, y: r.top })
  }, [])
  const onLeave = useCallback(() => setHover(null), [])

  return (
    <div className="space-y-3">
      {fases.map((fase, i) => (
        <FaseBarra key={fase.key} fase={fase} className={OFFSET[i]} onHover={onHover} onLeave={onLeave} onSelectCard={onSelectCard} />
      ))}
      {hover && <DealPreview hover={hover} />}
    </div>
  )
}

type FaseBarraProps = {
  fase: WwDiretoriaFase
  className?: string
  onHover: (deal: WwDiretoriaDeal, fase: WwDiretoriaFaseKey, label: string, e: MouseEvent<HTMLElement>) => void
  onLeave: () => void
  onSelectCard: (cardId: string) => void
}

const FaseBarra = memo(function FaseBarra({ fase, className = '', onHover, onLeave, onSelectCard }: FaseBarraProps) {
  const ui = FASE_UI[fase.key]
  const truncados = fase.count - fase.deals.length
  return (
    <div className={`bg-white border border-ww-sand rounded-xl shadow-ww-lift p-4 lg:p-5 lg:max-w-[860px] ${className}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`w-2.5 h-2.5 rounded-full ${ui.dot}`} />
        <span className={`text-base font-semibold tracking-tight ${ui.ink}`}>{fase.label}</span>
        <span className="text-[11px] uppercase tracking-wide text-ww-n400">{fase.sub}</span>
        <span className="flex-1" />
        <span className="text-sm text-ww-n500 tabular-nums">
          <span className="text-xl font-semibold text-ww-n700">{formatNumber(fase.count)}</span> {fase.count === 1 ? 'casal' : 'casais'} agora
        </span>
        {fase.valor_total > 0 && (
          <span className="text-sm text-ww-n500 tabular-nums">· {formatCurrency(fase.valor_total)}</span>
        )}
      </div>

      {fase.count === 0 ? (
        <p className="text-sm text-ww-n400 italic">Nenhum casal nesta fase agora.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-[2px]">
            {fase.deals.map((d) => (
              <button
                key={d.card_id}
                type="button"
                aria-label={`Ver histórico de etapas: ${d.titulo}`}
                onClick={() => onSelectCard(d.card_id)}
                onMouseEnter={(e) => onHover(d, fase.key, fase.label, e)}
                onMouseLeave={onLeave}
                className={`w-[4px] h-7 rounded-[1px] ${ui.bar} opacity-80 origin-bottom hover:opacity-100 hover:scale-y-110 transition-all cursor-pointer`}
              />
            ))}
          </div>
          {truncados > 0 && (
            <p className="text-[11px] text-ww-n400 mt-1.5">+{formatNumber(truncados)} casais não mostrados</p>
          )}
        </>
      )}
    </div>
  )
})

// ── Preview do deal ao passar o mouse (conteúdo muda por fase) ───────────────
function diasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}
function fmtDataCasamento(s: string | null): string | null {
  if (!s) return null
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}
function diasAteCasamento(s: string | null): number | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86_400_000)
}

function previewRows(deal: WwDiretoriaDeal, fase: WwDiretoriaFaseKey): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const add = (label: string, value: string | null | undefined) => { if (value != null && value !== '') rows.push({ label, value }) }
  add('Etapa', deal.stage_name)
  if (fase === 'sdr') {
    add('Orçamento', deal.faixa)
    add('Destino', deal.destino)
    add('Convidados', deal.convidados)
    add('Tipo', deal.tipo)
    if (deal.entrou_at) add('Entrou há', `${diasDesde(deal.entrou_at)} dias`)
  } else if (fase === 'closer') {
    if (deal.valor > 0) add('Valor', formatCurrency(deal.valor))
    add('Orçamento', deal.faixa)
    add('Destino', deal.destino)
    add('Convidados', deal.convidados)
    add('Responsável', deal.responsavel)
  } else if (fase === 'planejamento') {
    if (deal.valor > 0) add('Valor fechado', formatCurrency(deal.valor))
    add('Casamento', fmtDataCasamento(deal.data_casamento))
    add('Destino', deal.destino)
    add('Responsável', deal.responsavel)
  } else {
    const dc = fmtDataCasamento(deal.data_casamento)
    const dias = diasAteCasamento(deal.data_casamento)
    add('Casamento', dc ? (dias != null && dias >= 0 ? `${dc} · faltam ${dias}d` : dc) : null)
    add('Destino', deal.destino)
    if (deal.valor > 0) add('Valor', formatCurrency(deal.valor))
    add('Responsável', deal.responsavel)
  }
  return rows
}

function DealPreview({ hover }: { hover: HoverState }) {
  const { deal, fase, label } = hover
  const ui = FASE_UI[fase]
  const rows = previewRows(deal, fase)
  const W = 252
  const left = Math.max(8, Math.min(hover.x - W / 2, window.innerWidth - W - 8))
  const acima = hover.y > 280
  const style: CSSProperties = acima
    ? { left, bottom: window.innerHeight - hover.y + 10, width: W }
    : { left, top: hover.y + 18, width: W }
  return (
    <div className="fixed z-50 pointer-events-none" style={style}>
      <div className="bg-white border border-ww-sand rounded-xl shadow-ww-modal p-3">
        <div className="flex items-start gap-2 mb-2">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ui.dot}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ww-n700 leading-tight truncate">{deal.titulo}</div>
            <div className={`text-[11px] font-medium ${ui.ink}`}>{label}</div>
          </div>
        </div>
        <dl className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-ww-n400 shrink-0">{r.label}</dt>
              <dd className="text-ww-n700 text-right truncate">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 pt-2 border-t border-ww-sand text-[10px] text-ww-n400">Clique para ver o histórico de etapas</div>
      </div>
    </div>
  )
}
