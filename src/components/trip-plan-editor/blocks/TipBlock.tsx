import { Input } from '@/components/ui/Input'

interface TipBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function TipBlock({ data, onChange }: TipBlockProps) {
    return (
        <div className="space-y-2">
            <Input
                value={String(data.title || '')}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Título da dica (opcional)"
                className="h-8 text-sm font-medium"
            />
            <textarea
                value={String(data.content || '')}
                onChange={(e) => onChange({ ...data, content: e.target.value })}
                placeholder="Escreva a dica aqui... (suporta **negrito** e _itálico_)"
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
        </div>
    )
}
