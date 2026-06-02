import { useMemo, useState } from 'react'
import { Megaphone, Plus, Pause, Play, Ban, FileText, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWhatsAppLinhas } from '../../hooks/useWhatsAppLinhas'
import { useDisparoCampanhas } from '../../hooks/disparo/useDisparos'
import { useDisparoActions } from '../../hooks/disparo/useDisparoActions'
import type { DisparoCampanha, DisparoStatus } from '../../hooks/disparo/types'
import { ComporDisparoModal } from './ComporDisparoModal'
import { DisparoRelatorioModal } from './DisparoRelatorioModal'

const STATUS_META: Record<DisparoStatus, { label: string; cls: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  agendado:   { label: 'Agendado',   cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  disparando: { label: 'Enviando',   cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  pausado:    { label: 'Pausado',    cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  concluido:  { label: 'Concluído',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  cancelado:  { label: 'Cancelado',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export function DisparosBoard() {
  const { data: campanhas = [], isLoading } = useDisparoCampanhas()
  const { data: linhas = [] } = useWhatsAppLinhas('WEDDING')
  const [comporOpen, setComporOpen] = useState(false)
  const [relatorio, setRelatorio] = useState<{ id: string; titulo: string } | null>(null)

  const linhaLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of linhas) if (l.phone_number_id) m.set(l.phone_number_id, l.phone_number_label)
    return m
  }, [linhas])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-indigo-600" /> Disparos
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Mensagem livre para uma lista, enviada com segurança ao longo do tempo.</p>
        </div>
        <button
          type="button"
          onClick={() => setComporOpen(true)}
          className="inline-flex items-center gap-1.5 h-10 px-4 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo disparo
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Carregando…</div>
      ) : campanhas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-700 font-medium">Nenhum disparo ainda</p>
          <p className="text-xs text-slate-500 mt-1">Clique em "Novo disparo" para começar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {campanhas.map((c) => (
            <CampanhaRow
              key={c.id}
              campanha={c}
              linhaLabel={linhaLabel.get(c.phone_number_id) ?? 'Linha removida'}
              onRelatorio={() => setRelatorio({ id: c.id, titulo: c.titulo })}
            />
          ))}
        </div>
      )}

      <ComporDisparoModal open={comporOpen} onClose={() => setComporOpen(false)} />
      {relatorio && (
        <DisparoRelatorioModal
          open={!!relatorio}
          campaignId={relatorio.id}
          titulo={relatorio.titulo}
          onClose={() => setRelatorio(null)}
        />
      )}
    </div>
  )
}

function CampanhaRow({ campanha, linhaLabel, onRelatorio }: { campanha: DisparoCampanha; linhaLabel: string; onRelatorio: () => void }) {
  const { pausar, retomar, cancelar } = useDisparoActions()
  const [busy, setBusy] = useState(false)
  const meta = STATUS_META[campanha.status]
  const processados = campanha.enviados + campanha.falhados + campanha.opt_outs
  const pct = campanha.total > 0 ? Math.round((processados / campanha.total) * 100) : 0
  const ativo = campanha.status === 'disparando' || campanha.status === 'agendado'

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', meta.cls)}>
          {campanha.status === 'disparando' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {campanha.status === 'concluido' && <CheckCircle2 className="w-3 h-3 mr-1" />}
          {meta.label}
        </span>
        <div className="font-semibold text-slate-900 truncate flex-1 min-w-[120px]">{campanha.titulo}</div>

        <div className="flex items-center gap-3 text-sm shrink-0">
          <span className="text-emerald-600 font-semibold tabular-nums">{campanha.enviados}</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600 tabular-nums">{campanha.total}</span>
          {campanha.falhados > 0 && <span className="text-rose-600 tabular-nums">· {campanha.falhados} falhas</span>}
          {campanha.opt_outs > 0 && <span className="text-slate-500 tabular-nums">· {campanha.opt_outs} saíram</span>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(campanha.status === 'agendado' || campanha.status === 'disparando') && (
            <IconBtn title="Pausar" onClick={() => run(() => pausar(campanha.id))} busy={busy}><Pause className="w-4 h-4" /></IconBtn>
          )}
          {campanha.status === 'pausado' && (
            <IconBtn title="Retomar" onClick={() => run(() => retomar(campanha.id))} busy={busy}><Play className="w-4 h-4" /></IconBtn>
          )}
          {campanha.status !== 'concluido' && campanha.status !== 'cancelado' && (
            <IconBtn title="Cancelar" onClick={() => run(() => cancelar(campanha.id))} busy={busy} danger><Ban className="w-4 h-4" /></IconBtn>
          )}
          <button
            type="button" onClick={onRelatorio}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          ><FileText className="w-3.5 h-3.5" /> Relatório</button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', campanha.status === 'pausado' ? 'bg-amber-400' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3" /> {linhaLabel}
          {ativo && campanha.estimado_dias ? ` · ~${campanha.estimado_dias}d` : ''}
        </div>
      </div>
    </div>
  )
}

function IconBtn({ title, onClick, busy, danger, children }: { title: string; onClick: () => void; busy?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={busy}
      className={cn('inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors disabled:opacity-50',
        danger ? 'border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50'
               : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
    >{children}</button>
  )
}
