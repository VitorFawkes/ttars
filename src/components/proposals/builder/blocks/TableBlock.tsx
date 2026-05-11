import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
    GripVertical,
    Trash2,
    Plus,
    X,
} from 'lucide-react'

/**
 * TableBlock - Editable table for custom data
 * 
 * Features:
 * - Add/remove rows and columns
 * - Inline cell editing
 * - Header row styling
 */
interface TableBlockProps {
    id: string
    data?: {
        headers: string[]
        rows: string[][]
    }
    isPreview?: boolean
    onUpdate?: (data: { headers: string[]; rows: string[][] }) => void
    onDelete?: () => void
}

const DEFAULT_DATA = {
    headers: ['Coluna 1', 'Coluna 2', 'Coluna 3'],
    rows: [
        ['', '', ''],
        ['', '', ''],
    ],
}

export function TableBlock({
    data = DEFAULT_DATA,
    isPreview,
    onUpdate,
    onDelete,
}: TableBlockProps) {
    const [tableData, setTableData] = useState(data)

    const updateCell = useCallback((rowIndex: number, colIndex: number, value: string) => {
        const newRows = [...tableData.rows]
        newRows[rowIndex] = [...newRows[rowIndex]]
        newRows[rowIndex][colIndex] = value
        const newData = { ...tableData, rows: newRows }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    const updateHeader = useCallback((colIndex: number, value: string) => {
        const newHeaders = [...tableData.headers]
        newHeaders[colIndex] = value
        const newData = { ...tableData, headers: newHeaders }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    const addRow = useCallback(() => {
        const newRow = new Array(tableData.headers.length).fill('')
        const newData = {
            ...tableData,
            rows: [...tableData.rows, newRow],
        }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    const removeRow = useCallback((rowIndex: number) => {
        const newRows = tableData.rows.filter((_, i) => i !== rowIndex)
        const newData = { ...tableData, rows: newRows }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    const addColumn = useCallback(() => {
        const newHeaders = [...tableData.headers, `Coluna ${tableData.headers.length + 1}`]
        const newRows = tableData.rows.map(row => [...row, ''])
        const newData = { headers: newHeaders, rows: newRows }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    const removeColumn = useCallback((colIndex: number) => {
        const newHeaders = tableData.headers.filter((_, i) => i !== colIndex)
        const newRows = tableData.rows.map(row => row.filter((_, i) => i !== colIndex))
        const newData = { headers: newHeaders, rows: newRows }
        setTableData(newData)
        onUpdate?.(newData)
    }, [tableData, onUpdate])

    // Preview mode
    if (isPreview) {
        return (
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-100">
                            {tableData.headers.map((header, i) => (
                                <th
                                    key={i}
                                    className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-slate-50">
                                {row.map((cell, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100"
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Drag Handle + Actions */}
            <div className={cn(
                'absolute -left-10 top-3 flex flex-col gap-1 z-10',
                'opacity-0 group-hover:opacity-100 transition-opacity'
            )}>
                <button className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    {/* Header Row */}
                    <thead>
                        <tr className="bg-slate-50">
                            {tableData.headers.map((header, colIndex) => (
                                <th key={colIndex} className="relative group/col border-b border-slate-200">
                                    <input
                                        type="text"
                                        value={header}
                                        onChange={(e) => updateHeader(colIndex, e.target.value)}
                                        className="w-full px-4 py-3 text-sm font-semibold text-slate-700 bg-transparent border-none outline-none focus:ring-0"
                                    />
                                    {/* Remove Column Button */}
                                    {tableData.headers.length > 1 && (
                                        <button
                                            onClick={() => removeColumn(colIndex)}
                                            className={cn(
                                                'absolute top-1 right-1 p-0.5 rounded',
                                                'opacity-0 group-hover/col:opacity-100',
                                                'hover:bg-red-100 text-slate-400 hover:text-red-500'
                                            )}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </th>
                            ))}
                            {/* Add Column Button */}
                            <th className="w-10 border-b border-slate-200">
                                <button
                                    onClick={addColumn}
                                    className="p-2 hover:bg-slate-100 rounded"
                                >
                                    <Plus className="h-4 w-4 text-slate-400" />
                                </button>
                            </th>
                        </tr>
                    </thead>

                    {/* Data Rows */}
                    <tbody>
                        {tableData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="group/row hover:bg-slate-50">
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="border-b border-slate-100">
                                        <input
                                            type="text"
                                            value={cell}
                                            onChange={(e) => updateCell(rowIndex, cellIndex, e.target.value)}
                                            placeholder="..."
                                            className="w-full px-4 py-3 text-sm text-slate-600 bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-300"
                                        />
                                    </td>
                                ))}
                                {/* Remove Row Button */}
                                <td className="w-10 border-b border-slate-100">
                                    {tableData.rows.length > 1 && (
                                        <button
                                            onClick={() => removeRow(rowIndex)}
                                            className={cn(
                                                'p-1 rounded',
                                                'opacity-0 group-hover/row:opacity-100',
                                                'hover:bg-red-100 text-slate-400 hover:text-red-500'
                                            )}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Row Button */}
            <button
                onClick={addRow}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
            >
                <Plus className="h-4 w-4" />
                Adicionar linha
            </button>
        </div>
    )
}

export default TableBlock
