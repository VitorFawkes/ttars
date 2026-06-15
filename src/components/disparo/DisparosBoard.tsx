import { useMemo, useState } from 'react'
import { Megaphone, Plus, Pause, Play, Ban, FileText, Loader2, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWhatsAppLinhas } from '../../hooks/useWhatsAppLinhas'
import { useDisparoCampanhas } from '../../hooks/disparo/useDisparos'
import { useDisparoActions } from '../../hooks/disparo/useDisparoActions'
import type { DisparoCampanha, DisparoStatus } from '../../hooks/disparo/types'
import { ComporDisparoModal } from './ComporDisparoModal'
import { DisparoRelatorioModal } from './DisparoRelatorioModal'
import { SaudeLinhasPanel } from './SaudeLinhasPanel'

const STATUS_META: Record<DisparoStatus, { label: string; cls: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'bg-ww-cream text-ww-n500 border-ww-sand' },
  agendado:   { label: 'Agendado',   cls: 'bg-ww-gold-soft text-ww-gold-ink border-ww-gold/25' },
  disparando: { label: 'Enviando',   cls: 'bg-ww-gold-soft text-ww-gold-ink border-ww-gold/25' },
  pausado:    { label: 'Pausado',    cls: 'bg-ww-olive-soft text-ww-olive-ink border-ww-olive/25' },
  concluido:  { label: 'Concluído',  cls: 'bg-ww-success/10 text-ww-success border-ww-success/25' },
  cancelado:  { label: 'Cancelado',  cls: 'bg-ww-cream text-ww-n400 border-ww-sand' },
}

export function DisparosBoard() {
  const { data: campanhas = [], isLoading } = useDisparoCampanhas()
  const { data: linhas = [] } = useWhatsAppLinhas('WEDDING')
  const [comporOpen, setComporOpen] = useState(false)
  const [relatorioId, setRelatorioId] = useState<string | null>(null)
  // deriva da lista (fica fresco com o realtime) em vez de guardar uma cópia
  const relatorioCampanha = relatorioId ? campanhas.find((c) => c.id === relatorioId) ?? null : null

  const linhaLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of linhas) if (l.phone_number_id) m.set(l.phone_number_id, l.phone_number_label)
    return m
  }, [linhas])

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ww-gold-soft text-ww-gold">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-ww-serif text-[28px] leading-none text-ww-n700 tracking-tight">Disparos</h1>
            <p className="mt-1.5 text-sm text-ww-n500">Uma mensagem sua para uma lista — enviada com calma e segurança ao longo do tempo.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setComporOpen(true)}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-ww-gold text-white text-sm font-semibold shadow-ww-lift hover:bg-ww-gold-ink active:scale-[0.98] transition-[transform,background-color] duration-150 ease-ww-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ww-paper"
        >
          <Plus className="h-4 w-4" /> Novo disparo
        </button>
      </div>

      <SaudeLinhasPanel />

      {isLoading ? (
        <div className="rounded-2xl border border-ww-sand bg-white shadow-ww-lift p-10 text-center text-sm text-ww-n500">Carregando…</div>
      ) : campanhas.length === 0 ? (
        <EmptyState onNovo={() => setComporOpen(true)} />
      ) : (
        <div className="flex flex-col gap-3">
          {campanhas.map((c) => (
            <CampanhaRow
              key={c.id}
              campanha={c}
              linhaLabel={linhaLabel.get(c.phone_number_id) ?? 'Linha removida'}
              onRelatorio={() => setRelatorioId(c.id)}
            />
          ))}
        </div>
      )}

      <ComporDisparoModal open={comporOpen} onClose={() => setComporOpen(false)} />
      {relatorioCampanha && (
        <DisparoRelatorioModal
          open={!!relatorioCampanha}
          campanha={relatorioCampanha}
          onClose={() => setRelatorioId(null)}
        />
      )}
    </div>
  )
}

function EmptyState({ onNovo }: { onNovo: () => void }) {
  return (
    <div className="rounded-2xl border border-ww-sand bg-gradient-to-b from-white to-ww-cream/40 shadow-ww-lift">
      <div className="flex flex-col items-center text-center px-6 py-20">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ww-gold-soft text-ww-gold">
          <Megaphone className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-ww-serif text-xl text-ww-n700">Nenhum disparo ainda</h2>
        <p className="mt-2 max-w-sm text-sm text-ww-n500 leading-relaxed">
          Escreva uma mensagem, escolha quem recebe e o sistema envia aos poucos, sozinho — sem queimar o número.
        </p>
        <button
          type="button"
          onClick={onNovo}
          className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-ww-gold text-white text-sm font-semibold shadow-ww-lift hover:bg-ww-gold-ink active:scale-[0.98] transition-[transform,background-color] duration-150 ease-ww-soft"
        >
          <Plus className="h-4 w-4" /> Criar meu primeiro disparo
        </button>
      </div>
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
    <div className="rounded-2xl border border-ww-sand bg-white shadow-ww-lift px-5 py-4 transition-[box-shadow] duration-200 ease-ww-soft hover:shadow-ww-modal/30">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', meta.cls)}>
          {campanha.status === 'disparando' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {campanha.status === 'concluido' && <CheckCircle2 className="w-3 h-3 mr-1" />}
          {meta.label}
        </span>
        <div className="font-ww-serif text-[17px] text-ww-n700 truncate flex-1 min-w-[140px]">{campanha.titulo}</div>

        <div className="flex items-center gap-2.5 text-sm shrink-0 tabular-nums">
          <span className="font-semibold text-ww-success">{campanha.enviados}</span>
          <span className="text-ww-n400">de {campanha.total}</span>
          {campanha.total > 0 && campanha.total - processados > 0 && (
            <span className="text-ww-n500">· {campanha.total - processados} faltam</span>
          )}
          {campanha.falhados > 0 && <span className="text-ww-error">· {campanha.falhados} falhas</span>}
          {campanha.opt_outs > 0 && <span className="text-ww-n500">· {campanha.opt_outs} saíram</span>}
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
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-ww-n600 bg-white border border-ww-sand rounded-lg hover:bg-ww-cream active:scale-[0.98] transition-[transform,background-color] duration-150 ease-ww-soft"
          ><FileText className="w-3.5 h-3.5" /> Relatório</button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-ww-sand/60 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-ww-soft', campanha.status === 'pausado' ? 'bg-ww-olive' : 'bg-ww-gold')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[11px] text-ww-n400 flex items-center gap-1 shrink-0 tabular-nums">
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
      className={cn('inline-flex items-center justify-center h-9 w-9 rounded-lg border bg-white transition-[transform,background-color,color] duration-150 ease-ww-soft active:scale-[0.96] disabled:opacity-50',
        danger ? 'border-ww-sand text-ww-n500 hover:text-ww-error hover:border-ww-error/30 hover:bg-ww-error/5'
               : 'border-ww-sand text-ww-n600 hover:bg-ww-cream')}
    >{children}</button>
  )
}
