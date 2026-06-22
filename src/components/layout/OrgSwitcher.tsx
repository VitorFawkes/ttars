import { useState } from 'react'
import { Check, ChevronsUpDown, Plane, Gem, Building2, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useOrgMembers } from '../../hooks/useOrgMembers'
import { useOrgSwitch } from '../../hooks/useOrgSwitch'
import { useOrg } from '../../contexts/OrgContext'

interface OrgSwitcherProps {
    isCollapsed?: boolean
    onOpenChange?: (open: boolean) => void
    /** Tom do sidebar onde o switcher está: 'dark' (azul Trips) ou 'light' (champagne Weddings) */
    tone?: 'dark' | 'light'
}

// Símbolo + cor de marca de cada produto. Linha limpa (lucide), consistente com o menu.
const ORG_META: Record<string, { icon: LucideIcon; color: string }> = {
    'welcome-trips': { icon: Plane, color: 'text-indigo-500' },
    'welcome-weddings': { icon: Gem, color: 'text-ww-gold' },
}

// Produtos visíveis no seletor — só estes dois por enquanto, nesta ordem.
const PRODUCT_SLUGS = ['welcome-weddings', 'welcome-trips']

function OrgBadge({
    slug,
    size,
    className,
}: {
    slug?: string
    size: 'sm' | 'md'
    /** Sobrescreve a cor; se omitido, usa a cor de marca do produto */
    className?: string
}) {
    const meta = slug ? ORG_META[slug] : undefined
    const box = size === 'md' ? 'h-5 w-5' : 'h-4 w-4'
    if (meta) {
        const Icon = meta.icon
        return (
            <Icon
                aria-hidden
                strokeWidth={1.75}
                className={cn(box, 'flex-shrink-0', className ?? meta.color)}
            />
        )
    }
    return <Building2 aria-hidden className={cn(box, 'flex-shrink-0', className ?? 'text-slate-400')} />
}

export function OrgSwitcher({ isCollapsed = false, onOpenChange, tone = 'dark' }: OrgSwitcherProps) {
    const { org } = useOrg()
    const { orgs } = useOrgMembers()
    const switchOrg = useOrgSwitch()
    const [open, setOpen] = useState(false)
    const onDark = tone === 'dark'
    const surfaceClass = onDark
        ? 'bg-white/10 text-white border-white/10'
        : 'bg-white text-ww-n700 border-ww-gold/30 shadow-sm'
    // No gatilho (sobre o sidebar) o símbolo segue o tom; no dropdown usa a cor de marca.
    const badgeTone = onDark ? 'text-white' : 'text-ww-gold'

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        onOpenChange?.(next)
    }

    // Só Weddings e Trips, em ordem definida.
    const childOrgs = orgs
        .filter((o) => PRODUCT_SLUGS.includes(o.org_slug))
        .sort((a, b) => PRODUCT_SLUGS.indexOf(a.org_slug) - PRODUCT_SLUGS.indexOf(b.org_slug))

    // Se o usuário só tem 1 produto, mostra o nome sem dropdown.
    if (childOrgs.length <= 1) {
        const single = childOrgs[0]
        if (!single) return null

        return (
            <div
                title={isCollapsed ? single.org_name : undefined}
                className={cn(
                    'flex items-center rounded-lg text-sm font-medium border h-10',
                    surfaceClass,
                    isCollapsed ? 'w-10 justify-center' : 'w-full px-3',
                )}
            >
                {isCollapsed ? (
                    <OrgBadge slug={single.org_slug} size="md" className={badgeTone} />
                ) : (
                    <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                        <OrgBadge slug={single.org_slug} size="sm" className={badgeTone} />
                        <span className="truncate">{single.org_name}</span>
                    </div>
                )}
            </div>
        )
    }

    const currentOrg = childOrgs.find((o) => o.org_id === org?.id) ?? childOrgs[0]

    return (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <button
                    role="combobox"
                    aria-expanded={open}
                    aria-busy={switchOrg.isPending}
                    title={isCollapsed ? currentOrg?.org_name : undefined}
                    disabled={switchOrg.isPending}
                    className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-colors border h-10',
                        surfaceClass,
                        onDark ? 'hover:bg-white/20' : 'hover:bg-ww-gold-soft',
                        isCollapsed ? 'w-10 justify-center' : 'w-full justify-between px-3',
                        switchOrg.isPending && 'cursor-wait',
                    )}
                >
                    {isCollapsed ? (
                        <OrgBadge slug={currentOrg?.org_slug} size="md" className={badgeTone} />
                    ) : (
                        <>
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <OrgBadge slug={currentOrg?.org_slug} size="sm" className={badgeTone} />
                                <span className="truncate">{currentOrg?.org_name}</span>
                            </div>
                            {switchOrg.isPending ? (
                                <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-70" />
                            ) : (
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            )}
                        </>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-56 p-1.5 rounded-xl">
                <div className="px-2 pt-0.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Produto
                </div>
                {childOrgs.map((o) => {
                    const active = o.org_id === org?.id
                    return (
                        <DropdownMenuItem
                            key={o.org_id}
                            onSelect={() => {
                                if (o.org_id !== org?.id) {
                                    switchOrg.mutate({ orgId: o.org_id })
                                }
                                handleOpenChange(false)
                            }}
                            className={cn(
                                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer',
                                active && 'bg-slate-50',
                            )}
                        >
                            <OrgBadge slug={o.org_slug} size="sm" />
                            <span className="flex-1 text-sm font-medium text-slate-700">{o.org_name}</span>
                            {active && <Check className="h-4 w-4 text-slate-400" />}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
