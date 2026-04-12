import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  FileClock,
  Shield,
  LogOut,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin'

const navItems = [
  { to: '/platform', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/platform/organizations', label: 'Organizações', icon: Building2 },
  { to: '/platform/users', label: 'Usuários', icon: Users },
  { to: '/platform/audit', label: 'Audit Log', icon: FileClock },
  { to: '/platform/settings', label: 'Platform Admins', icon: Shield },
]

export default function PlatformLayout() {
  const { session, profile, loading } = useAuth()
  const isPlatformAdmin = usePlatformAdmin()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (profile && !isPlatformAdmin) return <Navigate to="/" replace />

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-slate-50">
      <aside className="w-64 flex-shrink-0 flex flex-col bg-slate-900 text-slate-100">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Platform</div>
              <div className="text-xs text-slate-400">Super-admin console</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800 space-y-2">
          <div className="px-3 py-2 text-xs text-slate-400">
            <div className="font-medium text-slate-200 truncate">{profile?.email}</div>
            <div className="text-[11px]">Platform Admin</div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Voltar ao CRM
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
