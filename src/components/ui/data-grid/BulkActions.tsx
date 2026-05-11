import { Button } from '../Button'


interface Action {
    label: string
    icon?: React.ElementType
    onClick: () => void
    variant?: 'default' | 'destructive' | 'outline' | 'ghost'
}

interface BulkActionsProps {
    selectedCount: number
    actions: Action[]
    onClearSelection?: () => void
}

export function BulkActions({ selectedCount, actions, onClearSelection }: BulkActionsProps) {
    if (selectedCount === 0) return null

    return (
        <div className="flex items-center gap-2 bg-white border border-gray-200 shadow-sm rounded-lg px-3 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm font-medium text-gray-600 mr-2">
                {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
            </span>

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {actions.map((action, index) => {
                const Icon = action.icon
                return (
                    <Button
                        key={index}
                        variant={action.variant || 'ghost'}
                        size="sm"
                        onClick={action.onClick}
                        className="h-7 px-2 text-xs"
                    >
                        {Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />}
                        {action.label}
                    </Button>
                )
            })}

            {onClearSelection && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearSelection}
                    className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600 ml-1"
                >
                    Limpar
                </Button>
            )}
        </div>
    )
}
