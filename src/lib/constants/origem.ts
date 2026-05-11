/**
 * Lead Origin Constants
 * Centralized taxonomy for origin tracking across cards and contacts.
 */

/** Origins selectable manually by users */
export const ORIGEM_OPTIONS = [
    { value: 'mkt', label: 'Marketing', icon: 'Megaphone', color: 'bg-violet-100 text-violet-700 border-violet-200' },
    { value: 'indicacao', label: 'Indicação', icon: 'Users', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'carteira_propria', label: 'Carteira Própria', icon: 'Wallet', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'carteira_wg', label: 'Carteira WG', icon: 'Briefcase', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { value: 'sorrento', label: 'Sorrento', icon: 'Building2', color: 'bg-rose-100 text-rose-700 border-rose-200' },
] as const

/** Legacy origins kept for display of existing records (not shown in selectors) */
export const ORIGEM_LEGACY_OPTIONS = [
    { value: 'carteira', label: 'Carteira', icon: 'Wallet', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'manual', label: 'Manual', icon: 'PenTool', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { value: 'outro', label: 'Outro', icon: 'MoreHorizontal', color: 'bg-gray-100 text-gray-600 border-gray-200' },
] as const

/** Origins auto-set by integrations (not shown in manual selector) */
export const ORIGEM_INTEGRATION_OPTIONS = [
    { value: 'site', label: 'Site', icon: 'Globe', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    { value: 'active_campaign', label: 'Active Campaign', icon: 'Zap', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle', color: 'bg-green-100 text-green-700 border-green-200' },
] as const

/** All origins (manual + legacy + integration) for filters and display */
export const ALL_ORIGEM_OPTIONS = [...ORIGEM_OPTIONS, ...ORIGEM_LEGACY_OPTIONS, ...ORIGEM_INTEGRATION_OPTIONS]

export type OrigemValue = (typeof ALL_ORIGEM_OPTIONS)[number]['value']

export function getOrigemLabel(value: string | null | undefined): string {
    return ALL_ORIGEM_OPTIONS.find(o => o.value === value)?.label ?? value ?? '-'
}

export function getOrigemColor(value: string | null | undefined): string {
    return ALL_ORIGEM_OPTIONS.find(o => o.value === value)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200'
}

/** Origins that show a sub-field (campaign detail or referrer contact) */
export function needsOrigemDetalhe(value: string | null | undefined): 'indicacao' | 'mkt' | false {
    if (value === 'indicacao') return 'indicacao'
    if (value === 'mkt') return 'mkt'
    return false
}
