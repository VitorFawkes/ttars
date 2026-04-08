import { Input } from '@/components/ui/Input'

interface DayHeaderBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function DayHeaderBlock({ data, onChange }: DayHeaderBlockProps) {
    const date = String(data.date || '')
    const title = String(data.title || '')
    const city = String(data.city || '')

    return (
        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <Input
                type="date"
                value={date}
                onChange={(e) => onChange({ ...data, date: e.target.value })}
                className="w-36 h-8 text-xs bg-white"
            />
            <Input
                value={title}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Ex: Dia 1 — Roma"
                className="flex-1 h-8 text-sm font-semibold bg-white"
            />
            <Input
                value={city}
                onChange={(e) => onChange({ ...data, city: e.target.value })}
                placeholder="Cidade"
                className="w-32 h-8 text-xs bg-white"
            />
        </div>
    )
}
