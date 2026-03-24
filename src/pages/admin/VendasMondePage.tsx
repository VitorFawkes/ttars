import { useState, useCallback, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
    Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
    ArrowLeft, ExternalLink, Clock, ChevronDown, ChevronRight,
    XCircle, Package, User as UserIcon, Download, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { parseBRNumber } from '@/lib/parseBRNumber'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

interface CsvRow {
    vendaNum: string
    produto: string
    valorTotal: number
    receita: number
    passageiros: string[]
    fornecedor: string
    representante: string
    documento: string
    dataInicio: string | null
    dataFim: string | null
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

interface ImportLogRow {
    id: string
    file_name: string
    total_rows: number
    matched_cards: number
    unmatched_vendas: number
    products_imported: number
    status: 'completed' | 'partial' | 'failed'
    error_message: string | null
    created_by: string
    created_at: string
    // joined
    profile_name?: string
}

interface ImportLogItemRow {
    id: string
    card_id: string
    card_title: string
    venda_num: string
    products_count: number
    total_venda: number
    total_receita: number
    status: 'success' | 'error'
    error_message: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Normaliza removendo acentos, º, pontuação e espaços extras
const norm = (s: string) => s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°.]/g, '')
    .replace(/\s+/g, ' ')

/** Converte data BR (dd/mm/yyyy), ISO, ou serial Excel para YYYY-MM-DD. Retorna null se inválido. */
function parseDateBR(value: unknown): string | null {
    if (value == null) return null
    // Excel serial date (number)
    if (typeof value === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30))
        const d = new Date(epoch.getTime() + value * 86400000)
        if (isNaN(d.getTime())) return null
        return d.toISOString().slice(0, 10)
    }
    const s = String(value).trim()
    if (!s) return null
    // dd/mm/yyyy or dd-mm-yyyy
    const brMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch
        const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    // yyyy-mm-dd (ISO)
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
        const d = new Date(isoMatch[0] + 'T00:00:00')
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    return null
}

const VENDA_COLUMN_ALIASES = ['venda n', 'venda no', 'n venda', 'venda_num', 'venda numero', 'num venda', 'no venda']
const PRODUTO_ALIASES = ['produto', 'product', 'nome produto']
const VALOR_TOTAL_ALIASES = ['valor total', 'total', 'valortotal', 'vl total']
const RECEITA_ALIASES = ['receitas', 'receita', 'revenue']
const PASSAGEIRO_ALIASES = ['passageiros', 'passageiro', 'passengers', 'pax', 'nomes passageiros']
const FORNECEDOR_ALIASES = ['fornecedor', 'supplier', 'hotel', 'cia aerea', 'companhia']
const REPRESENTANTE_ALIASES = ['representante', 'representative', 'agencia', 'operadora']
const DOCUMENTO_ALIASES = ['documento', 'doc', 'confirmacao', 'localizador', 'numero confirmacao', 'n confirmacao']
const DATA_INICIO_ALIASES = ['data inicio', 'data de inicio', 'check in', 'checkin', 'inicio', 'dt inicio']
const DATA_FIM_ALIASES = ['data fim', 'data de fim', 'check out', 'checkout', 'fim', 'dt fim']

function findColumn(headers: string[], aliases: string[]): string | null {
    const normalized = headers.map(h => norm(h))
    // Exact match
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h === alias)
        if (idx >= 0) return headers[idx]
    }
    // Partial match
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h.includes(alias))
        if (idx >= 0) return headers[idx]
    }
    return null
}

// ─── Status badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    if (status === 'completed') return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" /> Concluído
        </span>
    )
    if (status === 'partial') return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            <AlertTriangle className="h-3 w-3" /> Parcial
        </span>
    )
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
            <XCircle className="h-3 w-3" /> Erro
        </span>
    )
}

// ─── History row (expandable) ────────────────────────────────

function HistoryRow({ log }: { log: ImportLogRow }) {
    const [expanded, setExpanded] = useState(false)
    const [items, setItems] = useState<ImportLogItemRow[] | null>(null)
    const [loadingItems, setLoadingItems] = useState(false)

    const handleExpand = async () => {
        if (expanded) { setExpanded(false); return }
        setExpanded(true)
        if (items) return
        setLoadingItems(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from('monde_import_log_items') as any)
            .select('*')
            .eq('import_log_id', log.id)
            .order('created_at')
        setItems((data || []) as ImportLogItemRow[])
        setLoadingItems(false)
    }

    const Chevron = expanded ? ChevronDown : ChevronRight

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            <button
                onClick={handleExpand}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors text-left"
            >
                <Chevron className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-900 truncate">{log.file_name}</span>
                        <StatusBadge status={log.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(log.created_at)}
                        </span>
                        {log.profile_name && (
                            <span className="flex items-center gap-1">
                                <UserIcon className="h-3 w-3" />
                                {log.profile_name}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{log.matched_cards}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cards</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{log.products_imported}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Produtos</p>
                    </div>
                    {log.unmatched_vendas > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-amber-600">{log.unmatched_vendas}</p>
                            <p className="text-[10px] text-amber-500 uppercase tracking-wide">Sem match</p>
                        </div>
                    )}
                </div>
            </button>

            {expanded && (
                <div className="bg-slate-50/50 border-t border-slate-100 px-4 py-2">
                    {loadingItems ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                    ) : items && items.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                            {items.map(item => (
                                <div key={item.id} className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {item.status === 'success' ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        ) : (
                                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        )}
                                        <span className="text-xs font-mono text-slate-400">#{item.venda_num}</span>
                                        <Link
                                            to={`/cards/${item.card_id}`}
                                            className="text-sm text-indigo-600 hover:text-indigo-800 truncate hover:underline"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {item.card_title}
                                        </Link>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                                        <span>{item.products_count} prod.</span>
                                        <span className="font-medium text-slate-700">{formatBRL(Number(item.total_venda))}</span>
                                        <Link
                                            to={`/cards/${item.card_id}`}
                                            className="text-slate-400 hover:text-indigo-600"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 py-3 text-center">Nenhum detalhe registrado</p>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Preview card row (expandable with products) ─────────────

function displayDateBR(iso: string | null) {
    if (!iso) return null
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

function PreviewCardRow({ card }: { card: MatchedCard }) {
    const [expanded, setExpanded] = useState(false)
    const paxCount = new Set(card.products.flatMap(p => p.passageiros)).size
    const Chevron = expanded ? ChevronDown : ChevronRight

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 text-left hover:bg-slate-50/50 transition-colors"
            >
                <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                        <Chevron className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-slate-400">#{card.vendaNum}</span>
                        <span className="text-sm font-medium text-slate-900 truncate">{card.cardTitle}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {card.products.length}
                        </span>
                        {paxCount > 0 && (
                            <span className="text-xs text-indigo-500 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {paxCount}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 ml-5">
                    <span>Venda: <span className="font-medium text-slate-700">{formatBRL(card.totalVenda)}</span></span>
                    <span>Receita: <span className="font-medium text-emerald-600">{formatBRL(card.totalReceita)}</span></span>
                </div>
            </button>

            {expanded && (
                <div className="bg-slate-50/50 border-t border-slate-100 px-4 py-2">
                    <div className="space-y-2">
                        {card.products.map((p, idx) => (
                            <div key={idx} className="flex items-start gap-3 py-1.5">
                                <span className="text-[10px] text-slate-400 mt-0.5 shrink-0 w-4 text-right">{idx + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-700 truncate">{p.produto || 'Produto'}</span>
                                        <span className="text-xs text-slate-500 shrink-0 ml-2">{formatBRL(p.valorTotal)}</span>
                                    </div>
                                    {/* Extra details */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-slate-400">
                                        {p.fornecedor && <span>{p.fornecedor}</span>}
                                        {p.representante && <span>via {p.representante}</span>}
                                        {p.documento && <span>{p.documento}</span>}
                                        {(p.dataInicio || p.dataFim) && (
                                            <span>
                                                {displayDateBR(p.dataInicio)}{p.dataFim && p.dataFim !== p.dataInicio ? ` → ${displayDateBR(p.dataFim)}` : ''}
                                            </span>
                                        )}
                                        {p.passageiros.length > 0 && (
                                            <span className="text-indigo-400">{p.passageiros.join(', ')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Main page ───────────────────────────────────────────────

type Step = 'idle' | 'preview' | 'importing' | 'done'

export default function VendasMondePage() {
    const { profile } = useAuth()
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [step, setStep] = useState<Step>('idle')
    const [fileName, setFileName] = useState('')
    const [parsedRows, setParsedRows] = useState<CsvRow[]>([])
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
    const [isMatching, setIsMatching] = useState(false)
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importResult, setImportResult] = useState<{ cardsUpdated: number; productsImported: number; errors: number; matched: MatchedCard[] } | null>(null)

    const isAdmin = profile?.is_admin === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGestor = (profile as any)?.role_info?.name === 'gestor'

    // ─── Import history ──────────────────────────────────────
    const { data: history = [], isLoading: historyLoading } = useQuery({
        queryKey: ['monde-import-logs'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('monde_import_logs') as any)
                .select('*, profiles:created_by(nome)')
                .order('created_at', { ascending: false })
                .limit(50)
            if (error) throw error
            return (data || []).map((row: Record<string, unknown>) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const profiles = row.profiles as any
                return {
                    ...row,
                    profile_name: profiles?.nome || 'Usuário',
                } as ImportLogRow
            })
        },
    })

    // ─── File upload ─────────────────────────────────────────
    const processWorkbook = useCallback(async (workbook: XLSX.WorkBook, name: string) => {
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

        if (jsonData.length === 0) { toast.error('Arquivo vazio'); return }

        const headers = Object.keys(jsonData[0])
        const vendaCol = findColumn(headers, VENDA_COLUMN_ALIASES)
        const produtoCol = findColumn(headers, PRODUTO_ALIASES)
        const valorCol = findColumn(headers, VALOR_TOTAL_ALIASES)
        const receitaCol = findColumn(headers, RECEITA_ALIASES)
        const passageiroCol = findColumn(headers, PASSAGEIRO_ALIASES)
        const fornecedorCol = findColumn(headers, FORNECEDOR_ALIASES)
        const representanteCol = findColumn(headers, REPRESENTANTE_ALIASES)
        const documentoCol = findColumn(headers, DOCUMENTO_ALIASES)
        const dataInicioCol = findColumn(headers, DATA_INICIO_ALIASES)
        const dataFimCol = findColumn(headers, DATA_FIM_ALIASES)

        if (!vendaCol) { toast.error('Coluna "Venda Nº" não encontrada'); return }
        if (!produtoCol) { toast.error('Coluna "Produto" não encontrada'); return }
        if (!valorCol) { toast.error('Coluna "Valor Total" não encontrada'); return }

        const rows: CsvRow[] = jsonData
            .filter(row => row[vendaCol] != null && String(row[vendaCol]).trim() !== '')
            .map(row => ({
                vendaNum: String(row[vendaCol]).trim(),
                produto: String(row[produtoCol] || '').trim(),
                valorTotal: parseBRNumber(row[valorCol]),
                receita: receitaCol ? parseBRNumber(row[receitaCol]) : 0,
                passageiros: passageiroCol
                    ? String(row[passageiroCol] || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
                    : [],
                fornecedor: fornecedorCol ? String(row[fornecedorCol] || '').trim() : '',
                representante: representanteCol ? String(row[representanteCol] || '').trim() : '',
                documento: documentoCol ? String(row[documentoCol] || '').trim() : '',
                dataInicio: dataInicioCol ? parseDateBR(row[dataInicioCol]) : null,
                dataFim: dataFimCol ? parseDateBR(row[dataFimCol]) : null,
            }))

        if (rows.length === 0) { toast.error('Nenhuma linha válida encontrada'); return }

        setParsedRows(rows)
        setFileName(name)
        toast.success(`${rows.length} linhas carregadas`)
        await matchCards(rows)
    }, [])

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        const isCSV = /\.(csv|tsv|txt)$/i.test(file.name)

        try {
            if (isCSV) {
                // CSV: ler como texto UTF-8 para preservar acentos nos headers
                const text = await file.text()
                const workbook = XLSX.read(text, { type: 'string' })
                await processWorkbook(workbook, file.name)
            } else {
                // XLSX/XLS: ler como ArrayBuffer
                const reader = new FileReader()
                reader.onload = async (evt) => {
                    try {
                        const data = evt.target?.result
                        const workbook = XLSX.read(data, { type: 'array' })
                        await processWorkbook(workbook, file.name)
                    } catch (err) {
                        console.error('Erro ao ler arquivo:', err)
                        toast.error('Erro ao ler o arquivo')
                    }
                }
                reader.readAsArrayBuffer(file)
            }
        } catch (err) {
            console.error('Erro ao ler arquivo:', err)
            toast.error('Erro ao ler o arquivo')
        }
    }, [processWorkbook])

    // ─── Matching ────────────────────────────────────────────
    const matchCards = async (rows: CsvRow[]) => {
        setIsMatching(true)
        setStep('preview')

        try {
            const grouped = new Map<string, CsvRow[]>()
            for (const row of rows) {
                const existing = grouped.get(row.vendaNum) || []
                existing.push(row)
                grouped.set(row.vendaNum, existing)
            }

            const uniqueVendaNums = Array.from(grouped.keys())
            const matched: MatchedCard[] = []
            const matchedNums = new Set<string>()

            // Buscar cada número de venda diretamente no JSONB (filtro server-side)
            for (const num of uniqueVendaNums) {
                // 1. Match primário: produto_data->>numero_venda_monde
                const { data: cards } = await supabase
                    .from('cards')
                    .select('id, titulo')
                    .eq('produto_data->>numero_venda_monde', num)
                    .limit(1)

                const card = cards?.[0]
                if (card) {
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
                    continue
                }

                // 2. Fallback: buscar no histórico (numeros_venda_monde_historico)
                // Usa containment operator para buscar dentro do array JSONB
                const { data: histCards } = await supabase
                    .from('cards')
                    .select('id, titulo')
                    .contains('produto_data', { numeros_venda_monde_historico: [{ numero: num }] })
                    .limit(1)

                const histCard = histCards?.[0]
                if (histCard) {
                    const products = grouped.get(num)!
                    matched.push({
                        cardId: histCard.id,
                        cardTitle: (histCard.titulo as string) || 'Card sem título',
                        vendaNum: num,
                        products,
                        totalVenda: products.reduce((s, p) => s + p.valorTotal, 0),
                        totalReceita: products.reduce((s, p) => s + p.receita, 0),
                    })
                    matchedNums.add(num)
                }
            }

            setMatchResult({ matched, unmatched: uniqueVendaNums.filter(n => !matchedNums.has(n)) })
        } catch (err) {
            console.error('Erro ao fazer matching:', err)
            toast.error('Erro ao buscar cards no banco')
        } finally {
            setIsMatching(false)
        }
    }

    // ─── Import ──────────────────────────────────────────────
    const handleImport = async () => {
        if (!matchResult || matchResult.matched.length === 0) return

        setStep('importing')
        const { matched, unmatched } = matchResult
        setImportProgress({ current: 0, total: matched.length })

        let cardsUpdated = 0
        let productsImported = 0
        let errors = 0
        const cardResults: Array<{ card: MatchedCard; status: 'success' | 'error'; error?: string }> = []

        for (let i = 0; i < matched.length; i++) {
            const card = matched[i]
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from('card_financial_items') as any)
                    .delete()
                    .eq('card_id', card.cardId)

                const inserts = card.products.map(p => ({
                    card_id: card.cardId,
                    product_type: 'custom',
                    description: p.produto || null,
                    sale_value: p.valorTotal,
                    supplier_cost: Math.round((p.valorTotal - p.receita) * 100) / 100,
                    fornecedor: p.fornecedor || null,
                    representante: p.representante || null,
                    documento: p.documento || null,
                    data_inicio: p.dataInicio || null,
                    data_fim: p.dataFim || null,
                }))

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: insertedItems, error: insertError } = await (supabase.from('card_financial_items') as any)
                    .insert(inserts)
                    .select('id')

                if (insertError) throw insertError

                // Inserir passageiros por produto
                const passengerRows: Array<{ financial_item_id: string; card_id: string; nome: string; ordem: number }> = []
                if (insertedItems) {
                    for (let j = 0; j < card.products.length; j++) {
                        const product = card.products[j]
                        const itemId = insertedItems[j]?.id
                        if (!itemId || product.passageiros.length === 0) continue
                        product.passageiros.forEach((nome: string, idx: number) => {
                            passengerRows.push({
                                financial_item_id: itemId,
                                card_id: card.cardId,
                                nome,
                                ordem: idx,
                            })
                        })
                    }
                }
                if (passengerRows.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any).from('financial_item_passengers').insert(passengerRows)
                }

                await supabase.rpc('recalcular_financeiro_manual', { p_card_id: card.cardId })

                cardsUpdated++
                productsImported += inserts.length
                cardResults.push({ card, status: 'success' })
            } catch (err) {
                errors++
                const msg = err instanceof Error ? err.message : 'Erro desconhecido'
                cardResults.push({ card, status: 'error', error: msg })
                console.error(`Erro card ${card.cardId}:`, err)
            }

            setImportProgress({ current: i + 1, total: matched.length })
        }

        // ─── Persist log ─────────────────────────────────────
        try {
            const logStatus = errors === 0 ? 'completed' : (cardsUpdated > 0 ? 'partial' : 'failed')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: logRow, error: logError } = await (supabase.from('monde_import_logs') as any)
                .insert({
                    file_name: fileName,
                    total_rows: parsedRows.length,
                    matched_cards: cardsUpdated,
                    unmatched_vendas: unmatched.length,
                    products_imported: productsImported,
                    status: logStatus,
                    error_message: errors > 0 ? `${errors} card(s) com erro` : null,
                    created_by: profile?.id,
                })
                .select()
                .single()

            if (!logError && logRow) {
                const logItems = cardResults.map(r => ({
                    import_log_id: logRow.id,
                    card_id: r.card.cardId,
                    card_title: r.card.cardTitle,
                    venda_num: r.card.vendaNum,
                    products_count: r.card.products.length,
                    total_venda: r.card.totalVenda,
                    total_receita: r.card.totalReceita,
                    status: r.status,
                    error_message: r.error || null,
                }))

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from('monde_import_log_items') as any).insert(logItems)
            }
        } catch (logErr) {
            console.error('Erro ao salvar log:', logErr)
        }

        queryClient.invalidateQueries({ queryKey: ['monde-import-logs'] })
        setImportResult({ cardsUpdated, productsImported, errors, matched })
        setStep('done')

        if (errors === 0) {
            toast.success(`${cardsUpdated} cards atualizados com ${productsImported} produtos`)
        } else {
            toast.warning(`${cardsUpdated} cards OK, ${errors} com erro`)
        }
    }

    const handleReset = () => {
        setStep('idle')
        setFileName('')
        setParsedRows([])
        setMatchResult(null)
        setImportResult(null)
        setImportProgress({ current: 0, total: 0 })
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    if (!isAdmin && !isGestor) return <Navigate to="/dashboard" replace />

    // ─── Computed stats from last import ─────────────────────
    const lastImport = history[0] as ImportLogRow | undefined

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto p-6 pb-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5 text-amber-600" />
                            Vendas Monde
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Importe os produtos dos cards a partir do CSV ou Excel do sistema Monde
                        </p>
                    </div>
                    {step === 'idle' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    const csv = [
                                        'Venda Nº,Produto,Valor Total,Receitas,Passageiros,Fornecedor,Representante,Documento,Data Início,Data Fim',
                                        '99001,Hotel Grand Hyatt Cancún (5 noites),"R$ 12.500,00","R$ 2.100,00","João Silva, Maria Santos",Grand Hyatt,CVC,CONF-12345,10/05/2026,15/05/2026',
                                        '99001,Aéreo GRU-CUN-GRU (LATAM),"R$ 8.750,00","R$ 1.300,00","João Silva, Maria Santos",LATAM Airlines,Consolidadora X,LOC-ABC123,10/05/2026,15/05/2026',
                                        '99001,Transfer Aeroporto-Hotel,"R$ 950,00","R$ 180,00","João Silva, Maria Santos",Best Day,Best Day,TD-9988,,',
                                        '99001,Passeio Isla Mujeres,"R$ 1.200,00","R$ 250,00","João Silva",Xcaret,Best Day,PSS-4455,12/05/2026,12/05/2026',
                                        '99002,Hotel Ritz Paris (3 noites),"R$ 25.000,00","R$ 4.500,00","Ana Costa",Ritz Paris,Virtuoso,RES-77001,20/06/2026,23/06/2026',
                                        '99002,Aéreo GRU-CDG-GRU (Air France),"R$ 15.800,00","R$ 2.800,00","Ana Costa",Air France,Consolidadora Y,E-TKT-5566,20/06/2026,23/06/2026',
                                    ].join('\n')
                                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = 'teste_vendas_monde.csv'
                                    a.click()
                                    URL.revokeObjectURL(url)
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors"
                            >
                                <Download className="h-4 w-4" />
                                Baixar CSV exemplo
                            </button>
                            <label className="cursor-pointer">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                                    <Upload className="h-4 w-4" />
                                    Importar Planilha
                                </span>
                            </label>
                        </div>
                    )}
                </div>

                {/* ─── Active import flow ──────────────────── */}
                {step !== 'idle' && (
                    <div className="mb-8 space-y-4">
                        {/* Preview */}
                        {step === 'preview' && (
                            <>
                                {/* File bar */}
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
                                        {/* KPI cards */}
                                        {(() => {
                                            const totalPax = new Set(matchResult.matched.flatMap(m => m.products.flatMap(p => p.passageiros))).size
                                            const hasPax = totalPax > 0
                                            return (
                                                <div className={cn("grid gap-3", hasPax ? "grid-cols-4" : "grid-cols-3")}>
                                                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                                                        <p className="text-2xl font-bold text-emerald-600">{matchResult.matched.length}</p>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Cards encontrados</p>
                                                    </div>
                                                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center">
                                                        <p className="text-2xl font-bold text-slate-900">
                                                            {matchResult.matched.reduce((s, m) => s + m.products.length, 0)}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Produtos a importar</p>
                                                    </div>
                                                    {hasPax && (
                                                        <div className="bg-white border border-indigo-200 rounded-xl shadow-sm p-4 text-center">
                                                            <p className="text-2xl font-bold text-indigo-600">{totalPax}</p>
                                                            <p className="text-xs text-slate-500 font-medium mt-0.5">Passageiros</p>
                                                        </div>
                                                    )}
                                                    <div className={cn(
                                                        "bg-white border rounded-xl shadow-sm p-4 text-center",
                                                        matchResult.unmatched.length > 0 ? "border-amber-200" : "border-slate-200"
                                                    )}>
                                                        <p className={cn("text-2xl font-bold", matchResult.unmatched.length > 0 ? "text-amber-600" : "text-slate-400")}>
                                                            {matchResult.unmatched.length}
                                                        </p>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Sem match</p>
                                                    </div>
                                                </div>
                                            )
                                        })()}

                                        {/* Matched cards list */}
                                        {matchResult.matched.length > 0 && (
                                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                        Cards que serão atualizados
                                                    </h3>
                                                </div>
                                                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                                                    {matchResult.matched.map((card) => (
                                                        <PreviewCardRow key={card.cardId} card={card} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Unmatched */}
                                        {matchResult.unmatched.length > 0 && (
                                            <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
                                                <div className="px-4 py-3 border-b border-amber-200 bg-amber-50/50">
                                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                        Vendas sem match ({matchResult.unmatched.length})
                                                    </h3>
                                                    <p className="text-xs text-slate-500 mt-0.5">Nenhum card com esses números de venda — serão ignorados</p>
                                                </div>
                                                <div className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {matchResult.unmatched.map(num => (
                                                            <span key={num} className="text-xs font-mono bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200">
                                                                #{num}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex items-center justify-between pt-2">
                                            <Button variant="outline" onClick={handleReset}>Cancelar</Button>
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
                            </>
                        )}

                        {/* Importing */}
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

                        {/* Done */}
                        {step === 'done' && importResult && (
                            <>
                                <div className={cn(
                                    "bg-white border rounded-xl shadow-sm p-8 text-center",
                                    importResult.errors === 0 ? "border-emerald-200" : "border-amber-200"
                                )}>
                                    {importResult.errors === 0 ? (
                                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                                    ) : (
                                        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                                    )}
                                    <h2 className="text-lg font-bold text-slate-900 mb-1">
                                        {importResult.errors === 0 ? 'Importação concluída' : 'Importação concluída com erros'}
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        {importResult.cardsUpdated} card{importResult.cardsUpdated !== 1 ? 's' : ''} atualizado{importResult.cardsUpdated !== 1 ? 's' : ''} com {importResult.productsImported} produto{importResult.productsImported !== 1 ? 's' : ''}
                                        {importResult.errors > 0 && (
                                            <span className="text-red-600"> — {importResult.errors} com erro</span>
                                        )}
                                    </p>
                                </div>

                                {/* Updated cards list */}
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
                                                    <span className="text-xs text-slate-400">{card.products.length} prod.</span>
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
                            </>
                        )}
                    </div>
                )}

                {/* ─── Last import summary card ───────────── */}
                {step === 'idle' && lastImport && (
                    <div className="mb-6">
                        <div className={cn(
                            "bg-white border rounded-xl shadow-sm p-4",
                            lastImport.status === 'completed' ? "border-emerald-200" : lastImport.status === 'partial' ? "border-amber-200" : "border-red-200"
                        )}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-semibold text-slate-900">Última importação</h3>
                                    <StatusBadge status={lastImport.status} />
                                </div>
                                <span className="text-xs text-slate-400">{formatDate(lastImport.created_at)}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                <div>
                                    <p className="text-2xl font-bold text-slate-900">{lastImport.matched_cards}</p>
                                    <p className="text-xs text-slate-500">Cards atualizados</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-slate-900">{lastImport.products_imported}</p>
                                    <p className="text-xs text-slate-500">Produtos importados</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-slate-900">{lastImport.total_rows}</p>
                                    <p className="text-xs text-slate-500">Linhas no CSV</p>
                                </div>
                                <div>
                                    <p className={cn("text-2xl font-bold", lastImport.unmatched_vendas > 0 ? "text-amber-600" : "text-slate-400")}>
                                        {lastImport.unmatched_vendas}
                                    </p>
                                    <p className="text-xs text-slate-500">Sem match</p>
                                </div>
                            </div>
                            {lastImport.profile_name && (
                                <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                                    <UserIcon className="h-3 w-3" /> por {lastImport.profile_name}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── Import history ─────────────────────── */}
                {step === 'idle' && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <Clock className="h-4 w-4 text-slate-400" />
                                Histórico de importações
                            </h3>
                            <span className="text-xs text-slate-400">{history.length} importaç{history.length !== 1 ? 'ões' : 'ão'}</span>
                        </div>

                        {historyLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <FileSpreadsheet className="h-10 w-10 text-slate-200 mb-3" />
                                <p className="text-sm text-slate-500 font-medium">Nenhuma importação realizada</p>
                                <p className="text-xs text-slate-400 mt-1">Clique em "Importar Planilha" para começar</p>
                            </div>
                        ) : (
                            <div className="max-h-[500px] overflow-y-auto">
                                {history.map((log: ImportLogRow) => (
                                    <HistoryRow key={log.id} log={log} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
