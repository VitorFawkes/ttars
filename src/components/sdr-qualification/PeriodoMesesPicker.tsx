import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

const MESES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

const MESES_PT_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type Props = {
    selecionados: string[]
    onChange: (meses: string[], textoHumano: string) => void
}

function detectarPresetAno(numerosMes: number[]): string | null {
    if (numerosMes.length === 12) return 'O ano todo'
    const set = new Set(numerosMes)
    if (numerosMes.length === 6 && [1, 2, 3, 4, 5, 6].every((n) => set.has(n))) return 'Primeiro semestre'
    if (numerosMes.length === 6 && [7, 8, 9, 10, 11, 12].every((n) => set.has(n))) return 'Segundo semestre'
    if (numerosMes.length === 3 && [1, 2, 3].every((n) => set.has(n))) return 'Primeiro trimestre'
    if (numerosMes.length === 3 && [4, 5, 6].every((n) => set.has(n))) return 'Segundo trimestre'
    if (numerosMes.length === 3 && [7, 8, 9].every((n) => set.has(n))) return 'Terceiro trimestre'
    if (numerosMes.length === 3 && [10, 11, 12].every((n) => set.has(n))) return 'Quarto trimestre'
    return null
}

export function formatarMesesPT(meses: string[]): string {
    if (meses.length === 0) return ''
    const porAno = new Map<string, number[]>()
    for (const m of meses) {
        const match = /^(\d{4})-(\d{2})$/.exec(m)
        if (!match) continue
        const [, ano, mesStr] = match
        const arr = porAno.get(ano) ?? []
        arr.push(Number(mesStr))
        porAno.set(ano, arr)
    }
    const partes: string[] = []
    const anosOrdenados = Array.from(porAno.keys()).sort()
    for (const ano of anosOrdenados) {
        const nums = (porAno.get(ano) ?? []).sort((a, b) => a - b)
        const preset = detectarPresetAno(nums)
        if (preset) {
            partes.push(`${preset} de ${ano}`)
            continue
        }
        const nomes = nums.map((n) => MESES_PT[n - 1])
        if (nomes.length === 1) {
            partes.push(`${nomes[0]} de ${ano}`)
        } else {
            const ultimo = nomes[nomes.length - 1]
            const inicio = nomes.slice(0, -1).join(', ')
            partes.push(`${inicio} ou ${ultimo} de ${ano}`)
        }
    }
    return partes.join(' / ')
}

export function PeriodoMesesPicker({ selecionados, onChange }: Props) {
    const anoAtual = new Date().getFullYear()
    const [anoVisualizado, setAnoVisualizado] = useState<number>(() => {
        if (selecionados.length > 0) {
            const match = /^(\d{4})-/.exec(selecionados[0])
            if (match) return Number(match[1])
        }
        return anoAtual
    })

    const numerosDoAno = useMemo(() => {
        const set = new Set<number>()
        const prefix = `${anoVisualizado}-`
        for (const m of selecionados) {
            if (m.startsWith(prefix)) {
                const num = Number(m.split('-')[1])
                if (!isNaN(num)) set.add(num)
            }
        }
        return set
    }, [selecionados, anoVisualizado])

    const aplicar = (novosMesesDoAno: number[]) => {
        const outrosAnos = selecionados.filter((m) => !m.startsWith(`${anoVisualizado}-`))
        const novosDoAno = novosMesesDoAno
            .sort((a, b) => a - b)
            .map((n) => `${anoVisualizado}-${String(n).padStart(2, '0')}`)
        const combinado = [...outrosAnos, ...novosDoAno].sort()
        onChange(combinado, formatarMesesPT(combinado))
    }

    const toggleMes = (num: number) => {
        const atual = Array.from(numerosDoAno)
        const idx = atual.indexOf(num)
        if (idx === -1) atual.push(num)
        else atual.splice(idx, 1)
        aplicar(atual)
    }

    const aplicarPreset = (nums: number[]) => {
        aplicar(nums)
    }

    const limparAno = () => {
        const outrosAnos = selecionados.filter((m) => !m.startsWith(`${anoVisualizado}-`))
        onChange(outrosAnos, formatarMesesPT(outrosAnos))
    }

    const limparTudo = () => {
        onChange([], '')
    }

    const textoHumano = formatarMesesPT(selecionados)
    const anosComMeses = useMemo(() => {
        const set = new Set<number>()
        for (const m of selecionados) {
            const match = /^(\d{4})-/.exec(m)
            if (match) set.add(Number(match[1]))
        }
        return Array.from(set).sort()
    }, [selecionados])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <button
                    type="button"
                    onClick={() => setAnoVisualizado((a) => a - 1)}
                    className="p-1 rounded hover:bg-white text-slate-600"
                    aria-label="Ano anterior"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">{anoVisualizado}</span>
                    {numerosDoAno.size > 0 && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {numerosDoAno.size} {numerosDoAno.size === 1 ? 'mês' : 'meses'}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setAnoVisualizado((a) => a + 1)}
                    className="p-1 rounded hover:bg-white text-slate-600"
                    aria-label="Próximo ano"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <PresetChip label="1º semestre" onClick={() => aplicarPreset([1, 2, 3, 4, 5, 6])} />
                <PresetChip label="2º semestre" onClick={() => aplicarPreset([7, 8, 9, 10, 11, 12])} />
                <PresetChip label="Trim 1" onClick={() => aplicarPreset([1, 2, 3])} />
                <PresetChip label="Trim 2" onClick={() => aplicarPreset([4, 5, 6])} />
                <PresetChip label="Trim 3" onClick={() => aplicarPreset([7, 8, 9])} />
                <PresetChip label="Trim 4" onClick={() => aplicarPreset([10, 11, 12])} />
                <PresetChip label="Ano todo" onClick={() => aplicarPreset([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} />
                {numerosDoAno.size > 0 && (
                    <PresetChip
                        label={`Limpar ${anoVisualizado}`}
                        onClick={limparAno}
                        variant="danger"
                    />
                )}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
                {MESES_PT_SHORT.map((nome, idx) => {
                    const num = idx + 1
                    const marcado = numerosDoAno.has(num)
                    return (
                        <button
                            key={num}
                            type="button"
                            onClick={() => toggleMes(num)}
                            className={
                                'px-2 py-1.5 rounded-md text-sm font-medium border transition ' +
                                (marcado
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50')
                            }
                        >
                            {nome}
                        </button>
                    )
                })}
            </div>

            {selecionados.length > 0 ? (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-emerald-700 font-medium uppercase tracking-wide">Resumo</p>
                            <p className="text-sm text-emerald-900 mt-0.5">{textoHumano}</p>
                            {anosComMeses.length > 1 && (
                                <p className="text-[11px] text-emerald-700 mt-1">
                                    Marcou meses em {anosComMeses.length} anos. Use as setas no topo pra navegar.
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={limparTudo}
                            className="shrink-0 p-1 rounded hover:bg-emerald-100 text-emerald-700"
                            title="Limpar todos"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-slate-500">
                    Marque os meses que o casal aceita. Pode marcar em mais de um ano usando as setas.
                </p>
            )}
        </div>
    )
}

function PresetChip({
    label,
    onClick,
    variant = 'default',
}: {
    label: string
    onClick: () => void
    variant?: 'default' | 'danger'
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                'text-[11px] px-2 py-0.5 rounded-full border transition ' +
                (variant === 'danger'
                    ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                    : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50')
            }
        >
            {label}
        </button>
    )
}
