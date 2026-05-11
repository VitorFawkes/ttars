/**
 * CountdownHeader — Header com countdown até a viagem.
 * "Faltam X dias para a sua viagem!"
 */

import { useMemo } from 'react'
import { Plane } from 'lucide-react'

interface CountdownHeaderProps {
    targetDate: string // YYYY-MM-DD
    title?: string | null
}

export function CountdownHeader({ targetDate, title }: CountdownHeaderProps) {
    const daysUntil = useMemo(() => {
        const target = new Date(targetDate + 'T00:00:00')
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return diff
    }, [targetDate])

    if (daysUntil < 0) return null // Viagem já passou

    return (
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-5 text-white">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Plane className="h-6 w-6 text-white" />
                </div>
                <div>
                    {title && (
                        <p className="text-sm font-medium text-white/80">{title}</p>
                    )}
                    {daysUntil === 0 ? (
                        <p className="text-lg font-bold">Hoje é o dia! Boa viagem! ✈️</p>
                    ) : daysUntil === 1 ? (
                        <p className="text-lg font-bold">Amanhã! Última checagem 🎒</p>
                    ) : (
                        <p className="text-lg font-bold">
                            Faltam <span className="text-2xl">{daysUntil}</span> dias!
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
