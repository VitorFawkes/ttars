import { NavLink } from 'react-router-dom';
import {
    User,
    Database,
    Kanban,
    LayoutList,
    Tags,
    Webhook,
    Activity,
    Users as UsersIcon,
    MessageSquare,
    Trash2,
    Archive,
    FileCheck,
    ChevronDown,
    Palette,
    GitBranch,
    Wrench,
    Layers,
    Code,
    XCircle,
    Zap,
    Eye,
    Bell,
    AlertTriangle,
    Bot,
    Clock,
    BookOpen,
    BarChart3,
    Send,
    FileSpreadsheet,
    Upload,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { useState } from 'react';

// Reusable NavItem component
function NavItem({ to, icon: Icon, label, badge }: {
    to: string;
    icon: React.ElementType;
    label: string;
    badge?: number;
}) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            {({ isActive }) => (
                <>
                    <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                        </Badge>
                    )}
                </>
            )}
        </NavLink>
    );
}

// Collapsible Section component
function NavSection({ title, icon: Icon, children, defaultOpen = false }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
                <Icon className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">{title}</span>
                <ChevronDown className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    isOpen ? "rotate-180" : ""
                )} />
            </button>
            {isOpen && (
                <div className="space-y-0.5 mt-1">
                    {children}
                </div>
            )}
        </div>
    );
}

export default function SettingsSidebar() {
    const { profile } = useAuth();
    const { org } = useOrg();
    const isAdmin = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isWorkspaceAdmin = profile?.is_admin === true || (profile as any)?.role_info?.name === 'gestor';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phaseSlug = (profile as any)?.team?.phase?.slug as string | undefined;
    const isTrips = org?.slug === 'welcome-trips';
    const showVendasMonde = isTrips && isWorkspaceAdmin;
    const showImportPosVenda = isWorkspaceAdmin || phaseSlug === 'pos_venda';

    // Fetch blocked integration events count
    const { data: blockedCount = 0 } = useQuery({
        queryKey: ['integration-blocked-count'],
        queryFn: async () => {
            const { count } = await supabase
                .from('integration_events')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'blocked');
            return count || 0;
        },
        refetchInterval: 60000
    });

    return (
        <aside className="w-64 flex flex-col h-full border-r border-border bg-background">
            {/* Header */}
            <div className="px-6 py-8">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Configurações</h2>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 space-y-6">
                {/* Perfil */}
                <div className="space-y-0.5">
                    <NavItem to="/settings/profile" icon={User} label="Meu Perfil" />
                </div>

                {isAdmin && (
                    <>
                        {/* ═══════════════════════════════════════════════════════════
                            CUSTOMIZATION: Data Rules & Requirements
                        ═══════════════════════════════════════════════════════════ */}
                        <NavSection title="Personalização" icon={Palette} defaultOpen={true}>
                            <NavItem to="/settings/customization/data-rules" icon={Database} label="Regras de Dados" />
                            <NavItem to="/settings/customization/sections" icon={Layers} label="Seções" />
                            <NavItem to="/settings/customization/action-requirements" icon={FileCheck} label="Requisitos de Ação" />
                            <NavItem to="/settings/automations" icon={Zap} label="Automações" />
                            <NavItem to="/settings/automacoes/templates" icon={MessageSquare} label="Templates de Mensagem" />
                            <NavItem to="/settings/ai-agents" icon={Bot} label="Agentes IA" />
                            <NavItem to="/settings/ai-agents/conversations" icon={MessageSquare} label="Conversas IA" />
                            <NavItem to="/settings/ai-skills" icon={Wrench} label="Ferramentas IA" />
                            <NavItem to="/settings/ai-knowledge-bases" icon={BookOpen} label="Bases de Conhecimento" />
                            <NavItem to="/settings/ai-agents/analytics" icon={BarChart3} label="Analytics IA" />
                            <NavItem to="/settings/ai-agents/outbound-queue" icon={Send} label="Fila de Envios" />
                            <NavItem to="/settings/customization/notifications" icon={Bell} label="Notificações da empresa" />
                            <NavItem to="/settings/customization/alert-rules" icon={AlertTriangle} label="Alertas de Cards" />
                            <NavItem to="/settings/customization/categories" icon={Tags} label="Categorias" />
                            <NavItem to="/settings/customization/loss-reasons" icon={XCircle} label="Motivos de Perda" />
                            <NavItem to="/settings/customization/tags" icon={Tags} label="Tags de Cards" />
                        </NavSection>

                        {/* ═══════════════════════════════════════════════════════════
                            PIPELINE: Funnel Structure
                        ═══════════════════════════════════════════════════════════ */}
                        <NavSection title="Pipeline" icon={GitBranch} defaultOpen={true}>
                            <NavItem to="/settings/pipeline/structure" icon={Kanban} label="Estrutura do Funil" />
                            <NavItem to="/settings/pipeline/card-display" icon={LayoutList} label="Exibição de Cards" />
                        </NavSection>

                        {/* ═══════════════════════════════════════════════════════════
                            INTEGRATIONS: External Connections
                        ═══════════════════════════════════════════════════════════ */}
                        <NavSection title="Conexões" icon={Webhook}>
                            <NavItem to="/settings/integrations" icon={Webhook} label="Integrações" badge={blockedCount} />
                            <NavItem to="/settings/workspace/whatsapp" icon={MessageSquare} label="WhatsApp" />
                            <NavItem to="/settings/developer-platform" icon={Code} label="Developer Platform" />
                        </NavSection>

                        {/* ═══════════════════════════════════════════════════════════
                            TEAM: Users, Roles, Teams
                        ═══════════════════════════════════════════════════════════ */}
                        <NavSection title="Time" icon={UsersIcon}>
                            <NavItem to="/settings/team/members" icon={UsersIcon} label="Membros da Equipe" />
                            <NavItem to="/settings/team/phase-visibility" icon={Eye} label="Visibilidade de Fases" />
                        </NavSection>

                        {/* ═══════════════════════════════════════════════════════════
                            OPERATIONS: Maintenance & Health
                        ═══════════════════════════════════════════════════════════ */}
                        <NavSection title="Operações" icon={Wrench}>
                            <NavItem to="/settings/operations/health" icon={Activity} label="Saúde do Sistema" />
                            <NavItem to="/settings/operations/scheduled-jobs" icon={Clock} label="Processos Agendados" />
                            <NavItem to="/reactivation" icon={Sparkles} label="Reativação" />
                            {showVendasMonde && (
                                <NavItem to="/vendas-monde" icon={FileSpreadsheet} label="Vendas Monde" />
                            )}
                            {showImportPosVenda && (
                                <NavItem to="/importacao-pos-venda" icon={Upload} label="Import. Pós-Venda" />
                            )}
                            <NavItem to="/settings/operations/archive" icon={Archive} label="Arquivados" />
                            <NavItem to="/settings/operations/trash" icon={Trash2} label="Lixeira" />
                        </NavSection>
                    </>
                )}
            </nav>
        </aside>
    );
}
