import { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Kanban, Users, Settings, FileText, ChevronRight, User, BarChart3, LogOut, Database, Calendar, FileSpreadsheet, BellRing, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ProductSwitcher } from './ProductSwitcher'
import { useAuth } from '../../contexts/AuthContext'
import { useProductContext } from '../../hooks/useProductContext'
import NotificationCenter from './NotificationCenter'
import { useTodayMeetingCount } from '../../hooks/calendar/useTodayMeetingCount'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const navigation: { name: string; href: string; icon: LucideIcon; productsOnly?: string[]; adminOnly?: boolean }[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Funil', href: '/pipeline', icon: Kanban },
    { name: 'Gestão de Leads', href: '/leads', icon: Database },
    { name: 'Propostas', href: '/proposals', icon: FileText },
    { name: 'Grupos', href: '/groups', icon: Users, productsOnly: ['TRIPS'] },
    { name: 'Contatos', href: '/people', icon: User },
    { name: 'Agenda', href: '/calendar', icon: Calendar },
    { name: 'Vendas Monde', href: '/vendas-monde', icon: FileSpreadsheet, adminOnly: true },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Configurações', href: '/settings', icon: Settings },
]

export default function Sidebar() {
    const location = useLocation()
    const navigate = useNavigate()
    const { session, signOut, profile } = useAuth()
    const { currentProduct } = useProductContext()
    const [isExpanded, setIsExpanded] = useState(false)
    const { data: todayCount } = useTodayMeetingCount()
    const { isSupported: pushSupported, isSubscribed: pushSubscribed } = usePushNotifications()
    const showPushCta = pushSupported && !pushSubscribed

    const filteredNavigation = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAdminOrGestor = profile?.is_admin === true || (profile as any)?.role_info?.name === 'gestor'
        return navigation.filter(item => {
            if (item.adminOnly && !isAdminOrGestor) return false
            if (item.productsOnly && !item.productsOnly.includes(currentProduct)) return false
            return true
        })
    }, [currentProduct, profile])

    const userInitials = session?.user?.email?.substring(0, 2).toUpperCase() || 'U'
    const userName = session?.user?.email?.split('@')[0] || 'Usuário'

    return (
        <aside
            className={cn(
                "flex h-screen flex-col bg-primary-dark text-white shadow-lg transition-all duration-300 ease-in-out",
                isExpanded ? "w-64" : "w-16"
            )}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Header */}
            <div className={cn(
                "flex items-center justify-center transition-all duration-300",
                isExpanded ? "h-20 px-3" : "h-16 px-1"
            )}>
                <img
                    src={isExpanded ? "/logo-dark.png" : "/icon-light.png"}
                    alt="TARS"
                    className={cn(
                        "object-contain transition-all duration-300",
                        isExpanded ? "w-full max-w-[180px]" : "w-10 h-10 brightness-0 invert"
                    )}
                />
            </div>

            {/* Global Product Switcher - Always visible, adapts to collapsed state */}
            <div className={cn(
                "mb-2 transition-all duration-200",
                isExpanded ? "px-3" : "px-3 flex justify-center"
            )}>
                <ProductSwitcher isCollapsed={!isExpanded} />
            </div>

            <nav className="flex-1 space-y-1 px-2 py-4">
                {filteredNavigation.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')

                    return (
                        <Link
                            key={item.name}
                            to={item.href}
                            title={!isExpanded ? item.name : undefined}
                            className={cn(
                                "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-primary text-white shadow-sm"
                                    : "text-primary-light hover:bg-primary hover:text-white"
                            )}
                        >
                            <Icon className={cn(
                                "h-5 w-5 flex-shrink-0 transition-colors",
                                isActive ? "text-white" : "text-primary-light group-hover:text-white"
                            )} />
                            <span className={cn(
                                "ml-3 whitespace-nowrap transition-opacity duration-200",
                                isExpanded ? "opacity-100" : "opacity-0 w-0"
                            )}>
                                {item.name}
                            </span>
                            {item.name === 'Agenda' && !!todayCount && todayCount > 0 && (
                                <span className={cn(
                                    "ml-auto flex-shrink-0 bg-purple-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center transition-opacity duration-200",
                                    isExpanded ? "opacity-100" : "opacity-0"
                                )}>
                                    {todayCount}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Push notification CTA — navigates to settings, disappears when activated */}
            {showPushCta && (
                <div className="px-2 pb-2">
                    <button
                        onClick={() => navigate('/settings/profile?tab=notifications')}
                        title={!isExpanded ? 'Ativar Notificações' : undefined}
                        className={cn(
                            "w-full flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200"
                        )}
                    >
                        <div className="relative flex-shrink-0">
                            <BellRing className="h-5 w-5" />
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                        </div>
                        <span className={cn(
                            "ml-3 whitespace-nowrap transition-opacity duration-200",
                            isExpanded ? "opacity-100" : "opacity-0 w-0"
                        )}>
                            Ativar Notificações
                        </span>
                    </button>
                </div>
            )}

            {/* User section */}
            <div className="border-t border-primary/20 p-2">
                <div className={cn(
                    "flex items-center gap-3 rounded-lg bg-primary/10 px-2 py-2",
                    isExpanded ? "" : "justify-center"
                )}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-white flex-shrink-0">
                        {userInitials}
                    </div>
                    {isExpanded && (
                        <>
                            <div className="flex flex-1 flex-col overflow-hidden">
                                <span className="text-sm font-medium text-white truncate capitalize">{userName}</span>
                                <span className="text-xs text-primary-light truncate">{session?.user?.email}</span>
                            </div>
                            <NotificationCenter triggerClassName="text-primary-light hover:text-white hover:bg-primary/20" />
                            <button
                                onClick={() => signOut()}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-light hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                title="Sair"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Expand indicator when collapsed */}
            {!isExpanded && (
                <div className="absolute top-1/2 right-0 transform -translate-y-1/2 translate-x-1/2 bg-primary rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="h-3 w-3 text-white" />
                </div>
            )}
        </aside>
    )
}
