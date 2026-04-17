import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

interface LeadsPaginationProps {
    page: number
    pageSize: number
    total: number
    totalPages: number
    onPageChange: (page: number) => void
    onPageSizeChange: (pageSize: number) => void
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

export default function LeadsPagination({
    page,
    pageSize,
    total,
    totalPages,
    onPageChange,
    onPageSizeChange
}: LeadsPaginationProps) {
    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    const canGoBack = page > 1
    const canGoForward = page < totalPages

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
            <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                    Mostrando <span className="font-medium">{from}</span> a{' '}
                    <span className="font-medium">{to}</span> de{' '}
                    <span className="font-medium">{total}</span> leads
                </span>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Por página:</span>
                    <Select
                        value={pageSize.toString()}
                        onChange={(value) => onPageSizeChange(Number(value))}
                        options={PAGE_SIZE_OPTIONS.map((size) => ({
                            value: size.toString(),
                            label: size.toString()
                        }))}
                        className="h-8 w-[70px]"
                    />
                </div>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!canGoBack}
                    onClick={() => onPageChange(1)}
                    title="Primeira página"
                >
                    <ChevronsLeft className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!canGoBack}
                    onClick={() => onPageChange(page - 1)}
                    title="Página anterior"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="px-3 text-sm text-gray-600">
                    Página <span className="font-medium">{page}</span> de{' '}
                    <span className="font-medium">{totalPages}</span>
                </span>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!canGoForward}
                    onClick={() => onPageChange(page + 1)}
                    title="Próxima página"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!canGoForward}
                    onClick={() => onPageChange(totalPages)}
                    title="Última página"
                >
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
