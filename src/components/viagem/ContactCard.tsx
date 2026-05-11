import type { ViagemOwner } from '@/types/viagem'
import { MessageCircle, Mail, User } from 'lucide-react'

interface ContactCardProps {
  owner: ViagemOwner
  role: 'tp' | 'pv'
  variant?: 'primary' | 'secondary'
  viagemTitulo?: string | null
  className?: string
}

const ROLE_LABELS = {
  tp: 'sua Travel Planner',
  pv: 'seu consultor Pós-Venda',
} as const

const ROLE_LABELS_SECONDARY = {
  tp: 'desenhou sua viagem',
  pv: 'cuida dos detalhes',
} as const

function normalizePhone(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  const digits = telefone.replace(/[^0-9+]/g, '')
  if (!digits) return null
  // se começar com +, mantém; senão assume BR (55 DDD)
  if (digits.startsWith('+')) return digits.slice(1)
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

function whatsappLink(telefone: string | null | undefined, viagemTitulo: string | null | undefined): string | null {
  const normalized = normalizePhone(telefone)
  if (!normalized) return null
  const text = viagemTitulo
    ? encodeURIComponent(`Oi! Te chamo sobre a viagem "${viagemTitulo}"`)
    : encodeURIComponent('Oi! Te chamo sobre a viagem')
  return `https://wa.me/${normalized}?text=${text}`
}

export function ContactCard({ owner, role, variant = 'primary', viagemTitulo, className }: ContactCardProps) {
  const waLink = whatsappLink(owner.telefone, viagemTitulo)
  const mailLink = owner.email ? `mailto:${owner.email}` : null
  const subtitle = variant === 'secondary'
    ? `${owner.nome.split(' ')[0]} ${ROLE_LABELS_SECONDARY[role]}`
    : ROLE_LABELS[role]

  return (
    <div className={`flex items-center gap-3 rounded-xl bg-white border border-slate-200 shadow-sm p-3 ${className ?? ''}`}>
      {owner.avatar_url ? (
        <img
          src={owner.avatar_url}
          alt={owner.nome}
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <User className="h-5 w-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{owner.nome}</p>
        <p className="text-xs text-slate-500 truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {mailLink && (
          <a
            href={mailLink}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={`Enviar email para ${owner.nome}`}
            title={owner.email ?? ''}
          >
            <Mail className="h-4 w-4" />
          </a>
        )}
        <a
          href={waLink ?? undefined}
          target={waLink ? '_blank' : undefined}
          rel={waLink ? 'noopener noreferrer' : undefined}
          aria-disabled={!waLink}
          onClick={(e) => {
            if (!waLink) e.preventDefault()
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            waLink
              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
              : 'bg-slate-50 text-slate-300 cursor-not-allowed'
          }`}
          aria-label={`Falar com ${owner.nome} no WhatsApp`}
          title={waLink ? 'WhatsApp' : 'Sem telefone cadastrado'}
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
