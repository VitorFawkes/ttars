/**
 * DesktopProposalViewer - Container principal para visualização desktop
 *
 * Layout com duas colunas: conteúdo + sidebar sticky
 */

import { useState, useEffect } from 'react'
import type { ProposalFull } from '@/types/proposals'
import { useProposalSelections } from '../shared/hooks/useProposalSelections'
import { useProposalTotals, getSelectedItemsSummary } from '../shared/hooks/useProposalTotals'
import { useProposalAccept, trackProposalView } from '../shared/hooks/useProposalAccept'
import type { Currency } from '../shared/utils/priceUtils'
import { resolveSelectionMode } from '../shared/sectionMode'
import { DesktopProposalHero } from './DesktopProposalHero'
import { DesktopSection } from './DesktopSection'
import { DesktopSidebar } from './DesktopSidebar'
import { DesktopAcceptModal } from './DesktopAcceptModal'

interface DesktopProposalViewerProps {
  proposal: ProposalFull
}

export function DesktopProposalViewer({ proposal }: DesktopProposalViewerProps) {
  const version = proposal.active_version
  const sections = version?.sections || []
  const metadata = (version?.metadata as Record<string, unknown>) || {}

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
  const { totalPrimary } = useProposalTotals(
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

  // Itens selecionados para o modal e sidebar
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

  // Remove item (para sidebar)
  const handleRemoveItem = (itemId: string) => {
    toggleItem(itemId)
  }

  // Número de viajantes
  const travelers = parseInt(String(metadata.travelers || '1').replace(/\D/g, '')) || 1

  // Ancoras do tour do cliente: marca a 1ª seção obrigatória e a 1ª opcional,
  // e fixa o botão de comentário na 1ª seção (prioriza obrigatória).
  const firstRequiredId = contentSections.find(s => {
    const m = resolveSelectionMode(s)
    return m === 'pick_one_required' || m === 'pick_one_or_more'
  })?.id
  const firstOptionalId = contentSections.find(s => {
    const m = resolveSelectionMode(s)
    return m === 'pick_any_optional'
  })?.id
  const commentTourId = firstRequiredId ?? firstOptionalId ?? contentSections[0]?.id

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50">
      <div className="min-h-full">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Layout de duas colunas — hero dentro da coluna principal pra
              ficar alinhado com os cards abaixo (antes esticava até a borda
              do sidebar e dava sensação de desalinhamento). */}
          <div className="flex gap-8">
            {/* Coluna principal - Hero + Seções */}
            <main className="flex-1 min-w-0">
              <DesktopProposalHero proposal={proposal} />
              {contentSections.map(section => {
                const dataTourSection =
                  section.id === firstRequiredId
                    ? 'section-required'
                    : section.id === firstOptionalId
                      ? 'section-optional'
                      : undefined
                return (
                  <DesktopSection
                    key={section.id}
                    section={section}
                    selections={selections}
                    onToggleItem={toggleItem}
                    onSelectItem={selectItem}
                    onSelectOption={selectOption}
                    onChangeQuantity={changeQuantity}
                    commentMode={
                      proposal.public_token
                        ? { kind: 'public', proposalToken: proposal.public_token }
                        : undefined
                    }
                    dataTourSection={dataTourSection}
                    dataTourCommentBtn={section.id === commentTourId}
                  />
                )
              })}
            </main>

            {/* Sidebar sticky */}
            <aside className="w-80 flex-shrink-0">
              <DesktopSidebar
                sections={contentSections}
                selections={selections}
                selectedItems={selectedItemsSummary}
                total={totalPrimary}
                currency={primaryCurrency}
                travelers={travelers}
                onAccept={() => setShowAcceptModal(true)}
                onRemoveItem={handleRemoveItem}
                proposalToken={proposal.public_token}
              />
            </aside>
          </div>
        </div>
      </div>

      {/* Modal de aceite */}
      <DesktopAcceptModal
        isOpen={showAcceptModal}
        onClose={handleCloseModal}
        selectedItems={selectedItemsSummary}
        total={totalPrimary}
        currency={primaryCurrency}
        travelers={travelers}
        isAccepting={isAccepting}
        isAccepted={isAccepted}
        error={acceptError}
        onConfirm={accept}
      />
    </div>
  )
}
