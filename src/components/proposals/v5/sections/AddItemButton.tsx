import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface AddItemButtonProps {
    onAdd: () => void
}

export function AddItemButton({ onAdd }: AddItemButtonProps) {
    return (
        <div className="flex justify-center py-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={onAdd}
                className="text-xs text-slate-400 hover:text-slate-600 gap-1"
            >
                <Plus className="h-3.5 w-3.5" />
                Adicionar item
            </Button>
        </div>
    )
}
