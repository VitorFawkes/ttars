import { Outlet } from 'react-router-dom'
import AnalyticsSidebar from './AnalyticsSidebar'

export default function AnalyticsLayout() {
  return (
    <div className="flex w-full h-full bg-slate-50">
      <AnalyticsSidebar />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
