/**
 * Patricia Redesign — Master Layout
 *
 * Substitui: AiAgentV2DetailPage.tsx + AgentEditorLayout.tsx (combinados)
 *
 * Mudanças vs hoje:
 *  - 3 colunas: nav agrupada | conteúdo | context panel
 *  - Nav agrupada em 5 grupos colapsáveis (vs lista plana de 19)
 *  - Stats migra pro context panel (vs banner topo)
 *  - PhoneLines vai pra aba Ativação (vs banner topo)
 *  - AlertBar global padronizada (substitui banner laranja n8n)
 *  - Footer sticky com Save + indicador dirty
 *  - Toggle v3/v1 e Clássico/Playbook removidos do header
 *  - max-w aumenta de 6xl → screen-2xl
 *
 * Tipografia: display Geist, body Inter, mono Geist Mono.
 * Cores: slate neutra + indigo brand + acentos semânticos.
 *
 * Este é um PROTÓTIPO de referência. Imports apontam pros componentes UI
 * reais do projeto; quando a aplicação real for feita, este arquivo é a
 * fonte visual.
 */

import { useState, type ReactNode } from 'react'
import {
  ArrowLeft, ChevronDown, Save, Circle,
  Bot, MessageCircle, BookOpen,
  Settings, Wrench, Lightbulb, Zap,
  Database, Radio, ImageIcon, Sparkles,
  Power, Handshake, Megaphone,
  Stethoscope, PlayCircle, ShieldAlert,
  MessageSquare, BarChart3, Phone,
  AlertTriangle, Info, XCircle, X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────────────────────────

type TabId =
  | 'identidade' | 'modo' | 'playbook'
  | 'regras' | 'ferramentas' | 'decisoes' | 'cenarios'
  | 'conhecimento' | 'contexto' | 'memoria' | 'multimodal' | 'prompts'
  | 'ativacao' | 'handoff' | 'anuncios'
  | 'saude' | 'teste' | 'validador'

interface NavItemDef {
  id: TabId
  label: string
  icon: LucideIcon
  badge?: { tone: 'warning' | 'info'; text: string }
  /** Mostra só em legado (v3=off ou playbook=off) */
  legacyOnly?: boolean
}

interface NavGroupDef {
  id: string
  label: string
  items: NavItemDef[]
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'persona',
    label: 'Persona',
    items: [
      { id: 'identidade', label: 'Identidade', icon: Bot },
      { id: 'modo', label: 'Modo de interação', icon: MessageCircle },
      { id: 'playbook', label: 'Playbook', icon: BookOpen },
    ],
  },
  {
    id: 'comportamento',
    label: 'Comportamento',
    items: [
      { id: 'regras', label: 'Regras de negócio', icon: Settings },
      { id: 'ferramentas', label: 'Ferramentas', icon: Wrench },
      { id: 'decisoes', label: 'Decisões', icon: Lightbulb },
      { id: 'cenarios', label: 'Cenários', icon: Zap, legacyOnly: true },
    ],
  },
  {
    id: 'conhecimento',
    label: 'Conhecimento',
    items: [
      { id: 'conhecimento', label: 'Base de conhecimento', icon: Database },
      { id: 'contexto', label: 'Contexto & campos', icon: Radio },
      { id: 'memoria', label: 'Memória', icon: Database },
      { id: 'multimodal', label: 'Multimodal', icon: ImageIcon },
      { id: 'prompts', label: 'Prompts', icon: Sparkles, legacyOnly: true },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { id: 'ativacao', label: 'Ativação & linhas', icon: Power },
      { id: 'handoff', label: 'Handoff', icon: Handshake },
      { id: 'anuncios', label: 'Disparos', icon: Megaphone },
    ],
  },
  {
    id: 'diagnostico',
    label: 'Diagnóstico',
    items: [
      { id: 'saude', label: 'Saúde', icon: Stethoscope, badge: { tone: 'warning', text: '2' } },
      { id: 'teste', label: 'Teste ao vivo', icon: PlayCircle },
      { id: 'validador', label: 'Validador', icon: ShieldAlert, legacyOnly: true },
    ],
  },
]

interface MasterLayoutProps {
  agentName: string
  agentPersona?: string
  isActive: boolean
  activeTab: TabId
  onTabChange: (id: TabId) => void
  dirty: boolean
  onSave: () => void
  saving?: boolean
  legacyMode?: boolean
  children: ReactNode
  /** stats opcionais — mostram "—" se ausentes */
  stats?: {
    conversations7d?: number
    resolutionRate?: number
    escalationRate?: number
    avgTurns?: number
  }
  phoneLineCount?: number
  isN8n?: boolean
  alerts?: AlertDef[]
}

// ─────────────────────────────────────────────────────────────────────────────
//  Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function PatriciaMasterLayout({
  agentName, agentPersona, isActive, activeTab, onTabChange,
  dirty, onSave, saving, legacyMode = false,
  children, stats, phoneLineCount = 0, isN8n, alerts = [],
}: MasterLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 font-body text-slate-900 antialiased">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-10 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" className="-ml-2 text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              'w-2 h-2 rounded-full transition-colors',
              isActive ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-slate-300',
            )} />
            <div className="min-w-0">
              <h1 className="font-display text-[15px] font-medium text-slate-900 tracking-tight truncate">
                {agentName || 'Agente sem nome'}
              </h1>
              {agentPersona && (
                <p className="text-[11px] text-slate-500 truncate -mt-0.5">{agentPersona}</p>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {dirty && (
              <span className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium">
                <Circle className="w-1.5 h-1.5 fill-amber-500 stroke-amber-500" />
                Alterações não salvas
              </span>
            )}
            <Button
              onClick={onSave}
              disabled={saving || !dirty}
              size="sm"
              className="gap-1.5 font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* AlertBar global */}
        {(isN8n || alerts.length > 0) && (
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-10 pb-3 space-y-1.5">
            {isN8n && (
              <AlertBar
                tone="info"
                title="Este agente executa no n8n"
                description="Prompts e modelos moram no workflow. Aqui você edita identidade, ativação e handoff."
                action={{ label: 'Abrir workflow', href: 'https://n8n-n8n.ymnmx7.easypanel.host' }}
              />
            )}
            {alerts.map(a => <AlertBar key={a.id} {...a} />)}
          </div>
        )}
      </header>

      {/* ── Body: 3 columns ────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-10 py-6">
        <div className="grid grid-cols-12 gap-6">

          {/* Coluna 1: NAV agrupada ─────────────────────────────────────── */}
          <nav
            className="col-span-12 lg:col-span-3 xl:col-span-2"
            aria-label="Configurações do agente"
          >
            <div className="sticky top-[88px] space-y-5">
              {NAV_GROUPS.map(group => (
                <NavGroup
                  key={group.id}
                  group={group}
                  activeTab={activeTab}
                  onTabChange={onTabChange}
                  showLegacy={legacyMode}
                />
              ))}

              {!legacyMode && (
                <p className="text-[10px] text-slate-400 px-3 pt-2">
                  3 abas legadas estão ocultas.
                  <button className="text-indigo-600 hover:underline ml-1">Mostrar</button>
                </p>
              )}
            </div>
          </nav>

          {/* Coluna 2: CONTEÚDO ─────────────────────────────────────────── */}
          <main className="col-span-12 lg:col-span-9 xl:col-span-7 min-w-0">
            {children}
          </main>

          {/* Coluna 3: CONTEXT PANEL ────────────────────────────────────── */}
          <aside className="hidden xl:block xl:col-span-3">
            <div className="sticky top-[88px]">
              <ContextPanel
                isActive={isActive}
                stats={stats}
                phoneLineCount={phoneLineCount}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  NavGroup — grupo colapsável
// ─────────────────────────────────────────────────────────────────────────────

function NavGroup({
  group, activeTab, onTabChange, showLegacy,
}: {
  group: NavGroupDef
  activeTab: TabId
  onTabChange: (id: TabId) => void
  showLegacy: boolean
}) {
  const visibleItems = group.items.filter(i => showLegacy || !i.legacyOnly)
  const hasActive = visibleItems.some(i => i.id === activeTab)
  const [open, setOpen] = useState(hasActive)

  if (visibleItems.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {visibleItems.map(item => (
            <NavItem
              key={item.id}
              item={item}
              active={item.id === activeTab}
              onClick={() => onTabChange(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NavItem({
  item, active, onClick,
}: {
  item: NavItemDef
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] text-left transition-all duration-150 group',
        active
          ? 'bg-indigo-50 text-indigo-700 font-medium shadow-[inset_2px_0_0_rgb(79,70,229)]'
          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
      )}
    >
      <Icon className={cn(
        'w-3.5 h-3.5 transition-colors',
        active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-500',
      )} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && <NavBadge tone={item.badge.tone}>{item.badge.text}</NavBadge>}
    </button>
  )
}

function NavBadge({ tone, children }: { tone: 'warning' | 'info'; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none',
      tone === 'warning' && 'bg-amber-100 text-amber-700',
      tone === 'info' && 'bg-indigo-100 text-indigo-700',
    )}>
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Context Panel (lateral direita)
// ─────────────────────────────────────────────────────────────────────────────

function ContextPanel({
  isActive, stats, phoneLineCount,
}: {
  isActive: boolean
  stats?: MasterLayoutProps['stats']
  phoneLineCount: number
}) {
  return (
    <div className="space-y-4">

      {/* Status card */}
      <section className="bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2.5 border-b border-slate-100">
          <span className={cn(
            'w-2 h-2 rounded-full',
            isActive ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-slate-300',
          )} />
          <span className="text-[12px] font-medium text-slate-900">
            {isActive ? 'Respondendo clientes' : 'Pausada'}
          </span>
        </div>

        {phoneLineCount > 0 ? (
          <button className="w-full px-4 py-2.5 flex items-center gap-2 text-[12px] text-slate-600 hover:bg-slate-50 transition-colors text-left">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span className="flex-1">{phoneLineCount} linha{phoneLineCount > 1 ? 's' : ''} WhatsApp</span>
            <span className="text-[10px] text-indigo-600 font-medium">configurar →</span>
          </button>
        ) : (
          <div className="px-4 py-2.5 text-[12px] text-slate-400 italic flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" />
            Nenhuma linha conectada
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.06em] font-semibold text-slate-500">
            Métricas 30 dias
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">ao vivo</span>
        </header>

        <div className="divide-y divide-slate-100">
          <ContextStat label="Conversas (7d)" value={stats?.conversations7d} />
          <ContextStat label="Resolução" value={stats?.resolutionRate} format="percent" />
          <ContextStat label="Escalação" value={stats?.escalationRate} format="percent" emphasis="warning" />
          <ContextStat label="Média de turnos" value={stats?.avgTurns} format="decimal" />
        </div>

        <div className="px-4 py-2.5 bg-slate-50/60 grid grid-cols-2 gap-2 border-t border-slate-100">
          <ContextShortcut icon={MessageSquare} label="Conversas" />
          <ContextShortcut icon={BarChart3} label="Analytics" />
        </div>
      </section>

      <p className="px-1 text-[10px] text-slate-400 leading-relaxed">
        Atualiza a cada 30s. Métricas calculadas em <span className="font-mono">ai_agent_metrics</span>.
      </p>
    </div>
  )
}

function ContextStat({
  label, value, format = 'integer', emphasis,
}: {
  label: string
  value?: number | null
  format?: 'integer' | 'percent' | 'decimal'
  emphasis?: 'warning' | 'success'
}) {
  const formatted = value == null
    ? null
    : format === 'percent' ? `${Math.round(value * 100)}%`
    : format === 'decimal' ? value.toFixed(1)
    : value.toString()

  return (
    <div className="px-4 py-2.5 flex items-baseline justify-between">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className={cn(
        'font-display text-[15px] font-medium tabular-nums tracking-tight',
        formatted == null ? 'text-slate-300' : 'text-slate-900',
        emphasis === 'warning' && formatted && 'text-amber-700',
        emphasis === 'success' && formatted && 'text-emerald-700',
      )}>
        {formatted ?? '—'}
      </span>
    </div>
  )
}

function ContextShortcut({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors">
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  AlertBar
// ─────────────────────────────────────────────────────────────────────────────

interface AlertDef {
  id: string
  tone: 'info' | 'warning' | 'critical'
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  dismissible?: boolean
}

const ALERT_ICON: Record<AlertDef['tone'], LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
}

const ALERT_TONE: Record<AlertDef['tone'], string> = {
  info: 'bg-indigo-50/70 border-indigo-200/80 text-indigo-900',
  warning: 'bg-amber-50/70 border-amber-200/80 text-amber-900',
  critical: 'bg-rose-50/70 border-rose-200/80 text-rose-900',
}

const ALERT_ICON_TONE: Record<AlertDef['tone'], string> = {
  info: 'text-indigo-600',
  warning: 'text-amber-600',
  critical: 'text-rose-600',
}

export function AlertBar({
  tone, title, description, action, dismissible,
}: Omit<AlertDef, 'id'>) {
  const Icon = ALERT_ICON[tone]
  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-2.5 rounded-lg border text-[12px]',
      ALERT_TONE[tone],
    )}>
      <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', ALERT_ICON_TONE[tone])} />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        {description && <p className="text-[11px] opacity-80 mt-0.5">{description}</p>}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[11px] font-semibold underline underline-offset-2 hover:no-underline"
        >
          {action.label} →
        </button>
      )}
      {dismissible && (
        <button className="opacity-50 hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  TabFrame — embrulha qualquer aba com header + body padrão
// ─────────────────────────────────────────────────────────────────────────────

export function TabFrame({
  title, description, actions, children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6 pb-1">
        <div>
          <h2 className="font-display text-[22px] font-medium tracking-tight text-slate-900">
            {title}
          </h2>
          {description && (
            <p className="text-[13px] text-slate-500 mt-1 max-w-prose leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Demo / story
// ─────────────────────────────────────────────────────────────────────────────

export function PatriciaMasterLayoutDemo() {
  const [activeTab, setActiveTab] = useState<TabId>('identidade')
  const [dirty, setDirty] = useState(false)

  return (
    <PatriciaMasterLayout
      agentName="Patricia"
      agentPersona="SDR Welcome Weddings — qualifica noivos e agenda Wedding Planner"
      isActive={true}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      dirty={dirty}
      onSave={() => setDirty(false)}
      phoneLineCount={3}
      isN8n={false}
      stats={{
        conversations7d: 142,
        resolutionRate: 0.78,
        escalationRate: 0.14,
        avgTurns: 8.3,
      }}
      alerts={[
        {
          id: 'test-mode',
          tone: 'warning',
          title: 'Patricia em modo de teste',
          description: 'Só responde para o número 5511964293533. Whitelist em Diagnóstico → Saúde.',
          action: { label: 'Gerenciar' },
        },
      ]}
    >
      <TabFrame
        title="Identidade"
        description="Como Patricia se apresenta, qual o tom dela e se está respondendo."
        actions={<Button variant="outline" size="sm">Pré-visualizar</Button>}
      >
        <div className="bg-white border border-slate-200/80 rounded-xl p-6 text-[13px] text-slate-500 italic">
          [aba de exemplo — ver 02-TabIdentidade.tsx]
        </div>
      </TabFrame>
    </PatriciaMasterLayout>
  )
}
