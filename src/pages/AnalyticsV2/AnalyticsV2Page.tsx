import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import AnalyticsV2Sidebar from './AnalyticsV2Sidebar'
import UniversalFilterBar from './UniversalFilterBar'

export default function AnalyticsV2Page() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-slate-500">Carregando…</div>
      </div>
    )
  }

  if (!profile?.is_admin) {
    return <Navigate to="/analytics" replace />
  }

  return (
    <div className="h-full flex bg-slate-50">
      <AnalyticsV2Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <UniversalFilterBar />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
