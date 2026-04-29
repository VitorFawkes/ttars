import { useState, useCallback, useRef, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
    Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
    ArrowLeft, Clock, ChevronDown, ChevronRight, XCircle,
    Package, Users, Plus, RefreshCw, Undo2, SquareCheck, Square, MinusSquare,
    Filter, X, Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useArchiveCard } from '@/hooks/useArchiveCard'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { parseBRNumber } from '@/lib/parseBRNumber'
import { readFileText } from '@/lib/readFileText'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    norm, parseDateBR, parseCSVNative, findColumn, chunked, formatBRL,
    formatDateBR,
    VENDA_COLUMN_ALIASES, PRODUTO_ALIASES, VALOR_TOTAL_ALIASES, RECEITA_ALIASES,
    PASSAGEIRO_ALIASES, FORNECEDOR_ALIASES, DATA_INICIO_ALIASES, DATA_FIM_ALIASES,
} from '@/lib/csvUtils'

// ─── Constants ──────────────────────────────────────────────

const STAGE_APP_CONTEUDO = 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36'
const STAGE_PRE_EMBARQUE_GT30 = '1f684773-f8f3-434a-a44d-4994750c41aa'
const STAGE_PRE_EMBARQUE_LT30 = '3ce80249-b579-4a9c-9b82-f8569735cea9'
const STAGE_EM_VIAGEM = '0ebab355-6d0e-4b19-af13-b4b31268275f'
const STAGE_POS_VIAGEM = '2c07134a-cb83-4075-bc86-4750beec9393'
const SAMANTHA_ID = 'b2e26ddf-ebe8-4649-b367-40d2cf3a6bc5'

const POS_VENDA_STAGES = [STAGE_APP_CONTEUDO, STAGE_PRE_EMBARQUE_GT30, STAGE_PRE_EMBARQUE_LT30,
    STAGE_EM_VIAGEM, STAGE_POS_VIAGEM]

// Column aliases specific to this CSV
const CPF_ALIASES = ['cpf']
const PAGANTE_ALIASES = ['pagante', 'payer']
const VENDEDOR_ALIASES = ['vendedor', 'seller', 'consultor']
const APP_GERADO_ALIASES = ['app gerado']
const VOUCHERS_APP_ALIASES = ['vouchers no app']
const CONTRATO_VOUCHER_ALIASES = ['contr/ voucher', 'contr./voucher', 'contr./ voucher', 'contrato voucher', 'contrato/voucher']
const DATA_VENDA_ALIASES = ['data venda']

// ─── Title formatting helpers ──────────────────────────────

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

// Keywords que indicam companhia aérea (não é destino).
// Minúsculo, comparação via includes no fornecedor normalizado.
const AIRLINE_KEYWORDS = [
    'gol', 'latam', 'tam ', 'azul', 'tap ', 'american', 'delta',
    'united', 'air france', 'klm', 'iberia', 'lufthansa', 'emirates',
    'qatar', 'turkish', 'copa', 'avianca', 'jetblue', 'alitalia',
    'british airways', 'aeromexico', 'swiss', 'austrian',
    'airlines', 'aerolineas', 'airways',
]

const DESTINO_MAX_LEN = 30

function capitalizeWord(w: string): string {
    if (!w) return ''
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

/** Nome curto: primeira + segunda palavra, capitalizadas. */
function formatShortName(fullName: string): string {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'Sem nome'
    if (parts.length === 1) return capitalizeWord(parts[0])
    return `${capitalizeWord(parts[0])} ${capitalizeWord(parts[1])}`
}

/** Formata uma data ISO (yyyy-mm-dd) como "DD MMM AA" (ex: "04 JUL 26"). */
function formatDateShort(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return iso
    const [, y, mm, d] = m
    const mmm = MONTHS_PT[parseInt(mm, 10) - 1] || '???'
    const yy = y.slice(2)
    return `${d} ${mmm} ${yy}`
}

function formatDateRangeShort(inicio: string | null, fim: string | null): string {
    if (!inicio && !fim) return 'Sem data'
    if (inicio && fim && inicio !== fim) {
        return `${formatDateShort(inicio)} - ${formatDateShort(fim)}`
    }
    return formatDateShort((inicio || fim) as string)
}

/** Tira destino do trip a partir dos fornecedores dos produtos, ignorando companhias aéreas. */
function extractDestination(products: { fornecedor: string }[]): string {
    const uniq: string[] = []
    const seen = new Set<string>()
    for (const p of products) {
        const f = (p.fornecedor || '').trim()
        if (!f) continue
        const lower = f.toLowerCase()
        const isAirline = AIRLINE_KEYWORDS.some(k => lower.includes(k))
        if (isAirline) continue
        if (!seen.has(lower)) {
            seen.add(lower)
            uniq.push(f)
        }
    }
    if (uniq.length === 0) return 'SEM DESTINO'
    let first = uniq[0]
    if (first.length > DESTINO_MAX_LEN) {
        first = first.slice(0, DESTINO_MAX_LEN - 3).trimEnd() + '...'
    }
    if (uniq.length > 1) {
        return `${first} + ${uniq.length - 1}`
    }
    return first
}

/** Gera o título padrão: "Nome Sobrenome / Destino / DD MMM AA - DD MMM AA". */
function buildTripTitle(
    pagante: string,
    products: { fornecedor: string }[],
    dataInicio: string | null,
    dataFim: string | null,
): string {
    const name = formatShortName(pagante)
    const destino = extractDestination(products)
    const dates = formatDateRangeShort(dataInicio, dataFim)
    return `${name} / ${destino} / ${dates}`
}

// ─── Types ──────────────────────────────────────────────────

interface PosVendaCsvRow {
    vendaNum: string
    vendedor: string
    cpf: string
    cpfNorm: string
    pagante: string
    fornecedor: string
    produto: string
    dataVenda: string | null
    dataInicio: string | null
    dataFim: string | null
    passageiros: string[]
    appGerado: string
    vouchersNoApp: string
    contratoVoucher: string
    receita: number
    valorTotal: number
}

interface TripGroup {
    id: string
    cpfPrincipal: string
    cpfNorm: string
    pagantePrincipal: string
    vendedor: string
    vendedorProfileId: string | null
    dataInicio: string | null
    dataFim: string | null
    products: PosVendaCsvRow[]
    allPassengers: string[]
    acompanhantes: string[]
    stage: { id: string; name: string }
    appEnviadoConcluida: boolean
    existingCardId: string | null
    existingCardTitle: string | null
    existingStageId: string | null
    existingStageName: string | null
    existingPhaseSlug: string | null
    existingStatusComercial: string | null
    existingGanhoPlanner: boolean | null
    existingGanhoPos: boolean | null
    existingDonoPosId: string | null
    /** Quando há mais de um card no CRM com a mesma venda, lista os outros (id + titulo). */
    otherCardCandidates: Array<{
        id: string
        titulo: string
        statusComercial: string | null
        ganhoPlanner: boolean | null
        stageId: string | null
        stageName: string | null
    }>
    moveStage: boolean
    action: 'create' | 'update' | 'skip'
    skipReason: string | null
    audit: AuditResult
    valorTotal: number
    receita: number
    vendaNums: string[]
}

type AuditSeverity = 'ok' | 'warn' | 'error'
interface AuditResult {
    severity: AuditSeverity
    issues: string[]
}

type Step = 'idle' | 'preview' | 'importing' | 'done'

// Flow:
// - 'detalhada'   → planilha por produto (CSV Monde original). Criar + atualizar cards.
// - 'agregada'    → planilha já agregada por viagem (sem CPF). Apenas atualizar cards existentes;
//                   linhas sem card no CRM ficam como 'skip' com motivo "sem card encontrado".
type FlowMode = 'detalhada' | 'agregada'

// ─── Auditoria ──────────────────────────────────────────────

/**
 * Calcula a "saúde" de uma viagem do CSV em relação ao card existente no CRM.
 *
 * - error → não encontrei card no CRM (a viagem da planilha não tem card correspondente)
 * - warn  → encontrei card, mas algo está fora do esperado para uma viagem ganha em pós-venda
 * - ok    → tudo certo
 */
function computeAudit(trip: Pick<TripGroup,
    'existingCardId' | 'existingPhaseSlug' | 'existingStageId' | 'existingStageName' |
    'existingStatusComercial' | 'existingGanhoPlanner' | 'existingGanhoPos' | 'existingDonoPosId'
>): AuditResult {
    if (!trip.existingCardId) {
        return {
            severity: 'error',
            issues: ['Não encontrei card no CRM para essa viagem.'],
        }
    }
    const issues: string[] = []

    // 1. Etapa: card precisa estar na fase Pós-venda
    if (trip.existingPhaseSlug && trip.existingPhaseSlug !== 'pos_venda') {
        const stageLabel = trip.existingStageName ? ` (${trip.existingStageName})` : ''
        issues.push(`Etapa atual${stageLabel} está fora da fase Pós-venda.`)
    } else if (!trip.existingPhaseSlug) {
        issues.push('Etapa do card não pôde ser identificada.')
    }

    // 2. Ganho Planner: deve estar marcado em qualquer etapa de pós-venda
    // (venda foi fechada antes do card chegar aqui)
    if (trip.existingGanhoPlanner !== true) {
        issues.push('Falta marcar o Ganho Planner (marco da venda fechada).')
    }

    // 3. Dono pós-venda preenchido
    if (!trip.existingDonoPosId) {
        issues.push('Sem dono pós-venda atribuído.')
    }

    // 4. status_comercial='ganho' E ganho_pos=true SÓ podem aparecer na etapa
    //    "Pós-viagem & Reativação" (a viagem aconteceu, ciclo completo, sem risco residual).
    //    Em pré-embarque / Em Viagem ainda há risco de cancelamento/reembolso, então o
    //    status_comercial deve estar como 'aberto' e ganho_pos como false.
    if (trip.existingPhaseSlug === 'pos_venda' && trip.existingStageId) {
        const isPostTrip = trip.existingStageId === STAGE_POS_VIAGEM
        const stageLabel = trip.existingStageName ? ` ("${trip.existingStageName}")` : ''

        if (isPostTrip) {
            // Etapa Pós-viagem: status='ganho' E ganho_pos=true são esperados
            if (trip.existingStatusComercial !== 'ganho') {
                const statusLabel = trip.existingStatusComercial || 'desconhecido'
                issues.push(`Etapa é Pós-viagem mas status comercial está como "${statusLabel}" — deveria estar como "ganho".`)
            }
            if (trip.existingGanhoPos !== true) {
                issues.push('Etapa é Pós-viagem mas o Ganho Pós-venda ainda não foi marcado.')
            }
        } else {
            // Etapas pré-Pós-viagem (App & Conteúdo, Pré-embarque, Em Viagem):
            // status='ganho' OU ganho_pos=true são divergência (viagem ainda não aconteceu)
            if (trip.existingStatusComercial === 'ganho') {
                issues.push(`Card marcado como Ganho comercial mas a viagem ainda não aconteceu (etapa atual${stageLabel}). Deveria estar como "aberto".`)
            }
            if (trip.existingGanhoPos === true) {
                issues.push(`Card marcado como Ganho Pós-venda mas a viagem ainda não aconteceu (etapa atual${stageLabel}).`)
            }
        }
    }

    return {
        severity: issues.length === 0 ? 'ok' : 'warn',
        issues,
    }
}

// ─── Helpers ────────────────────────────────────────────────

const isSim = (val: string) => val.trim().toLowerCase().startsWith('sim')

const normalizeCpf = (cpf: string) => cpf.replace(/\D/g, '')

const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Calculates day difference between two ISO dates */
const daysBetween = (a: string, b: string) => {
    const da = new Date(a + 'T00:00:00').getTime()
    const db = new Date(b + 'T00:00:00').getTime()
    return Math.round((db - da) / (1000 * 60 * 60 * 24))
}

/** Days from today to a date */
const daysFromNow = (date: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date + 'T00:00:00').getTime()
    return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Union-Find ─────────────────────────────────────────────

class UnionFind {
    parent: Map<string, string>
    rank: Map<string, number>

    constructor() {
        this.parent = new Map()
        this.rank = new Map()
    }

    make(x: string) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x)
            this.rank.set(x, 0)
        }
    }

    find(x: string): string {
        const p = this.parent.get(x)
        if (p !== x) {
            const root = this.find(p!)
            this.parent.set(x, root)
            return root
        }
        return x
    }

    union(a: string, b: string) {
        const ra = this.find(a)
        const rb = this.find(b)
        if (ra === rb) return
        const rankA = this.rank.get(ra) || 0
        const rankB = this.rank.get(rb) || 0
        if (rankA < rankB) this.parent.set(ra, rb)
        else if (rankA > rankB) this.parent.set(rb, ra)
        else { this.parent.set(rb, ra); this.rank.set(ra, rankA + 1) }
    }
}

// ─── Trip Grouping Algorithm ────────────────────────────────

type RawTripGroup = Omit<TripGroup,
    | 'vendedorProfileId'
    | 'existingCardId' | 'existingCardTitle'
    | 'existingStageId' | 'existingStageName' | 'existingPhaseSlug'
    | 'existingStatusComercial' | 'existingGanhoPlanner' | 'existingGanhoPos' | 'existingDonoPosId'
    | 'otherCardCandidates'
    | 'moveStage' | 'action' | 'skipReason' | 'audit'
>

function groupRowsIntoTrips(rows: PosVendaCsvRow[]): RawTripGroup[] {
    // Step 1: Group by vendaNum
    const byVenda = new Map<string, PosVendaCsvRow[]>()
    for (const row of rows) {
        const key = row.vendaNum
        if (!byVenda.has(key)) byVenda.set(key, [])
        byVenda.get(key)!.push(row)
    }

    const vendaKeys = Array.from(byVenda.keys())
    const uf = new UnionFind()
    for (const k of vendaKeys) uf.make(k)

    // Step 2: Merge by CPF + overlapping dates
    const byCpf = new Map<string, string[]>()
    for (const vk of vendaKeys) {
        const cpfs = new Set(byVenda.get(vk)!.map(r => r.cpfNorm).filter(Boolean))
        for (const cpf of cpfs) {
            if (!byCpf.has(cpf)) byCpf.set(cpf, [])
            byCpf.get(cpf)!.push(vk)
        }
    }

    for (const [, vendas] of byCpf) {
        if (vendas.length < 2) continue
        // Sort groups by earliest dataInicio
        const withDates = vendas.map(vk => {
            const rows_ = byVenda.get(vk)!
            const dates = rows_.map(r => r.dataInicio).filter(Boolean) as string[]
            const earliest = dates.length > 0 ? dates.sort()[0] : null
            const latest = rows_.map(r => r.dataFim).filter(Boolean).sort().reverse()[0] || null
            return { vk, earliest, latest }
        }).filter(d => d.earliest).sort((a, b) => a.earliest!.localeCompare(b.earliest!))

        // Merge overlapping intervals (2 day tolerance)
        for (let i = 1; i < withDates.length; i++) {
            const prev = withDates[i - 1]
            const curr = withDates[i]
            if (prev.latest && curr.earliest && daysBetween(prev.latest, curr.earliest) <= 2) {
                uf.union(prev.vk, curr.vk)
                // Extend prev interval for chain merging
                if (curr.latest && (!prev.latest || curr.latest > prev.latest)) {
                    prev.latest = curr.latest
                }
            }
        }
    }

    // Step 3: Merge by shared passengers
    const vendaByPagante = new Map<string, string[]>()
    const vendaByPassenger = new Map<string, string[]>()

    for (const vk of vendaKeys) {
        const rows_ = byVenda.get(vk)!
        for (const r of rows_) {
            const pNorm = norm(r.pagante)
            if (!vendaByPagante.has(pNorm)) vendaByPagante.set(pNorm, [])
            vendaByPagante.get(pNorm)!.push(vk)

            for (const pax of r.passageiros) {
                const paxNorm = norm(pax)
                if (!vendaByPassenger.has(paxNorm)) vendaByPassenger.set(paxNorm, [])
                vendaByPassenger.get(paxNorm)!.push(vk)
            }
        }
    }

    // If a pagante of group A appears as passenger of group B (or vice versa) AND dates overlap
    for (const [personName, paganteVendas] of vendaByPagante) {
        const passengerVendas = vendaByPassenger.get(personName) || []
        // Merge pagante vendas with passenger vendas where dates overlap
        for (const pv of paganteVendas) {
            for (const sv of passengerVendas) {
                if (uf.find(pv) === uf.find(sv)) continue
                // Check date overlap
                const pvRows = byVenda.get(pv)!
                const svRows = byVenda.get(sv)!
                const pvDates = pvRows.map(r => r.dataInicio).filter(Boolean) as string[]
                const svDates = svRows.map(r => r.dataInicio).filter(Boolean) as string[]
                const pvEnds = pvRows.map(r => r.dataFim).filter(Boolean) as string[]
                const svEnds = svRows.map(r => r.dataFim).filter(Boolean) as string[]

                const pvStart = pvDates.sort()[0]
                const pvEnd = pvEnds.sort().reverse()[0]
                const svStart = svDates.sort()[0]
                const svEnd = svEnds.sort().reverse()[0]

                if (pvStart && pvEnd && svStart && svEnd) {
                    // Check overlap with 2 day tolerance
                    if (daysBetween(pvEnd, svStart) <= 2 && daysBetween(svEnd, pvStart) <= 2) {
                        uf.union(pv, sv)
                    }
                }
            }
        }
    }

    // Step 4: Collect groups
    const groups = new Map<string, PosVendaCsvRow[]>()
    for (const vk of vendaKeys) {
        const root = uf.find(vk)
        if (!groups.has(root)) groups.set(root, [])
        groups.get(root)!.push(...byVenda.get(vk)!)
    }

    // Step 5: Build trip aggregates
    const trips: RawTripGroup[] = []

    for (const [, products] of groups) {
        // Separate annual products (Seguro Viagem with > 180 day span)
        const isAnnual = (r: PosVendaCsvRow) => {
            if (!r.dataInicio || !r.dataFim) return false
            const span = daysBetween(r.dataInicio, r.dataFim)
            return span > 180 && /seguro/i.test(r.produto)
        }

        const regularProducts = products.filter(p => !isAnnual(p))
        const annualProducts = products.filter(p => isAnnual(p))

        // Dates from regular products only
        const starts = regularProducts.map(r => r.dataInicio).filter(Boolean) as string[]
        const ends = regularProducts.map(r => r.dataFim).filter(Boolean) as string[]
        const dataInicio = starts.length > 0 ? starts.sort()[0] : (products[0]?.dataInicio || null)
        const dataFim = ends.length > 0 ? ends.sort().reverse()[0] : (products[0]?.dataFim || null)

        // For annuals, keep them in products but don't use their dates for trip range
        const allProducts = [...regularProducts, ...annualProducts]

        // Unique venda nums
        const vendaNums = [...new Set(allProducts.map(r => r.vendaNum))]

        // All unique passengers (pagantes + passageiros)
        const personSet = new Map<string, string>()
        for (const r of allProducts) {
            personSet.set(norm(r.pagante), r.pagante)
            for (const pax of r.passageiros) {
                if (pax.trim()) personSet.set(norm(pax), pax)
            }
        }
        const allPassengers = Array.from(personSet.values())

        // Determine pagante principal (highest total value by CPF)
        const cpfValues = new Map<string, { cpf: string; pagante: string; total: number }>()
        for (const r of allProducts) {
            const key = r.cpfNorm || norm(r.pagante)
            const existing = cpfValues.get(key)
            if (existing) {
                existing.total += r.valorTotal
            } else {
                cpfValues.set(key, { cpf: r.cpf, pagante: r.pagante, total: r.valorTotal })
            }
        }
        const sorted = Array.from(cpfValues.values()).sort((a, b) => b.total - a.total)
        const pagantePrincipal = sorted[0]?.pagante || products[0].pagante
        const cpfPrincipal = sorted[0]?.cpf || products[0].cpf
        const cpfNorm = normalizeCpf(cpfPrincipal)

        // Acompanhantes = all passengers - pagante principal
        const pagNorm = norm(pagantePrincipal)
        const acompanhantes = allPassengers.filter(p => norm(p) !== pagNorm)

        // Determine vendedor (most frequent)
        const vendedorCount = new Map<string, number>()
        for (const r of allProducts) {
            if (r.vendedor) {
                vendedorCount.set(r.vendedor, (vendedorCount.get(r.vendedor) || 0) + 1)
            }
        }
        const vendedor = Array.from(vendedorCount.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || ''

        // App gerado: true if ANY product has sim
        const hasAppGerado = allProducts.some(r => isSim(r.appGerado))

        // Stage logic: ALL products must have app + voucher for pre-embarque
        const allReady = allProducts.every(r =>
            isSim(r.appGerado) && (isSim(r.vouchersNoApp) || isSim(r.contratoVoucher))
        )

        let stage: { id: string; name: string }
        if (allReady && dataInicio) {
            const days = daysFromNow(dataInicio)
            stage = days > 30
                ? { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque >>> 30 dias' }
                : { id: STAGE_PRE_EMBARQUE_LT30, name: 'Pré-Embarque <<< 30 dias' }
        } else {
            stage = { id: STAGE_APP_CONTEUDO, name: 'App & Conteúdo em Montagem' }
        }

        trips.push({
            id: vendaNums.join('-'),
            cpfPrincipal: cpfPrincipal,
            cpfNorm,
            pagantePrincipal,
            vendedor,
            dataInicio,
            dataFim,
            products: allProducts,
            allPassengers,
            acompanhantes,
            stage,
            appEnviadoConcluida: hasAppGerado,
            valorTotal: allProducts.reduce((s, p) => s + p.valorTotal, 0),
            receita: allProducts.reduce((s, p) => s + p.receita, 0),
            vendaNums,
        })
    }

    return trips
}

// ─── Import log row types ───────────────────────────────────

interface ImportLogRow {
    id: string
    file_name: string
    total_rows: number
    trips_found: number
    cards_created: number
    cards_updated: number
    duplicates_skipped: number
    products_imported: number
    reverted_count: number
    status: string
    created_by: string
    created_at: string
    profile_name?: string
}

interface ImportLogItemRow {
    id: string
    card_id: string | null
    action: string
    card_title: string | null
    pagante: string
    products_count: number
    total_venda: number
    stage_name: string | null
    error_message: string | null
    reverted_at: string | null
    previous_state: unknown | null
}

// ─── Expandable Trip Card ───────────────────────────────────

function TripCard({ trip, selected, onToggle, onToggleMoveStage, cardsToArchive, onToggleArchiveMark }: {
    trip: TripGroup
    selected: boolean
    onToggle: (id: string) => void
    onToggleMoveStage: (id: string) => void
    cardsToArchive: Set<string>
    onToggleArchiveMark: (id: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const Chevron = expanded ? ChevronDown : ChevronRight

    const actionBadge = {
        create: { label: 'Criar', cls: 'bg-emerald-50 text-emerald-700' },
        update: { label: 'Atualizar', cls: 'bg-blue-50 text-blue-700' },
        skip: { label: 'Pular', cls: 'bg-slate-100 text-slate-500' },
    }[trip.action]

    const auditBadge: Record<AuditSeverity, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
        ok: { label: 'Ok', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
        warn: { label: 'Divergência', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertTriangle },
        error: { label: 'Sem card', cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
    }
    const auditSeverity = trip.audit?.severity ?? 'ok'
    const auditIssues = trip.audit?.issues ?? []
    const auditInfo = auditBadge[auditSeverity]
    const AuditIcon = auditInfo.Icon

    const showStageDecision = trip.action === 'update' && !!trip.existingStageId && trip.existingStageId !== trip.stage.id
    const computedTitle = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)

    return (
        <div className={cn("border rounded-lg overflow-hidden transition-colors", selected ? "border-slate-200" : "border-slate-100 opacity-50")}>
            <div className="flex items-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(trip.id) }}
                    className="pl-4 pr-1 py-3 shrink-0 hover:bg-slate-50/50 transition-colors"
                    title={selected ? 'Desmarcar viagem' : 'Marcar viagem'}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(trip.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                </button>
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex-1 px-2 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors text-left"
            >
                <Chevron className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-900 truncate">
                            {computedTitle}
                        </span>
                        <span className={cn('inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full', actionBadge.cls)}>
                            {actionBadge.label}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {trip.stage.name}
                        </span>
                        <span
                            className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', auditInfo.cls)}
                            title={auditIssues.length > 0 ? auditIssues.join(' • ') : 'Card já está com tudo certo no CRM'}
                        >
                            <AuditIcon className="h-3 w-3" />
                            {auditInfo.label}
                        </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mb-0.5">
                        {trip.pagantePrincipal}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{formatDateBR(trip.dataInicio)} → {formatDateBR(trip.dataFim)}</span>
                        <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" /> {trip.products.length} produtos
                        </span>
                        <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {trip.allPassengers.length} pessoas
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{formatBRL(trip.valorTotal)}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-emerald-600">{formatBRL(trip.receita)}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Receita</p>
                    </div>
                </div>
            </button>
            </div>

            {/* Motivo de pular — visível sem precisar expandir */}
            {trip.action === 'skip' && trip.skipReason && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                    {trip.skipReason}
                </div>
            )}

            {/* Auditoria — lista de divergências + outros cards com mesma venda (visível sem expandir) */}
            {((trip.audit?.issues?.length ?? 0) > 0 || (trip.otherCardCandidates?.length ?? 0) > 0) && (
                <div className={cn(
                    'border-t px-4 py-2 text-xs',
                    auditSeverity === 'error'
                        ? 'border-rose-100 bg-rose-50/60 text-rose-800'
                        : 'border-amber-100 bg-amber-50/60 text-amber-800'
                )}>
                    <div className="flex items-start gap-2">
                        <AuditIcon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', trip.audit?.severity === 'error' ? 'text-rose-600' : 'text-amber-600')} />
                        <div className="space-y-1 flex-1 min-w-0">
                            {(trip.audit?.issues ?? []).map((issue, idx) => (
                                <div key={idx}>{issue}</div>
                            ))}
                            {trip.existingCardId && (
                                <Link
                                    to={`/cards/${trip.existingCardId}`}
                                    className="inline-block text-[11px] underline hover:no-underline"
                                    onClick={e => e.stopPropagation()}
                                >
                                    Abrir card para conferir
                                </Link>
                            )}
                            {(trip.otherCardCandidates?.length ?? 0) > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-amber-200/50">
                                    <div className="font-medium mb-1">
                                        Existem outros {trip.otherCardCandidates.length} card{trip.otherCardCandidates.length !== 1 ? 's' : ''} no CRM com essa mesma venda (não vão ser tocados):
                                    </div>
                                    <p className="text-[10px] text-amber-700/70 mb-1 italic">
                                        Já marcamos pra arquivar (vai pra lixeira ao clicar Atualizar). Desmarque os que quer manter.
                                    </p>
                                    <ul className="space-y-1.5">
                                        {trip.otherCardCandidates.map(other => {
                                            const status = other.statusComercial ?? '—'
                                            const etapa = other.stageName || '(etapa desconhecida)'
                                            const ganhoPlannerLabel = other.ganhoPlanner === true
                                                ? 'Ganho Planner ✓'
                                                : 'sem Ganho Planner'
                                            const willArchive = cardsToArchive.has(other.id)
                                            return (
                                                <li key={other.id} className="flex items-start gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={willArchive}
                                                        onChange={() => onToggleArchiveMark(other.id)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="mt-0.5 rounded border-amber-300 text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
                                                        title={willArchive ? 'Desmarcar (manter este card)' : 'Marcar pra arquivar'}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <Link
                                                                to={`/cards/${other.id}`}
                                                                className="underline hover:no-underline truncate"
                                                                onClick={e => e.stopPropagation()}
                                                                title={other.titulo}
                                                            >
                                                                {other.titulo}
                                                            </Link>
                                                            {willArchive && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                                                                    <Archive className="h-3 w-3" /> vai arquivar
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-amber-700/80 leading-tight">
                                                            status: <span className="font-medium">{status}</span> • etapa: <span className="font-medium">{etapa}</span> • {ganhoPlannerLabel}
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Decisão de mover de etapa — sempre visível (sem precisar expandir) */}
            {showStageDecision && (
                <div className="border-t border-slate-100 bg-amber-50 px-4 py-2.5 text-xs space-y-1.5">
                    <div className="text-amber-900">
                        Etapa atual: <span className="font-medium">{trip.existingStageName || '—'}</span>
                        {' → '}
                        Sugerida pelo CSV: <span className="font-medium">{trip.stage.name}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={trip.moveStage}
                            onChange={() => onToggleMoveStage(trip.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-slate-700">Mover card para a etapa sugerida</span>
                    </label>
                </div>
            )}

            {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-400">CPF:</span> <span className="text-slate-700 font-medium">{trip.cpfPrincipal}</span></div>
                        <div><span className="text-slate-400">Vendedor:</span> <span className="text-slate-700 font-medium">{trip.vendedor || '—'}</span></div>
                        <div><span className="text-slate-400">Vendas:</span> <span className="text-slate-700 font-medium">{trip.vendaNums.join(', ')}</span></div>
                        <div><span className="text-slate-400">App Enviado:</span> <span className={cn('font-medium', trip.appEnviadoConcluida ? 'text-emerald-600' : 'text-amber-600')}>{trip.appEnviadoConcluida ? 'Concluída' : 'Pendente'}</span></div>
                    </div>

                    {trip.existingCardId && (
                        <div className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1">
                            Card existente: <Link to={`/cards/${trip.existingCardId}`} className="text-blue-600 underline">{trip.existingCardTitle || trip.existingCardId}</Link>
                        </div>
                    )}

                    {/* Acompanhantes */}
                    {trip.acompanhantes.length > 0 && (
                        <div className="text-xs">
                            <span className="text-slate-400">Acompanhantes:</span>{' '}
                            <span className="text-slate-700">{trip.acompanhantes.join(', ')}</span>
                        </div>
                    )}

                    {/* Products table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                    <th className="text-left py-1 pr-2">Produto</th>
                                    <th className="text-left py-1 pr-2">Fornecedor</th>
                                    <th className="text-left py-1 pr-2">Período</th>
                                    <th className="text-right py-1 pr-2">Valor</th>
                                    <th className="text-center py-1 pr-2">App</th>
                                    <th className="text-center py-1">Voucher</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trip.products.map((p, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                                        <td className="py-1.5 pr-2 font-medium text-slate-700">{p.produto}</td>
                                        <td className="py-1.5 pr-2 text-slate-600">{p.fornecedor}</td>
                                        <td className="py-1.5 pr-2 text-slate-500">{formatDateBR(p.dataInicio)} - {formatDateBR(p.dataFim)}</td>
                                        <td className="py-1.5 pr-2 text-right text-slate-700">{formatBRL(p.valorTotal)}</td>
                                        <td className="py-1.5 pr-2 text-center">
                                            {isSim(p.appGerado) ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" /> : <XCircle className="h-3.5 w-3.5 text-slate-300 mx-auto" />}
                                        </td>
                                        <td className="py-1.5 text-center">
                                            {(isSim(p.vouchersNoApp) || isSim(p.contratoVoucher)) ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" /> : <XCircle className="h-3.5 w-3.5 text-slate-300 mx-auto" />}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── History Row ────────────────────────────────────────────

function HistoryRow({ log, profileId, onReverted }: { log: ImportLogRow; profileId?: string; onReverted: () => void }) {
    const [expanded, setExpanded] = useState(false)
    const [items, setItems] = useState<ImportLogItemRow[] | null>(null)
    const [loadingItems, setLoadingItems] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [reverting, setReverting] = useState(false)

    const handleExpand = async () => {
        if (expanded) { setExpanded(false); return }
        setExpanded(true)
        if (items) return
        setLoadingItems(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await ((supabase as any).from('pos_venda_import_log_items') as any)
            .select('*')
            .eq('import_log_id', log.id)
            .order('created_at')
        setItems((data || []) as ImportLogItemRow[])
        setLoadingItems(false)
    }

    const revertableItems = (items || []).filter(i => !i.reverted_at && i.card_id)
    const allSelected = revertableItems.length > 0 && revertableItems.every(i => selected.has(i.id))

    const toggleAll = () => {
        if (allSelected) setSelected(new Set())
        else setSelected(new Set(revertableItems.map(i => i.id)))
    }

    const toggleItem = (id: string) => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
    }

    const handleRevert = async () => {
        if (selected.size === 0) return
        setReverting(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('revert_pos_venda_import_items', {
                p_item_ids: Array.from(selected),
                p_reverted_by: profileId,
            })
            if (error) throw error
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = data as any
            toast.success(`${result?.reverted || 0} viagens revertidas`)
            setSelected(new Set())
            setItems(null) // Force reload
            setExpanded(false)
            onReverted()
        } catch (err) {
            console.error('Erro ao reverter:', err)
            toast.error('Erro ao reverter importação')
        } finally {
            setReverting(false)
        }
    }

    const Chevron = expanded ? ChevronDown : ChevronRight
    const totalReverted = log.reverted_count || 0
    const totalItems = (log.cards_created || 0) + (log.cards_updated || 0)

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            <button onClick={handleExpand} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors text-left">
                <Chevron className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-900 truncate">{log.file_name}</span>
                        {totalReverted > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                {totalReverted}/{totalItems} revertidos
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(log.created_at)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                    {log.cards_created > 0 && <div><p className="text-sm font-semibold text-emerald-600">{log.cards_created}</p><p className="text-[10px] text-slate-400 uppercase">Criados</p></div>}
                    {log.cards_updated > 0 && <div><p className="text-sm font-semibold text-blue-600">{log.cards_updated}</p><p className="text-[10px] text-slate-400 uppercase">Atualizados</p></div>}
                    <div><p className="text-sm font-semibold text-slate-900">{log.products_imported}</p><p className="text-[10px] text-slate-400 uppercase">Produtos</p></div>
                </div>
            </button>
            {expanded && (
                <div className="bg-slate-50/50 border-t border-slate-100 px-4 py-2">
                    {loadingItems ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div> :
                        items && items.length > 0 ? (
                            <div className="space-y-1">
                                {/* Toolbar */}
                                {revertableItems.length > 0 && (
                                    <div className="flex items-center justify-between py-1.5 border-b border-slate-200 mb-1">
                                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={toggleAll}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            Selecionar todos ({revertableItems.length})
                                        </label>
                                        {selected.size > 0 && (
                                            <Button
                                                variant="outline"
                                                onClick={handleRevert}
                                                disabled={reverting}
                                                className="text-xs h-7 px-2.5 text-red-600 border-red-200 hover:bg-red-50"
                                            >
                                                {reverting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
                                                Reverter {selected.size} selecionado{selected.size > 1 ? 's' : ''}
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Items */}
                                <div className="divide-y divide-slate-100">
                                    {items.map(item => {
                                        const isReverted = !!item.reverted_at
                                        const canRevert = !isReverted && !!item.card_id
                                        return (
                                            <div key={item.id} className={cn("flex items-center gap-2 py-2 text-xs", isReverted && "opacity-50")}>
                                                {canRevert && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(item.id)}
                                                        onChange={() => toggleItem(item.id)}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                )}
                                                {!canRevert && <div className="w-4" />}
                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                    {item.action === 'created' && !isReverted && <Plus className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                                                    {item.action === 'updated' && !isReverted && <RefreshCw className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                                    {isReverted && <Undo2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                                    <span className="text-slate-700 truncate">{item.pagante}</span>
                                                    {item.card_id && (
                                                        <Link to={`/cards/${item.card_id}`} className="text-indigo-500 hover:underline shrink-0" onClick={e => e.stopPropagation()}>
                                                            ver card
                                                        </Link>
                                                    )}
                                                    {item.stage_name && <span className="text-slate-400 shrink-0">({item.stage_name})</span>}
                                                    {isReverted && <span className="text-amber-600 shrink-0">revertido</span>}
                                                </div>
                                                <span className="text-slate-500 shrink-0">{formatBRL(item.total_venda)}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : <p className="text-xs text-slate-400 py-2">Sem detalhes</p>
                    }
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ImportacaoPosVendaPage() {
    const { profile } = useAuth()
    const { org } = useOrg()
    const activeOrgId = org?.id
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [step, setStep] = useState<Step>('idle')
    const [flowMode, setFlowMode] = useState<FlowMode>('detalhada')
    const [fileName, setFileName] = useState('')
    const [trips, setTrips] = useState<TripGroup[]>([])
    const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set())
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importResult, setImportResult] = useState<{ cardsCreated: number; cardsUpdated: number; productsImported: number; skipped: number; errors: number; cardsArchived?: number } | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    // Arquivar cards ambíguos: pré-marca todos os "outros" cards que apareceram com a
    // mesma venda. Usuário desmarca o que NÃO quer arquivar. Tudo é arquivado de uma
    // vez quando o usuário clicar em Atualizar.
    const [cardsToArchive, setCardsToArchive] = useState<Set<string>>(new Set())
    const { archiveBulk } = useArchiveCard()

    // Filters
    const [filterDataFimMin, setFilterDataFimMin] = useState('')
    const [filterDataFimMax, setFilterDataFimMax] = useState('')
    const [filterValorMin, setFilterValorMin] = useState('')
    const [filterValorMax, setFilterValorMax] = useState('')
    const [filterAction, setFilterAction] = useState<'all' | 'create' | 'update' | 'skip'>('all')
    const [filterVendedor, setFilterVendedor] = useState('')
    const [filterApp, setFilterApp] = useState<'all' | 'sim' | 'nao'>('all')
    const [filterVoucher, setFilterVoucher] = useState<'all' | 'sim' | 'nao'>('all')
    const [filterAudit, setFilterAudit] = useState<'all' | AuditSeverity>('all')
    const [showFilters, setShowFilters] = useState(false)

    // Persistência de sessão — mantém preview + filtros ao navegar entre páginas.
    // sessionStorage (não localStorage): some ao fechar a aba, não polui para sempre.
    const storageKey = activeOrgId ? `pv-import-session:${activeOrgId}` : null
    const [hasRestored, setHasRestored] = useState(false)

    // Restaurar sessão salva ao montar
    useEffect(() => {
        if (hasRestored || !storageKey) return
        try {
            const raw = sessionStorage.getItem(storageKey)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (parsed?.step === 'preview' && Array.isArray(parsed.trips) && parsed.trips.length > 0) {
                    setStep('preview')
                    setFlowMode(parsed.flowMode || 'detalhada')
                    setFileName(parsed.fileName || '')
                    // Normaliza trips antigos: garante que campos novos existam
                    // (sessões salvas antes de campos como otherCardCandidates / audit)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const normalizedTrips = parsed.trips.map((t: any) => ({
                        ...t,
                        otherCardCandidates: Array.isArray(t.otherCardCandidates) ? t.otherCardCandidates : [],
                        audit: t.audit && Array.isArray(t.audit.issues)
                            ? t.audit
                            : { severity: 'ok' as const, issues: [] },
                        existingGanhoPos: t.existingGanhoPos ?? null,
                        existingGanhoPlanner: t.existingGanhoPlanner ?? null,
                        existingStatusComercial: t.existingStatusComercial ?? null,
                        existingDonoPosId: t.existingDonoPosId ?? null,
                        existingPhaseSlug: t.existingPhaseSlug ?? null,
                    }))
                    setTrips(normalizedTrips)
                    setSelectedTrips(new Set(parsed.selectedTrips || []))
                    setFilterDataFimMin(parsed.filterDataFimMin || '')
                    setFilterDataFimMax(parsed.filterDataFimMax || '')
                    setFilterValorMin(parsed.filterValorMin || '')
                    setFilterValorMax(parsed.filterValorMax || '')
                    setFilterAction(parsed.filterAction || 'all')
                    setFilterVendedor(parsed.filterVendedor || '')
                    setFilterApp(parsed.filterApp || 'all')
                    setFilterVoucher(parsed.filterVoucher || 'all')
                    setFilterAudit(parsed.filterAudit || 'all')
                    setShowFilters(!!parsed.showFilters)
                    setCardsToArchive(new Set(parsed.cardsToArchive || []))
                }
            }
        } catch (err) {
            console.warn('Não foi possível restaurar sessão de importação:', err)
        }
        setHasRestored(true)
    }, [storageKey, hasRestored])

    // Persistir sessão durante preview
    useEffect(() => {
        if (!hasRestored || !storageKey || step !== 'preview') return
        try {
            sessionStorage.setItem(storageKey, JSON.stringify({
                step, flowMode, fileName, trips,
                selectedTrips: Array.from(selectedTrips),
                cardsToArchive: Array.from(cardsToArchive),
                filterDataFimMin, filterDataFimMax,
                filterValorMin, filterValorMax,
                filterAction, filterVendedor,
                filterApp, filterVoucher,
                filterAudit,
                showFilters,
            }))
        } catch (err) {
            console.warn('Não foi possível salvar sessão de importação:', err)
        }
    }, [step, fileName, trips, selectedTrips,
        filterDataFimMin, filterDataFimMax, filterValorMin, filterValorMax,
        filterAction, filterVendedor, filterApp, filterVoucher, filterAudit,
        showFilters, storageKey, hasRestored, flowMode, cardsToArchive])

    // Auth check: admin or pos_venda phase
    const isAdmin = profile?.is_admin === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userPhase = (profile as any)?.team?.phase?.slug as string | undefined
    const canAccess = isAdmin || userPhase === 'pos_venda'

    // History
    const { data: history = [] } = useQuery({
        queryKey: ['pv-import-logs'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await ((supabase as any).from('pos_venda_import_logs') as any)
                .select('*, profile:profiles!pos_venda_import_logs_created_by_fkey(nome)')
                .order('created_at', { ascending: false })
                .limit(20)
            if (error) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).map((r: any) => ({ ...r, profile_name: r.profile?.nome })) as ImportLogRow[]
        },
    })

    // Planner profiles for vendedor matching — do workspace ativo.
    // Resolvido por slug canônico da fase (pipeline_phases.slug = 'planner'), não por team.name,
    // para funcionar em orgs que renomearam o time.
    const { data: plannerProfiles = [] } = useQuery({
        queryKey: ['planner-profiles', activeOrgId],
        enabled: !!activeOrgId,
        queryFn: async () => {
            if (!activeOrgId) return []
            // Fase com slug='planner' do workspace ativo; depois teams ligados a essa fase.
            const { data: plannerPhases } = await supabase
                .from('pipeline_phases')
                .select('id')
                .eq('slug', 'planner')
                .eq('org_id', activeOrgId)
            const phaseIds = (plannerPhases || []).map(p => p.id as string)
            if (phaseIds.length === 0) return []

            const { data: plannerTeams } = await supabase
                .from('teams')
                .select('id')
                .eq('org_id', activeOrgId)
                .in('phase_id', phaseIds)
            const teamIds = (plannerTeams || []).map(t => t.id as string)
            if (teamIds.length === 0) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC types pendentes
            const { data: memberIds } = await (supabase.rpc as any)('get_team_member_ids', {
                p_team_ids: teamIds,
            })
            const ids = (memberIds ?? []) as string[]
            if (ids.length === 0) return []

            const { data } = await supabase
                .from('profiles')
                .select('id, nome')
                .eq('active', true)
                .in('id', ids)
            return (data || []) as { id: string; nome: string }[]
        },
        staleTime: 1000 * 60 * 10,
    })

    // ─── Process CSV rows ────────────────────────────────────
    const processRows = useCallback(async (rawRows: Record<string, unknown>[], file: string) => {
        setIsProcessing(true)
        try {
        setFileName(file)
        const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

        const colVenda = findColumn(headers, VENDA_COLUMN_ALIASES)
        const colProduto = findColumn(headers, PRODUTO_ALIASES)
        const colValorTotal = findColumn(headers, VALOR_TOTAL_ALIASES)
        const colReceita = findColumn(headers, RECEITA_ALIASES)
        const colPassageiros = findColumn(headers, PASSAGEIRO_ALIASES)
        const colFornecedor = findColumn(headers, FORNECEDOR_ALIASES)
        const colDataInicio = findColumn(headers, DATA_INICIO_ALIASES)
        const colDataFim = findColumn(headers, DATA_FIM_ALIASES)
        const colCpf = findColumn(headers, CPF_ALIASES)
        const colPagante = findColumn(headers, PAGANTE_ALIASES)
        const colVendedor = findColumn(headers, VENDEDOR_ALIASES)
        const colAppGerado = findColumn(headers, APP_GERADO_ALIASES)
        const colVouchersApp = findColumn(headers, VOUCHERS_APP_ALIASES)
        const colContratoVoucher = findColumn(headers, CONTRATO_VOUCHER_ALIASES)
        const colDataVenda = findColumn(headers, DATA_VENDA_ALIASES)

        if (!colVenda || !colCpf || !colPagante) {
            toast.error('CSV deve ter colunas: Venda Nº, CPF e Pagante')
            return
        }

        // Parse rows
        const parsed: PosVendaCsvRow[] = rawRows
            .filter(r => {
                const vn = String(r[colVenda!] ?? '').trim()
                return vn && vn !== '0'
            })
            .map(r => {
                const cpfRaw = String(r[colCpf!] ?? '').trim()
                const paxRaw = colPassageiros ? String(r[colPassageiros] ?? '').trim() : ''
                const passageiros = paxRaw
                    ? paxRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
                    : []

                return {
                    vendaNum: String(r[colVenda!] ?? '').trim(),
                    vendedor: colVendedor ? String(r[colVendedor] ?? '').trim() : '',
                    cpf: cpfRaw,
                    cpfNorm: normalizeCpf(cpfRaw),
                    pagante: colPagante ? String(r[colPagante] ?? '').trim() : '',
                    fornecedor: colFornecedor ? String(r[colFornecedor] ?? '').trim() : '',
                    produto: colProduto ? String(r[colProduto] ?? '').trim() : '',
                    dataVenda: colDataVenda ? parseDateBR(r[colDataVenda]) : null,
                    dataInicio: colDataInicio ? parseDateBR(r[colDataInicio]) : null,
                    dataFim: colDataFim ? parseDateBR(r[colDataFim]) : null,
                    passageiros,
                    appGerado: colAppGerado ? String(r[colAppGerado] ?? '').trim() : '',
                    vouchersNoApp: colVouchersApp ? String(r[colVouchersApp] ?? '').trim() : '',
                    contratoVoucher: colContratoVoucher ? String(r[colContratoVoucher] ?? '').trim() : '',
                    receita: colReceita ? parseBRNumber(r[colReceita]) : 0,
                    valorTotal: colValorTotal ? parseBRNumber(r[colValorTotal]) : 0,
                }
            })

        if (parsed.length === 0) {
            toast.error('Nenhuma linha válida encontrada no CSV')
            return
        }

        // Group into trips
        const rawTrips = groupRowsIntoTrips(parsed)

        // Match vendedores to profiles
        const profileMap = new Map(plannerProfiles.map(p => [norm(p.nome || ''), p.id]))

        // Detect existing cards
        const fullTrips: TripGroup[] = []

        for (const trip of rawTrips) {
            // Match vendedor
            const vendedorNorm = norm(trip.vendedor)
            const vendedorProfileId = profileMap.get(vendedorNorm) || null

            // Build title — padrão novo: "Nome Sobrenome / Destino / DD MMM AA - DD MMM AA"
            const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)

            // Check existing cards by venda nums
            let existingCardId: string | null = null
            let existingCardTitle: string | null = null
            let existingStageId: string | null = null
            let existingStatusComercial: string | null = null
            let existingGanhoPlanner: boolean | null = null
            let existingGanhoPos: boolean | null = null
            let existingDonoPosId: string | null = null

            const CARD_AUDIT_SELECT = 'id, titulo, pipeline_stage_id, status_comercial, ganho_planner, ganho_pos, pos_owner_id'

            // Check by numero_venda_monde — só cards do workspace ativo (senão link quebra)
            for (const vchunk of chunked(trip.vendaNums, 10)) {
                let query = supabase
                    .from('cards')
                    .select(`${CARD_AUDIT_SELECT}, produto_data`)
                    .in('produto_data->>numero_venda_monde', vchunk)
                if (activeOrgId) query = query.eq('org_id', activeOrgId)
                const { data: cards } = await query

                if (cards && cards.length > 0) {
                    const c = cards[0]
                    existingCardId = c.id
                    existingCardTitle = c.titulo as string
                    existingStageId = (c.pipeline_stage_id as string) || null
                    existingStatusComercial = (c.status_comercial as string) ?? null
                    existingGanhoPlanner = (c.ganho_planner as boolean) ?? null
                    existingGanhoPos = (c.ganho_pos as boolean) ?? null
                    existingDonoPosId = (c.pos_owner_id as string) ?? null
                    break
                }
            }

            // Fallback: check historical numbers
            if (!existingCardId) {
                for (const vn of trip.vendaNums.slice(0, 5)) {
                    let query = supabase
                        .from('cards')
                        .select(CARD_AUDIT_SELECT)
                        .contains('produto_data', { numeros_venda_monde_historico: [{ numero: vn }] })
                        .limit(1)
                    if (activeOrgId) query = query.eq('org_id', activeOrgId)
                    const { data: cards } = await query

                    if (cards && cards.length > 0) {
                        const c = cards[0]
                        existingCardId = c.id
                        existingCardTitle = c.titulo as string
                        existingStageId = (c.pipeline_stage_id as string) || null
                        existingStatusComercial = (c.status_comercial as string) ?? null
                        existingGanhoPlanner = (c.ganho_planner as boolean) ?? null
                        existingGanhoPos = (c.ganho_pos as boolean) ?? null
                        existingDonoPosId = (c.pos_owner_id as string) ?? null
                        break
                    }
                }
            }

            // Fallback: check by CPF + dates in pos-venda
            if (!existingCardId && trip.cpfNorm && trip.dataInicio) {
                const { data: contatos } = await supabase
                    .from('contatos')
                    .select('id')
                    .eq('cpf_normalizado', trip.cpfNorm)
                    .is('deleted_at', null)
                    .limit(1)

                if (contatos && contatos.length > 0) {
                    const contatoId = contatos[0].id
                    let query = supabase
                        .from('cards')
                        .select(CARD_AUDIT_SELECT)
                        .eq('pessoa_principal_id', contatoId)
                        .in('pipeline_stage_id', POS_VENDA_STAGES)
                        .lte('data_viagem_inicio', trip.dataFim || trip.dataInicio)
                        .gte('data_viagem_fim', trip.dataInicio)
                        .limit(1)
                    if (activeOrgId) query = query.eq('org_id', activeOrgId)
                    const { data: cards } = await query

                    if (cards && cards.length > 0) {
                        const c = cards[0]
                        existingCardId = c.id
                        existingCardTitle = c.titulo as string
                        existingStageId = (c.pipeline_stage_id as string) || null
                        existingStatusComercial = (c.status_comercial as string) ?? null
                        existingGanhoPlanner = (c.ganho_planner as boolean) ?? null
                        existingGanhoPos = (c.ganho_pos as boolean) ?? null
                        existingDonoPosId = (c.pos_owner_id as string) ?? null
                    }
                }
            }

            const action = existingCardId ? 'update' : 'create'

            fullTrips.push({
                ...trip,
                id: titulo,
                vendedorProfileId,
                existingCardId,
                existingCardTitle,
                existingStageId,
                existingStageName: null, // preenchido no batch abaixo
                existingPhaseSlug: null, // preenchido no batch abaixo
                existingStatusComercial,
                existingGanhoPlanner,
                existingGanhoPos,
                existingDonoPosId,
                otherCardCandidates: [],
                moveStage: true, // default: mantém comportamento atual; usuário pode desmarcar
                action,
                skipReason: null, // preenchido no batch abaixo se for T. Planner
                audit: { severity: 'ok', issues: [] }, // preenchido depois do batch de stages
            })
        }

        // Batch: resolver nome da etapa atual + fase (slug).
        // Regra: se o card existente está em qualquer etapa da fase "planner" (T. Planner),
        // pular o trip inteiro — o negócio ainda está em fechamento, não é caso de pós-venda.
        const uniqueExistingStageIds = [...new Set(
            fullTrips.map(t => t.existingStageId).filter(Boolean) as string[]
        )]
        if (uniqueExistingStageIds.length > 0) {
            // FK explícita: pipeline_stages tem duas FKs pra pipeline_phases
            // (phase_id e target_phase_id) — sem isso dá erro de ambiguidade.
            const { data: stages } = await supabase
                .from('pipeline_stages')
                .select('id, nome, phase:pipeline_phases!pipeline_stages_phase_id_fkey(slug)')
                .in('id', uniqueExistingStageIds)
            const stageInfo = new Map<string, { nome: string; phaseSlug: string }>(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (stages || []).map((s: any) => [s.id as string, { nome: s.nome as string, phaseSlug: s.phase?.slug as string }])
            )
            for (const t of fullTrips) {
                if (t.existingStageId) {
                    const info = stageInfo.get(t.existingStageId)
                    t.existingStageName = info?.nome || null
                    t.existingPhaseSlug = info?.phaseSlug || null
                    if (info?.phaseSlug === 'planner') {
                        t.action = 'skip'
                        t.skipReason = 'Card em T. Planner — fechamento ainda em andamento'
                    }
                }
            }
        }

        // Auditoria de saúde — calcula depois do enrichment de stages.
        for (const t of fullTrips) {
            t.audit = computeAudit(t)
        }

        setTrips(fullTrips)
        setSelectedTrips(new Set(fullTrips.map(t => t.id)))
        // Pré-marca pra arquivar TODOS os cards ambíguos de TODAS as viagens.
        // Usuário desmarca o que quer manter.
        setCardsToArchive(new Set(fullTrips.flatMap(t => (t.otherCardCandidates || []).map(o => o.id))))
        setStep('preview')
        toast.success(`${fullTrips.length} viagens identificadas (${parsed.length} linhas)`)
        } catch (err) {
            console.error('Erro ao processar CSV:', err)
            toast.error(`Erro ao processar arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        } finally {
            setIsProcessing(false)
        }
    }, [plannerProfiles, activeOrgId])

    // ─── Process AGGREGATED rows (planilha por viagem) ──────
    // Cada linha do CSV/XLSX é uma viagem completa. Sem CPF — match só por número de venda.
    // Cards não encontrados ficam como 'skip' (não cria cards via planilha agregada).
    const processAggregatedRows = useCallback(async (rawRows: Record<string, unknown>[], file: string) => {
        setIsProcessing(true)
        try {
            setFileName(file)
            const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

            // Aliases dos cabeçalhos da planilha agregada
            const colPagante = findColumn(headers, ['pagante', 'cliente', 'titular'])
            const colCpf = findColumn(headers, ['cpf', 'documento'])
            const colInicio = findColumn(headers, ['início', 'inicio', 'data inicio', 'data início', 'check-in', 'checkin', 'embarque', 'partida'])
            const colFim = findColumn(headers, ['fim', 'final', 'data fim', 'check-out', 'checkout', 'volta', 'retorno'])
            const colVendas = findColumn(headers, ['vendas', 'venda', 'venda nº', 'venda n°', 'numeros venda', 'números venda', '# vendas'])
            const colProdutos = findColumn(headers, ['produtos', 'produto', 'serviços', 'servicos'])
            const colFornecedores = findColumn(headers, ['fornecedores', 'fornecedor', 'operadora', 'operadoras', 'supplier'])
            const colPassageiros = findColumn(headers, ['passageiros', 'passageiro', 'pax', 'viajantes'])
            const colVendedor = findColumn(headers, ['vendedor', 'vendedores', 'consultor', 'consultores'])
            const colValor = findColumn(headers, ['valor (r$)', 'valor', 'total', 'valor total', 'faturamento'])

            if (!colPagante || !colInicio) {
                toast.error('Planilha por viagem precisa ter pelo menos as colunas: Pagante e Início.')
                return
            }

            // Helper: data flexível DD/MM/YYYY ou MM/DD/YYYY ou ISO
            const parseDateFlex = (val: unknown): string | null => {
                if (val == null || val === '') return null
                const s = String(val).trim()
                if (!s || s === '—' || s === '-') return null
                // ISO yyyy-mm-dd
                const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
                if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
                // dd/mm/yyyy ou mm/dd/yyyy — heurística por componente > 12
                const parts = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
                if (parts) {
                    const a = parseInt(parts[1], 10)
                    const b = parseInt(parts[2], 10)
                    let yy = parts[3]
                    if (yy.length === 2) yy = '20' + yy
                    let mm: number, dd: number
                    if (a > 12) { dd = a; mm = b }              // BR (DD/MM)
                    else if (b > 12) { mm = a; dd = b }         // US (MM/DD)
                    else { mm = a; dd = b }                     // ambíguo: assume US (Excel padrão)
                    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
                }
                // Serial Excel
                const num = parseFloat(s.replace(',', '.'))
                if (!isNaN(num) && num > 1000) {
                    const epoch = new Date(Date.UTC(1899, 11, 30))
                    const d = new Date(epoch.getTime() + num * 86400000)
                    return d.toISOString().slice(0, 10)
                }
                return null
            }

            const splitDash = (raw: string, sep: RegExp) => {
                const t = raw.trim()
                if (!t || t === '—' || t === '-') return []
                return t.split(sep).map(s => s.trim()).filter(Boolean)
            }

            // Parse cada linha em raw trip
            const rawTrips: RawTripGroup[] = []
            for (const r of rawRows) {
                const pagante = String(r[colPagante!] ?? '').trim()
                if (!pagante) continue

                const cpfRaw = colCpf ? String(r[colCpf] ?? '').trim() : ''
                const cpfClean = (cpfRaw === '—' || cpfRaw === '-') ? '' : cpfRaw
                const cpfNorm = normalizeCpf(cpfClean)

                const dataInicio = parseDateFlex(r[colInicio!])
                const dataFim = colFim ? parseDateFlex(r[colFim]) : null

                const vendaNumsRaw = colVendas ? String(r[colVendas] ?? '').trim() : ''
                const vendaNums = splitDash(vendaNumsRaw, /[,;]/)

                const produtos = colProdutos ? splitDash(String(r[colProdutos] ?? ''), /;/) : []
                const fornecedores = colFornecedores ? splitDash(String(r[colFornecedores] ?? ''), /[|;]/) : []
                const passageiros = colPassageiros ? splitDash(String(r[colPassageiros] ?? ''), /;/) : []
                const vendedorRaw = colVendedor ? String(r[colVendedor] ?? '').trim() : ''
                const vendedor = (vendedorRaw === '—' || vendedorRaw === '-') ? '' : vendedorRaw.split(/[;,]/)[0]?.trim() || ''
                const valorTotal = colValor ? parseBRNumber(r[colValor]) : 0

                // Pessoas únicas: pagante + passageiros (sem duplicar)
                const personSet = new Map<string, string>()
                personSet.set(norm(pagante), pagante)
                for (const pax of passageiros) {
                    if (pax.trim()) personSet.set(norm(pax), pax)
                }
                const allPassengers = Array.from(personSet.values())
                const pagNorm = norm(pagante)
                const acompanhantes = allPassengers.filter(p => norm(p) !== pagNorm)

                // Construir products[] pareando produto-fornecedor-venda 1-pra-1.
                // Valor distribuído igualmente (não temos detalhe na planilha agregada).
                const N = Math.max(produtos.length, 1)
                const valorPorProduto = produtos.length > 0
                    ? Math.round((valorTotal / N) * 100) / 100
                    : valorTotal
                const products: PosVendaCsvRow[] = (produtos.length > 0 ? produtos : ['Viagem']).map((prod, i) => ({
                    vendaNum: vendaNums[i] || vendaNums[0] || '',
                    vendedor,
                    cpf: cpfClean,
                    cpfNorm,
                    pagante,
                    fornecedor: fornecedores[i] || fornecedores[0] || '',
                    produto: prod,
                    dataVenda: null,
                    dataInicio,
                    dataFim,
                    passageiros,
                    // Planilha agregada: assumimos que app + voucher já estão prontos
                    // (caso contrário a viagem não estaria em pós-venda no Monde).
                    appGerado: 'sim',
                    vouchersNoApp: 'sim',
                    contratoVoucher: '',
                    receita: 0,
                    valorTotal: valorPorProduto,
                }))

                // Stage por data (mesma lógica do fluxo detalhado, com voucher='sim')
                let stage: { id: string; name: string }
                if (dataInicio) {
                    const days = daysFromNow(dataInicio)
                    stage = days > 30
                        ? { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque >>> 30 dias' }
                        : { id: STAGE_PRE_EMBARQUE_LT30, name: 'Pré-Embarque <<< 30 dias' }
                } else {
                    stage = { id: STAGE_APP_CONTEUDO, name: 'App & Conteúdo em Montagem' }
                }

                rawTrips.push({
                    id: `${pagante}-${vendaNums.join('_') || dataInicio || ''}`,
                    cpfPrincipal: cpfClean,
                    cpfNorm,
                    pagantePrincipal: pagante,
                    vendedor,
                    dataInicio,
                    dataFim,
                    products,
                    allPassengers,
                    acompanhantes,
                    stage,
                    appEnviadoConcluida: true,
                    valorTotal,
                    receita: 0,
                    vendaNums,
                })
            }

            if (rawTrips.length === 0) {
                toast.error('Nenhuma viagem válida encontrada na planilha.')
                return
            }

            // Match vendedor (mesma lógica)
            const profileMap = new Map(plannerProfiles.map(p => [norm(p.nome || ''), p.id]))

            // Enrichment: busca card existente APENAS por venda monde (sem fallback de CPF).
            //
            // ⚠ O banco pode ter MÚLTIPLOS cards com a mesma venda (importações
            // repetidas, sub-cards, cards de teste). Por isso buscamos todos os
            // candidatos e escolhemos o mais saudável: status=ganho, ganho_planner=true,
            // pos_owner preenchido. Se houver mais de um candidato qualificado,
            // alertamos na auditoria.
            type CardCandidate = {
                id: string
                titulo: string
                pipeline_stage_id: string | null
                status_comercial: string | null
                ganho_planner: boolean | null
                ganho_pos: boolean | null
                pos_owner_id: string | null
                _matchType: 'venda_atual' | 'venda_historico'
            }

            const scoreCard = (c: CardCandidate): number => {
                // Maior score = mais "saudável" = preferível
                let s = 0
                if (c.status_comercial === 'ganho') s += 100
                if (c.ganho_planner === true) s += 50
                if (c.pos_owner_id) s += 10
                if (c._matchType === 'venda_atual') s += 5  // venda atual > histórico
                return s
            }

            const fullTrips: TripGroup[] = []
            for (const trip of rawTrips) {
                const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)
                const vendedorProfileId = profileMap.get(norm(trip.vendedor)) || null

                const CARD_AUDIT_SELECT = 'id, titulo, pipeline_stage_id, status_comercial, ganho_planner, ganho_pos, pos_owner_id'

                const candidates: CardCandidate[] = []

                // 1. Por número de venda monde atual (TODOS os matches)
                if (trip.vendaNums.length > 0) {
                    for (const vchunk of chunked(trip.vendaNums, 10)) {
                        let query = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .in('produto_data->>numero_venda_monde', vchunk)
                            .limit(20)
                        if (activeOrgId) query = query.eq('org_id', activeOrgId)
                        const { data: cards } = await query
                        for (const c of (cards || [])) {
                            candidates.push({
                                id: c.id,
                                titulo: c.titulo as string,
                                pipeline_stage_id: (c.pipeline_stage_id as string) || null,
                                status_comercial: (c.status_comercial as string) ?? null,
                                ganho_planner: (c.ganho_planner as boolean) ?? null,
                                ganho_pos: (c.ganho_pos as boolean) ?? null,
                                pos_owner_id: (c.pos_owner_id as string) ?? null,
                                _matchType: 'venda_atual',
                            })
                        }
                    }
                }

                // 2. Histórico (renumeração de venda) — só busca se não achou nada na atual
                if (candidates.length === 0 && trip.vendaNums.length > 0) {
                    for (const vn of trip.vendaNums.slice(0, 5)) {
                        let query = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .contains('produto_data', { numeros_venda_monde_historico: [{ numero: vn }] })
                            .limit(10)
                        if (activeOrgId) query = query.eq('org_id', activeOrgId)
                        const { data: cards } = await query
                        for (const c of (cards || [])) {
                            // Evita duplicar se já tinha vindo na busca atual
                            if (candidates.some(x => x.id === c.id)) continue
                            candidates.push({
                                id: c.id,
                                titulo: c.titulo as string,
                                pipeline_stage_id: (c.pipeline_stage_id as string) || null,
                                status_comercial: (c.status_comercial as string) ?? null,
                                ganho_planner: (c.ganho_planner as boolean) ?? null,
                                ganho_pos: (c.ganho_pos as boolean) ?? null,
                                pos_owner_id: (c.pos_owner_id as string) ?? null,
                                _matchType: 'venda_historico',
                            })
                        }
                    }
                }

                // 3. Fallback por CPF + datas (só se tem CPF na planilha e não achou pela venda).
                // Mesma lógica do fluxo detalhado.
                if (candidates.length === 0 && trip.cpfNorm && trip.dataInicio) {
                    const { data: contatos } = await supabase
                        .from('contatos')
                        .select('id')
                        .eq('cpf_normalizado', trip.cpfNorm)
                        .is('deleted_at', null)
                        .limit(1)
                    if (contatos && contatos.length > 0) {
                        const contatoId = contatos[0].id
                        let query = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .eq('pessoa_principal_id', contatoId)
                            .in('pipeline_stage_id', POS_VENDA_STAGES)
                            .lte('data_viagem_inicio', trip.dataFim || trip.dataInicio)
                            .gte('data_viagem_fim', trip.dataInicio)
                            .limit(5)
                        if (activeOrgId) query = query.eq('org_id', activeOrgId)
                        const { data: cards } = await query
                        for (const c of (cards || [])) {
                            if (candidates.some(x => x.id === c.id)) continue
                            candidates.push({
                                id: c.id,
                                titulo: c.titulo as string,
                                pipeline_stage_id: (c.pipeline_stage_id as string) || null,
                                status_comercial: (c.status_comercial as string) ?? null,
                                ganho_planner: (c.ganho_planner as boolean) ?? null,
                                ganho_pos: (c.ganho_pos as boolean) ?? null,
                                pos_owner_id: (c.pos_owner_id as string) ?? null,
                                _matchType: 'venda_historico', // visualmente fallback, score igual histórico
                            })
                        }
                    }
                }

                // Dedup por id
                const uniqueCandidates = Array.from(
                    new Map(candidates.map(c => [c.id, c])).values()
                )
                // Ordena por score descendente
                uniqueCandidates.sort((a, b) => scoreCard(b) - scoreCard(a))

                // O melhor candidato vence; o resto fica em otherCardCandidates pra mostrar na UI
                const winner = uniqueCandidates[0] || null
                const others = uniqueCandidates.slice(1).map(c => ({
                    id: c.id,
                    titulo: c.titulo,
                    statusComercial: c.status_comercial,
                    ganhoPlanner: c.ganho_planner,
                    stageId: c.pipeline_stage_id,
                    stageName: null as string | null, // populado no batch de stages
                }))

                let existingCardId: string | null = null
                let existingCardTitle: string | null = null
                let existingStageId: string | null = null
                let existingStatusComercial: string | null = null
                let existingGanhoPlanner: boolean | null = null
                let existingGanhoPos: boolean | null = null
                let existingDonoPosId: string | null = null

                if (winner) {
                    existingCardId = winner.id
                    existingCardTitle = winner.titulo
                    existingStageId = winner.pipeline_stage_id
                    existingStatusComercial = winner.status_comercial
                    existingGanhoPlanner = winner.ganho_planner
                    existingGanhoPos = winner.ganho_pos
                    existingDonoPosId = winner.pos_owner_id
                }

                // Decisão de ação:
                // - Achou card no CRM → update
                // - Não achou MAS tem CPF + pagante → create (cria contato e card novo)
                // - Não achou e sem CPF/pagante → skip (não dá pra criar contato)
                let action: TripGroup['action']
                let skipReason: string | null = null
                if (existingCardId) {
                    action = 'update'
                } else if (trip.cpfNorm && trip.pagantePrincipal) {
                    action = 'create'
                } else {
                    action = 'skip'
                    skipReason = trip.vendaNums.length === 0
                        ? 'Sem número de venda nem CPF — não foi possível localizar nem criar o card.'
                        : 'Não encontrei card com esses números de venda no CRM e não tem CPF pra criar um novo.'
                }

                fullTrips.push({
                    ...trip,
                    id: titulo,
                    vendedorProfileId,
                    existingCardId,
                    existingCardTitle,
                    existingStageId,
                    existingStageName: null,
                    existingPhaseSlug: null,
                    existingStatusComercial,
                    existingGanhoPlanner,
                    existingGanhoPos,
                    existingDonoPosId,
                    otherCardCandidates: others,
                    moveStage: true,
                    action,
                    skipReason,
                    audit: { severity: 'ok', issues: [] },
                })
            }

            // Batch: nome da etapa + slug da fase. Inclui IDs dos outros candidates
            // pra também mostrar a etapa atual deles na lista de ambíguos.
            const allStageIds = new Set<string>()
            for (const t of fullTrips) {
                if (t.existingStageId) allStageIds.add(t.existingStageId)
                for (const o of t.otherCardCandidates) {
                    if (o.stageId) allStageIds.add(o.stageId)
                }
            }
            if (allStageIds.size > 0) {
                const { data: stages } = await supabase
                    .from('pipeline_stages')
                    .select('id, nome, phase:pipeline_phases!pipeline_stages_phase_id_fkey(slug)')
                    .in('id', [...allStageIds])
                const stageInfo = new Map<string, { nome: string; phaseSlug: string }>(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (stages || []).map((s: any) => [s.id as string, { nome: s.nome as string, phaseSlug: s.phase?.slug as string }])
                )
                for (const t of fullTrips) {
                    if (t.existingStageId) {
                        const info = stageInfo.get(t.existingStageId)
                        t.existingStageName = info?.nome || null
                        t.existingPhaseSlug = info?.phaseSlug || null
                        if (info?.phaseSlug === 'planner') {
                            t.action = 'skip'
                            t.skipReason = 'Card em T. Planner — fechamento ainda em andamento'
                        }
                    }
                    for (const o of t.otherCardCandidates) {
                        if (o.stageId) {
                            o.stageName = stageInfo.get(o.stageId)?.nome || null
                        }
                    }
                }
            }

            for (const t of fullTrips) {
                t.audit = computeAudit(t)
                // Se há outros cards com a mesma venda, sobe a severidade pra warn (se ainda 'ok'),
                // a issue propriamente dita é renderizada inline na UI via otherCardCandidates
                if (t.otherCardCandidates.length > 0 && t.audit.severity === 'ok') {
                    t.audit = { ...t.audit, severity: 'warn' }
                }
            }

            setTrips(fullTrips)
            setSelectedTrips(new Set(fullTrips.filter(t => t.action !== 'skip').map(t => t.id)))
            // Pré-marca pra arquivar TODOS os cards ambíguos de TODAS as viagens.
            setCardsToArchive(new Set(fullTrips.flatMap(t => (t.otherCardCandidates || []).map(o => o.id))))
            setStep('preview')
            const matched = fullTrips.filter(t => t.action === 'update').length
            const unmatched = fullTrips.filter(t => t.action === 'skip').length
            toast.success(`${fullTrips.length} viagens lidas — ${matched} com card no CRM, ${unmatched} sem card.`)
        } catch (err) {
            console.error('Erro ao processar planilha agregada:', err)
            toast.error(`Erro ao processar arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
        } finally {
            setIsProcessing(false)
        }
    }, [plannerProfiles, activeOrgId])

    // ─── File upload handler ─────────────────────────────────
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setIsProcessing(true)
        const isCSV = /\.(csv|tsv|txt)$/i.test(file.name)
        const processor = flowMode === 'agregada' ? processAggregatedRows : processRows
        try {
            if (isCSV) {
                const text = await readFileText(file)
                const rows = parseCSVNative(text)
                if (rows.length === 0) {
                    toast.error('Arquivo vazio ou sem dados válidos')
                    setIsProcessing(false)
                    return
                }
                await processor(rows, file.name)
            } else {
                const ab = await file.arrayBuffer()
                const workbook = XLSX.read(ab, { type: 'array', codepage: 65001 })
                const sheet = workbook.Sheets[workbook.SheetNames[0]]
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
                if (jsonData.length === 0) {
                    toast.error('Arquivo vazio ou sem dados válidos')
                    setIsProcessing(false)
                    return
                }
                await processor(jsonData, file.name)
            }
        } catch (err) {
            console.error('Erro ao ler arquivo:', err)
            toast.error(`Erro ao ler arquivo: ${err instanceof Error ? err.message : 'formato inválido'}`)
            setIsProcessing(false)
        }
    }, [processRows, processAggregatedRows, flowMode])

    // ─── Import handler ──────────────────────────────────────
    const handleImport = async () => {
        const toProcess = filteredTrips.filter(t => t.action !== 'skip' && selectedTrips.has(t.id))
        const skippedByUser = filteredTrips.filter(t => t.action !== 'skip' && !selectedTrips.has(t.id)).length
        if (toProcess.length === 0) return

        setStep('importing')
        setImportProgress({ current: 0, total: toProcess.length })

        try {
            const payload = toProcess.map(trip => ({
                existing_card_id: trip.existingCardId,
                titulo: buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim),
                cpf_norm: trip.cpfNorm,
                cpf_raw: trip.cpfPrincipal,
                pagante_nome: trip.pagantePrincipal,
                vendas_owner_id: trip.vendedorProfileId,
                pos_owner_id: SAMANTHA_ID,
                // Em UPDATE (card existe), só mandar nova etapa se o usuário marcou "Mover".
                // RPC preserva pipeline_stage_id atual quando recebe null. Em CREATE, sempre usar a etapa calculada.
                pipeline_stage_id: (trip.action === 'update' && !trip.moveStage) ? null : trip.stage.id,
                data_viagem_inicio: trip.dataInicio,
                data_viagem_fim: trip.dataFim,
                valor_total: trip.valorTotal,
                receita_total: trip.receita,
                venda_nums: trip.vendaNums,
                app_enviado_concluida: trip.appEnviadoConcluida,
                products: trip.products.map(p => ({
                    description: p.produto || null,
                    sale_value: p.valorTotal,
                    supplier_cost: Math.round((p.valorTotal - p.receita) * 100) / 100,
                    fornecedor: p.fornecedor || null,
                    is_ready: isSim(p.vouchersNoApp) || isSim(p.contratoVoucher),
                    data_inicio: p.dataInicio,
                    data_fim: p.dataFim,
                    passageiros: p.passageiros,
                })),
                products_to_mark_ready: trip.existingCardId ? trip.products
                    .filter(p => isSim(p.vouchersNoApp) || isSim(p.contratoVoucher))
                    .map(p => ({ description: p.produto, fornecedor: p.fornecedor })) : null,
                acompanhantes: trip.acompanhantes,
            }))

            // Batching: triggers cascata em cards/tarefas são pesados. Processa em
            // lotes de 15 pra não estourar timeout e mostrar progresso real.
            const BATCH_SIZE = 15
            let cardsCreated = 0
            let cardsUpdated = 0
            let productsImported = 0
            let contactsCreated = 0
            let totalErrors = 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allRpcResults: any[] = []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allErrors: any[] = []

            for (let offset = 0; offset < payload.length; offset += BATCH_SIZE) {
                const chunk = payload.slice(offset, offset + BATCH_SIZE)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data, error: rpcError } = await (supabase as any).rpc('bulk_create_pos_venda_cards', {
                    p_trips: chunk,
                    p_created_by: profile?.id,
                })
                if (rpcError) throw rpcError
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const r = data as any
                cardsCreated += r?.cards_created ?? 0
                cardsUpdated += r?.cards_updated ?? 0
                productsImported += r?.products_imported ?? 0
                contactsCreated += r?.contacts_created ?? 0
                totalErrors += r?.errors ?? 0
                // Resultados trazem idx relativo ao chunk; ajustar pro idx global
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const res of (r?.results || []) as any[]) {
                    const adjusted = { ...res, idx: res.idx + offset }
                    allRpcResults.push(adjusted)
                    if (adjusted.action === 'error') allErrors.push(adjusted)
                }
                setImportProgress({
                    current: Math.min(offset + BATCH_SIZE, payload.length),
                    total: payload.length,
                })
            }

            setImportResult({ cardsCreated, cardsUpdated, productsImported, skipped: skippedByUser, errors: totalErrors })
            if (allErrors.length > 0) {
                const firstErr = allErrors[0]
                toast.error(`${allErrors.length} viagem(ns) com erro. Ex: ${firstErr.error || 'sem detalhe'}`, { duration: 12000 })
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = { results: allRpcResults, contacts_created: contactsCreated }

            // Save import log
            try {
                const skipped = trips.filter(t => t.action === 'skip').length + skippedByUser
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: logRow } = await ((supabase as any).from('pos_venda_import_logs') as any)
                    .insert({
                        file_name: fileName,
                        total_rows: trips.reduce((s, t) => s + t.products.length, 0),
                        trips_found: trips.length,
                        cards_created: cardsCreated,
                        cards_updated: cardsUpdated,
                        contacts_created: result?.contacts_created ?? 0,
                        duplicates_skipped: skipped,
                        products_imported: productsImported,
                        status: 'completed',
                        created_by: profile?.id,
                    })
                    .select()
                    .single()

                if (logRow) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rpcResults = (result?.results || []) as any[]
                    const importedItems = toProcess.map((t, idx) => {
                        const rpcItem = rpcResults.find((r: { idx: number }) => r.idx === idx)
                        return {
                            import_log_id: logRow.id,
                            card_id: rpcItem?.card_id || null,
                            action: t.action === 'create' ? 'created' : 'updated',
                            card_title: buildTripTitle(t.pagantePrincipal, t.products, t.dataInicio, t.dataFim),
                            pagante: t.pagantePrincipal,
                            cpf: t.cpfPrincipal,
                            venda_nums: t.vendaNums,
                            data_inicio: t.dataInicio,
                            data_fim: t.dataFim,
                            products_count: t.products.length,
                            total_venda: t.valorTotal,
                            total_receita: t.receita,
                            stage_name: t.stage.name,
                            previous_state: rpcItem?.previous_state || null,
                        }
                    })
                    const skippedItems = filteredTrips
                        .filter(t => t.action !== 'skip' && !selectedTrips.has(t.id))
                        .map(t => ({
                            import_log_id: logRow.id,
                            card_id: null,
                            action: 'skipped',
                            card_title: buildTripTitle(t.pagantePrincipal, t.products, t.dataInicio, t.dataFim),
                            pagante: t.pagantePrincipal,
                            cpf: t.cpfPrincipal,
                            venda_nums: t.vendaNums,
                            data_inicio: t.dataInicio,
                            data_fim: t.dataFim,
                            products_count: t.products.length,
                            total_venda: t.valorTotal,
                            total_receita: t.receita,
                            stage_name: t.stage.name,
                            previous_state: null,
                        }))
                    const logItems = [...importedItems, ...skippedItems]
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await ((supabase as any).from('pos_venda_import_log_items') as any).insert(logItems)
                }
            } catch (logErr) {
                console.error('Erro ao salvar log:', logErr)
            }

            // Arquivar cards ambíguos marcados (limpa duplicatas legadas detectadas no preview)
            const archiveIds = Array.from(cardsToArchive)
            let cardsArchived = 0
            if (archiveIds.length > 0) {
                try {
                    archiveBulk(archiveIds)
                    cardsArchived = archiveIds.length
                } catch (archErr) {
                    console.error('Erro ao arquivar cards ambíguos:', archErr)
                }
            }

            queryClient.invalidateQueries({ queryKey: ['pv-import-logs'] })
            if (storageKey) sessionStorage.removeItem(storageKey)
            setImportResult(prev => prev ? { ...prev, cardsArchived } : prev)
            setStep('done')
            const archiveMsg = cardsArchived > 0 ? `, ${cardsArchived} arquivados` : ''
            toast.success(`${cardsCreated} cards criados, ${cardsUpdated} atualizados${archiveMsg}`)
        } catch (err) {
            console.error('Erro na importação:', err)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const e = err as any
            const msg = e?.message || e?.details || e?.hint || 'erro desconhecido'
            setImportResult({ cardsCreated: 0, cardsUpdated: 0, productsImported: 0, skipped: skippedByUser, errors: toProcess.length })
            setStep('done')
            toast.error(`Erro ao importar: ${msg}`, { duration: 10000 })
        }
    }

    const handleReset = () => {
        setStep('idle')
        setFileName('')
        setTrips([])
        setSelectedTrips(new Set())
        setCardsToArchive(new Set())
        setImportResult(null)
        setImportProgress({ current: 0, total: 0 })
        setFilterDataFimMin('')
        setFilterDataFimMax('')
        setFilterValorMin('')
        setFilterValorMax('')
        setFilterAction('all')
        setFilterVendedor('')
        setFilterApp('all')
        setFilterVoucher('all')
        setShowFilters(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (storageKey) sessionStorage.removeItem(storageKey)
    }

    // ─── Filter logic ────────────────────────────────────────
    const hasActiveFilters = !!(filterDataFimMin || filterDataFimMax || filterValorMin || filterValorMax || filterAction !== 'all' || filterVendedor || filterApp !== 'all' || filterVoucher !== 'all' || filterAudit !== 'all')

    const filteredTrips = trips.filter(trip => {
        if (filterAction !== 'all' && trip.action !== filterAction) return false
        if (filterAudit !== 'all' && (trip.audit?.severity ?? 'ok') !== filterAudit) return false
        if (filterDataFimMin && (!trip.dataFim || trip.dataFim < filterDataFimMin)) return false
        if (filterDataFimMax && (!trip.dataFim || trip.dataFim > filterDataFimMax)) return false
        if (filterValorMin && trip.valorTotal < parseFloat(filterValorMin)) return false
        if (filterValorMax && trip.valorTotal > parseFloat(filterValorMax)) return false
        if (filterVendedor && !norm(trip.vendedor).includes(norm(filterVendedor))) return false
        if (filterApp === 'sim' && !trip.appEnviadoConcluida) return false
        if (filterApp === 'nao' && trip.appEnviadoConcluida) return false
        if (filterVoucher !== 'all') {
            const allVoucher = trip.products.every(p => isSim(p.vouchersNoApp) || isSim(p.contratoVoucher))
            if (filterVoucher === 'sim' && !allVoucher) return false
            if (filterVoucher === 'nao' && allVoucher) return false
        }
        return true
    })

    const clearFilters = useCallback(() => {
        setFilterDataFimMin('')
        setFilterDataFimMax('')
        setFilterValorMin('')
        setFilterValorMax('')
        setFilterAction('all')
        setFilterVendedor('')
        setFilterApp('all')
        setFilterVoucher('all')
        setFilterAudit('all')
    }, [])

    const selectFiltered = useCallback(() => {
        setSelectedTrips(prev => {
            const next = new Set(prev)
            for (const t of filteredTrips) {
                if (t.action !== 'skip') next.add(t.id)
            }
            return next
        })
    }, [filteredTrips])

    const deselectFiltered = useCallback(() => {
        setSelectedTrips(prev => {
            const next = new Set(prev)
            for (const t of filteredTrips) {
                next.delete(t.id)
            }
            return next
        })
    }, [filteredTrips])

    // Unique vendedores for filter dropdown
    const uniqueVendedores = [...new Set(trips.map(t => t.vendedor).filter(Boolean))].sort()

    const toggleTrip = useCallback((id: string) => {
        setSelectedTrips(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const toggleMoveStage = useCallback((id: string) => {
        setTrips(prev => prev.map(t =>
            t.id === id ? { ...t, moveStage: !t.moveStage } : t
        ))
    }, [])

    const toggleArchiveMark = useCallback((cardId: string) => {
        setCardsToArchive(prev => {
            const next = new Set(prev)
            if (next.has(cardId)) next.delete(cardId)
            else next.add(cardId)
            return next
        })
    }, [])

    const toggleAllTrips = useCallback(() => {
        setSelectedTrips(prev => {
            const scope = hasActiveFilters ? filteredTrips : trips
            const actionable = scope.filter(t => t.action !== 'skip')
            if (actionable.length === 0) return prev
            const actionableIds = new Set(actionable.map(t => t.id))
            const selectedInScope = actionable.filter(t => prev.has(t.id)).length
            const next = new Set(prev)
            if (selectedInScope >= actionable.length) {
                for (const id of actionableIds) next.delete(id)
            } else {
                for (const id of actionableIds) next.add(id)
            }
            return next
        })
    }, [trips, filteredTrips, hasActiveFilters])

    if (!canAccess) return <Navigate to="/dashboard" replace />

    // ─── Stats ───────────────────────────────────────────────
    // Quando há filtro ativo, contadores refletem apenas o que está visível.
    // Viagens fora do filtro ficam parqueadas (não contam como "pular" nem são importadas).
    const scopeTrips = hasActiveFilters ? filteredTrips : trips
    const toCreate = scopeTrips.filter(t => t.action === 'create' && selectedTrips.has(t.id)).length
    const toUpdate = scopeTrips.filter(t => t.action === 'update' && selectedTrips.has(t.id)).length
    const toSkip = scopeTrips.filter(t => t.action === 'skip').length
    const deselected = scopeTrips.filter(t => t.action !== 'skip' && !selectedTrips.has(t.id)).length
    const scopeActionable = scopeTrips.filter(t => t.action !== 'skip')
    const selectedInScope = scopeActionable.filter(t => selectedTrips.has(t.id)).length

    // Auditoria — sempre calculada sobre todas as viagens (não respeita filtro de Saúde,
    // senão clicar num cartão zera os outros contadores).
    const auditOk = trips.filter(t => (t.audit?.severity ?? 'ok') === 'ok').length
    const auditWarn = trips.filter(t => t.audit?.severity === 'warn').length
    const auditError = trips.filter(t => t.audit?.severity === 'error').length

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto p-6 pb-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Link to="/dashboard" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                            <ArrowLeft className="h-5 w-5 text-slate-500" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Importação Pós-Venda</h1>
                            <p className="text-sm text-slate-500">Criar cards de viagens a partir do relatório Monde</p>
                        </div>
                    </div>
                    {step !== 'idle' && (
                        <Button variant="outline" onClick={handleReset}>Nova importação</Button>
                    )}
                </div>

                {/* ─── IDLE: Upload ─────────────────────────────── */}
                {step === 'idle' && (
                    <div className="space-y-6">
                        {isProcessing ? (
                            <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                                <div className="text-center">
                                    <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto mb-4" />
                                    <h2 className="text-lg font-semibold text-slate-900 mb-1">Processando {fileName}...</h2>
                                    <p className="text-sm text-slate-500">
                                        {flowMode === 'agregada'
                                            ? 'Lendo viagens e localizando cards no CRM'
                                            : 'Agrupando viagens e detectando cards existentes'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Seletor de fluxo */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFlowMode('detalhada')}
                                        className={cn(
                                            'text-left rounded-xl p-5 border-2 transition-colors',
                                            flowMode === 'detalhada'
                                                ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                                flowMode === 'detalhada' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                                            )}>
                                                <Plus className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                                                    Importar planilha por produto
                                                </h3>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    Relatório Monde detalhado — cada linha é um produto. Cria cards novos
                                                    quando não existem e atualiza os existentes. Precisa ter Venda Nº, CPF e Pagante.
                                                </p>
                                            </div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFlowMode('agregada')}
                                        className={cn(
                                            'text-left rounded-xl p-5 border-2 transition-colors',
                                            flowMode === 'agregada'
                                                ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={cn(
                                                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                                flowMode === 'agregada' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                                            )}>
                                                <RefreshCw className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                                                    Conferir e atualizar (planilha por viagem)
                                                </h3>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    Planilha agregada — cada linha é uma viagem inteira. Atualiza apenas
                                                    cards já existentes (etapa, números de venda e produtos). Sem CPF: viagens
                                                    que não baterem com nenhum card no CRM ficam de fora.
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {/* Caixa de upload */}
                                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                                    <div className="text-center">
                                        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                                            <Upload className="h-8 w-8 text-indigo-600" />
                                        </div>
                                        <h2 className="text-lg font-semibold text-slate-900 mb-1">
                                            {flowMode === 'agregada'
                                                ? 'Upload da Planilha por Viagem'
                                                : 'Upload do Relatório Monde'}
                                        </h2>
                                        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                                            {flowMode === 'agregada'
                                                ? 'Cada linha é uma viagem completa. O sistema vai localizar o card no CRM pelos números de venda e mostrar o que está divergente.'
                                                : 'Faça upload do CSV com os produtos vendidos. O sistema agrupará por viagem, detectará cards existentes e criará os novos no pós-venda.'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer font-medium text-sm"
                                        >
                                            <FileSpreadsheet className="h-4 w-4" />
                                            Selecionar arquivo
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".csv,.xlsx,.xls,.tsv,.txt"
                                            className="sr-only"
                                            onChange={handleFileUpload}
                                        />
                                        <p className="text-xs text-slate-400 mt-3">
                                            {flowMode === 'agregada'
                                                ? 'CSV, XLSX ou XLS — colunas esperadas: Pagante, Início, Fim, Vendas, Produtos, Fornecedores, Passageiros, Vendedor, Valor (R$)'
                                                : 'CSV, XLSX ou XLS — colunas obrigatórias: Venda Nº, CPF, Pagante'}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* History */}
                        {history.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-slate-400" /> Histórico de Importações
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {history.map(log => (
                                        <HistoryRow
                                            key={log.id}
                                            log={log}
                                            profileId={profile?.id}
                                            onReverted={() => queryClient.invalidateQueries({ queryKey: ['pv-import-logs'] })}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── PREVIEW ─────────────────────────────────── */}
                {step === 'preview' && (
                    <div className="space-y-4">
                        {/* Auditoria — saúde das viagens já existentes no CRM */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Conferência das viagens no CRM</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Antes de importar, veja se cada viagem da planilha já está saudável no CRM (ganho, etapa de pós-venda e dono atribuído).
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setFilterAudit(filterAudit === 'ok' ? 'all' : 'ok'); setShowFilters(true) }}
                                    className={cn(
                                        'rounded-xl p-3 text-center transition-colors border',
                                        filterAudit === 'ok'
                                            ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                                            : 'bg-white border-emerald-200 hover:bg-emerald-50/50'
                                    )}
                                    disabled={auditOk === 0}
                                    title={auditOk > 0 ? 'Filtrar viagens saudáveis' : ''}
                                >
                                    <div className="flex items-center justify-center gap-1.5">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                        <p className="text-xl font-bold text-emerald-600">{auditOk}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Ok</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setFilterAudit(filterAudit === 'warn' ? 'all' : 'warn'); setShowFilters(true) }}
                                    className={cn(
                                        'rounded-xl p-3 text-center transition-colors border',
                                        filterAudit === 'warn'
                                            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                                            : 'bg-white border-amber-200 hover:bg-amber-50/50'
                                    )}
                                    disabled={auditWarn === 0}
                                    title={auditWarn > 0 ? 'Filtrar viagens com divergência' : ''}
                                >
                                    <div className="flex items-center justify-center gap-1.5">
                                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                                        <p className="text-xl font-bold text-amber-600">{auditWarn}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Com divergência</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setFilterAudit(filterAudit === 'error' ? 'all' : 'error'); setShowFilters(true) }}
                                    className={cn(
                                        'rounded-xl p-3 text-center transition-colors border',
                                        filterAudit === 'error'
                                            ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-200'
                                            : 'bg-white border-rose-200 hover:bg-rose-50/50'
                                    )}
                                    disabled={auditError === 0}
                                    title={auditError > 0 ? 'Filtrar viagens sem card no CRM' : ''}
                                >
                                    <div className="flex items-center justify-center gap-1.5">
                                        <XCircle className="h-4 w-4 text-rose-600" />
                                        <p className="text-xl font-bold text-rose-600">{auditError}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Sem card no CRM</p>
                                </button>
                            </div>
                            {filterAudit !== 'all' && (
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                                    <span>
                                        Mostrando apenas viagens
                                        {filterAudit === 'ok' && ' saudáveis'}
                                        {filterAudit === 'warn' && ' com divergência'}
                                        {filterAudit === 'error' && ' sem card no CRM'}
                                        .
                                    </span>
                                    <button
                                        onClick={() => setFilterAudit('all')}
                                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
                                    >
                                        <X className="h-3 w-3" /> Limpar filtro de saúde
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Aviso: comportamento em cards existentes */}
                        {trips.some(t => t.action === 'update') && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm">
                                <p className="font-medium text-blue-900 mb-1">Sobre os cards existentes</p>
                                <p className="text-blue-800 leading-relaxed">
                                    Tarefas feitas, valores, donos, acompanhantes e datas de viagem ficam intactos.
                                    A etapa do pipeline só muda nas viagens em que você marcar <span className="font-medium">“Mover card para a etapa sugerida”</span> —
                                    expanda uma viagem de atualização para decidir.
                                </p>
                            </div>
                        )}

                        {/* Summary stats */}
                        <div className="grid grid-cols-4 gap-3">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-slate-900">{trips.length}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Viagens</p>
                            </div>
                            <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-emerald-600">{toCreate}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Criar</p>
                            </div>
                            <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-blue-600">{toUpdate}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Atualizar</p>
                            </div>
                            {(toSkip + deselected) > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { if (toSkip > 0) { setFilterAction('skip'); setShowFilters(true) } }}
                                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center hover:bg-slate-50 transition-colors"
                                    title={toSkip > 0 ? 'Ver viagens que serão puladas' : ''}
                                >
                                    <p className="text-2xl font-bold text-slate-400">{toSkip + deselected}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {toSkip > 0 ? `Pular (${toSkip} em T. Planner)` : 'Pular'}
                                    </p>
                                </button>
                            )}
                        </div>

                        {/* Filter bar */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                            >
                                <div className="flex items-center gap-2 text-sm">
                                    <Filter className="h-4 w-4 text-slate-400" />
                                    <span className="font-medium text-slate-700">Filtros</span>
                                    {hasActiveFilters && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                            {filteredTrips.length}/{trips.length} visíveis
                                        </span>
                                    )}
                                </div>
                                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", showFilters && "rotate-180")} />
                            </button>

                            {showFilters && (
                                <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* Data fim range */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Data término (de)</label>
                                            <input
                                                type="date"
                                                value={filterDataFimMin}
                                                onChange={e => setFilterDataFimMin(e.target.value)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Data término (até)</label>
                                            <input
                                                type="date"
                                                value={filterDataFimMax}
                                                onChange={e => setFilterDataFimMax(e.target.value)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            />
                                        </div>

                                        {/* Valor range */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Valor total mínimo (R$)</label>
                                            <input
                                                type="number"
                                                value={filterValorMin}
                                                onChange={e => setFilterValorMin(e.target.value)}
                                                placeholder="0"
                                                min="0"
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Valor total máximo (R$)</label>
                                            <input
                                                type="number"
                                                value={filterValorMax}
                                                onChange={e => setFilterValorMax(e.target.value)}
                                                placeholder="∞"
                                                min="0"
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            />
                                        </div>

                                        {/* Ação */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Ação</label>
                                            <select
                                                value={filterAction}
                                                onChange={e => setFilterAction(e.target.value as typeof filterAction)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            >
                                                <option value="all">Todas</option>
                                                <option value="create">Apenas criar</option>
                                                <option value="update">Apenas atualizar</option>
                                                <option value="skip">Apenas pular (T. Planner)</option>
                                            </select>
                                        </div>

                                        {/* Vendedor */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vendedor</label>
                                            <select
                                                value={filterVendedor}
                                                onChange={e => setFilterVendedor(e.target.value)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            >
                                                <option value="">Todos</option>
                                                {uniqueVendedores.map(v => (
                                                    <option key={v} value={v}>{v}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* App Gerado */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">App Gerado</label>
                                            <select
                                                value={filterApp}
                                                onChange={e => setFilterApp(e.target.value as typeof filterApp)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            >
                                                <option value="all">Todos</option>
                                                <option value="sim">Com app</option>
                                                <option value="nao">Sem app</option>
                                            </select>
                                        </div>

                                        {/* Voucher */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Voucher</label>
                                            <select
                                                value={filterVoucher}
                                                onChange={e => setFilterVoucher(e.target.value as typeof filterVoucher)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            >
                                                <option value="all">Todos</option>
                                                <option value="sim">Todos com voucher</option>
                                                <option value="nao">Algum sem voucher</option>
                                            </select>
                                        </div>

                                        {/* Saúde no CRM */}
                                        <div>
                                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Saúde no CRM</label>
                                            <select
                                                value={filterAudit}
                                                onChange={e => setFilterAudit(e.target.value as typeof filterAudit)}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                            >
                                                <option value="all">Todas</option>
                                                <option value="ok">Apenas saudáveis</option>
                                                <option value="warn">Apenas com divergência</option>
                                                <option value="error">Apenas sem card no CRM</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Filter actions */}
                                    <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={selectFiltered}
                                                className="text-xs h-7 px-2.5"
                                                disabled={filteredTrips.length === 0}
                                            >
                                                <SquareCheck className="h-3 w-3 mr-1" />
                                                Selecionar filtrados ({filteredTrips.filter(t => t.action !== 'skip').length})
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={deselectFiltered}
                                                className="text-xs h-7 px-2.5"
                                                disabled={filteredTrips.length === 0}
                                            >
                                                <Square className="h-3 w-3 mr-1" />
                                                Desmarcar filtrados
                                            </Button>
                                        </div>
                                        {hasActiveFilters && (
                                            <button
                                                onClick={clearFilters}
                                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                                            >
                                                <X className="h-3 w-3" />
                                                Limpar filtros
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* File info + select all */}
                        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={toggleAllTrips}
                                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition-colors"
                                    title={selectedInScope >= scopeActionable.length ? 'Desmarcar todas' : 'Selecionar todas'}
                                >
                                    {(() => {
                                        if (selectedInScope === 0) return <Square className="h-4 w-4" />
                                        if (selectedInScope >= scopeActionable.length) return <SquareCheck className="h-4 w-4 text-indigo-600" />
                                        return <MinusSquare className="h-4 w-4 text-indigo-600" />
                                    })()}
                                    <span className="font-medium">
                                        {selectedInScope}/{scopeActionable.length} {hasActiveFilters ? 'filtradas selecionadas' : 'selecionadas'}
                                    </span>
                                </button>
                                <span className="text-slate-300">|</span>
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                                    <span className="font-medium">{fileName}</span>
                                </div>
                            </div>
                            <Button onClick={handleImport} disabled={toCreate + toUpdate === 0 && cardsToArchive.size === 0}>
                                <Upload className="h-4 w-4 mr-1.5" />
                                {(() => {
                                    const total = toCreate + toUpdate
                                    if (total === 0) return 'Aplicar'
                                    if (toCreate > 0 && toUpdate > 0) return `Atualizar ${toUpdate} + criar ${toCreate} viagen${total !== 1 ? 's' : ''}`
                                    if (toCreate > 0) return `Criar ${toCreate} viagen${toCreate !== 1 ? 's' : ''}`
                                    return `Atualizar ${toUpdate} viagen${toUpdate !== 1 ? 's' : ''}`
                                })()}
                                {cardsToArchive.size > 0 && (
                                    <span className="ml-1.5 text-[10px] font-normal opacity-90">
                                        + arquivar {cardsToArchive.size}
                                    </span>
                                )}
                            </Button>
                        </div>

                        {/* Trip cards */}
                        <div className="space-y-2">
                            {filteredTrips.length === 0 && hasActiveFilters ? (
                                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
                                    <Filter className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">Nenhuma viagem corresponde aos filtros aplicados</p>
                                    <button onClick={clearFilters} className="text-sm text-indigo-600 hover:text-indigo-700 mt-1">
                                        Limpar filtros
                                    </button>
                                </div>
                            ) : (
                                filteredTrips.map(trip => (
                                    <TripCard
                                        key={trip.id}
                                        trip={trip}
                                        selected={selectedTrips.has(trip.id)}
                                        onToggle={toggleTrip}
                                        onToggleMoveStage={toggleMoveStage}
                                        cardsToArchive={cardsToArchive}
                                        onToggleArchiveMark={toggleArchiveMark}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* ─── IMPORTING ───────────────────────────────── */}
                {step === 'importing' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center">
                        <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-slate-900 mb-2">Importando viagens...</h2>
                        <p className="text-sm text-slate-500">
                            Criando cards, contatos e tarefas no pós-venda
                        </p>
                        <div className="mt-4 w-full max-w-xs mx-auto bg-slate-100 rounded-full h-2">
                            <div
                                className="bg-indigo-600 h-2 rounded-full transition-all"
                                style={{ width: importProgress.total > 0 ? `${(importProgress.current / importProgress.total) * 100}%` : '0%' }}
                            />
                        </div>
                    </div>
                )}

                {/* ─── DONE ────────────────────────────────────── */}
                {step === 'done' && importResult && (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center">
                        {importResult.errors === 0 ? (
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        ) : (
                            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        )}
                        <h2 className="text-lg font-semibold text-slate-900 mb-4">Importação concluída</h2>
                        <div className="flex items-center justify-center gap-6 mb-6">
                            {importResult.cardsCreated > 0 && (
                                <div>
                                    <p className="text-3xl font-bold text-emerald-600">{importResult.cardsCreated}</p>
                                    <p className="text-xs text-slate-500">Cards criados</p>
                                </div>
                            )}
                            {importResult.cardsUpdated > 0 && (
                                <div>
                                    <p className="text-3xl font-bold text-blue-600">{importResult.cardsUpdated}</p>
                                    <p className="text-xs text-slate-500">Cards atualizados</p>
                                </div>
                            )}
                            <div>
                                <p className="text-3xl font-bold text-slate-900">{importResult.productsImported}</p>
                                <p className="text-xs text-slate-500">Produtos importados</p>
                            </div>
                            {importResult.skipped > 0 && (
                                <div>
                                    <p className="text-3xl font-bold text-slate-400">{importResult.skipped}</p>
                                    <p className="text-xs text-slate-500">Viagens puladas</p>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <Button variant="outline" onClick={handleReset}>Nova importação</Button>
                            <Link to="/pipeline">
                                <Button>Ver no Funil</Button>
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
