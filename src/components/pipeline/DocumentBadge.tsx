import { FileText } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DocumentBadgeProps {
  total: number
  completed: number
  variant?: 'small' | 'default'
}

export default function DocumentBadge({ total, completed, variant = 'small' }: DocumentBadgeProps) {
  if (total === 0) return null

  const percentage = Math.round((completed / total) * 100)

  const colorClasses = percentage === 100
    ? 'bg-green-100 text-green-700 border-green-200'
    : percentage > 0
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200'

  if (variant === 'small') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium px-1.5 py-0.5 text-[10px] border",
        colorClasses
      )}>
        <FileText className="w-2.5 h-2.5" />
        {completed}/{total} docs
      </div>
    )
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-md font-medium px-2 py-1 text-xs border",
      colorClasses
    )}>
      <FileText className="w-3 h-3" />
      <span>{completed}/{total} docs</span>
    </div>
  )
}
