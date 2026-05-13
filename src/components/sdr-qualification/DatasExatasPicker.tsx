import { useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'

const MESES_PT_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

type Props = {
    selecionadas: string[]
    onChange: (datas: string[], textoHumano: string) => void
}

function formatarData(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (!m) return iso
    const [, ano, mes, dia] = m
    return `${Number(dia)}/${MESES_PT_SHORT[Number(mes) - 1]}/${ano}`
}

export function formatarDatasPT(datas: string[]): string {
    if (datas.length === 0) return ''
    if (datas.length === 1) return formatarData(datas[0])
    const sorted = [...datas].sort()
    const formatadas = sorted.map(formatarData)
    if (formatadas.length === 2) return `${formatadas[0]} ou ${formatadas[1]}`
    const ultimo = formatadas[formatadas.length - 1]
    const inicio = formatadas.slice(0, -1).join(', ')
    return `${inicio} ou ${ultimo}`
}

export function DatasExatasPicker({ selecionadas, onChange }: Props) {
    const [nova, setNova] = useState<string>('')

    const adicionar = () => {
        if (!nova) return
        if (selecionadas.includes(nova)) {
            setNova('')
            return
        }
        const novas = [...selecionadas, nova].sort()
        onChange(novas, formatarDatasPT(novas))
        setNova('')
    }

    const remover = (data: string) => {
        const novas = selecionadas.filter((d) => d !== data)
        onChange(novas, formatarDatasPT(novas))
    }

    const limpar = () => {
        onChange([], '')
    }

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <Input
                    type="date"
                    value={nova}
                    onChange={(e) => setNova(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            adicionar()
                        }
                    }}
                    className="flex-1"
                />
                <button
                    type="button"
                    onClick={adicionar}
                    disabled={!nova}
                    className="inline-flex items-center gap-1 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                </button>
            </div>

            {selecionadas.length > 0 ? (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-[11px] text-emerald-700 font-medium uppercase tracking-wide">
                            {selecionadas.length === 1 ? 'Data marcada' : `${selecionadas.length} datas marcadas`}
                        </p>
                        {selecionadas.length > 1 && (
                            <button
                                type="button"
                                onClick={limpar}
                                className="p-0.5 rounded hover:bg-emerald-100 text-emerald-700"
                                title="Limpar todas"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {[...selecionadas].sort().map((d) => (
                            <span
                                key={d}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-sm text-emerald-900"
                            >
                                {formatarData(d)}
                                <button
                                    type="button"
                                    onClick={() => remover(d)}
                                    className="hover:text-rose-600"
                                    aria-label="Remover"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="text-xs text-slate-500">
                    Marque uma data por vez. Casal pode estar em dúvida entre algumas — adicione todas.
                </p>
            )}
        </div>
    )
}
