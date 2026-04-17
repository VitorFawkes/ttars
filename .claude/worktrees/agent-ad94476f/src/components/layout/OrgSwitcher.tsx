import { useState } from 'react'
import { Check, ChevronsUpDown, Building2 } from 'lucide-react'
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
}

export function OrgSwitcher({ isCollapsed = false }: OrgSwitcherProps) {
    const { org } = useOrg()
    const { orgs } = useOrgMembers()
    const switchOrg = useOrgSwitch()
    const [open, setOpen] = useState(false)

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
                    <Building2 className="h-5 w-5 text-white/70" />
                ) : (
                    <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                        <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: single.branding?.primary_color ?? '#6366f1' }}
                        />
                        <span className="truncate">{single.org_name}</span>
                    </div>
                )}
            </div>
        )
    }

    const currentOrg = childOrgs.find((o) => o.org_id === org?.id) ?? childOrgs[0]

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    role="combobox"
                    aria-expanded={open}
                    title={isCollapsed ? currentOrg?.org_name : undefined}
                    disabled={switchOrg.isPending}
                    className={cn(
                        "flex items-center rounded-lg bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors border border-white/10 h-10",
                        isCollapsed ? "w-10 justify-center" : "w-full justify-between px-3",
                        switchOrg.isPending && "opacity-50 cursor-wait"
                    )}
                >
                    {isCollapsed ? (
                        <div
                            className="h-5 w-5 rounded-full"
                            style={{ backgroundColor: currentOrg?.branding?.primary_color ?? '#6366f1' }}
                        />
                    ) : (
                        <>
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <div
                                    className="h-3 w-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: currentOrg?.branding?.primary_color ?? '#6366f1' }}
                                />
                                <span className="truncate">
                                    {switchOrg.isPending ? 'Trocando...' : currentOrg?.org_name}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                            setOpen(false)
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    >
                        <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: o.branding?.primary_color ?? '#6366f1' }}
                        />
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
