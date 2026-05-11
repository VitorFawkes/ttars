import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import AnalyticsSidebar from './AnalyticsSidebar'
import AnalyticsDrillDownDrawer from '@/components/analytics/AnalyticsDrillDownDrawer'
import { useProductContext } from '@/hooks/useProductContext'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'

export default function AnalyticsLayout() {
  const { currentProduct } = useProductContext()
  const setProduct = useAnalyticsFilters(s => s.setProduct)

  useEffect(() => {
    setProduct(currentProduct)
  }, [currentProduct, setProduct])

  return (
    <div className="flex w-full h-full bg-slate-50">
      <AnalyticsSidebar />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </div>
      <AnalyticsDrillDownDrawer />
    </div>
  )
}
