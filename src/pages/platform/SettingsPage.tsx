import { Shield, AlertTriangle } from 'lucide-react'
import { usePlatformUsers } from '../../hooks/usePlatformData'
import { Link } from 'react-router-dom'

export default function SettingsPage() {
  const { users } = usePlatformUsers('')
  const platformAdmins = users.filter((u) => u.is_platform_admin)

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Shield className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Platform Admins</h1>
          <p className="text-sm text-slate-500">
            Usuários com acesso ao console platform (dono do SaaS).
          </p>
        </div>
      </header>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Privilégio máximo do sistema.</p>
          <p>
            Platform admins veem todas as organizações, podem provisionar, suspender, reativar e fazer
            impersonate. Nunca deve existir só 1 platform admin (risco de lockout).
          </p>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <header className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Atuais ({platformAdmins.length})
          </h2>
        </header>
        {platformAdmins.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">
            Nenhum platform admin. Isso não deveria acontecer — alguém foi revogado incorretamente?
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {platformAdmins.map((u) => (
              <li key={u.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{u.nome ?? u.email}</div>
                  <div className="text-xs text-slate-500">{u.email} · org: {u.org_name}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                  <Shield className="w-3 h-3" /> Platform
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 text-sm text-slate-500">
        Para promover/revogar, vá para{' '}
        <Link to="/platform/users" className="text-indigo-600 hover:underline">
          Usuários
        </Link>{' '}
        e use a ação "Promover" / "Revogar" na linha do usuário.
      </div>
    </div>
  )
}
