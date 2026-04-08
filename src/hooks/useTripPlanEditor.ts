/**
 * useTripPlanEditor — Zustand store para o editor do portal da viagem.
 *
 * Segue o mesmo padrão do useProposalBuilder:
 * - State central com blocos
 * - Actions atômicas (add, remove, update, reorder)
 * - isDirty tracking para auto-save
 * - Persistência via Supabase
 */

import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BlockType =
    | 'day_header'
    | 'travel_item'
    | 'voucher'
    | 'tip'
    | 'photo'
    | 'video'
    | 'contact'
    | 'checklist'
    | 'pre_trip_section'

export interface TripPlanBlock {
    id: string
    trip_plan_id: string
    block_type: BlockType
    parent_day_id: string | null
    ordem: number
    data: Record<string, unknown>
    is_published: boolean
    published_at: string | null
    created_at: string
    updated_at: string
}

export interface DayHeaderData {
    date: string          // YYYY-MM-DD
    title: string         // "Dia 1 — Roma"
    city: string          // "Roma"
    hero_image_url?: string
}

export interface VoucherData {
    file_url: string
    file_name: string
    voucher_type: 'hotel' | 'flight' | 'transfer' | 'experience' | 'generic'
    extracted_data?: Record<string, unknown>
    confirmation_number?: string
    supplier?: string
}

export interface TipData {
    content: string
    title?: string
}

export interface PhotoData {
    image_url: string
    caption?: string
}

export interface VideoData {
    url: string
    provider?: 'youtube' | 'vimeo' | 'other'
    caption?: string
}

export interface ContactData {
    name: string
    role: string
    phone?: string
    email?: string
    whatsapp?: string
}

export interface ChecklistData {
    items: Array<{ label: string; checked: boolean; category?: string }>
}

export interface PreTripData {
    topics: string[] // ['passport', 'vaccines', 'currency', 'timezone', 'insurance', 'luggage']
    custom_notes?: Record<string, string>
}

export interface TravelItemData {
    proposal_item_id?: string
    item_type: string
    title: string
    description?: string
    image_url?: string
}

// ─── Store State ────────────────────────────────────────────────────────────

interface TripPlanEditorState {
    // Core
    tripPlanId: string | null
    proposalId: string | null
    blocks: TripPlanBlock[]

    // UI
    isDirty: boolean
    isSaving: boolean
    lastSavedAt: Date | null
    selectedBlockId: string | null

    // Actions
    initialize: (tripPlanId: string, proposalId: string, blocks: TripPlanBlock[]) => void
    reset: () => void

    // Block CRUD
    addBlock: (type: BlockType, parentDayId?: string | null, data?: Record<string, unknown>) => string
    removeBlock: (blockId: string) => void
    updateBlockData: (blockId: string, data: Record<string, unknown>) => void
    reorderBlocks: (orderedIds: string[]) => void
    selectBlock: (blockId: string | null) => void

    // Publishing
    publishAll: () => Promise<void>
    publishBlock: (blockId: string) => void
    unpublishBlock: (blockId: string) => void

    // Persistence
    save: () => Promise<void>

    // Helpers
    getDayBlocks: () => TripPlanBlock[]
    getChildrenOfDay: (dayId: string) => TripPlanBlock[]
    getOrphanBlocks: () => TripPlanBlock[]
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useTripPlanEditor = create<TripPlanEditorState>((set, get) => ({
    // Initial state
    tripPlanId: null,
    proposalId: null,
    blocks: [],
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    selectedBlockId: null,

    // ─── Initialize ─────────────────────────────────────────────────────

    initialize: (tripPlanId, proposalId, blocks) => {
        set({
            tripPlanId,
            proposalId,
            blocks: blocks.sort((a, b) => a.ordem - b.ordem),
            isDirty: false,
            isSaving: false,
            selectedBlockId: null,
        })
    },

    reset: () => {
        set({
            tripPlanId: null,
            proposalId: null,
            blocks: [],
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,
            selectedBlockId: null,
        })
    },

    // ─── Block CRUD ─────────────────────────────────────────────────────

    addBlock: (type, parentDayId = null, data = {}) => {
        const { blocks, tripPlanId } = get()
        if (!tripPlanId) return ''

        const id = crypto.randomUUID()

        // Calcular ordem: se tem parent, ordena dentro do dia; senão, no final
        const siblings = parentDayId
            ? blocks.filter(b => b.parent_day_id === parentDayId)
            : blocks.filter(b => b.parent_day_id === null)
        const maxOrdem = siblings.reduce((max, b) => Math.max(max, b.ordem), -1)

        const newBlock: TripPlanBlock = {
            id,
            trip_plan_id: tripPlanId,
            block_type: type,
            parent_day_id: parentDayId,
            ordem: maxOrdem + 1,
            data,
            is_published: false,
            published_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }

        set(state => ({
            blocks: [...state.blocks, newBlock],
            isDirty: true,
            selectedBlockId: id,
        }))

        return id
    },

    removeBlock: (blockId) => {
        set(state => ({
            // Remover o bloco E seus filhos (se for day_header)
            blocks: state.blocks.filter(b => b.id !== blockId && b.parent_day_id !== blockId),
            isDirty: true,
            selectedBlockId: state.selectedBlockId === blockId ? null : state.selectedBlockId,
        }))
    },

    updateBlockData: (blockId, data) => {
        set(state => ({
            blocks: state.blocks.map(b =>
                b.id === blockId
                    ? { ...b, data: { ...b.data, ...data }, updated_at: new Date().toISOString() }
                    : b
            ),
            isDirty: true,
        }))
    },

    reorderBlocks: (orderedIds) => {
        set(state => ({
            blocks: state.blocks.map(b => {
                const newIndex = orderedIds.indexOf(b.id)
                return newIndex >= 0 ? { ...b, ordem: newIndex } : b
            }).sort((a, b) => a.ordem - b.ordem),
            isDirty: true,
        }))
    },

    selectBlock: (blockId) => {
        set({ selectedBlockId: blockId })
    },

    // ─── Publishing ─────────────────────────────────────────────────────

    publishAll: async () => {
        const { blocks, tripPlanId } = get()
        if (!tripPlanId) return

        const now = new Date().toISOString()
        set(state => ({
            blocks: state.blocks.map(b => ({
                ...b,
                is_published: true,
                published_at: b.published_at || now,
            })),
            isDirty: true,
        }))

        await get().save()
    },

    publishBlock: (blockId) => {
        set(state => ({
            blocks: state.blocks.map(b =>
                b.id === blockId
                    ? { ...b, is_published: true, published_at: new Date().toISOString() }
                    : b
            ),
            isDirty: true,
        }))
    },

    unpublishBlock: (blockId) => {
        set(state => ({
            blocks: state.blocks.map(b =>
                b.id === blockId ? { ...b, is_published: false } : b
            ),
            isDirty: true,
        }))
    },

    // ─── Persistence ────────────────────────────────────────────────────

    save: async () => {
        const { blocks, tripPlanId, isSaving } = get()
        if (!tripPlanId || isSaving) return

        set({ isSaving: true })

        try {
            // Fetch existing block IDs from DB
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: existingBlocks } = await (supabase.from as any)('trip_plan_blocks')
                .select('id')
                .eq('trip_plan_id', tripPlanId)

            const existingIds = new Set((existingBlocks || []).map((b: { id: string }) => b.id))
            const currentIds = new Set(blocks.map(b => b.id))

            // Delete removed blocks
            const toDelete = [...existingIds].filter(id => !currentIds.has(id))
            if (toDelete.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from as any)('trip_plan_blocks')
                    .delete()
                    .in('id', toDelete)
            }

            // Upsert all current blocks
            if (blocks.length > 0) {
                const rows = blocks.map(b => ({
                    id: b.id,
                    trip_plan_id: b.trip_plan_id,
                    block_type: b.block_type,
                    parent_day_id: b.parent_day_id,
                    ordem: b.ordem,
                    data: b.data,
                    is_published: b.is_published,
                    published_at: b.published_at,
                }))

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error } = await (supabase.from as any)('trip_plan_blocks')
                    .upsert(rows, { onConflict: 'id' })

                if (error) throw error
            }

            set({ isDirty: false, isSaving: false, lastSavedAt: new Date() })
        } catch (err) {
            console.error('[TripPlanEditor] Save error:', err)
            set({ isSaving: false })
            throw err
        }
    },

    // ─── Helpers ────────────────────────────────────────────────────────

    getDayBlocks: () => {
        return get().blocks.filter(b => b.block_type === 'day_header').sort((a, b) => a.ordem - b.ordem)
    },

    getChildrenOfDay: (dayId) => {
        return get().blocks.filter(b => b.parent_day_id === dayId).sort((a, b) => a.ordem - b.ordem)
    },

    getOrphanBlocks: () => {
        return get().blocks.filter(b => b.parent_day_id === null && b.block_type !== 'day_header')
            .sort((a, b) => a.ordem - b.ordem)
    },
}))

// ─── Block type metadata ────────────────────────────────────────────────────

export const BLOCK_TYPE_CONFIG: Record<BlockType, {
    label: string
    icon: string // lucide icon name
    color: { bg: string; text: string; border: string }
    category: 'structure' | 'content' | 'media' | 'utility'
}> = {
    day_header: {
        label: 'Dia',
        icon: 'CalendarDays',
        color: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
        category: 'structure',
    },
    travel_item: {
        label: 'Item da Viagem',
        icon: 'MapPin',
        color: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
        category: 'content',
    },
    voucher: {
        label: 'Voucher',
        icon: 'FileDown',
        color: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
        category: 'content',
    },
    tip: {
        label: 'Dica',
        icon: 'Lightbulb',
        color: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200' },
        category: 'content',
    },
    photo: {
        label: 'Foto',
        icon: 'Image',
        color: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
        category: 'media',
    },
    video: {
        label: 'Vídeo',
        icon: 'Video',
        color: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
        category: 'media',
    },
    contact: {
        label: 'Contato',
        icon: 'User',
        color: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
        category: 'utility',
    },
    checklist: {
        label: 'Checklist',
        icon: 'CheckSquare',
        color: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' },
        category: 'utility',
    },
    pre_trip_section: {
        label: 'Pré-viagem',
        icon: 'ClipboardList',
        color: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
        category: 'utility',
    },
}
