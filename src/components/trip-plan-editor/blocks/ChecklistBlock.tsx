import { Input } from '@/components/ui/Input'
import { Plus, X } from 'lucide-react'

interface ChecklistBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

interface ChecklistItem {
    label: string
    checked: boolean
    category?: string
}

export function ChecklistBlock({ data, onChange }: ChecklistBlockProps) {
    const items: ChecklistItem[] = Array.isArray(data.items)
        ? (data.items as ChecklistItem[])
        : [{ label: '', checked: false }]

    const updateItem = (index: number, updates: Partial<ChecklistItem>) => {
        const newItems = items.map((item, i) => i === index ? { ...item, ...updates } : item)
        onChange({ ...data, items: newItems })
    }

    const addItem = () => {
        onChange({ ...data, items: [...items, { label: '', checked: false }] })
    }

    const removeItem = (index: number) => {
        onChange({ ...data, items: items.filter((_, i) => i !== index) })
    }

    return (
        <div className="space-y-1.5">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => updateItem(i, { checked: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <Input
                        value={item.label}
                        onChange={(e) => updateItem(i, { label: e.target.value })}
                        placeholder="Item do checklist"
                        className="flex-1 h-7 text-xs"
                    />
                    <button
                        onClick={() => removeItem(i)}
                        className="p-1 text-slate-300 hover:text-red-500"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
            <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-1"
            >
                <Plus className="h-3 w-3" />
                Adicionar item
            </button>
        </div>
    )
}
