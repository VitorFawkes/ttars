import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

export default function WidgetCard({ title, subtitle, action, className, children }: Props) {
  return (
    <div className={cn('bg-white border border-slate-200 shadow-sm rounded-xl p-5', className)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
