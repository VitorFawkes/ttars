import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft,
  Loader2,
  Users,
  CreditCard,
  Building2,
  Pause,
  Play,
  Shield,
  LogIn,
  Plus,
  Users2,
} from 'lucide-react'
import { usePlatformOrgDetail } from '../../hooks/usePlatformData'
import { StatusBadge } from './DashboardPage'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { AddWorkspaceDialog } from '../../components/platform/AddWorkspaceDialog'
import { InviteAdminDialog } from '../../components/platform/InviteAdminDialog'
import { OrgUsersSection } from '../../components/platform/OrgUsersSection'

// Cast até types regenerados pós-promoção. Ver usePlatformData.ts para contexto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { detail, loading, error, refetch, addWorkspace, inviteAdmin, setSharingFlag } = usePlatformOrgDetail(
    id ?? null
  )
  const [showAddWorkspace, setShowAddWorkspace] = useState(false)
  const [showInviteAdmin, setShowInviteAdmin] = useState(false)
  const [togglingSharing, setTogglingSharing] = useState(false)

  const handleSuspend = async () => {
    if (!id || !detail) return
    const isWorkspace = !!(detail.parent as unknown as { id: string } | null)
    const suspendMessage = isWorkspace
      ? 'Suspender apenas este workspace (o tenant continuará ativo)'
      : 'Suspender o tenant E todas as workspaces filhas'
    const confirmed = window.confirm(
      `${suspendMessage}?\n\nMotivo (será salvo no audit log):`
    )
    if (!confirmed) return

    const reason = window.prompt('Motivo (opcional):') ?? ''
    const { error: rpcError } = await db.rpc('platform_suspend_organization', {
      p_org_id: id,
      p_reason: reason.trim() || null,
    })
    if (rpcError) {
      toast({ title: 'Erro ao suspender', description: rpcError.message, type: 'error' })
      return
    }
    toast({
      title: 'Organização suspensa',
      description: suspendMessage,
      type: 'success',
    })
    await refetch()
  }

  const handleResume = async () => {
    if (!id) return
    const { error: rpcError } = await db.rpc('platform_resume_organization', { p_org_id: id })
    if (rpcError) {
      toast({ title: 'Erro ao reativar', description: rpcError.message, type: 'error' })
      return
    }
    toast({ title: 'Organização reativada', type: 'success' })
    await refetch()
  }

  const handleImpersonate = async () => {
    if (!id) return
    const orgName = (detail?.organization as { name?: string } | undefined)?.name ?? 'esta org'
    if (!window.confirm(`Entrar como admin de ${orgName}? Todas as ações ficarão registradas.`)) return
    const { error: rpcError } = await db.rpc('platform_impersonate_org', { p_org_id: id })
    if (rpcError) {
      toast({ title: 'Erro ao impersonar', description: rpcError.message, type: 'error' })
      return
    }
    // refreshSession para pegar novo JWT com impersonating_org_id como active org.
    // Se refresh falha (sessão inválida), forçar logout/login manual.
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) {
      toast({
        title: 'Impersonate ativado — faça login novamente',
        description: 'Sessão precisa ser renovada',
        type: 'info',
      })
      await supabase.auth.signOut()
      window.location.href = '/login'
      return
    }
    toast({ title: `Impersonando ${orgName}`, type: 'success' })
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate('/platform/organizations')}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error ?? 'Organização não encontrada'}
        </div>
      </div>
    )
  }

  const org = detail.organization as {
    id: string
    name: string
    slug: string
    status: string
    logo_url?: string | null
    created_at: string
    suspended_at?: string | null
    suspended_reason?: string | null
    shares_contacts_with_children?: boolean | null
    parent_org_id?: string | null
  }

  const isAccount = !detail.parent
  const sharingEnabled = !!org.shares_contacts_with_children

  const handleToggleSharing = async () => {
    const willEnable = !sharingEnabled
    const msg = willEnable
      ? `Ligar compartilhamento de contatos, destinos e catálogos entre os workspaces de ${org.name}?\n\nTodos os contatos migrados passarão a ser visíveis nos ${detail.workspaces.length} workspaces. Reversível.`
      : `Desligar compartilhamento? Cada workspace de ${org.name} passará a enxergar apenas os próprios contatos (os já cadastrados na account pai ficam inacessíveis aos workspaces).`
    if (!window.confirm(msg)) return
    setTogglingSharing(true)
    try {
      await setSharingFlag(willEnable)
      toast({
        title: willEnable ? 'Compartilhamento ligado' : 'Compartilhamento desligado',
        type: 'success',
      })
    } catch (err) {
      toast({
        title: 'Erro ao alterar flag',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
    } finally {
      setTogglingSharing(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link
        to="/platform/organizations"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Organizações
      </Link>

      <header className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-indigo-100 flex items-center justify-center overflow-hidden">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-6 w-6 text-indigo-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{org.name}</h1>
              <StatusBadge status={org.status} />
            </div>
            <div className="text-sm text-slate-500 mt-1">
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">{org.slug}</code>
              <span className="mx-2">•</span>
              Criada em {new Date(org.created_at).toLocaleDateString('pt-BR')}
            </div>
            {org.status === 'suspended' && org.suspended_reason && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2 inline-block">
                Motivo: {org.suspended_reason}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {org.status === 'active' && (
            <Button variant="outline" size="sm" onClick={handleImpersonate}>
              <LogIn className="w-4 h-4 mr-1.5" /> Impersonar
            </Button>
          )}
          {org.status === 'active' ? (
            <Button variant="outline" size="sm" onClick={handleSuspend}>
              <Pause className="w-4 h-4 mr-1.5" /> Suspender
            </Button>
          ) : org.status === 'suspended' ? (
            <Button size="sm" onClick={handleResume}>
              <Play className="w-4 h-4 mr-1.5" /> Reativar
            </Button>
          ) : null}
        </div>
      </header>

      {detail.parent && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2 text-sm mb-6">
          Esta é uma <strong>workspace</strong> de{' '}
          <Link to={`/platform/organizations/${detail.parent.id}`} className="underline font-medium">
            {(detail.parent as { name: string }).name}
          </Link>
          . Ações platform-wide (suspender, impersonar) devem ser feitas no tenant.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Usuários" value={detail.stats.users} icon={Users} />
        <StatTile label="Cards abertos" value={detail.stats.cards_open} icon={CreditCard} />
        <StatTile label="Ganhos" value={detail.stats.cards_won} icon={CreditCard} />
        <StatTile label="Perdidos" value={detail.stats.cards_lost} icon={CreditCard} />
      </div>

      {isAccount && (
        <Section title="Compartilhamento entre workspaces" className="mb-6">
          <div className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2 bg-indigo-50 rounded-lg mt-0.5">
                <Users2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  Contatos, destinos e catálogos compartilhados
                </div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {sharingEnabled ? (
                    <>
                      <strong>Ligado.</strong> Os {detail.workspaces.length} workspaces desta conta
                      enxergam os mesmos contatos e catálogos (um lead do mesmo cliente não duplica
                      entre workspaces).
                    </>
                  ) : (
                    <>
                      <strong>Desligado.</strong> Cada workspace tem contatos e catálogos isolados.
                      Recomendado para contas com 1 workspace, ou quando cada produto atende públicos
                      diferentes.
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant={sharingEnabled ? 'outline' : 'default'}
              size="sm"
              onClick={handleToggleSharing}
              disabled={togglingSharing}
              className="flex-shrink-0"
            >
              {togglingSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : (sharingEnabled ? 'Desligar' : 'Ligar')}
            </Button>
          </div>
        </Section>
      )}

      {!detail.parent && (
        <Section
          title={`Workspaces (${detail.workspaces.length})`}
          className="mb-6"
          header={
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Workspaces ({detail.workspaces.length})
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddWorkspace(true)}
                className="gap-1"
              >
                <Plus className="w-4 h-4" /> Novo Workspace
              </Button>
            </div>
          }
        >
          {detail.workspaces.length === 0 ? (
            <EmptyRow>Nenhum workspace criado ainda.</EmptyRow>
          ) : (
            detail.workspaces.map((w) => (
              <div key={w.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/platform/organizations/${w.id}`}
                    className="text-sm font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {w.name}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5">
                    <code className="bg-slate-100 px-1 rounded">{w.slug}</code>
                    <span className="mx-2">·</span>
                    {w.user_count} usuários · {w.open_card_count}/{w.card_count} cards
                  </div>
                </div>
                <StatusBadge status={w.status} />
              </div>
            ))
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Admins"
          header={
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Admins</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowInviteAdmin(true)}
                className="gap-1"
              >
                <Plus className="w-4 h-4" /> Convidar
              </Button>
            </div>
          }
        >
          {detail.admins.length === 0 ? (
            <EmptyRow>Nenhum admin.</EmptyRow>
          ) : (
            detail.admins.map((a) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{a.nome ?? a.email}</div>
                  <div className="text-xs text-slate-500">{a.email}</div>
                </div>
                {a.is_platform_admin && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                    <Shield className="w-3 h-3" /> Platform
                  </span>
                )}
              </div>
            ))
          )}
        </Section>

        <Section title="Produtos">
          {detail.products.length === 0 ? (
            <EmptyRow>Nenhum produto.</EmptyRow>
          ) : (
            detail.products.map((p) => (
              <div key={p.id} className="px-5 py-3">
                <div className="text-sm font-medium text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  <code className="bg-slate-100 px-1 rounded">{p.slug}</code>
                  {p.pipeline_id && <span className="ml-2">pipeline: {p.pipeline_id.slice(0, 8)}…</span>}
                </div>
              </div>
            ))
          )}
        </Section>
      </div>

      <OrgUsersSection orgId={id!} className="mt-6" />

      <Section title="Atividade platform recente" className="mt-6">
        {detail.recent_audit.length === 0 ? (
          <EmptyRow>Nenhuma ação registrada.</EmptyRow>
        ) : (
          detail.recent_audit.map((e) => (
            <div key={e.id} className="px-5 py-3">
              <div className="text-sm">
                <span className="font-mono text-xs text-indigo-600">{e.action}</span>
                <span className="text-slate-500"> por </span>
                <span className="font-medium">{e.actor_email ?? e.actor_id.slice(0, 8)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {new Date(e.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
          ))
        )}
      </Section>

      <AddWorkspaceDialog
        isOpen={showAddWorkspace}
        onClose={() => setShowAddWorkspace(false)}
        onSubmit={addWorkspace}
      />

      <InviteAdminDialog
        isOpen={showInviteAdmin}
        onClose={() => setShowInviteAdmin(false)}
        onSubmit={inviteAdmin}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function Section({
  title,
  className = '',
  header,
  children,
}: {
  title: string
  className?: string
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      {header ? (
        header
      ) : (
        <header className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        </header>
      )}
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-sm text-slate-500">{children}</div>
}
