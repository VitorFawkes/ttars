import { useState } from 'react'
import { Check, ChevronsUpDown, Building2, Loader2 } from 'lucide-react'
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
}

const ORG_ICON_BY_SLUG: Record<string, string> = {
    'welcome-trips': '/vacation.svg',
    'welcome-weddings': '/wedding-rings.svg',
}

function OrgBadge({
    slug,
    color,
    size,
    onDark = false,
}: {
    slug?: string
    color?: string
    size: 'sm' | 'md'
    onDark?: boolean
}) {
    const icon = slug ? ORG_ICON_BY_SLUG[slug] : undefined
    const box = size === 'md' ? 'h-7 w-7' : 'h-5 w-5'
    if (icon) {
        return (
            <img
                src={icon}
                alt=""
                aria-hidden
                className={cn(
                    'object-contain flex-shrink-0',
                    box,
                    onDark && 'brightness-0 invert'
                )}
            />
        )
    }
    const dot = size === 'md' ? 'h-5 w-5' : 'h-3 w-3'
    return (
        <div
            className={cn('rounded-full flex-shrink-0', dot)}
            style={{ backgroundColor: color ?? '#6366f1' }}
        />
    )
}

export function OrgSwitcher({ isCollapsed = false, onOpenChange }: OrgSwitcherProps) {
    const { org } = useOrg()
    const { orgs } = useOrgMembers()
    const switchOrg = useOrgSwitch()
    const [open, setOpen] = useState(false)

    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        onOpenChange?.(next)
    }

    // Welcome Group agora é tenant como qualquer outra — sem filtro especial.
    const childOrgs = orgs

    // If user has only 1 org, show name without dropdown
    if (childOrgs.length <= 1) {
        const single = childOrgs[0]
        if (!single) return null

        return (
            <div
                title={isCollapsed ? single.org_name : undefined}
                className={cn(
                    "flex items-center rounded-lg bg-white/10 text-sm font-medium text-white border border-white/10 h-10",
                    isCollapsed ? "w-10 justify-center" : "w-full px-3"
                )}
            >
                {isCollapsed ? (
                    ORG_ICON_BY_SLUG[single.org_slug] ? (
                        <OrgBadge slug={single.org_slug} color={single.branding?.primary_color} size="md" onDark />
                    ) : (
                        <Building2 className="h-5 w-5 text-white/70" />
                    )
                ) : (
                    <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                        <OrgBadge slug={single.org_slug} color={single.branding?.primary_color} size="sm" onDark />
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
                        "flex items-center rounded-lg bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors border border-white/10 h-10",
                        isCollapsed ? "w-10 justify-center" : "w-full justify-between px-3",
                        switchOrg.isPending && "cursor-wait"
                    )}
                >
                    {isCollapsed ? (
                        <OrgBadge slug={currentOrg?.org_slug} color={currentOrg?.branding?.primary_color} size="md" onDark />
                    ) : (
                        <>
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <OrgBadge slug={currentOrg?.org_slug} color={currentOrg?.branding?.primary_color} size="sm" onDark />
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
            <DropdownMenuContent align="start" className="w-[200px] p-0">
                {childOrgs.map((o) => (
                    <DropdownMenuItem
                        key={o.org_id}
                        onSelect={() => {
                            if (o.org_id !== org?.id) {
                                switchOrg.mutate({ orgId: o.org_id })
                            }
                            handleOpenChange(false)
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    >
                        <OrgBadge slug={o.org_slug} color={o.branding?.primary_color} size="sm" />
                        <span className="flex-1">{o.org_name}</span>
                        {o.org_id === org?.id && (
                            <Check className="h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
