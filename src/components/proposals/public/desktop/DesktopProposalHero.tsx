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

  return (
    <div className="relative rounded-2xl overflow-hidden mb-8">
      {heroImage ? (
        <div className="relative h-80 w-full">
          <img
            src={heroImage}
            alt={title}
            className="w-full h-full object-cover"
          />
          {/* Overlay gradiente */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Conteúdo sobre a imagem */}
          <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
            <h1 className="text-4xl font-bold leading-tight mb-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-white/80 text-lg mb-4 max-w-2xl">{subtitle}</p>
            )}
            <div className="flex flex-wrap gap-4">
              {destination && (
                <span className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <MapPin className="h-4 w-4" />
                  {destination}
                </span>
              )}
              {travelDates && (
                <span className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <Calendar className="h-4 w-4" />
                  {travelDates}
                </span>
              )}
              {travelers && (
                <span className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <Users className="h-4 w-4" />
                  {travelers}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Fallback sem imagem
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-8 py-12 text-white">
          <h1 className="text-4xl font-bold leading-tight mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-white/80 text-lg mb-4 max-w-2xl">{subtitle}</p>
          )}
          <div className="flex flex-wrap gap-4">
            {destination && (
              <span className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
                <MapPin className="h-4 w-4" />
                {destination}
              </span>
            )}
            {travelDates && (
              <span className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
                <Calendar className="h-4 w-4" />
                {travelDates}
              </span>
            )}
            {travelers && (
              <span className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
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
