import type { Database } from '@/database.types'

// ============================================
// Base Types from Database
// ============================================
export type Proposal = Database['public']['Tables']['proposals']['Row']
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert']
export type ProposalUpdate = Database['public']['Tables']['proposals']['Update']

export type ProposalVersion = Database['public']['Tables']['proposal_versions']['Row']
export type ProposalVersionInsert = Database['public']['Tables']['proposal_versions']['Insert']

export type ProposalSection = Database['public']['Tables']['proposal_sections']['Row']
export type ProposalSectionInsert = Database['public']['Tables']['proposal_sections']['Insert']
export type ProposalSectionUpdate = Database['public']['Tables']['proposal_sections']['Update']

export type ProposalItem = Database['public']['Tables']['proposal_items']['Row']
export type ProposalItemInsert = Database['public']['Tables']['proposal_items']['Insert']
export type ProposalItemUpdate = Database['public']['Tables']['proposal_items']['Update']

export type ProposalOption = Database['public']['Tables']['proposal_options']['Row']
export type ProposalOptionInsert = Database['public']['Tables']['proposal_options']['Insert']
export type ProposalOptionUpdate = Database['public']['Tables']['proposal_options']['Update']

export type ProposalEvent = Database['public']['Tables']['proposal_events']['Row']
export type ProposalEventInsert = Database['public']['Tables']['proposal_events']['Insert']

export type ProposalClientSelection = Database['public']['Tables']['proposal_client_selections']['Row']
export type ProposalClientSelectionInsert = Database['public']['Tables']['proposal_client_selections']['Insert']
export type ProposalClientSelectionUpdate = Database['public']['Tables']['proposal_client_selections']['Update']

export type ProposalFlight = Database['public']['Tables']['proposal_flights']['Row']
export type ProposalFlightInsert = Database['public']['Tables']['proposal_flights']['Insert']

// ============================================
// Enum Types
// ============================================
export type ProposalStatus = Database['public']['Enums']['proposal_status'] | 'in_progress'
export type ProposalSectionType = Database['public']['Enums']['proposal_section_type']
export type ProposalItemType = Database['public']['Enums']['proposal_item_type']

// ============================================
// Extended Types (with relations)
// ============================================
export interface ProposalWithVersion extends Proposal {
    active_version?: ProposalVersion | null
}

export interface ProposalVersionWithSections extends ProposalVersion {
    sections: ProposalSectionWithItems[]
    flights?: ProposalFlight[]
}

export interface ProposalSectionWithItems extends ProposalSection {
    items: ProposalItemWithOptions[]
}

export interface ProposalItemWithOptions extends ProposalItem {
    options: ProposalOption[]
}

export interface ProposalFull extends Proposal {
    active_version: ProposalVersionWithSections | null
}

// ============================================
// Builder State Types
// ============================================
export interface ProposalBuilderState {
    proposal: Proposal | null
    version: ProposalVersion | null
    sections: ProposalSectionWithItems[]
    isDirty: boolean
    isSaving: boolean
    lastSavedAt: Date | null
}

export interface ProposalBuilderActions {
    // Section actions
    addSection: (type: ProposalSectionType, title: string) => void
    removeSection: (sectionId: string) => void
    updateSection: (sectionId: string, updates: Partial<ProposalSection>) => void
    reorderSections: (orderedIds: string[]) => void

    // Item actions
    addItem: (sectionId: string, item: Partial<ProposalItemInsert>) => void
    removeItem: (itemId: string) => void
    updateItem: (itemId: string, updates: Partial<ProposalItem>) => void
    reorderItems: (sectionId: string, orderedIds: string[]) => void

    // Option actions
    addOption: (itemId: string, option: Partial<ProposalOptionInsert>) => void
    removeOption: (optionId: string) => void
    updateOption: (optionId: string, updates: Partial<ProposalOption>) => void

    // Save actions
    save: () => Promise<void>
    publish: () => Promise<string> // Returns public token
}

// ============================================
// Status Helpers
// ============================================
export const PROPOSAL_STATUS_CONFIG: Record<ProposalStatus, {
    label: string
    color: string
    bgColor: string
    icon: string
}> = {
    draft: { label: 'Rascunho', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: 'FileEdit' },
    sent: { label: 'Enviada', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'Send' },
    viewed: { label: 'Visualizada', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: 'Eye' },
    in_progress: { label: 'Em Análise', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: 'Clock' },
    accepted: { label: 'Aceita', color: 'text-green-600', bgColor: 'bg-green-100', icon: 'CheckCircle' },
    rejected: { label: 'Recusada', color: 'text-red-600', bgColor: 'bg-red-100', icon: 'XCircle' },
    expired: { label: 'Expirada', color: 'text-slate-500', bgColor: 'bg-slate-100', icon: 'Timer' },
}

export const SECTION_TYPE_CONFIG: Record<ProposalSectionType, {
    label: string
    icon: string
    defaultTitle: string
}> = {
    cover: { label: 'Capa', icon: 'Image', defaultTitle: 'Sua Viagem' },
    itinerary: { label: 'Roteiro', icon: 'Map', defaultTitle: 'Roteiro' },
    flights: { label: 'Voos', icon: 'Plane', defaultTitle: 'Voos' },
    hotels: { label: 'Hospedagem', icon: 'Building2', defaultTitle: 'Hospedagem' },
    experiences: { label: 'Experiências', icon: 'Sparkles', defaultTitle: 'Experiências' },
    transfers: { label: 'Transfers', icon: 'Car', defaultTitle: 'Transfers' },
    services: { label: 'Serviços', icon: 'Briefcase', defaultTitle: 'Serviços' },
    terms: { label: 'Termos', icon: 'FileText', defaultTitle: 'Termos e Condições' },
    summary: { label: 'Resumo', icon: 'Receipt', defaultTitle: 'Resumo' },
    custom: { label: 'Personalizado', icon: 'PlusCircle', defaultTitle: 'Seção' },
}

export const ITEM_TYPE_CONFIG: Record<ProposalItemType, {
    label: string
    icon: string
}> = {
    hotel: { label: 'Hotel', icon: 'Building2' },
    flight: { label: 'Voo', icon: 'Plane' },
    transfer: { label: 'Transfer', icon: 'Car' },
    experience: { label: 'Experiência', icon: 'Sparkles' },
    service: { label: 'Serviço', icon: 'Briefcase' },
    insurance: { label: 'Seguro', icon: 'Shield' },
    fee: { label: 'Taxa', icon: 'Receipt' },
    custom: { label: 'Personalizado', icon: 'Package' },
}
