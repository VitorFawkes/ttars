import { Building2, Users, CreditCard, TrendingUp, AlertTriangle, Archive, Loader2 } from 'lucide-react'
import { usePlatformStats, usePlatformOrgs, usePlatformAuditLog } from '../../hooks/usePlatformData'
import { Link } from 'react-router-dom'

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'warning' | 'success'
}) {
  const toneClass =
    tone === 'warning' ? 'text-amber-600 bg-amber-50' :
    tone === 'success' ? 'text-emerald-600 bg-emerald-50' :
    'text-indigo-600 bg-indigo-50'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-semibold tracking-tight text-slate-900 mt-2">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        <div className={`h-10 w-10 rounded-lg ${toneClass} flex items-center justify-center`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: stats, loading: loadingStats } = usePlatformStats()
  const { orgs } = usePlatformOrgs()
  const { entries: audit } = usePlatformAuditLog(10)

  const recentOrgs = orgs.slice(0, 5)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Visão geral do SaaS — todas as organizações.</p>
      </header>

      {loadingStats ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando estatísticas…
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Organizações"
              value={stats.orgs_total}
              sub={`${stats.orgs_active} ativas • ${stats.orgs_suspended} suspensas`}
              icon={Building2}
            />
            <StatCard
              label="Usuários"
              value={stats.users_total}
              sub={`${stats.users_active_30d} ativos nos últimos 30d`}
              icon={Users}
            />
            <StatCard
              label="Cards Abertos"
              value={stats.cards_open}
              sub={`${stats.cards_total} no total`}
              icon={CreditCard}
            />
            <StatCard
              label="Novos em 30d"
              value={stats.orgs_new_30d}
              sub={`${stats.cards_new_30d} cards criados`}
              icon={TrendingUp}
              tone="success"
            />
          </div>

          {stats.orgs_suspended + stats.orgs_archived > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {stats.orgs_suspended > 0 && (
                <StatCard
                  label="Suspensas"
                  value={stats.orgs_suspended}
                  sub="Acesso bloqueado"
                  icon={AlertTriangle}
                  tone="warning"
                />
              )}
              {stats.orgs_archived > 0 && (
                <StatCard
                  label="Arquivadas"
                  value={stats.orgs_archived}
                  sub="Desativadas permanentemente"
                  icon={Archive}
                />
              )}
            </div>
          )}
        </>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Organizações recentes</h2>
            <Link to="/platform/organizations" className="text-xs text-indigo-600 hover:underline">
              Ver todas →
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {recentOrgs.length === 0 ? (
              <li className="px-5 py-6 text-sm text-slate-500">Nenhuma organização ainda.</li>
            ) : (
              recentOrgs.map((o) => (
                <li key={o.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <Link
                      to={`/platform/organizations/${o.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-indigo-600 truncate block"
                    >
                      {o.name}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {o.user_count} usuários • {o.card_count} cards
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Atividade recente</h2>
            <Link to="/platform/audit" className="text-xs text-indigo-600 hover:underline">
              Ver tudo →
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {audit.length === 0 ? (
              <li className="px-5 py-6 text-sm text-slate-500">Nenhuma ação registrada ainda.</li>
            ) : (
              audit.slice(0, 6).map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <div className="text-sm text-slate-900">
                    <span className="font-mono text-xs text-indigo-600">{e.action}</span>
                    <span className="text-slate-500"> por </span>
                    <span className="font-medium">{e.actor_email ?? e.actor_id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativa', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    suspended: { label: 'Suspensa', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    archived: { label: 'Arquivada', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const cfg = map[status] ?? map.active
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
