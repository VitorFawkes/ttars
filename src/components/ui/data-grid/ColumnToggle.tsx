import { Columns } from 'lucide-react'
import { Button } from '../Button'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../dropdown-menu'

interface ColumnToggleProps {
    columns: {
        id: string
        label: string
        isVisible: boolean
    }[]
    onToggle: (columnId: string, isVisible: boolean) => void
}

export function ColumnToggle({ columns, onToggle }: ColumnToggleProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-9 bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm transition-all duration-200"
                >
                    <Columns className="mr-2 h-4 w-4 text-gray-500" />
                    Colunas
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px] p-2">
                <DropdownMenuLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1.5">
                    Exibir Colunas
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    {columns.map((column) => (
                        <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize cursor-pointer text-sm py-2 px-2 rounded-md hover:bg-gray-50 data-[state=checked]:text-primary data-[state=checked]:bg-primary/5 transition-colors"
                            checked={column.isVisible}
                            onCheckedChange={(checked) => onToggle(column.id, checked)}
                        >
                            {column.label}
                        </DropdownMenuCheckboxItem>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
