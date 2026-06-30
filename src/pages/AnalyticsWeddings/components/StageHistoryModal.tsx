import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWwCardStageHistory, type WwStageHistEtapa } from '@/hooks/analyticsWeddings/useWw2'

const fmtDias = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}d`
function fmtData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Modal com a linha do tempo do card: quanto tempo ficou em cada etapa. */
export function StageHistoryModal({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useWwCardStageHistory(cardId)
  const etapas = data?.etapas ?? []
  const maxDias = Math.max(1, ...etapas.map((e) => e.dias))

  return (
    <Dialog open={!!cardId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 max-h-[85vh] flex flex-col border-ww-sand shadow-ww-modal">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-ww-sand">
          <DialogTitle className="font-ww-serif text-lg font-semibold text-ww-n700 tracking-tight pr-6 truncate">
            {data?.titulo ?? 'Histórico do card'}
          </DialogTitle>
          <p className="text-xs text-ww-n500 mt-0.5">
            Tempo em cada etapa
            {data && data.total_dias != null && <> · {fmtDias(data.total_dias)} no total</>}
            {data?.etapa_atual && <> · agora em <span className="text-ww-n700 font-medium">{data.etapa_atual}</span></>}
          </p>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 bg-ww-cream/70 rounded animate-pulse" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-rose-600">Não foi possível carregar o histórico.</p>
          ) : data?.error || etapas.length === 0 ? (
            <p className="text-sm text-ww-n400 py-6 text-center">Sem histórico de etapas registrado para este card.</p>
          ) : (
            <ol className="space-y-1">
              {etapas.map((e, i) => <EtapaRow key={i} e={e} maxDias={maxDias} />)}
            </ol>
          )}
        </div>

        <div className="px-5 py-3 border-t border-ww-sand flex items-center justify-between gap-3">
          <span className="text-[10px] text-ww-n400 leading-snug">
            Tempo a partir do registro automático de mudanças de etapa — etapas anteriores a isso podem não constar.
          </span>
          {cardId && (
            <Link to={`/cards/${cardId}`} className="shrink-0 text-xs font-medium text-indigo-700 hover:underline">
              Abrir card →
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EtapaRow({ e, maxDias }: { e: WwStageHistEtapa; maxDias: number }) {
  const w = Math.max(2, Math.round((e.dias / maxDias) * 100))
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="w-40 shrink-0 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.atual ? 'bg-ww-gold' : 'bg-ww-sand-dk'}`} />
          <span className={`text-sm truncate ${e.atual ? 'text-ww-n700 font-semibold' : 'text-ww-n600'}`} title={e.etapa ?? ''}>
            {e.etapa ?? '—'}
          </span>
        </div>
        <div className="text-[10px] text-ww-n400 ml-3">
          {fmtData(e.entrou_em)}{e.atual ? ' · agora' : ` → ${fmtData(e.saiu_em)}`}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-ww-cream rounded">
          <div className={`h-full rounded ${e.atual ? 'bg-ww-gold' : 'bg-ww-rosewood/70'}`} style={{ width: `${w}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-ww-n700 w-12 text-right">{fmtDias(e.dias)}</span>
      </div>
    </li>
  )
}
