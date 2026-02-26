import { useMemo, useCallback } from 'react'
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { DashboardWidget } from '@/lib/reports/reportTypes'

interface DashboardGridProps {
    widgets: DashboardWidget[]
    isEditing: boolean
    onLayoutChange?: (widgets: { id: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }[]) => void
    renderWidget: (widget: DashboardWidget) => React.ReactNode
}

export default function DashboardGrid({
    widgets,
    isEditing,
    onLayoutChange,
    renderWidget,
}: DashboardGridProps) {
    const { width, containerRef } = useContainerWidth()

    const layout = useMemo(() =>
        widgets.map(w => ({
            i: w.id,
            x: w.grid_x,
            y: w.grid_y,
            w: w.grid_w,
            h: w.grid_h,
            minW: 2,
            maxW: 12,
            minH: 2,
            maxH: 8,
        })),
    [widgets])

    const handleLayoutChange = useCallback((newLayout: Layout) => {
        if (!onLayoutChange) return
        const updates = newLayout.map(l => ({
            id: l.i,
            grid_x: l.x,
            grid_y: l.y,
            grid_w: l.w,
            grid_h: l.h,
        }))
        onLayoutChange(updates)
    }, [onLayoutChange])

    return (
        <div ref={containerRef}>
            {width > 0 && (
                <ResponsiveGridLayout
                    className="layout"
                    width={width}
                    layouts={{ lg: layout }}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={80}
                    dragConfig={{ enabled: isEditing, handle: '.widget-drag-handle' }}
                    resizeConfig={{ enabled: isEditing }}
                    onLayoutChange={handleLayoutChange}
                    compactor={verticalCompactor}
                    margin={[16, 16]}
                >
                    {widgets.map(widget => (
                        <div key={widget.id}>
                            {renderWidget(widget)}
                        </div>
                    ))}
                </ResponsiveGridLayout>
            )}
        </div>
    )
}
