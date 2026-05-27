import { useACBaseUrl, buildACContactUrl } from '@/hooks/useACBaseUrl'

type Props = {
  externalId: string | null | undefined
  contactName?: string | null
  size?: 'sm' | 'md'
  variant?: 'icon' | 'pill'
}

/**
 * Abre o contato no ActiveCampaign em nova aba. Se o contato não tem
 * external_id (não sincronizado com AC) o botão fica desabilitado com tooltip.
 */
export function OpenInACButton({ externalId, contactName, size = 'sm', variant = 'icon' }: Props) {
  const { data: baseUrl } = useACBaseUrl()
  const url = buildACContactUrl(baseUrl, externalId)
  const disabled = !url

  const title = disabled
    ? (externalId ? 'Active não configurado neste workspace' : 'Casal ainda não sincronizado com Active')
    : contactName
      ? `Abrir ${contactName} no Active`
      : 'Abrir no Active'

  const sizeClass = size === 'sm' ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2 text-xs'

  if (disabled) {
    return (
      <span
        title={title}
        aria-label={title}
        className={`inline-flex items-center gap-1 ${sizeClass} rounded-md border border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed`}
      >
        <ACIcon />
        {variant === 'pill' && <span>Active</span>}
      </span>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 ${sizeClass} rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-300 transition font-medium`}
    >
      <ACIcon />
      {variant === 'pill' && <span>Active</span>}
    </a>
  )
}

function ACIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3L13 3L13 10" />
      <path d="M13 3L4 12" />
      <path d="M3 7L3 13L10 13" />
    </svg>
  )
}
