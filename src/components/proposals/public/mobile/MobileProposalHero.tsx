/**
 * MobileProposalHero - Hero/capa da proposta
 */

import type { ProposalFull } from '@/types/proposals'
import { Calendar, Users } from 'lucide-react'

interface MobileProposalHeroProps {
  proposal: ProposalFull
}

export function MobileProposalHero({ proposal }: MobileProposalHeroProps) {
  const version = proposal.active_version
  const metadata = (version?.metadata as Record<string, unknown>) || {}

  // Extrai informações do metadata
  const title = version?.title || 'Proposta de Viagem'
  const subtitle = metadata.subtitle as string | undefined
  const travelDates = metadata.travel_dates as string | undefined
  const travelers = metadata.travelers as string | undefined
  const coverImageUrl = metadata.cover_image_url as string | undefined

  // Busca imagem da seção cover se não tiver no metadata
  const coverSection = version?.sections?.find(s => s.section_type === 'cover')
  const coverItem = coverSection?.items?.[0]
  const coverRichContent = coverItem?.rich_content as Record<string, unknown> | undefined
  const heroImage = coverImageUrl || coverRichContent?.cover_image_url as string | undefined || coverItem?.image_url

  return (
    <div className="relative">
      {/* Imagem de fundo */}
      {heroImage ? (
        <div className="relative h-64 w-full overflow-hidden">
          <img
            src={heroImage}
            alt={title}
            className="w-full h-full object-cover"
          />
          {/* Overlay gradiente */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          {/* Conteúdo sobre a imagem */}
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h1 className="text-2xl font-bold leading-tight mb-1">
              {title}
            </h1>
            {subtitle && (
              <p className="text-white/80 text-sm mb-3">{subtitle}</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {travelDates && (
                <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <Calendar className="h-4 w-4" />
                  {travelDates}
                </span>
              )}
              {travelers && (
                <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <Users className="h-4 w-4" />
                  {travelers}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Fallback sem imagem
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-12 text-white">
          <h1 className="text-2xl font-bold leading-tight mb-1">
            {title}
          </h1>
          {subtitle && (
            <p className="text-white/80 text-sm mb-3">{subtitle}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            {travelDates && (
              <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
                <Calendar className="h-4 w-4" />
                {travelDates}
              </span>
            )}
            {travelers && (
              <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
                <Users className="h-4 w-4" />
                {travelers}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
