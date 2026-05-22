import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Kanban,
  Users,
  Settings,
  FileText,
  ChevronRight,
  User,
  BarChart3,
  LogOut,
  Database,
  Calendar,
  CheckSquare,
  Gift,
  Shield,
  MapPin,
  Building2,
  Target,
  Smile,
  Heart,
  LibraryBig,
  type LucideIcon,
} from "lucide-react";
import { BellConciergeIcon } from "../icons/BellConciergeIcon";
import { cn } from "../../lib/utils";
import { OrgSwitcher } from "./OrgSwitcher";
import { useAuth } from "../../contexts/AuthContext";
import { useOrg } from "../../contexts/OrgContext";
import { usePlatformAdmin } from "../../hooks/usePlatformAdmin";
import { useTodayMeetingCount } from "../../hooks/calendar/useTodayMeetingCount";

const navigation: {
  name: string;
  href: string;
  icon: LucideIcon;
  orgsOnly?: string[];
  adminOnly?: boolean;
  phases?: string[];
  roles?: string[];
}[] = [
  { name: "Funil", href: "/pipeline", icon: Kanban },
  { name: "Gestão de Leads", href: "/leads", icon: Database },
  { name: "Propostas", href: "/proposals", icon: FileText },
  { name: "Catálogo", href: "/catalogo", icon: LibraryBig },
  {
    name: "Viagens",
    href: "/viagens",
    icon: MapPin,
    orgsOnly: ["welcome-trips"],
  },
  { name: "Grupos", href: "/groups", icon: Users, orgsOnly: ["welcome-trips"] },
  { name: "Contatos", href: "/people", icon: User },
  {
    name: "Empresas",
    href: "/empresas",
    icon: Building2,
    orgsOnly: ["welcome-corporativo"],
  },
  { name: "Tarefas", href: "/tasks", icon: CheckSquare },
  { name: "Agenda", href: "/calendar", icon: Calendar },
  {
    name: "Concierge",
    href: "/concierge",
    icon: BellConciergeIcon as unknown as LucideIcon,
  },
  { name: "Presentes", href: "/presentes", icon: Gift, roles: ["pos_venda"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "NPS", href: "/nps", icon: Smile },
  {
    name: "Pontuações SDR",
    href: "/sdr/pontuacoes",
    icon: Target,
    orgsOnly: ["welcome-weddings"],
  },
  {
    name: "Convidados",
    href: "/convidados",
    icon: Heart,
    orgsOnly: ["welcome-weddings"],
  },
  { name: "Configurações", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { session, signOut, profile } = useAuth();
  const { org } = useOrg();
  const isPlatformAdmin = usePlatformAdmin();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMouseInside, setIsMouseInside] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);
  // Set de URLs de logo que falharam ao carregar — derivado por URL, não precisa reset
  const [failedLogoUrls, setFailedLogoUrls] = useState<Set<string>>(new Set());
  const logoFailed = org?.logo_url ? failedLogoUrls.has(org.logo_url) : false;
  const { data: todayCount } = useTodayMeetingCount();

  // Persist last visited route for restoring on return
  useEffect(() => {
    if (location.pathname !== "/login") {
      localStorage.setItem("welcomecrm-last-route", location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current)
        window.clearTimeout(collapseTimerRef.current);
    };
  }, []);

  // Decide expansão de forma derivada: aberto se mouse dentro OU popover aberto.
  // Quando ambos ficam falsos, agenda colapso com 150ms de debounce.
  useEffect(() => {
    const shouldBeOpen = isMouseInside || isPopoverOpen;
    if (shouldBeOpen) {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      setIsExpanded(true);
      return;
    }
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      collapseTimerRef.current = null;
    }, 150);
  }, [isMouseInside, isPopoverOpen]);

  const handleMouseEnter = () => setIsMouseInside(true);
  const handleMouseLeave = () => setIsMouseInside(false);

  const filteredNavigation = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isAdminOrGestor =
      profile?.is_admin === true ||
      ["gestor", "manager"].includes((profile as any)?.role_info?.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phaseSlug = (profile as any)?.team?.phase?.slug as string | undefined;
    const profileRole = profile?.role as string | undefined;
    return navigation.filter((item) => {
      if (item.adminOnly && !isAdminOrGestor) return false;
      if (item.phases) {
        const hasPhaseAccess = phaseSlug && item.phases.includes(phaseSlug);
        if (!isAdminOrGestor && !hasPhaseAccess) return false;
      }
      if (item.roles) {
        const hasRoleAccess = profileRole && item.roles.includes(profileRole);
        if (!isAdminOrGestor && !hasRoleAccess) return false;
      }
      if (item.orgsOnly && org?.slug && !item.orgsOnly.includes(org.slug))
        return false;
      return true;
    });
  }, [org, profile]);

  const userInitials =
    session?.user?.email?.substring(0, 2).toUpperCase() || "U";
  const userName = session?.user?.email?.split("@")[0] || "Usuário";

  return (
    <aside
      className={cn(
        "group flex h-screen flex-col bg-primary-dark text-white shadow-lg transition-[width] duration-200 ease-out will-change-[width]",
        isExpanded ? "w-64" : "w-16",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header — logo da org se existir, senão fallback WelcomeCRM */}
      <div
        className={cn(
          "relative flex items-center justify-center px-2 overflow-hidden transition-[height] duration-200 ease-out",
          isExpanded ? "h-24" : "h-20",
        )}
      >
        {org?.logo_url && !logoFailed ? (
          <img
            src={org.logo_url}
            alt={org.name}
            className={cn(
              "object-contain transition-[max-width,max-height] duration-200 ease-out",
              isExpanded ? "max-h-20 max-w-[224px]" : "max-h-10 max-w-10",
            )}
            onError={() => {
              if (org?.logo_url) {
                setFailedLogoUrls((prev) => {
                  const next = new Set(prev);
                  next.add(org.logo_url!);
                  return next;
                });
              }
            }}
          />
        ) : (
          <>
            <img
              src="/icon-light.png"
              alt={org?.name ?? "WelcomeCRM"}
              className={cn(
                "absolute h-10 w-10 object-contain brightness-0 invert transition-opacity duration-200",
                isExpanded ? "opacity-0" : "opacity-100",
              )}
            />
            <img
              src="/logo-dark.png"
              alt={org?.name ?? "WelcomeCRM"}
              className={cn(
                "absolute h-25 max-w-[224px] object-contain transition-opacity duration-200",
                isExpanded ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        )}
      </div>

      {/* Global Product Switcher - Always visible, adapts to collapsed state */}
      <div
        className={cn(
          "mb-2 transition-all duration-200",
          isExpanded ? "px-3" : "px-3 flex justify-center",
        )}
      >
        <OrgSwitcher
          isCollapsed={!isExpanded}
          onOpenChange={setIsPopoverOpen}
        />
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.href ||
            location.pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              to={item.href}
              title={!isExpanded ? item.name : undefined}
              className={cn(
                "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "text-primary-light hover:bg-primary hover:text-white",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 flex-shrink-0 transition-colors",
                  isActive
                    ? "text-white"
                    : "text-primary-light group-hover:text-white",
                )}
              />
              <span
                className={cn(
                  "ml-3 whitespace-nowrap transition-opacity duration-200",
                  isExpanded ? "opacity-100" : "opacity-0 w-0",
                )}
              >
                {item.name}
              </span>
              {item.name === "Agenda" && !!todayCount && todayCount > 0 && (
                <span
                  className={cn(
                    "ml-auto flex-shrink-0 bg-purple-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center transition-opacity duration-200",
                    isExpanded ? "opacity-100" : "opacity-0",
                  )}
                >
                  {todayCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Platform Admin — só aparece para donos do SaaS */}
      {isPlatformAdmin && (
        <div className="border-t border-primary/20 p-2">
          <Link
            to="/platform"
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
              "text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200",
              isExpanded ? "" : "justify-center",
            )}
            title={isExpanded ? undefined : "Platform Admin"}
          >
            <Shield className="h-4 w-4 flex-shrink-0" />
            {isExpanded && <span className="truncate">Platform Admin</span>}
          </Link>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-primary/20 p-2">
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg bg-primary/10 px-2 py-2",
            isExpanded ? "" : "justify-center",
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-white flex-shrink-0">
            {userInitials}
          </div>
          {isExpanded && (
            <>
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="text-sm font-medium text-white truncate capitalize">
                  {userName}
                </span>
                <span className="text-xs text-primary-light truncate">
                  {session?.user?.email}
                </span>
              </div>
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
  );
}
