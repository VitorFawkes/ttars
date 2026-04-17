/**
 * ProposalViewRouter - Router que seleciona Mobile ou Desktop
 *
 * Detecta automaticamente o tipo de dispositivo e renderiza
 * o viewer apropriado
 */

import { useState, useEffect } from 'react'
import type { ProposalFull } from '@/types/proposals'
import { MobileProposalViewer } from './mobile'
import { DesktopProposalViewer } from './desktop'

interface ProposalViewRouterProps {
  proposal: ProposalFull
}

// Hook para detectar mobile vs desktop
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    // Verificação inicial
    const media = window.matchMedia(query)
    setMatches(media.matches)

    // Listener para mudanças
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

// Breakpoint: <= 1023px = mobile, >= 1024px = desktop
const MOBILE_QUERY = '(max-width: 1023px)'

export function ProposalViewRouter({ proposal }: ProposalViewRouterProps) {
  const isMobile = useMediaQuery(MOBILE_QUERY)

  // Renderiza componente apropriado
  if (isMobile) {
    return <MobileProposalViewer proposal={proposal} />
  }

  return <DesktopProposalViewer proposal={proposal} />
}

// Export do hook para uso externo se necessário
export { useMediaQuery }
