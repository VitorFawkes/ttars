import { Phone, MessageCircle, Mail } from 'lucide-react'
import type { ViagemOwner } from '@/types/viagem'

interface EmergencyContactsProps {
  tp: ViagemOwner | null
  pv: ViagemOwner | null
  viagemTitulo?: string | null
}

function normalizePhone(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  const digits = telefone.replace(/[^0-9+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return digits.slice(1)
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

function whatsappLink(telefone: string | null | undefined, viagemTitulo: string | null | undefined): string | null {
  const normalized = normalizePhone(telefone)
  if (!normalized) return null
  const text = viagemTitulo
    ? encodeURIComponent(`Oi! Preciso falar sobre a viagem "${viagemTitulo}"`)
    : encodeURIComponent('Oi! Preciso falar sobre a viagem')
  return `https://wa.me/${normalized}?text=${text}`
}

export function EmergencyContacts({ tp, pv, viagemTitulo }: EmergencyContactsProps) {
  const contacts = [
    pv ? { ...pv, label: 'Pós-Venda' } : null,
    tp ? { ...tp, label: 'Travel Planner' } : null,
  ].filter(Boolean) as (ViagemOwner & { label: string })[]

  if (contacts.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Contatos de apoio</h3>
      <div className="space-y-2">
        {contacts.map((c) => {
          const waLink = whatsappLink(c.telefone, viagemTitulo)
          const mailLink = c.email ? `mailto:${c.email}` : null
          return (
            <div key={c.id} className="flex items-center gap-3">
              {c.avatar_url ? (
                <img src={c.avatar_url} alt={c.nome} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Phone className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{c.nome}</p>
                <p className="text-xs text-slate-500">{c.label}</p>
              </div>
              {mailLink && (
                <a
                  href={mailLink}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label={`Email para ${c.nome}`}
                  title={c.email ?? ''}
                >
                  <Mail className="h-3.5 w-3.5" />
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
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  waLink
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                }`}
                aria-label={`WhatsApp com ${c.nome}`}
                title={waLink ? 'WhatsApp' : 'Sem telefone cadastrado'}
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
