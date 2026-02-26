import { Outlet } from 'react-router-dom'
import ReportsSidebar from '@/components/reports/ReportsSidebar'

export default function ReportsPage() {
    return (
        <div className="flex h-full overflow-hidden">
            <ReportsSidebar />
            <div className="flex-1 overflow-hidden flex flex-col">
                <Outlet />
            </div>
        </div>
    )
}
