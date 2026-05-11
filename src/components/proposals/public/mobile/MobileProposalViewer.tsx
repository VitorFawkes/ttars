/**
 * MobileProposalViewer - Container principal para visualização mobile
 *
 * Arquitetura nova:
 * - Lê dados diretamente via readers (sem normalização)
 * - Componentes específicos por tipo
 * - Hooks compartilhados para estado
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ProposalFull } from '@/types/proposals'
import { useProposalSelections } from '../shared/hooks/useProposalSelections'
import { useProposalTotals, getSelectedItemsSummary } from '../shared/hooks/useProposalTotals'
import { useProposalAccept, trackProposalView } from '../shared/hooks/useProposalAccept'
import type { Currency } from '../shared/utils/priceUtils'
import { MobileProposalHero } from './MobileProposalHero'
import { MobileSectionNav } from './MobileSectionNav'
import { MobileSection } from './MobileSection'
import { MobileFooter } from './MobileFooter'
import { MobileAcceptModal } from './MobileAcceptModal'

interface MobileProposalViewerProps {
  proposal: ProposalFull
}

export function MobileProposalViewer({ proposal }: MobileProposalViewerProps) {
  const version = proposal.active_version
  const sections = version?.sections || []
  const metadata = (version?.metadata as Record<string, unknown>) || {}

  // Ref para o scroll container (necessário porque o CSS global tem overflow: hidden)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Moeda
  const primaryCurrency = (metadata.currency as Currency) || 'BRL'

  // Filtro de seções (remove cover e blocos especiais)
  const contentSections = sections.filter(s => {
    if (s.section_type === 'cover') return false
    if (s.items?.length === 0) return false
    const firstItem = s.items?.[0]
    if (firstItem) {
      const rc = firstItem.rich_content as Record<string, unknown>
      if (rc?.is_title_block || rc?.is_text_block || rc?.is_divider_block || rc?.is_image_block || rc?.is_video_block) {
        return false
      }
    }
    return true
  })

  // Estado de seleções
  const {
    selections,
    toggleItem,
    selectItem,
    selectOption,
    changeQuantity,
  } = useProposalSelections(contentSections)

  // Totais
  const { totalPrimary, selectedItemsCount } = useProposalTotals(
    contentSections,
    selections,
    primaryCurrency
  )

  // Modal de aceite
  const [showAcceptModal, setShowAcceptModal] = useState(false)

  // Hook de aceite
  const {
    isAccepting,
    isAccepted,
    error: acceptError,
    accept,
    reset: resetAccept,
  } = useProposalAccept({
    proposalId: proposal.id,
    versionId: version?.id || '',
    sections: contentSections,
    selections,
    total: totalPrimary,
    currency: primaryCurrency,
  })

  // Track visualização
  useEffect(() => {
    trackProposalView(proposal.id)
  }, [proposal.id])

  // Scroll tracking para seção ativa
  const [activeSection, setActiveSection] = useState<string | undefined>()
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollY = container.scrollTop + 200 // Offset para detecção

    for (const [sectionId, element] of sectionRefs.current) {
      const rect = element.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const top = rect.top - containerRect.top + container.scrollTop

      if (scrollY >= top && scrollY < top + rect.height) {
        setActiveSection(sectionId)
        break
      }
    }
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Scroll para seção
  const scrollToSection = useCallback((sectionId: string) => {
    const container = scrollContainerRef.current
    const element = sectionRefs.current.get(sectionId)
    if (container && element) {
      const offset = 60 // Altura do nav
      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const top = elementRect.top - containerRect.top + container.scrollTop - offset
      container.scrollTo({ top, behavior: 'smooth' })
    }
  }, [])

  // Itens selecionados para o modal
  const selectedItemsSummary = getSelectedItemsSummary(contentSections, selections)

  // Fecha modal e reseta estado após aceite
  const handleCloseModal = () => {
    setShowAcceptModal(false)
    if (isAccepted) {
      // Poderia redirecionar ou mostrar confirmação permanente
    } else {
      resetAccept()
    }
  }

  // Número de viajantes
  const travelers = parseInt(String(metadata.travelers || '1').replace(/\D/g, '')) || 1

  return (
    <div
      ref={scrollContainerRef}
      className="fixed inset-0 overflow-y-auto bg-slate-50"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Conteúdo scrollável */}
      <div className="min-h-full pb-32">
        {/* Hero */}
        <MobileProposalHero proposal={proposal} />

        {/* Navegação por seções - sticky dentro do scroll container */}
        <MobileSectionNav
          sections={contentSections}
          selections={selections}
          activeSection={activeSection}
          onSectionClick={scrollToSection}
        />

        {/* Seções de conteúdo */}
        <main className="pt-4">
          {contentSections.map(section => (
            <div
              key={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el)
              }}
            >
              <MobileSection
                section={section}
                selections={selections}
                onToggleItem={toggleItem}
                onSelectItem={selectItem}
                onSelectOption={selectOption}
                onChangeQuantity={changeQuantity}
              />
            </div>
          ))}
        </main>
      </div>

      {/* Footer sticky - fora do container scrollável para ficar fixo */}
      <MobileFooter
        total={totalPrimary}
        currency={primaryCurrency}
        travelers={travelers}
        onAccept={() => setShowAcceptModal(true)}
        isVisible={selectedItemsCount > 0}
      />

      {/* Modal de aceite */}
      <MobileAcceptModal
        isOpen={showAcceptModal}
        onClose={handleCloseModal}
        selectedItems={selectedItemsSummary}
        total={totalPrimary}
        currency={primaryCurrency}
        isAccepting={isAccepting}
        isAccepted={isAccepted}
        error={acceptError}
        onConfirm={accept}
      />
    </div>
  )
}
