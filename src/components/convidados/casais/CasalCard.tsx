import { useState } from 'react'
import { Phone, Link2, ExternalLink, Copy, Send, Pencil, Trash2, CheckCircle2, AlertCircle, Calendar, Unlink, History, Bell } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { buildLinkCasal, buildWhatsappLink } from '../../../lib/convidados/buildLink'
import { HistoricoEnviosModal } from './HistoricoEnviosModal'
import type { CasalAdminRow } from '../../../lib/convidados/types'

interface Props {
  casal: CasalAdminRow
  onEditar: (casal: CasalAdminRow) => void
  onVincularCard: (casal: CasalAdminRow) => void
  onDesvincular: (casal: CasalAdminRow) => void
  onExcluir: (casal: CasalAdminRow) => void
}

export function CasalCard({ casal, onEditar, onVincularCard, onDesvincular, onExcluir }: Props) {
  const [copied, setCopied] = useState(false)
  const [showHistorico, setShowHistorico] = useState(false)
  const link = buildLinkCasal(casal.codigo)
  const wa = buildWhatsappLink(casal.whatsapp_digits, casal.codigo)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const isOrfao = !casal.card_id
  const isEncerrado = !!casal.encerrado_em
  const semTel = casal.pessoas_sem_telefone > 0
  const nuncaEnviou = !casal.enviado_em
  const alteradoDepois = casal.alterado_depois_do_envio

  const status = isEncerrado
    ? { label: 'Encerrado', cls: 'bg-slate-100 text-slate-600 border-slate-200', alert: false }
    : alteradoDepois
      ? { label: 'Atualizou depois', cls: 'bg-amber-100 text-amber-900 border-amber-300', alert: true }
      : nuncaEnviou && casal.total_pessoas === 0
        ? { label: 'Não iniciado', cls: 'bg-slate-50 text-ww-n500 border-ww-sand', alert: false }
        : nuncaEnviou
          ? { label: 'Em preenchimento', cls: 'bg-sky-50 text-sky-700 border-sky-200', alert: false }
          : semTel
            ? { label: `${casal.pessoas_sem_telefone} sem telefone`, cls: 'bg-rose-50 text-rose-700 border-rose-200', alert: false }
            : { label: 'Lista enviada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', alert: false }

  return (
    <article className="group bg-white border border-ww-sand rounded-xl p-5 shadow-sm hover:shadow-ww-lift hover:-translate-y-0.5 transition-all duration-200 ease-ww-soft flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold mb-1">♥ Casal</p>
          <h3 className="font-ww-serif italic text-xl text-ww-n700 leading-tight">{casal.nome_casal}</h3>
          {casal.workspace_name && (
            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-ww-n500 bg-ww-cream px-1.5 py-0.5 rounded">{casal.workspace_name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {casal.total_envios > 0 && (
            <button type="button" onClick={() => setShowHistorico(true)}
              className="p-1.5 rounded hover:bg-ww-cream text-ww-n500 hover:text-ww-gold-ink" aria-label="Histórico" title="Histórico de envios">
              <History className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onEditar(casal)}
            className="p-1.5 rounded hover:bg-ww-cream text-ww-n500 hover:text-ww-n700" aria-label="Editar" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => onExcluir(casal)}
            className="p-1.5 rounded hover:bg-rose-50 text-ww-n400 hover:text-rose-600" aria-label="Excluir" title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {alteradoDepois && (
        <button type="button" onClick={() => setShowHistorico(true)}
          className="-mx-1 -mt-1 px-2.5 py-1.5 bg-amber-100/80 border border-amber-300 rounded-md text-left hover:bg-amber-100 transition-colors flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span className="text-[11px] text-amber-900 font-medium leading-tight">
            O casal editou depois do último envio. Clique para ver o que mudou.
          </span>
        </button>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2">
          <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">Código do casamento</dt>
          <dd>
            <code className="inline-block font-mono text-[12px] bg-ww-gold-soft text-ww-gold-ink px-2 py-0.5 rounded whitespace-nowrap">{casal.codigo}</code>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">WhatsApp do contato</dt>
          <dd className="inline-flex items-center gap-1.5 text-ww-n700">
            <Phone className="w-3 h-3 text-ww-n400" />+55 {formatPhoneBR(casal.whatsapp_digits)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">Casamento vinculado</dt>
          <dd className="text-ww-n700">
            {isOrfao ? (
              <button type="button" onClick={() => onVincularCard(casal)}
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">
                <AlertCircle className="w-3 h-3" /> Sem casamento — vincular
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-ww-n400" />
                <span className="truncate max-w-[200px]">{casal.card_titulo || '—'}</span>
                <button type="button" onClick={() => onDesvincular(casal)}
                  className="text-ww-n400 hover:text-ww-rosewood" title="Desvincular do casamento">
                  <Unlink className="w-3 h-3" />
                </button>
              </div>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2 py-2 border-y border-dashed border-ww-sand text-xs">
        <Stat n={casal.total_convites} label="convites" />
        <Stat n={casal.total_pessoas} label="convidados" accent />
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide', status.cls)}>
          {status.alert && <Bell className="w-2.5 h-2.5" />}{status.label}
        </span>
      </div>

      <div className="bg-ww-paper border border-ww-sand rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-ww-n500 min-w-0">
        <Link2 className="w-3 h-3 shrink-0 text-ww-gold" />
        <code className="font-mono text-[10.5px] truncate flex-1">{link}</code>
      </div>

      <footer className="flex items-center gap-1.5">
        <button type="button" onClick={handleCopy}
          className={cn('flex-1 inline-flex items-center justify-center gap-1.5 px-2 h-8 text-xs font-medium rounded-md border transition-colors',
            copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-ww-sand text-ww-n600 hover:bg-ww-cream')}>
          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-2.5 h-8 text-xs font-medium rounded-md bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors" title="Enviar pelo WhatsApp">
            <Send className="w-3.5 h-3.5" /> Enviar
          </a>
        )}
        <a href={link} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-2.5 h-8 text-xs font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors" title="Abrir lista">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir lista
        </a>
      </footer>

      <HistoricoEnviosModal open={showHistorico} onClose={() => setShowHistorico(false)} casal={casal} />
    </article>
  )
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <strong className={cn('tabular-nums font-semibold', accent ? 'text-ww-gold-ink text-base' : 'text-ww-n700 text-sm')}>{n}</strong>
      <span className="text-ww-n500 text-[11px]">{label}</span>
    </div>
  )
}
