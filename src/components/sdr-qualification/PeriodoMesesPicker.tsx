import { useMemo, useState } from 'react'
import { Plus, Minus, Trash2 } from 'lucide-react'

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

    // Anos visíveis: corrente + 2 anos pra frente por padrão. User pode expandir.
    const [anoMin, setAnoMin] = useState<number>(() => {
        const anosComMeses = selecionados
            .map((m) => Number(m.split('-')[0]))
            .filter((n) => !isNaN(n))
        return anosComMeses.length > 0 ? Math.min(anoAtual, ...anosComMeses) : anoAtual
    })
    const [anoMax, setAnoMax] = useState<number>(() => {
        const anosComMeses = selecionados
            .map((m) => Number(m.split('-')[0]))
            .filter((n) => !isNaN(n))
        const max = anosComMeses.length > 0 ? Math.max(anoAtual + 2, ...anosComMeses) : anoAtual + 2
        return max
    })

    const anosVisiveis = useMemo(() => {
        const arr: number[] = []
        for (let a = anoMin; a <= anoMax; a++) arr.push(a)
        return arr
    }, [anoMin, anoMax])

    const mesesPorAno = useMemo(() => {
        const m = new Map<number, Set<number>>()
        for (const ms of selecionados) {
            const match = /^(\d{4})-(\d{2})$/.exec(ms)
            if (!match) continue
            const ano = Number(match[1])
            const mes = Number(match[2])
            if (!m.has(ano)) m.set(ano, new Set())
            m.get(ano)!.add(mes)
        }
        return m
    }, [selecionados])

    const aplicarAno = (ano: number, novosMesesDoAno: number[]) => {
        const outros = selecionados.filter((m) => !m.startsWith(`${ano}-`))
        const novosDoAno = novosMesesDoAno
            .sort((a, b) => a - b)
            .map((n) => `${ano}-${String(n).padStart(2, '0')}`)
        const combinado = [...outros, ...novosDoAno].sort()
        onChange(combinado, formatarMesesPT(combinado))
    }

    const toggleMes = (ano: number, num: number) => {
        const atual = Array.from(mesesPorAno.get(ano) ?? new Set<number>())
        const idx = atual.indexOf(num)
        if (idx === -1) atual.push(num)
        else atual.splice(idx, 1)
        aplicarAno(ano, atual)
    }

    const marcarAnoTodo = (ano: number) => aplicarAno(ano, [1,2,3,4,5,6,7,8,9,10,11,12])
    const limparAno = (ano: number) => aplicarAno(ano, [])

    const limparTudo = () => onChange([], '')

    const textoHumano = formatarMesesPT(selecionados)

    return (
        <div className="space-y-3">
            {/* Resumo no topo */}
            {selecionados.length > 0 ? (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-emerald-700 font-medium uppercase tracking-wide">
                                {selecionados.length} {selecionados.length === 1 ? 'mês marcado' : 'meses marcados'}
                            </p>
                            <p className="text-sm text-emerald-900 mt-0.5">{textoHumano}</p>
                        </div>
                        <button
                            type="button"
                            onClick={limparTudo}
                            className="shrink-0 p-1 rounded hover:bg-emerald-100 text-emerald-700"
                            title="Limpar tudo"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-slate-500">
                    Marque os meses que o casal aceita — pode misturar meses de anos diferentes.
                </p>
            )}

            {/* Botão "ano anterior" */}
            <div className="flex justify-center">
                <button
                    type="button"
                    onClick={() => setAnoMin((a) => a - 1)}
                    className="text-[11px] text-slate-500 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Mostrar ano anterior ({anoMin - 1})
                </button>
            </div>

            {/* Grid: 1 linha por ano */}
            <div className="space-y-3">
                {anosVisiveis.map((ano) => {
                    const marcados = mesesPorAno.get(ano) ?? new Set<number>()
                    const cheio = marcados.size === 12
                    return (
                        <div key={ano} className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{ano}</span>
                                    {marcados.size > 0 && (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                            {marcados.size}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {!cheio && (
                                        <button
                                            type="button"
                                            onClick={() => marcarAnoTodo(ano)}
                                            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                                        >
                                            Ano todo
                                        </button>
                                    )}
                                    {marcados.size > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => limparAno(ano)}
                                            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-700"
                                        >
                                            Limpar
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-6 gap-1 p-2 bg-white">
                                {MESES_PT_SHORT.map((nome, idx) => {
                                    const num = idx + 1
                                    const marcado = marcados.has(num)
                                    return (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => toggleMes(ano, num)}
                                            className={
                                                'py-1 rounded text-xs font-medium border transition ' +
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
                        </div>
                    )
                })}
            </div>

            {/* Botão "próximo ano" */}
            <div className="flex justify-center gap-3">
                {anoMax > anoMin && (
                    <button
                        type="button"
                        onClick={() => {
                            // Só remove o último ano se ele não tiver meses marcados
                            const temMeses = (mesesPorAno.get(anoMax)?.size ?? 0) > 0
                            if (!temMeses) setAnoMax((a) => a - 1)
                        }}
                        disabled={(mesesPorAno.get(anoMax)?.size ?? 0) > 0}
                        className="text-[11px] text-slate-500 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={(mesesPorAno.get(anoMax)?.size ?? 0) > 0 ? 'Limpe os meses antes' : ''}
                    >
                        <Minus className="w-3 h-3" /> Esconder {anoMax}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setAnoMax((a) => a + 1)}
                    className="text-[11px] text-slate-500 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Mostrar próximo ano ({anoMax + 1})
                </button>
            </div>
        </div>
    )
}
