import { Check, Send } from 'lucide-react'
import type { ProposalRecipient } from '@/hooks/useProposalRecipients'

interface RecipientsBadgeProps {
  recipients: ProposalRecipient[] | undefined
}

function formatRelative(dateIso: string | null): string {
  if (!dateIso) return ''
  const ms = Date.now() - new Date(dateIso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const d = Math.floor(hr / 24)
  return `há ${d}d`
}

export function RecipientsBadge({ recipients }: RecipientsBadgeProps) {
  if (!recipients || recipients.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <Send className="h-3 w-3 text-slate-400" />
      {recipients.map((r) => {
        const nome = r.contato.nome
        const opened = !!r.first_opened_at
        return (
          <span
            key={r.id}
            className={
              opened
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium'
                : r.sent_at
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px]'
            }
            title={
              opened
                ? `Aberto ${formatRelative(r.last_opened_at)}${
                    r.open_count > 1 ? ` (${r.open_count}x)` : ''
                  }`
                : r.sent_at
                ? `Enviado ${formatRelative(r.sent_at)} — ainda não abriu`
                : 'Não enviado ainda'
            }
          >
            {opened && <Check className="h-2.5 w-2.5" />}
            {nome}
            {opened && (
              <span className="text-emerald-600/70">
                · {formatRelative(r.last_opened_at)}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
