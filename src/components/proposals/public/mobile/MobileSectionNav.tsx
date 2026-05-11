/**
 * MobileSectionNav - Navegação horizontal por seções
 */

import { useRef, useEffect, useState } from 'react'
import type { ProposalSectionWithItems } from '@/types/proposals'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import { cn } from '@/lib/utils'
import type { SelectionsMap } from '../shared/types'

interface MobileSectionNavProps {
  sections: ProposalSectionWithItems[]
  selections: SelectionsMap
  activeSection?: string
  onSectionClick: (sectionId: string) => void
}

export function MobileSectionNav({
  sections,
  selections,
  activeSection,
  onSectionClick,
}: MobileSectionNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)

  // Filtra seções válidas (não cover, não blocos especiais)
  const navSections = sections.filter(s => {
    if (s.section_type === 'cover') return false
    if (s.items?.length === 0) return false
    // Verifica se é bloco especial
    const firstItem = s.items?.[0]
    if (firstItem) {
      const rc = firstItem.rich_content as Record<string, unknown>
      if (rc?.is_title_block || rc?.is_text_block || rc?.is_divider_block) return false
    }
    return true
  })

  // Detecta scroll para mostrar fades
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      setShowLeftFade(el.scrollLeft > 10)
      setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
    }

    handleScroll()
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [navSections.length])

  // Verifica status de cada seção
  const getSectionStatus = (section: ProposalSectionWithItems): 'complete' | 'incomplete' | 'neutral' => {
    const items = section.items || []
    if (items.length < 2) return 'neutral' // Seção de item único não precisa de validação

    // Seção com múltiplos itens requer seleção
    const hasSelection = items.some(item => selections[item.id]?.selected)
    return hasSelection ? 'complete' : 'incomplete'
  }

  if (navSections.length === 0) return null

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-100">
      <div className="relative">
        {/* Fade esquerdo */}
        {showLeftFade && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        )}

        {/* Fade direito */}
        {showRightFade && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        )}

        {/* Scroll horizontal */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {navSections.map(section => {
            const config = SECTION_TYPE_CONFIG[section.section_type] || SECTION_TYPE_CONFIG.custom
            const isActive = activeSection === section.id
            const status = getSectionStatus(section)

            // Remove emoji do título
            const cleanTitle = section.title
              .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
              .trim()

            return (
              <button
                key={section.id}
                onClick={() => onSectionClick(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <span>{cleanTitle || config.defaultTitle}</span>

                {/* Status indicator */}
                {status === 'complete' && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                )}
                {status === 'incomplete' && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">
                    !
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
