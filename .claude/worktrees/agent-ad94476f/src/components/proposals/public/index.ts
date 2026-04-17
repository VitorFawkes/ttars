/**
 * Public Proposal Viewer - Main exports
 *
 * Nova arquitetura:
 * - Mobile e Desktop são componentes separados
 * - Readers leem dados diretamente do rich_content
 * - ProposalViewRouter detecta automaticamente o dispositivo
 */

// Main router - detecta mobile/desktop automaticamente
export { ProposalViewRouter, useMediaQuery } from './ProposalViewRouter'

// Mobile components
export { MobileProposalViewer } from './mobile'

// Desktop components
export { DesktopProposalViewer } from './desktop'

// Shared utilities
export * from './shared'
