import { Plane } from 'lucide-react'

interface CountdownBannerProps {
  targetDate?: string | null
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function CountdownBanner({ targetDate }: CountdownBannerProps) {
  if (!targetDate) return null

  const days = getDaysUntil(targetDate)

  if (days <= 0) {
    return (
      <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white text-center">
        <Plane className="h-6 w-6 mx-auto mb-1" />
        <p className="text-lg font-bold">Boa viagem!</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 p-4 text-white text-center">
      <Plane className="h-6 w-6 mx-auto mb-1" />
      <p className="text-3xl font-bold tracking-tight">{days}</p>
      <p className="text-sm font-medium text-white/80">
        {days === 1 ? 'dia para embarcar' : 'dias para embarcar'}
      </p>
    </div>
  )
}
