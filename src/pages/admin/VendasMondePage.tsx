import { useState, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { parseBRNumber } from '@/lib/parseBRNumber'
import { toast } from 'sonner'

interface CsvRow {
    vendaNum: string
    produto: string
    valorTotal: number
    receita: number
}

interface MatchedCard {
    cardId: string
    cardTitle: string
    vendaNum: string
    products: CsvRow[]
    totalVenda: number
    totalReceita: number
}

interface MatchResult {
    matched: MatchedCard[]
    unmatched: string[]
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const VENDA_COLUMN_ALIASES = ['venda nº', 'venda no', 'venda n.', 'nº venda', 'venda_num', 'venda numero', 'venda número']
const PRODUTO_ALIASES = ['produto', 'product', 'nome produto']
const VALOR_TOTAL_ALIASES = ['valor total', 'total', 'valortotal', 'vl total']
const RECEITA_ALIASES = ['receitas', 'receita', 'revenue']

function findColumn(headers: string[], aliases: string[]): string | null {
    const normalized = headers.map(h => h.toLowerCase().trim())
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h === alias)
        if (idx >= 0) return headers[idx]
    }
    // Partial match fallback
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h.includes(alias))
        if (idx >= 0) return headers[idx]
    }
    return null
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

export default function VendasMondePage() {
    const { profile } = useAuth()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [step, setStep] = useState<Step>('upload')
    const [fileName, setFileName] = useState('')
    const [parsedRows, setParsedRows] = useState<CsvRow[]>([])
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
    const [isMatching, setIsMatching] = useState(false)
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importResult, setImportResult] = useState<{ cardsUpdated: number; productsImported: number; matched: MatchedCard[] } | null>(null)

    const isAdmin = profile?.is_admin === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGestor = (profile as any)?.role_info?.name === 'gestor'

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)

        const reader = new FileReader()
        reader.onload = async (evt) => {
            try {
                const data = evt.target?.result
                const workbook = XLSX.read(data, { type: 'array' })
                const sheet = workbook.Sheets[workbook.SheetNames[0]]
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

                if (jsonData.length === 0) {
                    toast.error('Arquivo vazio')
                    return
                }

                const headers = Object.keys(jsonData[0])
                const vendaCol = findColumn(headers, VENDA_COLUMN_ALIASES)
                const produtoCol = findColumn(headers, PRODUTO_ALIASES)
                const valorCol = findColumn(headers, VALOR_TOTAL_ALIASES)
                const receitaCol = findColumn(headers, RECEITA_ALIASES)

                if (!vendaCol) {
                    toast.error('Coluna "Venda Nº" não encontrada no arquivo')
                    return
                }
                if (!produtoCol) {
                    toast.error('Coluna "Produto" não encontrada no arquivo')
                    return
                }
                if (!valorCol) {
                    toast.error('Coluna "Valor Total" não encontrada no arquivo')
                    return
                }

                const rows: CsvRow[] = jsonData
                    .filter(row => row[vendaCol] != null && String(row[vendaCol]).trim() !== '')
                    .map(row => ({
                        vendaNum: String(row[vendaCol]).trim(),
                        produto: String(row[produtoCol] || '').trim(),
                        valorTotal: parseBRNumber(row[valorCol]),
                        receita: receitaCol ? parseBRNumber(row[receitaCol]) : 0,
                    }))

                if (rows.length === 0) {
                    toast.error('Nenhuma linha válida encontrada')
                    return
                }

                setParsedRows(rows)
                toast.success(`${rows.length} linhas carregadas`)

                // Start matching
                await matchCards(rows)
            } catch (err) {
                console.error('Erro ao ler arquivo:', err)
                toast.error('Erro ao ler o arquivo')
            }
        }
        reader.readAsArrayBuffer(file)
    }, [])

    const matchCards = async (rows: CsvRow[]) => {
        setIsMatching(true)
        setStep('preview')

        try {
            // Group rows by vendaNum
            const grouped = new Map<string, CsvRow[]>()
            for (const row of rows) {
                const existing = grouped.get(row.vendaNum) || []
                existing.push(row)
                grouped.set(row.vendaNum, existing)
            }

            const uniqueVendaNums = Array.from(grouped.keys())
            const matched: MatchedCard[] = []
            const matchedNums = new Set<string>()

            // Batch query: primary match by numero_venda_monde
            const BATCH_SIZE = 50
            for (let i = 0; i < uniqueVendaNums.length; i += BATCH_SIZE) {
                const batch = uniqueVendaNums.slice(i, i + BATCH_SIZE)

                // Query cards where numero_venda_monde matches any of the batch values
                const { data: cards, error } = await supabase
                    .from('cards')
                    .select('id, titulo, produto_data')
                    .not('produto_data', 'is', null)

                if (error) throw error

                for (const card of cards || []) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const produtoData = card.produto_data as Record<string, any> | null
                    if (!produtoData) continue

                    const mondePrimary = String(produtoData.numero_venda_monde || '').trim()
                    const mondeHistory: Array<{ numero: string }> = produtoData.numeros_venda_monde_historico || []

                    // Check primary monde number
                    for (const num of batch) {
                        if (matchedNums.has(num)) continue

                        let isMatch = mondePrimary === num
                        if (!isMatch) {
                            isMatch = mondeHistory.some(h => String(h.numero).trim() === num)
                        }

                        if (isMatch) {
                            const products = grouped.get(num)!
                            matched.push({
                                cardId: card.id,
                                cardTitle: (card.titulo as string) || 'Card sem título',
                                vendaNum: num,
                                products,
                                totalVenda: products.reduce((s, p) => s + p.valorTotal, 0),
                                totalReceita: products.reduce((s, p) => s + p.receita, 0),
                            })
                            matchedNums.add(num)
                        }
                    }
                }
            }

            const unmatched = uniqueVendaNums.filter(n => !matchedNums.has(n))

            setMatchResult({ matched, unmatched })
        } catch (err) {
            console.error('Erro ao fazer matching:', err)
            toast.error('Erro ao buscar cards no banco')
        } finally {
            setIsMatching(false)
        }
    }

    const handleImport = async () => {
        if (!matchResult || matchResult.matched.length === 0) return

        setStep('importing')
        const { matched } = matchResult
        setImportProgress({ current: 0, total: matched.length })

        let cardsUpdated = 0
        let productsImported = 0

        for (let i = 0; i < matched.length; i++) {
            const card = matched[i]
            try {
                // 1. Delete existing products
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from('card_financial_items') as any)
                    .delete()
                    .eq('card_id', card.cardId)

                // 2. Insert new products from CSV
                const inserts = card.products.map(p => ({
                    card_id: card.cardId,
                    product_type: 'custom',
                    description: p.produto || null,
                    sale_value: p.valorTotal,
                    supplier_cost: Math.round((p.valorTotal - p.receita) * 100) / 100,
                }))

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: insertError } = await (supabase.from('card_financial_items') as any)
                    .insert(inserts)

                if (insertError) throw insertError

                // 3. Recalculate card financials
                await supabase.rpc('recalcular_financeiro_manual', { p_card_id: card.cardId })

                cardsUpdated++
                productsImported += inserts.length
            } catch (err) {
                console.error(`Erro ao importar card ${card.cardId}:`, err)
                toast.error(`Erro no card "${card.cardTitle}"`)
            }

            setImportProgress({ current: i + 1, total: matched.length })
        }

        setImportResult({ cardsUpdated, productsImported, matched })
        setStep('done')
        toast.success(`${cardsUpdated} cards atualizados com ${productsImported} produtos`)
    }

    const handleReset = () => {
        setStep('upload')
        setFileName('')
        setParsedRows([])
        setMatchResult(null)
        setImportResult(null)
        setImportProgress({ current: 0, total: 0 })
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    if (!isAdmin && !isGestor) return <Navigate to="/dashboard" replace />

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-amber-600" />
                    Vendas Monde
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Importe um CSV do sistema Monde para popular os produtos dos cards automaticamente.
                </p>
            </div>

            {/* Step 1: Upload */}
            {step === 'upload' && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
                    <div className="flex flex-col items-center justify-center py-8">
                        <Upload className="h-12 w-12 text-slate-300 mb-4" />
                        <p className="text-sm text-slate-600 mb-1 font-medium">Selecione o arquivo CSV ou Excel do Monde</p>
                        <p className="text-xs text-slate-400 mb-6">O arquivo deve conter a coluna "Venda Nº" para fazer o match com os cards</p>
                        <label className="cursor-pointer">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors">
                                <FileSpreadsheet className="h-4 w-4" />
                                Escolher arquivo
                            </span>
                        </label>
                    </div>
                </div>
            )}

            {/* Step 2: Preview */}
            {step === 'preview' && (
                <div className="space-y-4">
                    {/* File info */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="h-5 w-5 text-amber-600" />
                            <div>
                                <p className="text-sm font-medium text-slate-900">{fileName}</p>
                                <p className="text-xs text-slate-400">{parsedRows.length} linhas carregadas</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleReset}>
                            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                            Trocar arquivo
                        </Button>
                    </div>

                    {isMatching ? (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 flex flex-col items-center">
                            <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-3" />
                            <p className="text-sm text-slate-600">Buscando cards no banco...</p>
                        </div>
                    ) : matchResult && (
                        <>
                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                                    <p className="text-2xl font-bold text-slate-900">{matchResult.matched.length}</p>
                                    <p className="text-xs text-emerald-600 font-medium">Cards encontrados</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                                    <p className="text-2xl font-bold text-slate-900">{matchResult.unmatched.length}</p>
                                    <p className="text-xs text-red-500 font-medium">Sem match</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                                    <p className="text-2xl font-bold text-slate-900">
                                        {matchResult.matched.reduce((s, m) => s + m.products.length, 0)}
                                    </p>
                                    <p className="text-xs text-slate-500 font-medium">Produtos a importar</p>
                                </div>
                            </div>

                            {/* Matched cards table */}
                            {matchResult.matched.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            Cards encontrados
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                                        {matchResult.matched.map((card) => (
                                            <div key={card.cardId} className="px-4 py-3">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-xs font-mono text-slate-400">#{card.vendaNum}</span>
                                                        <span className="text-sm font-medium text-slate-900 truncate">{card.cardTitle}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-400 shrink-0">{card.products.length} produto{card.products.length !== 1 ? 's' : ''}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                                    <span>Venda: <span className="font-medium text-slate-700">{formatBRL(card.totalVenda)}</span></span>
                                                    <span>Receita: <span className="font-medium text-emerald-600">{formatBRL(card.totalReceita)}</span></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Unmatched vendas */}
                            {matchResult.unmatched.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                            Vendas sem match ({matchResult.unmatched.length})
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Estas vendas não foram encontradas em nenhum card e serão ignoradas</p>
                                    </div>
                                    <div className="px-4 py-3">
                                        <div className="flex flex-wrap gap-2">
                                            {matchResult.unmatched.map(num => (
                                                <span key={num} className="text-xs font-mono bg-red-50 text-red-600 px-2 py-1 rounded">
                                                    #{num}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center justify-between pt-2">
                                <Button variant="outline" onClick={handleReset}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={matchResult.matched.length === 0}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Importar {matchResult.matched.length} card{matchResult.matched.length !== 1 ? 's' : ''}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Step 3: Importing */}
            {step === 'importing' && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 flex flex-col items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-3" />
                    <p className="text-sm font-medium text-slate-900 mb-1">
                        Importando... {importProgress.current}/{importProgress.total}
                    </p>
                    <div className="w-64 bg-slate-100 rounded-full h-2 mt-3">
                        <div
                            className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Step 4: Done */}
            {step === 'done' && importResult && (
                <div className="space-y-4">
                    <div className="bg-white border border-emerald-200 rounded-xl shadow-sm p-8 text-center">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                        <h2 className="text-lg font-bold text-slate-900 mb-1">Importação concluída</h2>
                        <p className="text-sm text-slate-500">
                            {importResult.cardsUpdated} card{importResult.cardsUpdated !== 1 ? 's' : ''} atualizado{importResult.cardsUpdated !== 1 ? 's' : ''} com {importResult.productsImported} produto{importResult.productsImported !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {/* Links to updated cards */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                            <h3 className="text-sm font-semibold text-slate-900">Cards atualizados</h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                            {importResult.matched.map((card) => (
                                <Link
                                    key={card.cardId}
                                    to={`/cards/${card.cardId}`}
                                    className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs font-mono text-slate-400">#{card.vendaNum}</span>
                                        <span className="text-sm text-slate-700 truncate">{card.cardTitle}</span>
                                    </div>
                                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-center pt-2">
                        <Button onClick={handleReset} className="bg-amber-600 hover:bg-amber-700 text-white">
                            Nova importação
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
