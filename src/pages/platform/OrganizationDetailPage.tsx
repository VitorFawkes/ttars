import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Users, CreditCard, Building2, Pause, Play, Shield, LogIn } from 'lucide-react'
import { usePlatformOrgDetail } from '../../hooks/usePlatformData'
import { StatusBadge } from './DashboardPage'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'

// Cast até types regenerados pós-promoção. Ver usePlatformData.ts para contexto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { detail, loading, error, refetch } = usePlatformOrgDetail(id ?? null)

  const handleSuspend = async () => {
    if (!id) return
    const reason = window.prompt('Motivo (opcional):') ?? ''
    const { error: rpcError } = await db.rpc('platform_suspend_organization', {
      p_org_id: id,
      p_reason: reason.trim() || null,
    })
    if (rpcError) {
      toast({ title: 'Erro ao suspender', description: rpcError.message, type: 'error' })
      return
    }
    toast({ title: 'Organização suspensa', type: 'success' })
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
    await supabase.auth.refreshSession()
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Usuários" value={detail.stats.users} icon={Users} />
        <StatTile label="Cards abertos" value={detail.stats.cards_open} icon={CreditCard} />
        <StatTile label="Ganhos" value={detail.stats.cards_won} icon={CreditCard} />
        <StatTile label="Perdidos" value={detail.stats.cards_lost} icon={CreditCard} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Admins desta org">
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
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      <header className="px-5 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-sm text-slate-500">{children}</div>
}
