import { Activity, Send, Reply, ShieldCheck, ShieldAlert, Ban } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDisparoSaudeLinhas } from '../../hooks/disparo/useDisparoSaudeLinhas'
import type { DisparoSaudeLinha } from '../../hooks/disparo/types'

const STATUS_META: Record<DisparoSaudeLinha['status'], { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  saudavel:  { label: 'Saudável',             cls: 'bg-ww-success/10 text-ww-success border-ww-success/25', Icon: ShieldCheck },
  risco:     { label: 'Em risco',             cls: 'bg-ww-olive-soft text-ww-olive-ink border-ww-olive/25', Icon: ShieldAlert },
  bloqueada: { label: 'Bloqueada (provável)', cls: 'bg-ww-rosewood-soft text-ww-rosewood border-ww-rosewood/25', Icon: Ban },
}

/** Painel de saúde dos números de WhatsApp usados em disparos.
 *  Some sozinho se não houver linhas (ex.: org sem disparo configurado). */
export function SaudeLinhasPanel() {
  const { data: linhas = [], isLoading } = useDisparoSaudeLinhas()
  if (isLoading || linhas.length === 0) return null

  return (
    <div className="rounded-2xl border border-ww-sand bg-white shadow-ww-lift p-5">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-ww-gold" />
        <h2 className="font-ww-serif text-[17px] text-ww-n700">Saúde dos números</h2>
      </div>
      <p className="mt-1 text-xs text-ww-n400">
        Estimativa pelo volume e respostas de hoje — não é uma confirmação do WhatsApp.
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {linhas.map((l) => <LinhaCard key={l.phone_number_id} linha={l} />)}
      </div>
    </div>
  )
}

function LinhaCard({ linha }: { linha: DisparoSaudeLinha }) {
  const meta = STATUS_META[linha.status]
  const Icon = meta.Icon
  return (
    <div className="rounded-xl border border-ww-sand bg-ww-paper px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ww-n700 truncate">{linha.phone_number_label}</div>
          <div className="text-[11px] text-ww-n400">{linha.is_oficial ? 'Oficial Meta' : 'Não-oficial'}</div>
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0', meta.cls)}>
          <Icon className="w-3 h-3" /> {meta.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-ww-n600">
          <Send className="w-3.5 h-3.5 text-ww-n400" />
          <span className="font-semibold text-ww-n700">{linha.enviados_hoje}</span> hoje
        </span>
        <span className="inline-flex items-center gap-1.5 text-ww-n600">
          <Reply className="w-3.5 h-3.5 text-ww-n400" />
          <span className="font-semibold text-ww-n700">{linha.responderam}</span>
          {linha.destinatarios > 0 ? ` de ${linha.destinatarios} responderam` : ' responderam'}
        </span>
      </div>
    </div>
  )
}
