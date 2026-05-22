/**
 * DesktopProposalHero - Hero/capa da proposta para desktop
 *
 * Layout mais amplo com imagem grande e informações detalhadas
 */

import type { ProposalFull } from '@/types/proposals'
import { Calendar, Users, MapPin } from 'lucide-react'

interface DesktopProposalHeroProps {
  proposal: ProposalFull
}

export function DesktopProposalHero({ proposal }: DesktopProposalHeroProps) {
  const version = proposal.active_version
  const metadata = (version?.metadata as Record<string, unknown>) || {}

  // Extrai informações do metadata
  const title = version?.title || 'Proposta de Viagem'
  const subtitle = metadata.subtitle as string | undefined
  const travelDates = metadata.travel_dates as string | undefined
  const travelers = metadata.travelers as string | undefined
  const destination = metadata.destination as string | undefined
  const coverImageUrl = metadata.cover_image_url as string | undefined

  // Busca imagem da seção cover se não tiver no metadata
  const coverSection = version?.sections?.find(s => s.section_type === 'cover')
  const coverItem = coverSection?.items?.[0]
  const coverRichContent = coverItem?.rich_content as Record<string, unknown> | undefined
  const heroImage = coverImageUrl || coverRichContent?.cover_image_url as string | undefined || coverItem?.image_url

  const chips = (
    <div className="flex flex-wrap gap-2">
      {destination && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <MapPin className="h-3 w-3 text-slate-500" />
          {destination}
        </span>
      )}
      {travelDates && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <Calendar className="h-3 w-3 text-slate-500" />
          {travelDates}
        </span>
      )}
      {travelers && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <Users className="h-3 w-3 text-slate-500" />
          {travelers}
        </span>
      )}
    </div>
  )

  return (
    <div className="mb-8">
      {/* Imagem decorativa (se houver) */}
      {heroImage ? (
        <div className="mb-6 overflow-hidden rounded-2xl">
          <img
            src={heroImage}
            alt={title}
            className="h-64 w-full object-cover"
          />
        </div>
      ) : null}

      {/* Título + chips — alinhados com os títulos de seção abaixo
          (sem padding interno extra, mesmo edge da coluna principal). */}
      <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>
      {subtitle && (
        <p className="mb-4 max-w-3xl text-base text-slate-600">{subtitle}</p>
      )}
      {(destination || travelDates || travelers) && chips}
    </div>
  )
}
