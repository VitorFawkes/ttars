import { useState, useCallback, useRef, useEffect } from 'react'
import { Navigate, Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
    Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
    ArrowLeft, ArrowRight, Clock, ChevronDown, ChevronRight, XCircle,
    Package, Users, Plus, RefreshCw, Undo2, SquareCheck, Square, MinusSquare,
    Filter, X, Archive, Calendar, Hash, MapPin, Pencil, Link2,
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
    norm, parseCSVNative, findColumn, chunked, formatBRL,
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
/** Coluna opcional onde o usuário declara em qual etapa a viagem deveria estar. */
const ETAPA_ALIASES = ['etapa', 'etapa atual', 'etapa correta', 'etapa alvo', 'fase', 'situacao', 'situação', 'status etapa', 'em qual etapa', 'estado']

/**
 * Tenta resolver um texto livre da coluna "etapa" do CSV num stage_id conhecido.
 * Heurística: normaliza (sem acento, lower, sem pontuação) e procura por palavras-chave.
 * Detecta também os comparadores < e > ANTES de remover a pontuação, pra distinguir
 * "Pré-embarque <30" (LT30) de "Pré-embarque >30" (GT30).
 * Retorna null se o texto está vazio ou não casa com nenhuma etapa.
 */
function resolveTargetStage(rawText: string): { id: string; name: string } | null {
    const text = (rawText || '').trim()
    if (!text) return null

    // 1) Detecta comparadores na string ORIGINAL antes de normalizar (lá o `<`/`>` somem)
    const original = text.toLowerCase()
    const hasLess = original.includes('<')           // <30, <<<, <= etc
    const hasGreater = original.includes('>')        // >30, >>>, >= etc

    // 2) Normaliza pra busca por palavra-chave (sem acento, sem pontuação)
    const n = text.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // App & Conteúdo (também: "montagem", "criar app", "produzindo")
    if (n.includes('app') || n.includes('conteudo') || n.includes('montagem') || n.includes('produzindo')) {
        return { id: STAGE_APP_CONTEUDO, name: 'App & Conteúdo em Montagem' }
    }

    // Em viagem (precisa testar antes de "embarque" pra evitar falsos)
    if (n.includes('em viagem') || n === 'viagem' || n.includes('viajando') || n.includes('em curso')) {
        return { id: STAGE_EM_VIAGEM, name: 'Em Viagem' }
    }

    // Pós-viagem / Reativação
    if (n.includes('pos viagem') || n.includes('posviagem') || n.includes('reativacao') || n === 'pos' || n.startsWith('pos ')) {
        return { id: STAGE_POS_VIAGEM, name: 'Pós-viagem & Reativação' }
    }

    // Pré-embarque: distingue por comparador OU palavras-chave de tempo
    const isPreEmbarque = n.includes('pre embarque') || n.includes('preembarque') || n.includes('embarque')
    if (isPreEmbarque) {
        // GT30: tem `>` OU palavras "mais", "maior", "longe", "longo", "gt"
        const isGt = hasGreater || n.includes('mais') || n.includes('maior') || n.includes('longe') || n.includes('longo') || n.includes(' gt ')
        // LT30: tem `<` OU palavras "menor", "menos", "perto", "proximo", "lt"
        const isLt = hasLess || n.includes('menor') || n.includes('menos') || n.includes('perto') || n.includes('proximo') || n.includes(' lt ')

        if (isGt && !isLt) {
            return { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque - >>> 30 dias' }
        }
        if (isLt && !isGt) {
            return { id: STAGE_PRE_EMBARQUE_LT30, name: 'Pré-Embarque <<< 30 dias' }
        }
        // Sem qualificador claro → assume LT30 (caso mais comum, viagem próxima)
        return { id: STAGE_PRE_EMBARQUE_LT30, name: 'Pré-Embarque <<< 30 dias' }
    }

    return null
}

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
    /** Coluna opcional do CSV onde o usuário declara a etapa-alvo (texto cru). */
    etapaCsv: string
}

interface TripDiff {
    /** Algum campo divergente entre arquivo e CRM */
    hasAny: boolean
    etapa: { changed: boolean; fromName: string | null; toName: string }
    datas: {
        changed: boolean
        inicio: { from: string | null; to: string | null; changed: boolean }
        fim: { from: string | null; to: string | null; changed: boolean }
    }
    monde: {
        changed: boolean
        current: string[]
        file: string[]
        toAdd: string[]
        toRemove: string[]
        toKeep: string[]
    }
    valor: { changed: boolean; from: number; to: number }
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
    /** Estado atual do card no CRM — usado pelo diff lado-a-lado no preview */
    existingDataInicio: string | null
    existingDataFim: string | null
    existingValorFinal: number | null
    existingNumeroVendaMonde: string | null
    existingHistoricoNums: string[]
    /** Quando o card matcheado está arquivado, marca aqui. UI mostra badge "Arquivado"
     *  e o RPC desarquiva ao aplicar (se update_dates ou sync_monde_nums acionados). */
    existingArchivedAt: string | null
    /** Quando há mais de um card no CRM com a mesma venda, lista os outros (id + titulo). */
    otherCardCandidates: Array<{
        id: string
        titulo: string
        statusComercial: string | null
        ganhoPlanner: boolean | null
        stageId: string | null
        stageName: string | null
    }>
    /** Toggles por viagem — default ON quando há diff, OFF caso contrário */
    moveStage: boolean
    updateDates: boolean
    syncMondeNums: boolean
    action: 'create' | 'update' | 'skip'
    skipReason: string | null
    audit: AuditResult
    diff: TripDiff
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
                issues.push('Etapa é Pós-viagem mas a viagem ainda não foi encerrada (pós-venda).')
            }
        } else {
            // Etapas pré-Pós-viagem (App & Conteúdo, Pré-embarque, Em Viagem):
            // status='ganho' OU ganho_pos=true são divergência (viagem ainda não aconteceu)
            if (trip.existingStatusComercial === 'ganho') {
                issues.push(`Card marcado como Ganho comercial mas a viagem ainda não aconteceu (etapa atual${stageLabel}). Deveria estar como "aberto".`)
            }
            if (trip.existingGanhoPos === true) {
                issues.push(`Card marcado como encerrado (pós-venda) mas a viagem ainda não aconteceu (etapa atual${stageLabel}).`)
            }
        }
    }

    return {
        severity: issues.length === 0 ? 'ok' : 'warn',
        issues,
    }
}

// ─── Diff arquivo × CRM ─────────────────────────────────────

/**
 * Compara o que está no card no CRM vs o que veio na planilha.
 * Para cada campo (etapa, datas, números Monde, valor), calcula se mudou
 * e qual é a diferença. Usado para mostrar o diff lado-a-lado no preview.
 *
 * Trips em ação 'create' ou 'skip' retornam diff zerado (não tem o que comparar).
 */
function computeTripDiff(trip: Pick<TripGroup,
    'action' | 'existingCardId' | 'existingStageId' | 'existingStageName' |
    'existingDataInicio' | 'existingDataFim' | 'existingValorFinal' |
    'existingNumeroVendaMonde' | 'existingHistoricoNums' |
    'stage' | 'dataInicio' | 'dataFim' | 'valorTotal' | 'vendaNums'
>): TripDiff {
    const empty: TripDiff = {
        hasAny: false,
        etapa: { changed: false, fromName: null, toName: trip.stage.name },
        datas: {
            changed: false,
            inicio: { from: null, to: trip.dataInicio, changed: false },
            fim: { from: null, to: trip.dataFim, changed: false },
        },
        monde: {
            changed: false,
            current: [],
            file: [...new Set(trip.vendaNums)],
            toAdd: [],
            toRemove: [],
            toKeep: [],
        },
        valor: { changed: false, from: 0, to: trip.valorTotal },
    }

    if (trip.action !== 'update' || !trip.existingCardId) {
        return empty
    }

    const etapaChanged = !!trip.existingStageId && trip.existingStageId !== trip.stage.id
    const etapa = {
        changed: etapaChanged,
        fromName: trip.existingStageName,
        toName: trip.stage.name,
    }

    const inicioChanged = !!trip.dataInicio && trip.existingDataInicio !== trip.dataInicio
    const fimChanged = !!trip.dataFim && trip.existingDataFim !== trip.dataFim
    const datas = {
        changed: inicioChanged || fimChanged,
        inicio: { from: trip.existingDataInicio, to: trip.dataInicio, changed: inicioChanged },
        fim: { from: trip.existingDataFim, to: trip.dataFim, changed: fimChanged },
    }

    const fileNums = [...new Set(trip.vendaNums.filter(Boolean))]
    const currentSet = new Set<string>([
        ...(trip.existingNumeroVendaMonde ? [trip.existingNumeroVendaMonde] : []),
        ...trip.existingHistoricoNums,
    ].filter(Boolean))
    const currentNums = [...currentSet]
    const toAdd = fileNums.filter(n => !currentSet.has(n))
    const toRemove = currentNums.filter(n => !fileNums.includes(n))
    const toKeep = fileNums.filter(n => currentSet.has(n))
    const monde = {
        changed: toAdd.length > 0 || toRemove.length > 0,
        current: currentNums,
        file: fileNums,
        toAdd,
        toRemove,
        toKeep,
    }

    const fromValor = trip.existingValorFinal ?? 0
    const valor = {
        changed: Math.abs(fromValor - trip.valorTotal) > 0.005,
        from: fromValor,
        to: trip.valorTotal,
    }

    return {
        hasAny: etapa.changed || datas.changed || monde.changed || valor.changed,
        etapa,
        datas,
        monde,
        valor,
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
    | 'existingDataInicio' | 'existingDataFim' | 'existingValorFinal'
    | 'existingNumeroVendaMonde' | 'existingHistoricoNums'
    | 'existingArchivedAt'
    | 'otherCardCandidates'
    | 'moveStage' | 'updateDates' | 'syncMondeNums' | 'action' | 'skipReason' | 'audit' | 'diff'
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

        // Se o CSV trouxer coluna "etapa" preenchida e reconhecida, ela vence.
        const etapaCsvText = allProducts.map(r => r.etapaCsv).find(s => s && s.trim()) || ''
        const stageFromCsv = etapaCsvText ? resolveTargetStage(etapaCsvText) : null

        let stage: { id: string; name: string }
        if (stageFromCsv) {
            stage = stageFromCsv
        } else if (allReady && dataInicio) {
            const days = daysFromNow(dataInicio)
            stage = days > 30
                ? { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque - >>> 30 dias' }
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

// ─── Destination stage summary (topo do preview) ────────────

/**
 * Widget de visão de cima: agrupa viagens por etapa-destino e mostra
 * "Para onde vão essas N viagens — X para Pré-embarque, Y para Pós-viagem...".
 * Cada linha clicável aplica filtro de etapa-destino. Ordem segue ordem
 * natural do funil.
 */
const TARGET_STAGE_ORDER: Array<{ id: string; name: string; color: string }> = [
    { id: STAGE_APP_CONTEUDO, name: 'App & Conteúdo em Montagem', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque - >>> 30 dias', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: STAGE_PRE_EMBARQUE_LT30, name: 'Pré-Embarque <<< 30 dias', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: STAGE_EM_VIAGEM, name: 'Em Viagem', color: 'bg-violet-50 text-violet-700 border-violet-200' },
    { id: STAGE_POS_VIAGEM, name: 'Pós-viagem & Reativação', color: 'bg-amber-50 text-amber-700 border-amber-200' },
]

/** Contexto de duplicata por card: vencedor sugerido + razões + número da venda
 *  conflitante. Permite mostrar a decisão da duplicata INLINE na lista "fora da planilha"
 *  da etapa, sem mandar o user pro painel embaixo. */
type DupCtx = {
    numero: string
    totalInGroup: number
    isWinner: boolean
    reasons: string[]
    score: number
}

function DestinationStageSummary({
    trips, filterTargetStage, onSelectStage, stageCounts, activeOrgId,
    dupCtxByCardId, cardsToArchive, onToggleArchiveMark,
}: {
    trips: TripGroup[]
    filterTargetStage: string
    onSelectStage: (stageId: string) => void
    /** Contagem ATUAL no CRM por stage_id (ativos em fluxo, sem arquivados) */
    stageCounts: Record<string, number>
    /** Workspace ativo — necessário pra buscar a lista dos cards "fora da planilha" */
    activeOrgId: string | null
    /** Mapa cardId → contexto de duplicata. Se o card está num grupo, o contexto traz o
     *  vencedor sugerido pelo sistema e as razões — mostrado INLINE na lista. */
    dupCtxByCardId: Map<string, DupCtx>
    /** Set compartilhado pra arquivar — também usado pro checkbox "arquivar este?" inline */
    cardsToArchive: Set<string>
    onToggleArchiveMark: (cardId: string) => void
}) {
    // Estado: qual etapa teve a lista "fora da planilha" expandida pelo usuário
    const [expandedOutStage, setExpandedOutStage] = useState<string | null>(null)

    // IDs de cards da planilha que estão atualmente em cada etapa (action=update).
    // Usado para excluir esses IDs da query de "fora da planilha".
    const fileIdsCurrentlyInStage: Record<string, string[]> = {}
    for (const t of trips) {
        if (!t.existingCardId || !t.existingStageId) continue
        if (!fileIdsCurrentlyInStage[t.existingStageId]) fileIdsCurrentlyInStage[t.existingStageId] = []
        fileIdsCurrentlyInStage[t.existingStageId].push(t.existingCardId)
    }

    // Busca dos cards "fora da planilha" da etapa expandida — só roda quando o user clica.
    const idsToExcludeKey = expandedOutStage ? (fileIdsCurrentlyInStage[expandedOutStage] || []).join(',') : ''
    const { data: outOfFileCards = [], isLoading: loadingOutOfFile } = useQuery({
        queryKey: ['out-of-file-cards', activeOrgId, expandedOutStage, idsToExcludeKey],
        enabled: !!expandedOutStage && !!activeOrgId,
        staleTime: 1000 * 30,
        queryFn: async () => {
            if (!expandedOutStage || !activeOrgId) return []
            let q = supabase
                .from('cards')
                .select('id, titulo, data_viagem_inicio, data_viagem_fim, pessoa_principal_id')
                .eq('org_id', activeOrgId)
                .eq('pipeline_stage_id', expandedOutStage)
                .is('archived_at', null)
                .is('deleted_at', null)
                // Mesmos filtros do stageCounts: sem sub-cards merged/cancelled e sem
                // is_group_parent. Sem isso a lista mostrava mais cards que o contador.
                .or('sub_card_status.is.null,sub_card_status.eq.active')
                .or('is_group_parent.is.null,is_group_parent.eq.false')
                .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                .order('data_viagem_inicio', { ascending: true, nullsFirst: false })
                .limit(200)
            const idsInFile = fileIdsCurrentlyInStage[expandedOutStage] || []
            if (idsInFile.length > 0) {
                // PostgREST: NOT IN com lista
                q = q.not('id', 'in', `(${idsInFile.join(',')})`)
            }
            const { data } = await q
            return (data || []) as Array<{
                id: string; titulo: string;
                data_viagem_inicio: string | null; data_viagem_fim: string | null;
                pessoa_principal_id: string | null
            }>
        },
    })

    if (trips.length === 0) return null

    // Mapa por etapa-destino (vão chegar):
    //  - total: quantas viagens do arquivo vão TERMINAR nessa etapa
    //  - alreadyThere: dessas, quantas já estão lá hoje no CRM
    const counts = new Map<string, { total: number; alreadyThere: number }>()
    for (const t of trips) {
        if (t.action === 'skip') continue
        const cur = counts.get(t.stage.id) || { total: 0, alreadyThere: 0 }
        cur.total += 1
        if (t.action === 'update' && t.existingStageId === t.stage.id) {
            cur.alreadyThere += 1
        }
        counts.set(t.stage.id, cur)
    }

    // Mapa por etapa-atual no CRM: quantas viagens do arquivo ESTÃO HOJE em cada etapa.
    const fileNowInStage: Record<string, number> = {}
    for (const t of trips) {
        if (t.action !== 'update' || !t.existingStageId) continue
        fileNowInStage[t.existingStageId] = (fileNowInStage[t.existingStageId] || 0) + 1
    }

    // Por etapa-destino: quantas viagens da planilha vão CRIAR card novo lá.
    // Auditoria completa: além de "CRM tem a mais" (fora da planilha), também
    // saber "planilha tem a mais" (viagens novas que ainda não existem no CRM).
    const creatingByStage: Record<string, number> = {}
    for (const t of trips) {
        if (t.action !== 'create') continue
        creatingByStage[t.stage.id] = (creatingByStage[t.stage.id] || 0) + 1
    }

    const totalActionable = [...counts.values()].reduce((s, c) => s + c.total, 0)
    if (totalActionable === 0) return null

    // Calcula DELTA por etapa, considerando toggles ativos por viagem.
    // Regras de movimento:
    //  - action='create' → +1 na etapa-destino
    //  - action='update' + moveStage=true + existingStageId !== stage.id → +1 destino, -1 da atual
    //  - action='update' + moveStage=false → fica onde está (sem delta de etapa)
    const delta: Record<string, number> = {}
    for (const t of trips) {
        if (t.action === 'skip') continue
        if (t.action === 'create') {
            delta[t.stage.id] = (delta[t.stage.id] || 0) + 1
            continue
        }
        // update
        if (t.moveStage && t.existingStageId && t.existingStageId !== t.stage.id) {
            delta[t.stage.id] = (delta[t.stage.id] || 0) + 1
            delta[t.existingStageId] = (delta[t.existingStageId] || 0) - 1
        }
        // se !moveStage, fica onde está → sem delta
    }

    // Mostra TODAS as etapas pós-venda (mesmo que não venham do arquivo) para
    // dar a visão completa de "como vai ficar o funil depois".
    const visibleStages = TARGET_STAGE_ORDER

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                    Para onde vão essas {totalActionable} {totalActionable === 1 ? 'viagem' : 'viagens'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Etapa de destino calculada pelas datas e pelo status de app/voucher. Os números mostram <span className="font-medium">como o funil vai ficar</span> se você aplicar com os toggles atuais.
                </p>
            </div>
            <div className="space-y-1.5">
                {visibleStages.map(stage => {
                    const c = counts.get(stage.id) || { total: 0, alreadyThere: 0 }
                    const current = stageCounts[stage.id] ?? 0
                    const stageDelta = delta[stage.id] || 0
                    // Clamp pra evitar negativo absurdo se houver mismatch entre filtros
                    // de stageCounts e match (ex: planilha aponta pra cards já fechados que
                    // não estão sendo contados no kanban).
                    const projected = Math.max(0, current + stageDelta)
                    const fileHere = fileNowInStage[stage.id] || 0  // arquivo: quantas estão AQUI hoje no CRM
                    const fileGoing = c.total                        // arquivo: quantas vão TERMINAR aqui
                    const isSelected = filterTargetStage === stage.id
                    const hasInteraction = fileGoing > 0 || fileHere > 0  // tem viagem do arquivo nessa etapa de algum jeito
                    const isOutListOpen = expandedOutStage === stage.id
                    return (
                        <div key={stage.id} className="space-y-1">
                        {(() => {
                            // Narrativa clara: 3 colunas com header + valor + detalhamento.
                            // Em vez de números soltos, cada coluna conta sua história:
                            //   PLANILHA: total que vai terminar aqui (atualizar + criar)
                            //   CRM HOJE: total atual no funil (na planilha + fora dela)
                            //   CRM DEPOIS: projeção pós-aplicação (delta colorido)
                            const creating = creatingByStage[stage.id] || 0
                            const updating = fileGoing - creating
                            const onPlanInCRM = fileHere // cards no CRM hoje que estão na planilha
                            const outOfFile = Math.max(0, current - fileHere)
                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Click no card faz DUAS coisas: filtra pra essa etapa
                                        // e abre/fecha a lista detalhada. Em qualquer etapa com
                                        // alguma interação (planilha OU CRM) o user consegue
                                        // expandir — não depende de ter "fora da planilha".
                                        if (fileGoing > 0) onSelectStage(stage.id)
                                        if (hasInteraction) setExpandedOutStage(isOutListOpen ? null : stage.id)
                                    }}
                                    disabled={!hasInteraction}
                                    className={cn(
                                        'w-full px-3 py-3 rounded-lg border transition-colors text-left',
                                        hasInteraction
                                            ? (isSelected
                                                ? `${stage.color} ring-2 ring-offset-1 ring-indigo-300 cursor-pointer`
                                                : `${stage.color} hover:brightness-95 cursor-pointer`)
                                            : 'bg-slate-50 border-slate-100 text-slate-400 cursor-default'
                                    )}
                                >
                                    {/* Linha 1: nome da etapa + chevron de expand */}
                                    <div className="font-semibold text-sm mb-2 flex items-center justify-between gap-2">
                                        <span>{stage.name}</span>
                                        {hasInteraction && (
                                            <span className="text-[11px] font-normal opacity-70">
                                                {isOutListOpen ? '▴ ocultar detalhes' : '▾ ver detalhes'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Linha 2: 3 colunas com mesma altura, separadores verticais */}
                                    <div className="grid grid-cols-3 gap-3 text-xs">
                                        {/* Coluna 1: PLANILHA — viagens que vão terminar aqui */}
                                        <div className="flex flex-col">
                                            <div className="text-[9px] uppercase tracking-wide opacity-60 font-semibold mb-0.5">
                                                Da planilha
                                            </div>
                                            <div className={cn(
                                                'text-lg font-bold leading-none mb-1',
                                                fileGoing > 0 ? 'text-slate-900' : 'text-slate-300'
                                            )}>
                                                {fileGoing}
                                                <span className="text-[10px] font-normal opacity-60 ml-1">vão terminar aqui</span>
                                            </div>
                                            {fileGoing > 0 && (
                                                <div className="text-[10px] opacity-75 leading-tight">
                                                    {updating > 0 && <span>{updating} atualizar card existente</span>}
                                                    {updating > 0 && creating > 0 && <br />}
                                                    {creating > 0 && <span className="text-emerald-700 font-medium">{creating} criar card novo</span>}
                                                </div>
                                            )}
                                        </div>

                                        {/* Coluna 2: CRM HOJE — total atual + breakdown */}
                                        <div className="flex flex-col border-l border-current/15 pl-3">
                                            <div className="text-[9px] uppercase tracking-wide opacity-60 font-semibold mb-0.5">
                                                CRM hoje
                                            </div>
                                            <div className={cn(
                                                'text-lg font-bold leading-none mb-1',
                                                hasInteraction ? 'text-slate-900' : 'text-slate-300'
                                            )}>
                                                {current}
                                                <span className="text-[10px] font-normal opacity-60 ml-1">cards aqui</span>
                                            </div>
                                            {current > 0 && (
                                                <div className="text-[10px] opacity-75 leading-tight">
                                                    {onPlanInCRM > 0 && <span>{onPlanInCRM} também na planilha</span>}
                                                    {onPlanInCRM > 0 && outOfFile > 0 && <br />}
                                                    {outOfFile > 0 && (
                                                        <span
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setExpandedOutStage(isOutListOpen ? null : stage.id)
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.stopPropagation(); e.preventDefault()
                                                                    setExpandedOutStage(isOutListOpen ? null : stage.id)
                                                                }
                                                            }}
                                                            className="text-rose-700 font-medium underline cursor-pointer hover:text-rose-900"
                                                        >
                                                            {outOfFile} fora da planilha {isOutListOpen ? '▴' : '▾'}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Coluna 3: CRM DEPOIS — projeção pós-aplicação.
                                            Mostra a soma explícita: viagens da planilha + cards fora da planilha
                                            que continuam lá = total no CRM depois. */}
                                        <div className="flex flex-col border-l border-current/15 pl-3">
                                            <div className="text-[9px] uppercase tracking-wide opacity-60 font-semibold mb-0.5">
                                                CRM depois
                                            </div>
                                            <div className="flex items-baseline gap-1.5 mb-1 leading-none">
                                                <span className={cn(
                                                    'text-lg font-bold',
                                                    stageDelta > 0 && 'text-emerald-700',
                                                    stageDelta < 0 && 'text-rose-700',
                                                    stageDelta === 0 && (hasInteraction ? 'text-slate-900' : 'text-slate-300'),
                                                )}>
                                                    {projected}
                                                </span>
                                                {stageDelta !== 0 && (
                                                    <span className={cn(
                                                        'text-[10px] font-bold',
                                                        stageDelta > 0 ? 'text-emerald-600' : 'text-rose-600'
                                                    )}>
                                                        {stageDelta > 0 ? `+${stageDelta}` : stageDelta}
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-normal opacity-60">cards aqui</span>
                                            </div>
                                            {hasInteraction && (
                                                <div className="text-[10px] opacity-75 leading-tight">
                                                    {/* Soma explícita pra responder "vão ter X ou Y?":
                                                        planilha + fora-da-planilha-que-fica = projetado */}
                                                    {fileGoing > 0 && outOfFile > 0 && (
                                                        <span>
                                                            <span className="font-medium">{fileGoing}</span> da planilha + <span className="font-medium text-rose-700">{outOfFile}</span> fora da planilha
                                                            {' = '}
                                                            <span className="font-bold">{projected}</span>
                                                        </span>
                                                    )}
                                                    {fileGoing > 0 && outOfFile === 0 && (
                                                        <span>
                                                            <span className="font-medium">{fileGoing}</span> da planilha
                                                            {projected !== fileGoing && (
                                                                <span> · {projected - fileGoing} {projected - fileGoing > 0 ? 'extra' : 'a menos'}</span>
                                                            )}
                                                        </span>
                                                    )}
                                                    {fileGoing === 0 && outOfFile > 0 && (
                                                        <span><span className="font-medium text-rose-700">{outOfFile}</span> fora da planilha continuam aqui</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            )
                        })()}

                        {/* Lista expandida: TODOS os cards que terminam nessa etapa após aplicar.
                            Da planilha (criar/atualizar/migrar) + fora da planilha (manter/arquivar).
                            User vê em UM SÓ LUGAR o que vai estar lá no final. */}
                        {isOutListOpen && (() => {
                            // Trips da planilha que terminam nessa etapa
                            const tripsHere = trips.filter(t => t.action !== 'skip' && t.stage.id === stage.id)
                            const tripsCreating = tripsHere.filter(t => t.action === 'create')
                            const tripsAlreadyHere = tripsHere.filter(t => t.action === 'update' && t.existingStageId === stage.id)
                            const tripsArrivingFromOther = tripsHere.filter(t => t.action === 'update' && t.existingStageId !== stage.id)

                            const willKeep = outOfFileCards.filter(c => !cardsToArchive.has(c.id))
                            const willArchive = outOfFileCards.filter(c => cardsToArchive.has(c.id))
                            const totalFinal = tripsHere.length + willKeep.length

                            // Helper: render trip da planilha como linha
                            const renderTripLine = (t: typeof tripsHere[number], action: 'criar' | 'atualizar' | 'migrar') => {
                                const colorByAction = {
                                    criar: 'bg-emerald-50 border-emerald-200',
                                    atualizar: 'bg-slate-50 border-slate-200',
                                    migrar: 'bg-blue-50 border-blue-200',
                                }
                                const labelByAction = {
                                    criar: { text: 'criar', cls: 'bg-emerald-100 text-emerald-700' },
                                    atualizar: { text: 'atualizar', cls: 'bg-slate-100 text-slate-600' },
                                    migrar: { text: 'migrar pra cá', cls: 'bg-blue-100 text-blue-700' },
                                }
                                const lbl = labelByAction[action]
                                const titulo = buildTripTitle(t.pagantePrincipal, t.products, t.dataInicio, t.dataFim)
                                return (
                                    <li key={t.id} className={cn('text-xs flex items-center gap-2 px-2 py-1 rounded border', colorByAction[action])}>
                                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', lbl.cls)}>
                                            {lbl.text}
                                        </span>
                                        {t.existingCardId ? (
                                            <Link
                                                to={`/cards/${t.existingCardId}`}
                                                className="flex-1 min-w-0 truncate text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {titulo}
                                            </Link>
                                        ) : (
                                            <span className="flex-1 min-w-0 truncate text-slate-700">{titulo}</span>
                                        )}
                                        {action === 'migrar' && t.existingStageName && (
                                            <span className="text-[9px] text-blue-700 bg-blue-50 border border-blue-200 px-1 rounded shrink-0">
                                                de {t.existingStageName}
                                            </span>
                                        )}
                                        {t.existingArchivedAt && (
                                            <span
                                                className="text-[9px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-1 rounded shrink-0"
                                                title="Card está arquivado — vai desarquivar ao aplicar"
                                            >
                                                ⚠ vai desarquivar
                                            </span>
                                        )}
                                        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                                            {(() => {
                                                const ini = t.dataInicio ? formatDateBR(t.dataInicio) : null
                                                const fim = t.dataFim ? formatDateBR(t.dataFim) : null
                                                if (!ini && !fim) return '—'
                                                if (ini && fim) return `${ini} → ${fim}`
                                                return ini || fim
                                            })()}
                                        </span>
                                    </li>
                                )
                            }

                            // Helper: render card fora-da-planilha. Quando o card faz parte
                            // de um grupo de duplicatas, mostra a decisão (manter vencedor /
                            // arquivar perdedor) e as razões INLINE — pra o user resolver tudo
                            // aqui mesmo, sem ir pro painel embaixo.
                            const renderOutItem = (card: typeof outOfFileCards[number], archiveMode: boolean) => {
                                const dup = dupCtxByCardId.get(card.id)
                                return (
                                    <li key={card.id} className={cn(
                                        'text-xs px-2 py-1 rounded border',
                                        archiveMode ? 'bg-rose-50 border-rose-200' : (dup ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50 border-amber-200')
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <label
                                                className="inline-flex items-center gap-1 cursor-pointer select-none shrink-0"
                                                title={archiveMode ? 'Vai arquivar — clique pra manter' : 'Vai manter — clique pra arquivar'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={archiveMode}
                                                    onChange={() => onToggleArchiveMark(card.id)}
                                                    className={cn('rounded',
                                                        archiveMode ? 'border-rose-300 text-rose-600 focus:ring-rose-500' : 'border-amber-300 text-amber-600 focus:ring-amber-500')}
                                                />
                                                <span className={cn('text-[10px] font-semibold px-1 rounded',
                                                    archiveMode ? 'text-rose-700' : (dup?.isWinner ? 'text-emerald-700' : 'text-amber-700'))}>
                                                    {archiveMode ? 'arquivar' : 'manter'}
                                                </span>
                                            </label>
                                            <Link
                                                to={`/cards/${card.id}`}
                                                className="flex-1 min-w-0 truncate text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {card.titulo || '(sem título)'}
                                            </Link>
                                            {!dup && (
                                                <span className="text-[9px] font-medium text-amber-700 bg-amber-100 border border-amber-300 px-1 rounded shrink-0">
                                                    fora da planilha
                                                </span>
                                            )}
                                            {dup && dup.isWinner && (
                                                <span
                                                    className="text-[9px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1 rounded shrink-0"
                                                    title={`Sistema sugere manter este (vence pelas razões: ${dup.reasons.join(', ') || 'maior score'}). Outros ${dup.totalInGroup - 1} card(s) com a venda ${dup.numero} estão marcados pra arquivar.`}
                                                >
                                                    🏆 vencedor (venda {dup.numero})
                                                </span>
                                            )}
                                            {dup && !dup.isWinner && (
                                                <span
                                                    className="text-[9px] font-semibold text-rose-700 bg-rose-100 border border-rose-300 px-1 rounded shrink-0"
                                                    title={`Sistema sugere arquivar — outro card com a venda ${dup.numero} venceu (em ${dup.totalInGroup} cards no total).`}
                                                >
                                                    perdedor (venda {dup.numero})
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                                                {(() => {
                                                    const ini = card.data_viagem_inicio ? formatDateBR(card.data_viagem_inicio) : null
                                                    const fim = card.data_viagem_fim ? formatDateBR(card.data_viagem_fim) : null
                                                    if (!ini && !fim) return '—'
                                                    if (ini && fim) return `${ini} → ${fim}`
                                                    return ini || fim
                                                })()}
                                            </span>
                                        </div>
                                        {dup && dup.reasons.length > 0 && (
                                            <div className="mt-0.5 ml-[4.5rem] text-[10px] text-slate-500 italic">
                                                {dup.isWinner ? 'porque tem ' : 'outro card tem '}{dup.reasons.join(' · ')}
                                            </div>
                                        )}
                                    </li>
                                )
                            }

                            return (
                                <div className="bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2.5 ml-3 mr-3 space-y-3">
                                    {loadingOutOfFile && (
                                        <div className="text-xs text-slate-500">Carregando…</div>
                                    )}

                                    {/* Header: balanço final */}
                                    <div className="text-[11px] text-slate-700 bg-white rounded border border-slate-200 px-3 py-2">
                                        <span className="font-semibold">Total em "{stage.name}" depois: {totalFinal} cards</span>
                                        {' = '}
                                        <span className="text-slate-600">{tripsHere.length} da planilha + {willKeep.length} fora da planilha que ficam</span>
                                        {willArchive.length > 0 && (
                                            <span className="text-rose-700"> · {willArchive.length} {willArchive.length === 1 ? 'sai pra lixeira' : 'saem pra lixeira'}</span>
                                        )}
                                    </div>

                                    {/* Da planilha — 3 sub-grupos */}
                                    {tripsHere.length > 0 && (
                                        <div>
                                            <div className="text-[11px] font-semibold text-slate-800 mb-1.5 flex items-center gap-1">
                                                <FileSpreadsheet className="h-3 w-3" />
                                                Da planilha ({tripsHere.length})
                                            </div>

                                            {tripsCreating.length > 0 && (
                                                <div className="mb-2">
                                                    <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold mb-1 px-1">
                                                        {tripsCreating.length} {tripsCreating.length === 1 ? 'cria card novo' : 'criam cards novos'}
                                                    </div>
                                                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                                                        {tripsCreating.map(t => renderTripLine(t, 'criar'))}
                                                    </ul>
                                                </div>
                                            )}

                                            {tripsArrivingFromOther.length > 0 && (
                                                <div className="mb-2">
                                                    <div className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold mb-1 px-1">
                                                        {tripsArrivingFromOther.length} {tripsArrivingFromOther.length === 1 ? 'vai migrar pra cá' : 'vão migrar pra cá'} (de outras etapas)
                                                    </div>
                                                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                                                        {tripsArrivingFromOther.map(t => renderTripLine(t, 'migrar'))}
                                                    </ul>
                                                </div>
                                            )}

                                            {tripsAlreadyHere.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold mb-1 px-1">
                                                        {tripsAlreadyHere.length} {tripsAlreadyHere.length === 1 ? 'já está aqui (atualizar dados)' : 'já estão aqui (atualizar dados)'}
                                                    </div>
                                                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                                                        {tripsAlreadyHere.map(t => renderTripLine(t, 'atualizar'))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Fora da planilha — 2 sub-grupos */}
                                    {!loadingOutOfFile && outOfFileCards.length > 0 && (
                                        <div>
                                            <div className="text-[11px] font-semibold text-slate-800 mb-1.5 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                                Fora da planilha ({outOfFileCards.length}) — cards no CRM que a planilha não trouxe
                                            </div>

                                            {willKeep.length > 0 && (
                                                <div className="mb-2">
                                                    <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1 px-1">
                                                        {willKeep.length} {willKeep.length === 1 ? 'continua aqui (sem ação)' : 'continuam aqui (sem ação)'}
                                                    </div>
                                                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                                                        {willKeep.map(c => renderOutItem(c, false))}
                                                    </ul>
                                                </div>
                                            )}

                                            {willArchive.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold mb-1 px-1">
                                                        {willArchive.length} {willArchive.length === 1 ? 'vai pra lixeira' : 'vão pra lixeira'}
                                                    </div>
                                                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                                                        {willArchive.map(c => renderOutItem(c, true))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        </div>
                    )
                })}
            </div>
            {filterTargetStage !== 'all' && (
                <button
                    type="button"
                    onClick={() => onSelectStage(filterTargetStage)}
                    className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                    <X className="h-3 w-3" /> Limpar filtro de etapa-destino
                </button>
            )}
        </div>
    )
}

// ─── Painel de duplicatas (raio-X do CRM, independe da planilha) ────

type DuplicateCardRow = {
    id: string
    titulo: string | null
    pipeline_stage_id: string | null
    pessoa_principal_id: string | null
    status_comercial: string | null
    ganho_planner: boolean | null
    pos_owner_id: string | null
    archived_at: string | null
    numeroAtual: string | null
    numerosHistorico: string[]
}

/**
 * Score de "qual card manter" num grupo de duplicatas. Quanto maior, melhor.
 * Componentes (transparentes, mostrados ao usuário como "razões"):
 *  - status='ganho' (100): viagem fechada
 *  - ganho_planner=true (50): marco da venda fechada batido
 *  - pos_owner_id (25): tem dono pós-venda atribuído
 *  - etapa-fase mais avançada (0-20): pós-viagem > em viagem > pré-embarque > app
 */
function scoreCardForKeep(c: DuplicateCardRow): { score: number; reasons: string[] } {
    let s = 0
    const reasons: string[] = []
    if (c.status_comercial === 'ganho') { s += 100; reasons.push('status Ganho') }
    if (c.ganho_planner === true) { s += 50; reasons.push('Ganho Planner ✓') }
    if (c.pos_owner_id) { s += 25; reasons.push('dono Pós ✓') }
    const stageWeights: Record<string, number> = {
        '2c07134a-cb83-4075-bc86-4750beec9393': 20, // STAGE_POS_VIAGEM
        '0ebab355-6d0e-4b19-af13-b4b31268275f': 15, // STAGE_EM_VIAGEM
        '3ce80249-b579-4a9c-9b82-f8569735cea9': 10, // STAGE_PRE_EMBARQUE_LT30
        '1f684773-f8f3-434a-a44d-4994750c41aa': 5,  // STAGE_PRE_EMBARQUE_GT30
        'b2b0679c-ea06-4b46-9dd4-ee02abff1a36': 0,  // STAGE_APP_CONTEUDO
    }
    s += stageWeights[c.pipeline_stage_id || ''] || 0
    // Card arquivado quase nunca é o "manter": foi arquivado de propósito ou por
    // dedup antigo. Se houver alternativa não arquivada, ela vence.
    if (c.archived_at) { s -= 1000; reasons.push('arquivado') }
    return { score: s, reasons }
}

function DuplicatesPanel({
    groups, loading, tripExistingIds, tripVendaNumsByCardId, stageNameById, cardsToArchive, onToggleArchiveMark,
}: {
    groups: Array<{ numero: string; cards: DuplicateCardRow[] }>
    loading: boolean
    /** Cards que vieram da planilha (matched). Pra mostrar "✓ na planilha" no item */
    tripExistingIds: Set<string>
    /** Map cardId → conjunto de números de venda Monde da viagem da planilha que casou esse card.
     *  Se o número do grupo está no set, a viagem foi trazida POR ESSE número. Senão foi por outro
     *  caminho (CPF, outro número, histórico) — info crucial pra desambiguar duplicatas. */
    tripVendaNumsByCardId: Map<string, Set<string>>
    /** id da etapa → nome legível, pra mostrar onde o card está hoje */
    stageNameById: Record<string, string>
    /** Set compartilhado de cards a arquivar — single source of truth */
    cardsToArchive: Set<string>
    /** Toggle individual: marca/desmarca um card pra arquivar */
    onToggleArchiveMark: (cardId: string) => void
}) {
    const [expanded, setExpanded] = useState(false)

    if (loading && groups.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Verificando duplicatas no CRM…</h3>
            </div>
        )
    }

    if (groups.length === 0) return null

    const totalCards = groups.reduce((s, g) => s + g.cards.length, 0)
    // Quantos cards de duplicatas estão marcados pra arquivar (intersection)
    const dupIds = new Set<string>()
    for (const g of groups) for (const c of g.cards) dupIds.add(c.id)
    let markedFromDups = 0
    for (const id of dupIds) if (cardsToArchive.has(id)) markedFromDups++

    return (
        <div className="bg-white border border-rose-200 rounded-xl shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-rose-50/30 transition-colors text-left"
            >
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    <div>
                        <h3 className="text-sm font-semibold text-rose-900">
                            {groups.length} {groups.length === 1 ? 'número Monde aparece' : 'números Monde aparecem'} em mais de um card ativo
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                            {totalCards} cards envolvidos. Sistema sugere manter o "melhor" e arquivar os outros — clique pra revisar.
                            {markedFromDups > 0 && (
                                <span className="ml-1 font-medium text-rose-700">
                                    ({markedFromDups} marcado{markedFromDups !== 1 ? 's' : ''} pra arquivar)
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform shrink-0', expanded && 'rotate-180')} />
            </button>

            {expanded && (
                <div className="border-t border-rose-100 max-h-[600px] overflow-y-auto">
                    {groups.map(group => {
                        // Identifica o card vencedor (maior score). Empate vence o primeiro.
                        const ranked = [...group.cards]
                            .map(card => ({ card, ...scoreCardForKeep(card) }))
                            .sort((a, b) => b.score - a.score)
                        const winnerId = ranked[0]?.card.id
                        return (
                            <div key={group.numero} className="px-4 py-3 border-b border-rose-100 last:border-b-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                                        Venda Monde
                                    </span>
                                    <span className="font-mono text-sm font-bold text-slate-900">{group.numero}</span>
                                    <span className="text-[10px] text-slate-500">
                                        em {group.cards.length} cards
                                    </span>
                                </div>
                                <ul className="space-y-1.5">
                                    {ranked.map(({ card, score, reasons }) => {
                                        const inFile = tripExistingIds.has(card.id)
                                        const stageName = stageNameById[card.pipeline_stage_id || ''] || '(etapa desconhecida)'
                                        const isCurrentNumber = card.numeroAtual === group.numero
                                        const isWinner = card.id === winnerId
                                        const willArchive = cardsToArchive.has(card.id)
                                        return (
                                            <li
                                                key={card.id}
                                                className={cn(
                                                    'flex items-start gap-2 text-xs px-2 py-1.5 rounded-md border',
                                                    isWinner
                                                        ? 'bg-emerald-50/50 border-emerald-200'
                                                        : willArchive
                                                            ? 'bg-rose-50/50 border-rose-200'
                                                            : 'bg-white border-slate-200'
                                                )}
                                            >
                                                {/* Checkbox / badge "manter": vencedor não tem checkbox, tem badge fixo */}
                                                {isWinner ? (
                                                    <span
                                                        className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                                                        title={`Sistema sugere manter este. Razões: ${reasons.join(', ') || 'maior score do grupo'} (score ${score})`}
                                                    >
                                                        🏆 manter
                                                    </span>
                                                ) : (
                                                    <label
                                                        className="inline-flex items-center gap-1 cursor-pointer select-none shrink-0 mt-0.5"
                                                        title={willArchive ? 'Vai arquivar — clique pra manter' : 'Manter ativo — clique pra arquivar'}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={willArchive}
                                                            onChange={() => onToggleArchiveMark(card.id)}
                                                            className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                                                        />
                                                        <span className={cn(
                                                            'text-[10px] font-semibold px-1 rounded',
                                                            willArchive ? 'text-rose-700' : 'text-slate-500'
                                                        )}>
                                                            {willArchive ? 'arquivar' : 'manter'}
                                                        </span>
                                                    </label>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Link
                                                            to={`/cards/${card.id}`}
                                                            className="text-slate-700 hover:text-rose-700 underline-offset-2 hover:underline truncate"
                                                            title={card.titulo || card.id}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            {card.titulo || '(sem título)'}
                                                        </Link>
                                                        {(() => {
                                                            // Por qual venda da planilha esse card foi trazido?
                                                            // Se a planilha trouxe esse card POR ESTE número (do grupo),
                                                            // mostra "✓ na planilha". Se trouxe por OUTRO número, mostra
                                                            // "✓ na planilha (por venda X)" — assim o user entende que
                                                            // 67552 está nesse card por legado/histórico, não como venda atual.
                                                            const tripNums = tripVendaNumsByCardId.get(card.id)
                                                            if (!inFile || !tripNums) {
                                                                return (
                                                                    <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded shrink-0" title="Esse card NÃO veio na planilha de auditoria">
                                                                        ⚠ fora da planilha
                                                                    </span>
                                                                )
                                                            }
                                                            const matchedByThisNumber = tripNums.has(group.numero)
                                                            if (matchedByThisNumber) {
                                                                return (
                                                                    <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded shrink-0" title={`A planilha trouxe esse card pela venda ${group.numero}`}>
                                                                        ✓ na planilha (esta venda)
                                                                    </span>
                                                                )
                                                            }
                                                            // Veio na planilha mas por OUTRA venda (CPF, número diferente, etc)
                                                            const otherNums = [...tripNums].filter(n => n !== group.numero)
                                                            const label = otherNums.length > 0
                                                                ? `por venda ${otherNums.slice(0, 2).join(', ')}${otherNums.length > 2 ? '…' : ''}`
                                                                : 'por CPF/datas'
                                                            return (
                                                                <span
                                                                    className="text-[9px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1 rounded shrink-0"
                                                                    title={`A planilha trouxe esse card por OUTRA venda (não a ${group.numero}). ${otherNums.length > 0 ? `Vendas da planilha: ${otherNums.join(', ')}` : 'Match foi por CPF + datas'}`}
                                                                >
                                                                    ✓ na planilha ({label})
                                                                </span>
                                                            )
                                                        })()}
                                                        {!isCurrentNumber && (
                                                            <span className="text-[9px] text-slate-400 italic" title="Esse número está só no histórico do card, não é a venda atual">
                                                                (histórico do card)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                        <span>{stageName}</span>
                                                        {reasons.length > 0 && (
                                                            <span className="opacity-70">·  {reasons.join(' · ')}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─── Diff row helpers (uma linha por campo divergente) ──────

type LucideIcon = typeof CheckCircle2

/** Linha genérica do diff: ícone + label + "está hoje" + → + "vai virar" + checkbox. */
function DiffRow({
    Icon, label, from, to, toggleLabel, checked, onToggle, informational,
}: {
    Icon: LucideIcon
    label: string
    from: string
    to: string
    toggleLabel?: string
    checked?: boolean
    onToggle?: () => void
    informational?: boolean
}) {
    return (
        <div className="flex items-start gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 grid grid-cols-[110px_minmax(0,1fr)_16px_minmax(0,1fr)] gap-2 items-center">
                <span className="font-medium text-slate-700 truncate">{label}</span>
                <span className="text-slate-500 truncate" title={from}>{from}</span>
                <ArrowRight className="h-3 w-3 text-slate-300" />
                <span className="text-slate-900 font-medium truncate" title={to}>{to}</span>
            </div>
            {!informational && onToggle && (
                <label
                    className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
                    onClick={e => e.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={onToggle}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-600">{toggleLabel || 'aplicar'}</span>
                </label>
            )}
            {informational && (
                <span className="text-[10px] text-slate-400 shrink-0 italic">informativo</span>
            )}
        </div>
    )
}

/**
 * Linha específica do diff de números Monde — mostra explicitamente
 * o que vai ser adicionado, removido ou mantido. Toggle único: "sincronizar".
 */
function MondeDiffRow({
    diff, checked, onToggle,
}: {
    diff: TripDiff['monde']
    checked: boolean
    onToggle: () => void
}) {
    return (
        <div className="flex items-start gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Hash className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-700 mb-1">Números de venda Monde</div>
                <div className="space-y-0.5">
                    {diff.toKeep.length > 0 && (
                        <div className="text-slate-500">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mr-1.5">mantém</span>
                            <span className="font-mono">{diff.toKeep.join(', ')}</span>
                        </div>
                    )}
                    {diff.toAdd.length > 0 && (
                        <div className="text-emerald-700">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 mr-1.5">+ adicionar</span>
                            <span className="font-mono">{diff.toAdd.join(', ')}</span>
                        </div>
                    )}
                    {diff.toRemove.length > 0 && (
                        <div className="text-rose-700">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-rose-600 mr-1.5">− remover</span>
                            <span className="font-mono">{diff.toRemove.join(', ')}</span>
                        </div>
                    )}
                </div>
            </div>
            <label
                className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onToggle}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-600">sincronizar</span>
            </label>
        </div>
    )
}

// ─── Expandable Trip Card ───────────────────────────────────

function TripCard({ trip, selected, onToggle, onToggleMoveStage, onToggleUpdateDates, onToggleSyncMondeNums, cardsToArchive, onToggleArchiveMark }: {
    trip: TripGroup
    selected: boolean
    onToggle: (id: string) => void
    onToggleMoveStage: (id: string) => void
    onToggleUpdateDates: (id: string) => void
    onToggleSyncMondeNums: (id: string) => void
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

    // Defesa: trip.diff pode estar undefined em sessões antigas restauradas do
    // sessionStorage que foram salvas antes do deploy de 2026-04-30. computeTripDiff
    // sempre retorna estrutura válida, então recalcula no fly se faltar.
    const tripDiff: TripDiff = trip.diff ?? computeTripDiff(trip)
    const showDiff = trip.action === 'update' && tripDiff.hasAny
    // Conta quantos toggles aplicáveis estão ativos — pra mostrar chip "X mudanças"
    const pendingChanges = trip.action === 'update'
        ? (tripDiff.etapa.changed && trip.moveStage ? 1 : 0)
            + (tripDiff.datas.changed && trip.updateDates ? 1 : 0)
            + (tripDiff.monde.changed && trip.syncMondeNums ? 1 : 0)
        : 0
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
                        {/* Etapa: mostra "CRM → planilha" se diferentes; só "planilha" se iguais ou se for create */}
                        {trip.action === 'update' && tripDiff.etapa.changed ? (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                                title="Etapa atual no CRM → Etapa que veio da planilha"
                            >
                                <span className="opacity-70">{tripDiff.etapa.fromName || '—'}</span>
                                <ArrowRight className="h-2.5 w-2.5 opacity-60" />
                                <span className="font-semibold">{trip.stage.name}</span>
                            </span>
                        ) : (
                            <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
                                title={trip.action === 'update' ? 'Etapa coincide com a planilha (sem mudança)' : 'Etapa-destino para o card a criar'}
                            >
                                {trip.stage.name}
                            </span>
                        )}
                        <span
                            className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', auditInfo.cls)}
                            title={auditIssues.length > 0 ? auditIssues.join(' • ') : 'Card já está com tudo certo no CRM'}
                        >
                            <AuditIcon className="h-3 w-3" />
                            {auditInfo.label}
                        </span>
                        {pendingChanges > 0 && (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200"
                                title="Quantos campos vão ser alterados ao aplicar"
                            >
                                <Pencil className="h-3 w-3" />
                                {pendingChanges} {pendingChanges === 1 ? 'mudança' : 'mudanças'}
                            </span>
                        )}
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

            {/* Diff arquivo × CRM — tabela lado a lado, visível sem precisar expandir.
                Cada toggle decide se o campo correspondente vai ser aplicado no card. */}
            {showDiff && (
                <div className="border-t border-slate-100 bg-indigo-50/30 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                        <ArrowRight className="h-3 w-3 text-indigo-500" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                            O que vai mudar nessa viagem
                        </span>
                    </div>

                    <div className="space-y-2">
                        {tripDiff.etapa.changed && (
                            <DiffRow
                                Icon={MapPin}
                                label="Etapa"
                                from={tripDiff.etapa.fromName || '—'}
                                to={trip.stage.name}
                                toggleLabel="mover"
                                checked={trip.moveStage}
                                onToggle={() => onToggleMoveStage(trip.id)}
                            />
                        )}

                        {tripDiff.datas.changed && (
                            <DiffRow
                                Icon={Calendar}
                                label="Datas da viagem"
                                from={`${formatDateBR(tripDiff.datas.inicio.from) || '—'} → ${formatDateBR(tripDiff.datas.fim.from) || '—'}`}
                                to={`${formatDateBR(tripDiff.datas.inicio.to) || '—'} → ${formatDateBR(tripDiff.datas.fim.to) || '—'}`}
                                toggleLabel="atualizar"
                                checked={trip.updateDates}
                                onToggle={() => onToggleUpdateDates(trip.id)}
                            />
                        )}

                        {tripDiff.monde.changed && (
                            <MondeDiffRow
                                diff={tripDiff.monde}
                                checked={trip.syncMondeNums}
                                onToggle={() => onToggleSyncMondeNums(trip.id)}
                            />
                        )}

                        {tripDiff.valor.changed && (
                            <DiffRow
                                Icon={Hash}
                                label="Valor total"
                                from={formatBRL(tripDiff.valor.from)}
                                to={formatBRL(tripDiff.valor.to)}
                                informational
                            />
                        )}
                    </div>
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
                        <div className={cn(
                            'text-xs rounded px-2 py-1',
                            trip.existingArchivedAt
                                ? 'bg-amber-50 border border-amber-300'
                                : 'bg-blue-50 border border-blue-200'
                        )}>
                            {trip.existingArchivedAt && (
                                <span className="text-[10px] font-semibold text-amber-800 bg-amber-200 border border-amber-300 px-1 rounded mr-1">
                                    ⚠ ARQUIVADO
                                </span>
                            )}
                            Card existente: <Link to={`/cards/${trip.existingCardId}`} className={cn(trip.existingArchivedAt ? 'text-amber-700' : 'text-blue-600', 'underline')}>{trip.existingCardTitle || trip.existingCardId}</Link>
                            {trip.existingArchivedAt && (
                                <span className="ml-1 text-amber-700">— vai desarquivar e atualizar ao aplicar</span>
                            )}
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

function HistoryRow({ log, profileId, isAdmin, autoExpand, onReverted }: {
    log: ImportLogRow
    profileId?: string
    isAdmin?: boolean
    /** Quando true (URL com :logId que bate), abre essa linha expandida automaticamente. */
    autoExpand?: boolean
    onReverted: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [items, setItems] = useState<ImportLogItemRow[] | null>(null)
    const [loadingItems, setLoadingItems] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [reverting, setReverting] = useState(false)
    const [copied, setCopied] = useState(false)

    const loadItems = useCallback(async () => {
        if (items) return
        setLoadingItems(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await ((supabase as any).from('pos_venda_import_log_items') as any)
            .select('*')
            .eq('import_log_id', log.id)
            .order('created_at')
        setItems((data || []) as ImportLogItemRow[])
        setLoadingItems(false)
    }, [log.id, items])

    // Auto-expand quando a URL é /importacao-pos-venda/:logId batendo essa linha.
    // Útil pra compartilhar link específico com colegas de pós-venda.
    useEffect(() => {
        if (autoExpand && !expanded) {
            setExpanded(true)
            loadItems()
        }
    }, [autoExpand, expanded, loadItems])

    const handleExpand = async () => {
        if (expanded) { setExpanded(false); return }
        setExpanded(true)
        await loadItems()
    }

    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation()
        const url = `${window.location.origin}/importacao-pos-venda/${log.id}`
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
            toast.success('Link copiado')
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {
            toast.error('Não consegui copiar — copia manualmente: ' + url)
        })
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
                    <button
                        type="button"
                        onClick={handleCopyLink}
                        title="Copiar link permanente desta importação"
                        className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors shrink-0',
                            copied
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        )}
                    >
                        <Link2 className="h-3 w-3" />
                        {copied ? 'copiado' : 'copiar link'}
                    </button>
                </div>
            </button>
            {expanded && (
                <div className="bg-slate-50/50 border-t border-slate-100 px-4 py-2">
                    {loadingItems ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div> :
                        items && items.length > 0 ? (
                            <div className="space-y-1">
                                {/* Toolbar de reverter — só admin (ação destrutiva).
                                    Pós-venda não-admin vê só a lista, sem checkbox/botão. */}
                                {isAdmin && revertableItems.length > 0 && (
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

                                {/* Items agrupados por etapa-destino — auditoria clara */}
                                {(() => {
                                    // Agrupa items por stage_name (etapa-destino calculada na hora do import)
                                    // + bucket "Pulada / Sem etapa" pra items sem stage_name (skip).
                                    const groups = new Map<string, ImportLogItemRow[]>()
                                    for (const item of items) {
                                        const key = item.stage_name || '(Pulada / sem etapa)'
                                        const existing = groups.get(key)
                                        if (existing) existing.push(item)
                                        else groups.set(key, [item])
                                    }
                                    // Ordena: etapas do funil pós-venda primeiro, depois alfabético, "Pulada" por último
                                    const STAGE_ORDER = [
                                        'App & Conteúdo em Montagem',
                                        'Pré-embarque - >>> 30 dias',
                                        'Pré-Embarque <<< 30 dias',
                                        'Em Viagem',
                                        'Pós-viagem & Reativação',
                                    ]
                                    const orderedKeys = [
                                        ...STAGE_ORDER.filter(k => groups.has(k)),
                                        ...[...groups.keys()]
                                            .filter(k => !STAGE_ORDER.includes(k) && k !== '(Pulada / sem etapa)')
                                            .sort(),
                                    ]
                                    if (groups.has('(Pulada / sem etapa)')) orderedKeys.push('(Pulada / sem etapa)')

                                    return (
                                        <div className="space-y-2">
                                            {orderedKeys.map(stageName => {
                                                const stageItems = groups.get(stageName) || []
                                                const created = stageItems.filter(i => i.action === 'created' && !i.reverted_at).length
                                                const updated = stageItems.filter(i => i.action === 'updated' && !i.reverted_at).length
                                                const reverted = stageItems.filter(i => !!i.reverted_at).length
                                                const skipped = stageItems.filter(i => i.action === 'skipped').length
                                                return (
                                                    <details key={stageName} className="bg-white border border-slate-200 rounded-md overflow-hidden group">
                                                        <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-slate-50">
                                                            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
                                                            <span className="font-medium text-sm text-slate-900">{stageName}</span>
                                                            <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded shrink-0">
                                                                {stageItems.length}
                                                            </span>
                                                            <span className="text-xs text-slate-500 ml-2 truncate">
                                                                {created > 0 && <span className="text-emerald-600">{created} criado{created !== 1 ? 's' : ''}</span>}
                                                                {created > 0 && updated > 0 && <span> · </span>}
                                                                {updated > 0 && <span className="text-blue-600">{updated} atualizado{updated !== 1 ? 's' : ''}</span>}
                                                                {(created > 0 || updated > 0) && skipped > 0 && <span> · </span>}
                                                                {skipped > 0 && <span className="text-slate-500">{skipped} pulado{skipped !== 1 ? 's' : ''}</span>}
                                                                {reverted > 0 && <span className="text-amber-600"> · {reverted} revertido{reverted !== 1 ? 's' : ''}</span>}
                                                            </span>
                                                        </summary>
                                                        <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-80 overflow-y-auto">
                                                            {stageItems.map(item => {
                                                                const isReverted = !!item.reverted_at
                                                                // Reverter é destrutivo — só admin pode marcar items pra reverter.
                                                                const canRevert = !!isAdmin && !isReverted && !!item.card_id
                                                                // Resolve etapa-origem a partir do previous_state. As 5 etapas POS_VENDA são
                                                                // resolvidas inline; outras etapas viram "outra etapa".
                                                                const STAGE_NAME_BY_ID: Record<string, string> = {
                                                                    [STAGE_APP_CONTEUDO]: 'App & Conteúdo em Montagem',
                                                                    [STAGE_PRE_EMBARQUE_GT30]: 'Pré-embarque - >>> 30 dias',
                                                                    [STAGE_PRE_EMBARQUE_LT30]: 'Pré-Embarque <<< 30 dias',
                                                                    [STAGE_EM_VIAGEM]: 'Em Viagem',
                                                                    [STAGE_POS_VIAGEM]: 'Pós-viagem & Reativação',
                                                                }
                                                                const prev = item.previous_state as { pipeline_stage_id?: string } | null
                                                                const fromStageId = prev?.pipeline_stage_id || null
                                                                const fromStageName = fromStageId
                                                                    ? (STAGE_NAME_BY_ID[fromStageId] || 'outra etapa')
                                                                    : null
                                                                const stageMoved = item.action === 'updated' && fromStageId && fromStageId !== item.stage_name
                                                                    && fromStageName !== stageName
                                                                // Label da ação como texto
                                                                const actionLabel = isReverted ? 'revertido'
                                                                    : item.action === 'created' ? 'criado'
                                                                    : item.action === 'updated' ? (stageMoved ? 'migrado' : 'atualizado')
                                                                    : item.action === 'skipped' ? 'pulado'
                                                                    : item.action
                                                                const actionColor = isReverted ? 'bg-amber-100 text-amber-700'
                                                                    : item.action === 'created' ? 'bg-emerald-100 text-emerald-700'
                                                                    : item.action === 'updated' ? (stageMoved ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                                                                    : item.action === 'skipped' ? 'bg-slate-100 text-slate-500'
                                                                    : 'bg-slate-100 text-slate-600'
                                                                return (
                                                                    <div key={item.id} className={cn("px-3 py-2 text-xs", isReverted && "opacity-50")}>
                                                                        <div className="flex items-center gap-2">
                                                                            {canRevert && (
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selected.has(item.id)}
                                                                                    onChange={() => toggleItem(item.id)}
                                                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                                                                />
                                                                            )}
                                                                            {!canRevert && <div className="w-4 shrink-0" />}
                                                                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', actionColor)}>
                                                                                {actionLabel}
                                                                            </span>
                                                                            <span className="text-slate-700 truncate flex-1">{item.pagante}</span>
                                                                            {item.card_id && (
                                                                                <Link to={`/cards/${item.card_id}`} className="text-indigo-500 hover:underline shrink-0" onClick={e => e.stopPropagation()}>
                                                                                    ver card
                                                                                </Link>
                                                                            )}
                                                                            <span className="text-slate-500 shrink-0">{formatBRL(item.total_venda)}</span>
                                                                        </div>
                                                                        {/* Sub-linha: estava em X → foi pra Y (só pra updates com mudança de etapa) */}
                                                                        {fromStageName && stageMoved && (
                                                                            <div className="ml-7 mt-0.5 text-[10px] text-slate-500">
                                                                                estava em <span className="text-slate-700">{fromStageName}</span> → foi pra <span className="font-medium text-blue-700">{stageName}</span>
                                                                            </div>
                                                                        )}
                                                                        {fromStageName && !stageMoved && item.action === 'updated' && (
                                                                            <div className="ml-7 mt-0.5 text-[10px] text-slate-400 italic">
                                                                                já estava em {fromStageName} (manteve etapa)
                                                                            </div>
                                                                        )}
                                                                        {/* Pra skips, mostrar a razão (T. Planner, ganho-sem-pós, etc) */}
                                                                        {item.action === 'skipped' && item.error_message && (
                                                                            <div className="ml-7 mt-0.5 text-[10px] text-amber-700 italic">
                                                                                motivo: {item.error_message}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </details>
                                                )
                                            })}
                                        </div>
                                    )
                                })()}
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
    // Quando a URL é /importacao-pos-venda/:logId, abre o detalhe daquela importação
    // já expandido. Permite compartilhar link específico com qualquer user pós-venda.
    const { logId: focusLogId } = useParams<{ logId?: string }>()

    const [step, setStep] = useState<Step>('idle')
    const [flowMode, setFlowMode] = useState<FlowMode>('detalhada')
    const [fileName, setFileName] = useState('')
    const [trips, setTrips] = useState<TripGroup[]>([])
    const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set())
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importResult, setImportResult] = useState<{ cardsCreated: number; cardsUpdated: number; productsImported: number; skipped: number; errors: number; cardsArchived?: number } | null>(null)
    // Detalhe por viagem após o import — alimenta a tela "done" com lista do que subiu/falhou
    const [importDetails, setImportDetails] = useState<{
        success: Array<{
            pagante: string
            titulo: string
            vendaNums: string[]
            cardId: string | null
            action: 'created' | 'updated'
            /** Etapa-destino após aplicar (id) — pra agrupar no relatório */
            stageToId: string | null
            stageToName: string | null
            changes: {
                stageFrom: string | null
                stageTo: string | null
                stageMoved: boolean
                statusFrom: string | null
                statusTo: string | null
                ganhoPosFrom: boolean | null
                ganhoPosTo: boolean | null
                vendasAdicionadas: string[]
            }
        }>
        failed: Array<{ pagante: string; titulo: string; vendaNums: string[]; cardId: string | null; error: string }>
        skipped: Array<{
            pagante: string
            titulo: string
            vendaNums: string[]
            reason: string
            /** Categoria do skip pra agrupar no relatório */
            category: 'planner' | 'ganho_sem_pos' | 'outra_fase' | 'sem_pagante' | 'desmarcado' | 'outro'
            /** Card existente (se houver) — pra abrir e investigar */
            cardId: string | null
            /** Etapa atual do card (pra mostrar no relatório) */
            currentStageName: string | null
        }>
    } | null>(null)
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
    /** Filtra por etapa-destino (id de pipeline_stages). 'all' = sem filtro. */
    const [filterTargetStage, setFilterTargetStage] = useState<string>('all')
    const [showFilters, setShowFilters] = useState(false)

    // Persistência de sessão — mantém preview + filtros ao navegar entre páginas.
    // sessionStorage (não localStorage): some ao fechar a aba, não polui para sempre.
    // Versão bumpada quando regras de match/parse mudam — invalida sessões salvas antes
    // do bump, forçando o user a re-subir a planilha pra reprocessar com o código novo.
    // v2 (2026-05-04 manhã) — match pega arquivados + locale BR/US.
    // v3 (2026-05-04 tarde) — score penaliza arquivados (-1000) pra não vencer ativos.
    const storageKey = activeOrgId ? `pv-import-session-v3:${activeOrgId}` : null
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
                    // (sessões salvas antes de campos como otherCardCandidates / audit / diff)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const normalizedTrips: TripGroup[] = parsed.trips.map((t: any) => {
                        const filled: TripGroup = {
                            ...t,
                            otherCardCandidates: Array.isArray(t.otherCardCandidates) ? t.otherCardCandidates : [],
                            audit: t.audit && Array.isArray(t.audit.issues)
                                ? t.audit
                                : { severity: 'ok', issues: [] },
                            existingGanhoPos: t.existingGanhoPos ?? null,
                            existingGanhoPlanner: t.existingGanhoPlanner ?? null,
                            existingStatusComercial: t.existingStatusComercial ?? null,
                            existingDonoPosId: t.existingDonoPosId ?? null,
                            existingPhaseSlug: t.existingPhaseSlug ?? null,
                            // Campos novos do diff (sessions antes do deploy de 2026-04-30 não tinham)
                            existingDataInicio: t.existingDataInicio ?? null,
                            existingDataFim: t.existingDataFim ?? null,
                            existingValorFinal: t.existingValorFinal ?? null,
                            existingNumeroVendaMonde: t.existingNumeroVendaMonde ?? null,
                            existingHistoricoNums: Array.isArray(t.existingHistoricoNums) ? t.existingHistoricoNums : [],
                            existingArchivedAt: t.existingArchivedAt ?? null,
                            moveStage: t.moveStage ?? true,
                            updateDates: t.updateDates ?? false,
                            syncMondeNums: t.syncMondeNums ?? false,
                            diff: t.diff && typeof t.diff.hasAny === 'boolean' ? t.diff : undefined as unknown as TripDiff,
                        }
                        // Recalcula diff a partir dos snapshots — funciona mesmo em sessões antigas
                        // que não tinham diff (apenas datas/etapas/Monde antigos no card).
                        filled.diff = computeTripDiff(filled)
                        return filled
                    })
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

    // Contagem ATUAL de cards ativos em cada etapa pós-venda do workspace.
    // Usado pelo widget DestinationStageSummary pra mostrar "depois" projetado.
    // Filtros iguais ao kanban (em fluxo): aberto OU ganho-com-ganho_pos-false, sem arquivados.
    const { data: stageCounts = {} } = useQuery<Record<string, number>>({
        queryKey: ['pos-venda-stage-counts', activeOrgId],
        enabled: !!activeOrgId,
        staleTime: 1000 * 30,
        queryFn: async () => {
            if (!activeOrgId) return {}
            const counts: Record<string, number> = {}
            await Promise.all(POS_VENDA_STAGES.map(async (stageId) => {
                // Filtros idênticos ao Kanban (cards "vivos no funil"):
                // - archived_at NULL (não arquivado)
                // - deleted_at NULL (não na lixeira)
                // - sub_card_status NULL ou 'active' (não merged/cancelled)
                // - is_group_parent IS NULL OR FALSE (não é card-pai de grupo)
                // - status_comercial em fluxo: aberto OR ganho-com-ganho_pos-false
                const { count } = await supabase
                    .from('cards')
                    .select('id', { count: 'exact', head: true })
                    .eq('org_id', activeOrgId)
                    .eq('pipeline_stage_id', stageId)
                    .is('archived_at', null)
                    .is('deleted_at', null)
                    .or('sub_card_status.is.null,sub_card_status.eq.active')
                    .or('is_group_parent.is.null,is_group_parent.eq.false')
                    .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                counts[stageId] = count || 0
            }))
            return counts
        },
    })

    // Auditoria de duplicatas — escaneia TODOS os cards ativos do funil pós-venda
    // procurando números Monde repetidos em cards diferentes (atual ou histórico).
    // Independe da planilha que o user subiu — é raio-X do CRM.
    type DuplicateCard = {
        id: string
        titulo: string | null
        pipeline_stage_id: string | null
        pessoa_principal_id: string | null
        status_comercial: string | null
        ganho_planner: boolean | null
        pos_owner_id: string | null
        archived_at: string | null
        numeroAtual: string | null
        numerosHistorico: string[]
    }
    type DuplicateGroup = { numero: string; cards: DuplicateCard[] }
    const { data: duplicateGroups = [], isLoading: loadingDuplicates } = useQuery<DuplicateGroup[]>({
        queryKey: ['monde-duplicates', activeOrgId],
        enabled: !!activeOrgId,
        staleTime: 1000 * 60,
        queryFn: async () => {
            if (!activeOrgId) return []
            // Inclui arquivados — sem isso a auditoria não detecta caso onde tem
            // um card ativo + um arquivado com mesmo Monde (caso comum: import duplicou
            // e user arquivou o errado). Score penaliza arquivados, então o painel
            // ainda sugere manter o ativo.
            const { data } = await supabase
                .from('cards')
                .select('id, titulo, pipeline_stage_id, pessoa_principal_id, status_comercial, ganho_planner, pos_owner_id, archived_at, produto_data')
                .eq('org_id', activeOrgId)
                .in('pipeline_stage_id', POS_VENDA_STAGES)
                .is('deleted_at', null)
                .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                .limit(3000)

            const cards = (data || []).map((c: Record<string, unknown>): DuplicateCard => {
                const pd = (c.produto_data ?? {}) as Record<string, unknown>
                const numeroAtual = typeof pd.numero_venda_monde === 'string' ? pd.numero_venda_monde : null
                const histRaw = Array.isArray(pd.numeros_venda_monde_historico) ? pd.numeros_venda_monde_historico : []
                const numerosHistorico = (histRaw as Array<{ numero?: unknown }>)
                    .map(h => typeof h?.numero === 'string' ? h.numero : null)
                    .filter((n): n is string => !!n)
                return {
                    id: c.id as string,
                    titulo: (c.titulo as string) ?? null,
                    pipeline_stage_id: (c.pipeline_stage_id as string) ?? null,
                    pessoa_principal_id: (c.pessoa_principal_id as string) ?? null,
                    status_comercial: (c.status_comercial as string) ?? null,
                    ganho_planner: (c.ganho_planner as boolean) ?? null,
                    pos_owner_id: (c.pos_owner_id as string) ?? null,
                    archived_at: (c.archived_at as string) ?? null,
                    numeroAtual,
                    numerosHistorico,
                }
            })

            // Agrupa por número Monde (atual + histórico). Cada card aparece UMA vez por número.
            const byNum = new Map<string, Map<string, DuplicateCard>>()
            for (const card of cards) {
                const nums = new Set<string>()
                if (card.numeroAtual) nums.add(card.numeroAtual)
                for (const n of card.numerosHistorico) nums.add(n)
                for (const n of nums) {
                    if (!byNum.has(n)) byNum.set(n, new Map())
                    byNum.get(n)!.set(card.id, card)
                }
            }

            const groups: DuplicateGroup[] = []
            for (const [numero, cardMap] of byNum) {
                if (cardMap.size < 2) continue
                groups.push({ numero, cards: [...cardMap.values()] })
            }
            // Ordena: maior número de cards duplicados primeiro
            return groups.sort((a, b) => b.cards.length - a.cards.length)
        },
    })

    // Pré-marca pra arquivar os "perdedores" de cada grupo de duplicatas — só uma vez
    // (quando os groups carregam pela primeira vez na sessão). Se user mexer depois,
    // não sobrescreve a escolha. Sessão antiga já tem o cardsToArchive restaurado.
    const [duplicatesAutoSeeded, setDuplicatesAutoSeeded] = useState(false)
    useEffect(() => {
        if (duplicatesAutoSeeded) return
        if (loadingDuplicates) return
        if (duplicateGroups.length === 0) return
        const losersToArchive = new Set<string>()
        for (const group of duplicateGroups) {
            const ranked = [...group.cards]
                .map(card => ({ card, ...scoreCardForKeep(card) }))
                .sort((a, b) => b.score - a.score)
            const winnerId = ranked[0]?.card.id
            for (const { card } of ranked) {
                if (card.id !== winnerId) losersToArchive.add(card.id)
            }
        }
        setCardsToArchive(prev => {
            const next = new Set(prev)
            for (const id of losersToArchive) next.add(id)
            return next
        })
        setDuplicatesAutoSeeded(true)
    }, [duplicateGroups, loadingDuplicates, duplicatesAutoSeeded])

    // Cards atualmente em App & Conteúdo que a planilha quer mover pra outra etapa.
    // Pra cada um, verificar se tarefas críticas ("Criar App", "Liberar App", "Conferir
    // Vouchers", "Adicionar vouchers no App") estão concluídas — se não, BLOQUEAR a
    // mudança de etapa por padrão (regra do negócio: card só sai do App quando o app
    // está pronto). User pode forçar manualmente desmarcando o aviso.
    const cardsLeavingAppConteudo = trips
        .filter(t => t.action === 'update'
            && t.existingStageId === STAGE_APP_CONTEUDO
            && t.stage.id !== STAGE_APP_CONTEUDO
            && !!t.existingCardId)
        .map(t => t.existingCardId as string)
    const cardsLeavingAppKey = [...new Set(cardsLeavingAppConteudo)].sort().join(',')

    const { data: appPendingTasksByCard = {} } = useQuery<Record<string, string[]>>({
        queryKey: ['app-conteudo-tasks-pending', cardsLeavingAppKey],
        enabled: cardsLeavingAppConteudo.length > 0,
        staleTime: 1000 * 60,
        queryFn: async () => {
            if (cardsLeavingAppConteudo.length === 0) return {}
            const ids = [...new Set(cardsLeavingAppConteudo)]
            const { data } = await supabase
                .from('tarefas')
                .select('card_id, titulo, concluida')
                .in('card_id', ids)
                .in('titulo', ['Criar App', 'App Enviado para o Cliente', 'Conferir Vouchers', 'Adicionar vouchers no App', 'Liberar App'])
            const map: Record<string, string[]> = {}
            for (const t of (data || []) as Array<{ card_id: string; titulo: string; concluida: boolean }>) {
                if (!t.concluida) {
                    if (!map[t.card_id]) map[t.card_id] = []
                    map[t.card_id].push(t.titulo)
                }
            }
            return map
        },
    })

    // Bloqueia moveStage automaticamente quando o card está em App & Conteúdo
    // com tarefas pendentes (1x por trip — não sobrescreve escolhas manuais).
    const [appBlockApplied, setAppBlockApplied] = useState(false)
    useEffect(() => {
        if (appBlockApplied) return
        if (cardsLeavingAppConteudo.length === 0) return
        if (Object.keys(appPendingTasksByCard).length === 0) return
        setTrips(prev => prev.map(t => {
            if (t.action !== 'update') return t
            if (t.existingStageId !== STAGE_APP_CONTEUDO) return t
            if (!t.existingCardId) return t
            const pending = appPendingTasksByCard[t.existingCardId]
            if (pending && pending.length > 0) {
                // Adiciona issue ao audit pra mostrar o aviso visual + força moveStage=false
                const newIssues = [
                    ...t.audit.issues,
                    `Tarefas pendentes em App & Conteúdo (${pending.join(', ')}) — não recomendamos mover pra outra etapa.`,
                ]
                return {
                    ...t,
                    moveStage: false,
                    audit: {
                        severity: t.audit.severity === 'error' ? 'error' : 'warn',
                        issues: newIssues,
                    },
                }
            }
            return t
        }))
        setAppBlockApplied(true)
    }, [appPendingTasksByCard, appBlockApplied, cardsLeavingAppConteudo.length])

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
        const colEtapa = findColumn(headers, ETAPA_ALIASES)

        // ─── Date locale detection ────────────────────────────
        // parseDateBR (do csvUtils) sempre interpreta primeiro componente como DD.
        // Se a planilha vier com datas em US (MM/DD), todas as datas com ambos
        // componentes ≤ 12 ficam invertidas. Solução: olhar TODAS as datas do
        // arquivo, contar quantas só fazem sentido como BR (a > 12) vs como US
        // (b > 12). Se predominantemente um, usa esse. Empate ou ambíguo total →
        // BR (CRM é BR). Aplicamos esse locale em TODAS as datas, inclusive nas
        // ambíguas, garantindo coerência por arquivo.
        const detectFileLocale = (rows: Record<string, unknown>[], cols: (string | null | undefined)[]): 'BR' | 'US' => {
            let brHits = 0, usHits = 0
            for (const r of rows) {
                for (const c of cols) {
                    if (!c) continue
                    const v = r[c]
                    if (typeof v !== 'string') continue
                    const m = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
                    if (!m) continue
                    const a = parseInt(m[1], 10), b = parseInt(m[2], 10)
                    if (a > 12 && b <= 12) brHits++
                    else if (b > 12 && a <= 12) usHits++
                }
            }
            if (usHits > brHits) return 'US'
            return 'BR'
        }
        const fileLocale = detectFileLocale(rawRows, [colDataInicio, colDataFim, colDataVenda])
        const parseDateLocale = (val: unknown): string | null => {
            if (val == null || val === '') return null
            if (typeof val === 'number') {
                // Excel serial — sempre converte UTC, sem ambiguidade
                const epoch = new Date(Date.UTC(1899, 11, 30))
                const d = new Date(epoch.getTime() + val * 86400000)
                return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
            }
            const s = String(val).trim()
            if (!s || s === '—' || s === '-') return null
            const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
            if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
            const parts = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
            if (parts) {
                const a = parseInt(parts[1], 10), b = parseInt(parts[2], 10)
                let yy = parts[3]
                if (yy.length === 2) yy = '20' + yy
                let mm: number, dd: number
                if (a > 12 && b <= 12) { dd = a; mm = b }
                else if (b > 12 && a <= 12) { mm = a; dd = b }
                else if (fileLocale === 'US') { mm = a; dd = b }
                else { dd = a; mm = b }
                if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
                return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
            }
            const num = parseFloat(s.replace(',', '.'))
            if (!isNaN(num) && num > 1000) {
                const epoch = new Date(Date.UTC(1899, 11, 30))
                const d = new Date(epoch.getTime() + num * 86400000)
                return d.toISOString().slice(0, 10)
            }
            return null
        }

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
                    dataVenda: colDataVenda ? parseDateLocale(r[colDataVenda]) : null,
                    dataInicio: colDataInicio ? parseDateLocale(r[colDataInicio]) : null,
                    dataFim: colDataFim ? parseDateLocale(r[colDataFim]) : null,
                    passageiros,
                    appGerado: colAppGerado ? String(r[colAppGerado] ?? '').trim() : '',
                    vouchersNoApp: colVouchersApp ? String(r[colVouchersApp] ?? '').trim() : '',
                    contratoVoucher: colContratoVoucher ? String(r[colContratoVoucher] ?? '').trim() : '',
                    receita: colReceita ? parseBRNumber(r[colReceita]) : 0,
                    valorTotal: colValorTotal ? parseBRNumber(r[colValorTotal]) : 0,
                    etapaCsv: colEtapa ? String(r[colEtapa] ?? '').trim() : '',
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

            // Snapshot do card existente (preenchido no caminho de match que achar o card)
            type CardSnapshotDet = {
                id: string
                titulo: string
                pipeline_stage_id: string | null
                status_comercial: string | null
                ganho_planner: boolean | null
                ganho_pos: boolean | null
                pos_owner_id: string | null
                data_viagem_inicio: string | null
                data_viagem_fim: string | null
                valor_final: number | null
                valor_estimado: number | null
                produto_data: Record<string, unknown> | null
                archived_at: string | null
            }
            let snapshot: CardSnapshotDet | null = null

            const CARD_AUDIT_SELECT = 'id, titulo, pipeline_stage_id, status_comercial, ganho_planner, ganho_pos, pos_owner_id, data_viagem_inicio, data_viagem_fim, valor_final, valor_estimado, produto_data, archived_at'

            // Helper: prefere cards NÃO arquivados. Se houver não-arquivado, ele vence.
            // Se só tiver arquivado, esse é o match. Cobre o caso de cards duplicados
            // (um arquivado, outro ativo com tarefas reais).
            const pickPreferringActive = (cards: unknown[]): CardSnapshotDet | null => {
                if (!cards || cards.length === 0) return null
                const arr = cards as CardSnapshotDet[]
                const active = arr.find(c => !c.archived_at)
                return (active ?? arr[0]) ?? null
            }

            // Check by numero_venda_monde — só cards do workspace ativo e não arquivados.
            // Card arquivado é tratado como inexistente em qualquer operação Monde (regra absoluta).
            for (const vchunk of chunked(trip.vendaNums, 10)) {
                let query = supabase
                    .from('cards')
                    .select(CARD_AUDIT_SELECT)
                    .in('produto_data->>numero_venda_monde', vchunk)
                    .is('deleted_at', null)
                    .is('archived_at', null)
                if (activeOrgId) query = query.eq('org_id', activeOrgId)
                const { data: cards } = await query

                const picked = pickPreferringActive(cards || [])
                if (picked) {
                    snapshot = picked
                    break
                }
            }

            // Histórico (numeros_venda_monde_historico) é apenas informativo — não usar para matching.

            // Fallback: check by CPF + dates in pos-venda (ignora arquivados/deletados)
            if (!snapshot && trip.cpfNorm && trip.dataInicio) {
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
                        .is('deleted_at', null)
                        .is('archived_at', null)
                        .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                        .limit(1)
                    if (activeOrgId) query = query.eq('org_id', activeOrgId)
                    const { data: cards } = await query

                    if (cards && cards.length > 0) {
                        snapshot = cards[0] as unknown as CardSnapshotDet
                    }
                }
            }

            // 5º caminho: match por NOME do pagante (qualquer card pós-venda dele).
            // Só roda se tudo acima falhou. Sem filtro estrito de datas — cliente pode
            // ter só 1 card pós-venda ativo, basta achar pra fazer match.
            if (!snapshot && trip.pagantePrincipal) {
                const partes = trip.pagantePrincipal.trim().split(/\s+/).filter(Boolean)
                const primeiroNome = partes[0] || ''
                const ultimoSobrenome = partes.length > 1 ? partes[partes.length - 1] : ''
                if (primeiroNome.length >= 2) {
                    const { data: contatos } = await supabase
                        .from('contatos')
                        .select('id, nome, sobrenome')
                        .ilike('nome', `${primeiroNome.replace(/[%_]/g, '')}%`)
                        .is('deleted_at', null)
                        .limit(50)
                    const tripNome = norm(trip.pagantePrincipal)
                    const matchingContatos = (contatos || []).filter(c => {
                        const fullName = `${(c as { nome?: string }).nome || ''} ${(c as { sobrenome?: string }).sobrenome || ''}`.trim()
                        const fullNorm = norm(fullName)
                        if (fullNorm === tripNome) return true
                        if (fullNorm.includes(tripNome) || tripNome.includes(fullNorm)) return true
                        if (ultimoSobrenome) {
                            const ultimoNorm = norm(ultimoSobrenome)
                            if (fullNorm.includes(norm(primeiroNome)) && fullNorm.includes(ultimoNorm)) return true
                        }
                        return false
                    })
                    if (matchingContatos.length > 0) {
                        const contatoIds = matchingContatos.map(c => (c as { id: string }).id)
                        let q = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .in('pessoa_principal_id', contatoIds)
                            .in('pipeline_stage_id', POS_VENDA_STAGES)
                            .is('deleted_at', null)
                            .is('archived_at', null)
                            .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                            .limit(5)
                        if (activeOrgId) q = q.eq('org_id', activeOrgId)
                        const { data: cards } = await q
                        if (cards && cards.length > 0) {
                            snapshot = cards[0] as unknown as CardSnapshotDet
                        }
                    }
                }
            }

            // 6º caminho: match pelo TÍTULO do card (último recurso).
            // Resolve casos onde o pagante da planilha aparece como ACOMPANHANTE no card
            // (não como pessoa_principal). Ex: card "Aparecida Donizete / SEM DESTINO" tem
            // o esposo Antonio como pessoa_principal, mas o título tem "Aparecida Donizete".
            //
            // O título é gerado por buildTripTitle/formatShortName que pega só os 2 PRIMEIROS
            // nomes — então o match procura "primeiroNome + segundoNome".
            //
            // SEM filtro de datas no SQL — datas no card podem estar erradas em DB (legado de
            // import antigo com bug de locale, ex: "06/10" virou "Out 6" em vez de "Jun 10").
            // O usuário quer ATUALIZAR esses cards. Filtro de datas só acrescenta falso negativo
            // — risco de falso positivo é baixo (primeiro nome + segundo nome é único o bastante,
            // só puxa cards na fase pós-venda em status correto). Se houver mais de um, escolhe
            // o que tem datas mais próximas; senão pega o primeiro.
            if (!snapshot && trip.pagantePrincipal) {
                const partes = trip.pagantePrincipal.trim().split(/\s+/).filter(Boolean)
                const primeiroNome = partes[0] || ''
                const segundoNome = partes.length > 1 ? partes[1] : ''
                if (primeiroNome.length >= 3 && segundoNome.length >= 2) {
                    let q = supabase
                        .from('cards')
                        .select(CARD_AUDIT_SELECT)
                        .ilike('titulo', `%${primeiroNome.replace(/[%_]/g, '')}%${segundoNome.replace(/[%_]/g, '')}%`)
                        .in('pipeline_stage_id', POS_VENDA_STAGES)
                        .is('deleted_at', null)
                        .is('archived_at', null)
                        .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                        .limit(10)
                    if (activeOrgId) q = q.eq('org_id', activeOrgId)
                    const { data: cards } = await q
                    if (cards && cards.length > 0) {
                        // Prefere card NÃO arquivado (se houver). Entre os do mesmo grupo
                        // (arquivados ou ativos), ordena por proximidade de datas se trip
                        // tem dataInicio/Fim. Senão pega o primeiro.
                        const sorted = (cards as CardSnapshotDet[]).slice().sort((a, b) => {
                            const aArch = a.archived_at ? 1 : 0
                            const bArch = b.archived_at ? 1 : 0
                            if (aArch !== bArch) return aArch - bArch
                            if (!trip.dataInicio || !trip.dataFim) return 0
                            const tIni = new Date(trip.dataInicio).getTime()
                            const tFim = new Date(trip.dataFim).getTime()
                            const distOf = (c: CardSnapshotDet) => {
                                if (!c.data_viagem_inicio || !c.data_viagem_fim) return Number.MAX_SAFE_INTEGER
                                return Math.abs(new Date(c.data_viagem_inicio).getTime() - tIni)
                                     + Math.abs(new Date(c.data_viagem_fim).getTime() - tFim)
                            }
                            return distOf(a) - distOf(b)
                        })
                        snapshot = sorted[0]
                    }
                }
            }

            const action = snapshot ? 'update' : 'create'
            const pd = (snapshot?.produto_data ?? {}) as Record<string, unknown>
            const historicoRaw = Array.isArray(pd.numeros_venda_monde_historico) ? pd.numeros_venda_monde_historico : []
            const existingHistoricoNums = (historicoRaw as Array<{ numero?: unknown }>)
                .map(h => typeof h?.numero === 'string' ? h.numero : null)
                .filter((n): n is string => !!n)

            fullTrips.push({
                ...trip,
                id: titulo,
                vendedorProfileId,
                existingCardId: snapshot?.id ?? null,
                existingCardTitle: snapshot?.titulo ?? null,
                existingStageId: snapshot?.pipeline_stage_id ?? null,
                existingStageName: null,
                existingPhaseSlug: null,
                existingStatusComercial: snapshot?.status_comercial ?? null,
                existingGanhoPlanner: snapshot?.ganho_planner ?? null,
                existingGanhoPos: snapshot?.ganho_pos ?? null,
                existingDonoPosId: snapshot?.pos_owner_id ?? null,
                existingDataInicio: snapshot?.data_viagem_inicio ?? null,
                existingDataFim: snapshot?.data_viagem_fim ?? null,
                existingValorFinal: snapshot?.valor_final ?? snapshot?.valor_estimado ?? null,
                existingNumeroVendaMonde: typeof pd.numero_venda_monde === 'string' ? pd.numero_venda_monde : null,
                existingHistoricoNums,
                existingArchivedAt: snapshot?.archived_at ?? null,
                otherCardCandidates: [],
                moveStage: true,
                updateDates: false,
                syncMondeNums: false,
                action,
                skipReason: null,
                audit: { severity: 'ok', issues: [] },
                diff: {
                    hasAny: false,
                    etapa: { changed: false, fromName: null, toName: trip.stage.name },
                    datas: {
                        changed: false,
                        inicio: { from: null, to: trip.dataInicio, changed: false },
                        fim: { from: null, to: trip.dataFim, changed: false },
                    },
                    monde: { changed: false, current: [], file: [], toAdd: [], toRemove: [], toKeep: [] },
                    valor: { changed: false, from: 0, to: trip.valorTotal },
                },
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
                    // Regras de skip baseadas em fase atual do card:
                    // - 'planner': T. Planner ainda em andamento, não tocar
                    // - 'pos_venda': pode atualizar normalmente (caso esperado)
                    // - outras fases COM ganho_planner=true: cliente foi ganho mas NÃO vai
                    //   pra pós-venda (ganho direto). Não tocar.
                    // - outras fases sem ganho: caso atípico, pular com motivo genérico.
                    if (info?.phaseSlug === 'planner') {
                        t.action = 'skip'
                        t.skipReason = 'Card em T. Planner — fechamento ainda em andamento'
                    } else if (info?.phaseSlug && info.phaseSlug !== 'pos_venda') {
                        t.action = 'skip'
                        if (t.existingGanhoPlanner === true && t.existingStatusComercial === 'ganho') {
                            t.skipReason = `Ganho sem pós-venda — card está em "${info.nome}" e não passou pelo funil de Pós-venda`
                        } else {
                            t.skipReason = `Card em fase "${info.nome}" (fora de Pós-venda) — não tocar pela importação`
                        }
                    }
                }
            }
        }

        // Auditoria de saúde + diff arquivo×CRM — calcula depois do enrichment de stages.
        for (const t of fullTrips) {
            t.audit = computeAudit(t)
            t.diff = computeTripDiff(t)
            // Default dos toggles: ON quando há diff, OFF quando não há.
            t.moveStage = t.diff.etapa.changed
            t.updateDates = t.diff.datas.changed
            t.syncMondeNums = t.diff.monde.changed
        }

        setTrips(fullTrips)
        setSelectedTrips(new Set(fullTrips.map(t => t.id)))
        // Pré-marca pra arquivar TODOS os cards ambíguos de TODAS as viagens.
        // MERGE em vez de RESET pra preservar pré-seleção automática de duplicatas
        // (vinda do useEffect de duplicateGroups).
        setCardsToArchive(prev => {
            const next = new Set(prev)
            for (const t of fullTrips) {
                for (const o of (t.otherCardCandidates || [])) next.add(o.id)
            }
            return next
        })
        // Permite reseed do useEffect de duplicatas se a planilha mudou
        setDuplicatesAutoSeeded(false)
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
            const colReceita = findColumn(headers, RECEITA_ALIASES)
            const colEtapa = findColumn(headers, ETAPA_ALIASES)

            if (!colPagante || !colInicio) {
                toast.error('Planilha por viagem precisa ter pelo menos as colunas: Pagante e Início.')
                return
            }

            // Detecta locale do arquivo olhando TODAS as datas. Se houver pelo menos
            // uma data com a > 12 (só faz sentido como BR) e nenhuma forçando US, BR.
            // Idem para US. Empate ou ambíguo total → BR (CRM é BR). O locale
            // detectado se aplica em TODAS as datas — incluindo as ambíguas — pra
            // garantir consistência por arquivo.
            let brHits = 0, usHits = 0
            for (const r of rawRows) {
                for (const c of [colInicio, colFim]) {
                    if (!c) continue
                    const v = r[c]
                    if (typeof v !== 'string') continue
                    const m = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
                    if (!m) continue
                    const a = parseInt(m[1], 10), b = parseInt(m[2], 10)
                    if (a > 12 && b <= 12) brHits++
                    else if (b > 12 && a <= 12) usHits++
                }
            }
            const fileLocale: 'BR' | 'US' = usHits > brHits ? 'US' : 'BR'
            const parseDateFlex = (val: unknown): string | null => {
                if (val == null || val === '') return null
                if (typeof val === 'number') {
                    const epoch = new Date(Date.UTC(1899, 11, 30))
                    const d = new Date(epoch.getTime() + val * 86400000)
                    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
                }
                const s = String(val).trim()
                if (!s || s === '—' || s === '-') return null
                const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
                if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
                const parts = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
                if (parts) {
                    const a = parseInt(parts[1], 10)
                    const b = parseInt(parts[2], 10)
                    let yy = parts[3]
                    if (yy.length === 2) yy = '20' + yy
                    let mm: number, dd: number
                    if (a > 12 && b <= 12) { dd = a; mm = b }
                    else if (b > 12 && a <= 12) { mm = a; dd = b }
                    else if (fileLocale === 'US') { mm = a; dd = b }
                    else { dd = a; mm = b }
                    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
                    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
                }
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
                const receita = colReceita ? parseBRNumber(r[colReceita]) : 0

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
                // Valor e receita distribuídos igualmente (não temos detalhe por produto).
                const N = Math.max(produtos.length, 1)
                const valorPorProduto = produtos.length > 0
                    ? Math.round((valorTotal / N) * 100) / 100
                    : valorTotal
                const receitaPorProduto = produtos.length > 0
                    ? Math.round((receita / N) * 100) / 100
                    : receita
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
                    receita: receitaPorProduto,
                    valorTotal: valorPorProduto,
                    etapaCsv: '',
                }))

                // Se o CSV tem coluna "etapa" e ela for reconhecida, usa ela.
                // Senão deduz pela data (lógica antiga).
                const etapaCsvText = colEtapa ? String(r[colEtapa] ?? '').trim() : ''
                const stageFromCsv = etapaCsvText ? resolveTargetStage(etapaCsvText) : null

                let stage: { id: string; name: string }
                if (stageFromCsv) {
                    stage = stageFromCsv
                } else if (dataInicio) {
                    const days = daysFromNow(dataInicio)
                    stage = days > 30
                        ? { id: STAGE_PRE_EMBARQUE_GT30, name: 'Pré-embarque - >>> 30 dias' }
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
                    receita,
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
                archived_at: string | null
                _matchType: 'venda_atual' | 'venda_historico'
            }

            const scoreCard = (c: CardCandidate): number => {
                // Maior score = mais "saudável" = preferível
                let s = 0
                if (c.status_comercial === 'ganho') s += 100
                if (c.ganho_planner === true) s += 50
                if (c.pos_owner_id) s += 10
                if (c._matchType === 'venda_atual') s += 5  // venda atual > histórico
                // Cards arquivados são fallback — só vencem se não tiver alternativa.
                // Cobre o caso onde o user já tem dois cards do mesmo Monde, um arquivado
                // (resíduo de import antigo) e outro ativo (com tarefas, histórico real).
                // Sem isso, o trip pode acabar atualizando o arquivado e marcando o ativo
                // como duplicata-perdedora.
                if (c.archived_at) s -= 1000
                return s
            }

            const fullTrips: TripGroup[] = []
            for (const trip of rawTrips) {
                const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)
                const vendedorProfileId = profileMap.get(norm(trip.vendedor)) || null

                const CARD_AUDIT_SELECT = 'id, titulo, pipeline_stage_id, status_comercial, ganho_planner, ganho_pos, pos_owner_id, data_viagem_inicio, data_viagem_fim, valor_final, valor_estimado, produto_data, archived_at'

                const candidates: CardCandidate[] = []

                // 1. Por número de venda monde atual (TODOS os matches, sem arquivados/deletados)
                if (trip.vendaNums.length > 0) {
                    for (const vchunk of chunked(trip.vendaNums, 10)) {
                        let query = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .in('produto_data->>numero_venda_monde', vchunk)
                            .is('deleted_at', null)
                            .is('archived_at', null)
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
                                archived_at: (c.archived_at as string) ?? null,
                                _matchType: 'venda_atual',
                            })
                        }
                    }
                }

                // Histórico (numeros_venda_monde_historico) é apenas informativo — não usar para matching.

                // 2. Fallback por CPF + datas (só se tem CPF na planilha e não achou pela venda).
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
                            .is('deleted_at', null)
                            .is('archived_at', null)
                            .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
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
                                archived_at: (c.archived_at as string) ?? null,
                                _matchType: 'venda_historico', // visualmente fallback, score igual histórico
                            })
                        }
                    }
                }

                // 4. Fallback por NOME do pagante — só se tudo acima falhou.
                // Pra planilhas agregadas que não trazem CPF nem número Monde da viagem,
                // mas têm o nome do cliente. Match por similaridade de primeiro nome +
                // sobrenome. SEM filtro estrito de datas (overlap pode falhar mesmo em
                // viagens da mesma pessoa quando só temos uma viagem ativa).
                if (candidates.length === 0 && trip.pagantePrincipal) {
                    const partes = trip.pagantePrincipal.trim().split(/\s+/).filter(Boolean)
                    const primeiroNome = partes[0] || ''
                    const ultimoSobrenome = partes.length > 1 ? partes[partes.length - 1] : ''
                    if (primeiroNome.length >= 2) {
                        // Busca contatos por primeiro nome (ilike)
                        const { data: contatos } = await supabase
                            .from('contatos')
                            .select('id, nome, sobrenome')
                            .ilike('nome', `${primeiroNome.replace(/[%_]/g, '')}%`)
                            .is('deleted_at', null)
                            .limit(50)
                        const tripNome = norm(trip.pagantePrincipal)
                        const matchingContatos = (contatos || []).filter(c => {
                            const fullName = `${(c as { nome?: string }).nome || ''} ${(c as { sobrenome?: string }).sobrenome || ''}`.trim()
                            const fullNorm = norm(fullName)
                            // Match se nome completo bate OU se primeiro+último sobrenome batem
                            if (fullNorm === tripNome) return true
                            if (fullNorm.includes(tripNome) || tripNome.includes(fullNorm)) return true
                            if (ultimoSobrenome) {
                                const ultimoNorm = norm(ultimoSobrenome)
                                if (fullNorm.includes(norm(primeiroNome)) && fullNorm.includes(ultimoNorm)) return true
                            }
                            return false
                        })
                        if (matchingContatos.length > 0) {
                            const contatoIds = matchingContatos.map(c => (c as { id: string }).id)
                            let q = supabase
                                .from('cards')
                                .select(CARD_AUDIT_SELECT)
                                .in('pessoa_principal_id', contatoIds)
                                .in('pipeline_stage_id', POS_VENDA_STAGES)
                                .is('deleted_at', null)
                                .is('archived_at', null)
                                .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                                .limit(5)
                            if (activeOrgId) q = q.eq('org_id', activeOrgId)
                            const { data: cards } = await q
                            for (const c of (cards || [])) {
                                if (candidates.some(x => x.id === (c as { id: string }).id)) continue
                                candidates.push({
                                    id: (c as { id: string }).id,
                                    titulo: (c as { titulo?: string }).titulo as string,
                                    pipeline_stage_id: ((c as { pipeline_stage_id?: string }).pipeline_stage_id as string) || null,
                                    status_comercial: ((c as { status_comercial?: string }).status_comercial as string) ?? null,
                                    ganho_planner: ((c as { ganho_planner?: boolean }).ganho_planner as boolean) ?? null,
                                    ganho_pos: ((c as { ganho_pos?: boolean }).ganho_pos as boolean) ?? null,
                                    pos_owner_id: ((c as { pos_owner_id?: string }).pos_owner_id as string) ?? null,
                                    archived_at: ((c as { archived_at?: string }).archived_at as string) ?? null,
                                    _matchType: 'venda_historico', // score baixo, último recurso
                                })
                            }
                        }
                    }
                }

                // 5. Match pelo TÍTULO do card (último recurso) — pega cards onde o pagante
                //    aparece como ACOMPANHANTE (título tem o nome dele, mas pessoa_principal
                //    é outra pessoa, ex: esposo). Resolve casos como "Aparecida Donizete".
                //
                //    SEM filtro estrito de datas no SQL — datas no card podem estar erradas
                //    em DB (legado de import antigo com bug de locale). Risco de falso positivo
                //    é baixo: primeiro+segundo nome é único o bastante e o filtro já restringe
                //    a fase pós-venda em status correto. Quando há mais de um candidato, o
                //    score-cards desempata por proximidade de datas mais à frente.
                if (candidates.length === 0 && trip.pagantePrincipal) {
                    const partes = trip.pagantePrincipal.trim().split(/\s+/).filter(Boolean)
                    const primeiroNome = partes[0] || ''
                    const segundoNome = partes.length > 1 ? partes[1] : ''
                    if (primeiroNome.length >= 3 && segundoNome.length >= 2) {
                        let q = supabase
                            .from('cards')
                            .select(CARD_AUDIT_SELECT)
                            .ilike('titulo', `%${primeiroNome.replace(/[%_]/g, '')}%${segundoNome.replace(/[%_]/g, '')}%`)
                            .in('pipeline_stage_id', POS_VENDA_STAGES)
                            .is('deleted_at', null)
                            .is('archived_at', null)
                            .or('status_comercial.eq.aberto,and(status_comercial.eq.ganho,ganho_pos.eq.false)')
                            .limit(10)
                        if (activeOrgId) q = q.eq('org_id', activeOrgId)
                        const { data: cards } = await q
                        for (const c of (cards || [])) {
                            if (candidates.some(x => x.id === (c as { id: string }).id)) continue
                            candidates.push({
                                id: (c as { id: string }).id,
                                titulo: (c as { titulo?: string }).titulo as string,
                                pipeline_stage_id: ((c as { pipeline_stage_id?: string }).pipeline_stage_id as string) || null,
                                status_comercial: ((c as { status_comercial?: string }).status_comercial as string) ?? null,
                                ganho_planner: ((c as { ganho_planner?: boolean }).ganho_planner as boolean) ?? null,
                                ganho_pos: ((c as { ganho_pos?: boolean }).ganho_pos as boolean) ?? null,
                                pos_owner_id: ((c as { pos_owner_id?: string }).pos_owner_id as string) ?? null,
                                archived_at: ((c as { archived_at?: string }).archived_at as string) ?? null,
                                _matchType: 'venda_historico',
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

                // Snapshot: extrai produto_data + datas + valor do winner (se houver)
                // para alimentar o diff lado-a-lado.
                let winnerProdutoData: Record<string, unknown> = {}
                let winnerDataInicio: string | null = null
                let winnerDataFim: string | null = null
                let winnerValorFinal: number | null = null
                let winnerArchivedAt: string | null = null
                if (winner) {
                    const w = winner as unknown as {
                        produto_data?: Record<string, unknown> | null
                        data_viagem_inicio?: string | null
                        data_viagem_fim?: string | null
                        valor_final?: number | null
                        valor_estimado?: number | null
                        archived_at?: string | null
                    }
                    winnerProdutoData = (w.produto_data ?? {}) as Record<string, unknown>
                    winnerDataInicio = w.data_viagem_inicio ?? null
                    winnerDataFim = w.data_viagem_fim ?? null
                    winnerValorFinal = (typeof w.valor_final === 'number' ? w.valor_final
                        : typeof w.valor_estimado === 'number' ? w.valor_estimado
                        : null)
                    winnerArchivedAt = w.archived_at ?? null
                }
                const winnerHistoricoRaw = Array.isArray(winnerProdutoData.numeros_venda_monde_historico)
                    ? winnerProdutoData.numeros_venda_monde_historico
                    : []
                const winnerHistoricoNums = (winnerHistoricoRaw as Array<{ numero?: unknown }>)
                    .map(h => typeof h?.numero === 'string' ? h.numero : null)
                    .filter((n): n is string => !!n)

                // Decisão de ação:
                // - Achou card no CRM → update
                // - Achou card no CRM → update
                // - Não achou MAS tem pagante (com OU sem CPF) → create. Card criado sem CPF
                //   ganha tarefa "Atualizar CPF do contato principal" (alta prioridade) e flag
                //   produto_data.precisa_cpf=true pra UI alertar.
                // - Sem pagante → skip (sem como criar contato)
                let action: TripGroup['action']
                let skipReason: string | null = null
                if (winner) {
                    action = 'update'
                } else if (trip.pagantePrincipal) {
                    action = 'create'
                } else {
                    action = 'skip'
                    skipReason = 'Sem nome de pagante na planilha — não dá pra criar contato nem card.'
                }

                fullTrips.push({
                    ...trip,
                    id: titulo,
                    vendedorProfileId,
                    existingCardId: winner?.id ?? null,
                    existingCardTitle: winner?.titulo ?? null,
                    existingStageId: winner?.pipeline_stage_id ?? null,
                    existingStageName: null,
                    existingPhaseSlug: null,
                    existingStatusComercial: winner?.status_comercial ?? null,
                    existingGanhoPlanner: winner?.ganho_planner ?? null,
                    existingGanhoPos: winner?.ganho_pos ?? null,
                    existingDonoPosId: winner?.pos_owner_id ?? null,
                    existingDataInicio: winnerDataInicio,
                    existingDataFim: winnerDataFim,
                    existingValorFinal: winnerValorFinal,
                    existingNumeroVendaMonde: typeof winnerProdutoData.numero_venda_monde === 'string' ? winnerProdutoData.numero_venda_monde : null,
                    existingHistoricoNums: winnerHistoricoNums,
                    existingArchivedAt: winnerArchivedAt,
                    otherCardCandidates: others,
                    moveStage: true,
                    updateDates: false,
                    syncMondeNums: false,
                    action,
                    skipReason,
                    audit: { severity: 'ok', issues: [] },
                    diff: {
                        hasAny: false,
                        etapa: { changed: false, fromName: null, toName: trip.stage.name },
                        datas: {
                            changed: false,
                            inicio: { from: null, to: trip.dataInicio, changed: false },
                            fim: { from: null, to: trip.dataFim, changed: false },
                        },
                        monde: { changed: false, current: [], file: [], toAdd: [], toRemove: [], toKeep: [] },
                        valor: { changed: false, from: 0, to: trip.valorTotal },
                    },
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
                        // Mesmo padrão do fluxo detalhada: pula T.Planner, pula ganho-direto
                        // (ganho sem pós-venda) e pula outras fases fora de Pós-venda.
                        if (info?.phaseSlug === 'planner') {
                            t.action = 'skip'
                            t.skipReason = 'Card em T. Planner — fechamento ainda em andamento'
                        } else if (info?.phaseSlug && info.phaseSlug !== 'pos_venda') {
                            t.action = 'skip'
                            if (t.existingGanhoPlanner === true && t.existingStatusComercial === 'ganho') {
                                t.skipReason = `Ganho sem pós-venda — card está em "${info.nome}" e não passou pelo funil de Pós-venda`
                            } else {
                                t.skipReason = `Card em fase "${info.nome}" (fora de Pós-venda) — não tocar pela importação`
                            }
                        }
                    }
                    for (const o of t.otherCardCandidates) {
                        if (o.stageId) {
                            o.stageName = stageInfo.get(o.stageId)?.nome || null
                        }
                    }
                }
            }

            // Recuperar receita histórica via pos_venda_import_log_items.
            // Quando uma viagem da planilha agregada vai CRIAR card novo, a receita
            // não vem na planilha — buscamos no log de imports anteriores (que vieram
            // da planilha detalhada com a coluna Receita) usando os números de venda.
            // Só faz lookup do histórico pra trips CREATE que NÃO trouxeram receita na planilha
            // (fallback). Se a planilha já tem coluna Receita preenchida, usa direto.
            const tripsThatNeedReceita = fullTrips.filter(t => t.action === 'create' && t.vendaNums.length > 0 && (t.receita || 0) === 0)
            if (tripsThatNeedReceita.length > 0) {
                const allVendaNums = [...new Set(tripsThatNeedReceita.flatMap(t => t.vendaNums))]
                if (allVendaNums.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: logItems } = await ((supabase as any).from('pos_venda_import_log_items') as any)
                        .select('venda_nums, total_venda, total_receita, created_at')
                        .overlaps('venda_nums', allVendaNums)
                        .order('created_at', { ascending: false })
                        .limit(500)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const items: Array<{ venda_nums: string[]; total_venda: number; total_receita: number; created_at: string }> = logItems || []
                    for (const t of tripsThatNeedReceita) {
                        const tripSet = new Set(t.vendaNums)
                        // Prioriza item com mesmo conjunto de vendas; depois overlap com mais matches
                        let best: typeof items[0] | null = null
                        let bestScore = 0
                        for (const item of items) {
                            const overlap = (item.venda_nums || []).filter(v => tripSet.has(v)).length
                            if (overlap === 0) continue
                            // score: overlap exato vale mais; data mais recente desempata
                            const exact = overlap === t.vendaNums.length && item.venda_nums.length === t.vendaNums.length
                            const score = (exact ? 1000 : overlap * 10)
                            if (score > bestScore) {
                                best = item
                                bestScore = score
                            }
                        }
                        if (best && best.total_receita > 0) {
                            t.receita = best.total_receita
                            // Se a planilha agregada não trouxe valor mas o log tem, usa do log
                            if (t.valorTotal === 0 && best.total_venda > 0) {
                                t.valorTotal = best.total_venda
                            }
                            // Distribuir receita pelos products proporcionalmente ao sale_value
                            // (o RPC recalcula receita do card via sum(sale_value) - sum(supplier_cost),
                            // então precisa estar nos products também)
                            const totalSale = t.products.reduce((s, p) => s + p.valorTotal, 0)
                            if (totalSale > 0) {
                                for (const p of t.products) {
                                    p.receita = Math.round((p.valorTotal / totalSale) * t.receita * 100) / 100
                                }
                            }
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
                t.diff = computeTripDiff(t)
                t.moveStage = t.diff.etapa.changed
                t.updateDates = t.diff.datas.changed
                t.syncMondeNums = t.diff.monde.changed
            }

            setTrips(fullTrips)
            setSelectedTrips(new Set(fullTrips.filter(t => t.action !== 'skip').map(t => t.id)))
            // Pré-marca pra arquivar TODOS os cards ambíguos de TODAS as viagens.
            // MERGE em vez de RESET pra preservar pré-seleção automática de duplicatas.
            setCardsToArchive(prev => {
                const next = new Set(prev)
                for (const t of fullTrips) {
                    for (const o of (t.otherCardCandidates || [])) next.add(o.id)
                }
                return next
            })
            setDuplicatesAutoSeeded(false)
            setStep('preview')
            const matched = fullTrips.filter(t => t.action === 'update').length
            const created = fullTrips.filter(t => t.action === 'create').length
            const withReceita = fullTrips.filter(t => t.action === 'create' && t.receita > 0).length
            const unmatched = fullTrips.filter(t => t.action === 'skip').length
            const receitaMsg = withReceita > 0 ? ` · receita recuperada do histórico em ${withReceita} criação(ões)` : ''
            toast.success(`${fullTrips.length} viagens lidas — ${matched} atualizar, ${created} criar, ${unmatched} pular${receitaMsg}.`)
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
                // defval: null garante que TODAS as colunas apareçam em TODAS as linhas
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
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
            // Pré-correção: cards em etapa pré-Pós-Viagem que têm indicadores de "ganho"
            // (status_comercial='ganho' OU ganho_pos=true) — estado errado herdado de
            // imports antigos. Movemos status pra 'aberto' e zeramos ganho_pos —
            // estado correto pra etapas pré-Pós-Viagem (a viagem ainda não aconteceu).
            //
            // Isso também desbloqueia o trigger enforce_trips_ganho_pos_only_in_pos_viagem
            // que barra qualquer UPDATE em cards com ganho_pos=true em pré-pós-viagem.
            const cardsToFixBeforeUpdate = toProcess
                .filter(t => {
                    if (t.action !== 'update' || !t.existingCardId) return false
                    // Etapa-alvo: a calculada pelo sistema (se moveStage) ou a atual
                    const targetStageId = t.moveStage ? t.stage.id : t.existingStageId
                    if (!targetStageId || targetStageId === STAGE_POS_VIAGEM) return false
                    // Precisa correção se card tem indicador de "ganho" e a etapa-alvo é pré-pós-viagem
                    return t.existingGanhoPos === true || t.existingStatusComercial === 'ganho'
                })
                .map(t => t.existingCardId as string)
            const cardsFixedSet = new Set(cardsToFixBeforeUpdate)
            if (cardsToFixBeforeUpdate.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: fixErr } = await (supabase.from('cards') as any)
                    .update({
                        ganho_pos: false,
                        ganho_pos_at: null,
                        status_comercial: 'aberto',
                    })
                    .in('id', cardsToFixBeforeUpdate)
                if (fixErr) {
                    console.error('Erro ao pré-corrigir status/ganho_pos:', fixErr)
                    // Continua mesmo assim — alguns cards podem dar erro no RPC e o usuário vê
                }
            }

            const payload = toProcess.map(trip => {
                // Auditoria sem valores: na planilha agregada, quando vem sem valor/receita,
                // NÃO inventar (não rateaer entre produtos). O usuário sobe um relatório
                // detalhado depois com valores reais por produto.
                const isAggregated = flowMode === 'agregada'
                const tripValorVazio = (trip.valorTotal || 0) === 0 && (trip.receita || 0) === 0
                const skipFinanceiros = isAggregated && tripValorVazio
                return {
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
                // Flags por viagem (RPC respeita: false = comportamento legado COALESCE/append)
                update_dates: trip.action === 'update' ? trip.updateDates : false,
                sync_monde_nums: trip.action === 'update' ? trip.syncMondeNums : false,
                // Flag: se true, RPC não cria items financeiros nem atualiza valor_final/receita.
                // Útil quando a planilha agregada não trouxe valor (vai vir no relatório detalhado depois).
                skip_financials: skipFinanceiros,
                // Quando detalhada vem pra card que já existe, atualiza items financeiros existentes.
                update_financials_on_existing: !isAggregated && trip.action === 'update',
                valor_total: skipFinanceiros ? 0 : trip.valorTotal,
                receita_total: skipFinanceiros ? 0 : trip.receita,
                venda_nums: trip.vendaNums,
                app_enviado_concluida: trip.appEnviadoConcluida,
                // Products vai vazio quando skip_financials=true — RPC não toca em items financeiros.
                products: skipFinanceiros ? [] : trip.products.map(p => ({
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
                }
            })

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

            // Pós-processamento: cards arquivados que foram matched (e o user aplicou)
            // viram "ativos" de novo. Sem isso, o card ficaria atualizado mas continuaria
            // arquivado — fora do funil. Premissa: se a planilha trouxe a viagem como
            // ativa e o user clicou aplicar, ele quer o card de volta no funil.
            const archivedToReactivate = toProcess
                .filter(t => t.existingCardId && t.existingArchivedAt)
                .map(t => t.existingCardId as string)
            if (archivedToReactivate.length > 0) {
                const { error: unarchiveErr } = await supabase
                    .from('cards')
                    .update({ archived_at: null })
                    .in('id', archivedToReactivate)
                if (unarchiveErr) {
                    console.error('Erro ao desarquivar cards:', unarchiveErr)
                }
            }

            setImportResult({ cardsCreated, cardsUpdated, productsImported, skipped: skippedByUser, errors: totalErrors })

            // Detalhe por viagem pra tela "done" mostrar exatamente o que subiu / falhou
            const success: NonNullable<typeof importDetails>['success'] = []
            const failed: NonNullable<typeof importDetails>['failed'] = []
            const skipped: NonNullable<typeof importDetails>['skipped'] = []
            for (const res of allRpcResults) {
                const trip = toProcess[res.idx]
                if (!trip) continue
                const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)
                const base = { pagante: trip.pagantePrincipal, titulo, vendaNums: trip.vendaNums, cardId: (res.card_id as string) || trip.existingCardId || null }
                if (res.action === 'error') {
                    failed.push({ ...base, error: res.error || 'erro desconhecido' })
                } else if (res.action === 'created' || res.action === 'updated') {
                    // Capturar mudanças exatas pra mostrar no relatório
                    const wasFixed = trip.existingCardId ? cardsFixedSet.has(trip.existingCardId) : false
                    const stageMoved = res.action === 'updated'
                        && trip.moveStage === true
                        && trip.existingStageId !== null
                        && trip.existingStageId !== trip.stage.id
                    // Etapa final do card após aplicar:
                    // - update + moveStage=true → etapa-destino do trip (trip.stage)
                    // - update + moveStage=false → etapa atual no CRM (existingStage)
                    // - create → sempre etapa-destino do trip (trip.stage)
                    const finalStageId = res.action === 'created' || trip.moveStage
                        ? trip.stage.id
                        : (trip.existingStageId || trip.stage.id)
                    const finalStageName = res.action === 'created' || trip.moveStage
                        ? trip.stage.name
                        : (trip.existingStageName || trip.stage.name)
                    success.push({
                        ...base,
                        action: res.action,
                        stageToId: finalStageId,
                        stageToName: finalStageName,
                        changes: {
                            stageFrom: trip.existingStageName,
                            stageTo: trip.stage.name,
                            stageMoved,
                            statusFrom: res.action === 'updated' ? trip.existingStatusComercial : null,
                            statusTo: wasFixed ? 'aberto' : (res.action === 'created' ? 'aberto' : trip.existingStatusComercial),
                            ganhoPosFrom: res.action === 'updated' ? trip.existingGanhoPos : null,
                            ganhoPosTo: wasFixed ? false : (res.action === 'created' ? false : trip.existingGanhoPos),
                            vendasAdicionadas: trip.vendaNums,
                        },
                    })
                }
            }
            // Viagens com action='skip' (T. Planner, ganho-sem-pós, sem match, etc) — não vão pro RPC
            for (const trip of trips.filter(t => t.action === 'skip')) {
                const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)
                const reason = trip.skipReason || 'pulada'
                // Categoria pra agrupar visualmente no relatório
                let category: 'planner' | 'ganho_sem_pos' | 'outra_fase' | 'sem_pagante' | 'desmarcado' | 'outro' = 'outro'
                if (reason.includes('T. Planner')) category = 'planner'
                else if (reason.includes('Ganho sem pós-venda')) category = 'ganho_sem_pos'
                else if (reason.includes('fora de Pós-venda')) category = 'outra_fase'
                else if (reason.includes('Sem nome de pagante') || reason.includes('Sem número de venda nem CPF') || reason.includes('Não encontrei card')) category = 'sem_pagante'
                skipped.push({
                    pagante: trip.pagantePrincipal,
                    titulo,
                    vendaNums: trip.vendaNums,
                    reason,
                    category,
                    cardId: trip.existingCardId,
                    currentStageName: trip.existingStageName,
                })
            }
            // Viagens DESMARCADAS pelo user (action != skip mas não selectionado) — também entram no relatório
            for (const trip of trips.filter(t => t.action !== 'skip' && !selectedTrips.has(t.id))) {
                const titulo = buildTripTitle(trip.pagantePrincipal, trip.products, trip.dataInicio, trip.dataFim)
                skipped.push({
                    pagante: trip.pagantePrincipal,
                    titulo,
                    vendaNums: trip.vendaNums,
                    reason: 'Você desmarcou esta viagem antes de aplicar',
                    category: 'desmarcado',
                    cardId: trip.existingCardId,
                    currentStageName: trip.existingStageName,
                })
            }
            setImportDetails({ success, failed, skipped })

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
                    // Skips registrados no log: TUDO que veio na planilha mas não foi
                    // criado/atualizado. Inclui:
                    //  - Desmarcados pelo user (action != 'skip' E !selected)
                    //  - Pulados pelo sistema (action == 'skip': T. Planner, ganho-sem-pós,
                    //    outras fases, sem pagante/CPF, etc)
                    // Ambos vão pro log com action='skipped' + razão em error_message,
                    // e o stage_name continua sendo a etapa-alvo da planilha (pra agrupamento).
                    const skippedItems = trips
                        .filter(t => t.action === 'skip' || !selectedTrips.has(t.id))
                        .map(t => ({
                            import_log_id: logRow.id,
                            card_id: t.existingCardId || null,
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
                            // stage_name = etapa-alvo da PLANILHA (pra agrupar no histórico
                            // pelo "destino que a planilha pretendia"). Mesmo cards pulados
                            // aparecem agrupados pela etapa que estavam classificados.
                            stage_name: t.stage.name,
                            error_message: t.action === 'skip'
                                ? (t.skipReason || 'pulado pelo sistema')
                                : 'desmarcado por você',
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
        setImportDetails(null)
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
    const hasActiveFilters = !!(filterDataFimMin || filterDataFimMax || filterValorMin || filterValorMax || filterAction !== 'all' || filterVendedor || filterApp !== 'all' || filterVoucher !== 'all' || filterAudit !== 'all' || filterTargetStage !== 'all')

    const filteredTrips = trips.filter(trip => {
        if (filterAction !== 'all' && trip.action !== filterAction) return false
        if (filterAudit !== 'all' && (trip.audit?.severity ?? 'ok') !== filterAudit) return false
        if (filterTargetStage !== 'all' && trip.stage.id !== filterTargetStage) return false
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
        setFilterTargetStage('all')
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

    const toggleUpdateDates = useCallback((id: string) => {
        setTrips(prev => prev.map(t =>
            t.id === id ? { ...t, updateDates: !t.updateDates } : t
        ))
    }, [])

    const toggleSyncMondeNums = useCallback((id: string) => {
        setTrips(prev => prev.map(t =>
            t.id === id ? { ...t, syncMondeNums: !t.syncMondeNums } : t
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

    if (!canAccess) return <Navigate to="/pipeline" replace />

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
                        <Link to="/settings" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
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
                        ) : !isAdmin ? (
                            // Pós-venda não-admin: vê só o histórico, não o uploader.
                            // Usa as próximas seções (history) renderizadas mais abaixo.
                            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                <h2 className="text-base font-semibold text-slate-900 mb-1">Histórico de importações</h2>
                                <p className="text-sm text-slate-500">
                                    Aqui você vê todas as planilhas pós-venda que foram subidas, com detalhe do que cada uma fez. Apenas administradores podem subir uma planilha nova.
                                </p>
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
                                            isAdmin={isAdmin}
                                            autoExpand={focusLogId === log.id}
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
                        {/* Para onde vão essas viagens — agrupado por etapa-destino + projeção */}
                        <DestinationStageSummary
                            trips={trips}
                            filterTargetStage={filterTargetStage}
                            stageCounts={stageCounts}
                            activeOrgId={activeOrgId ?? null}
                            dupCtxByCardId={(() => {
                                // Pra cada grupo de duplicatas, computa o vencedor (maior score) e
                                // anota cada card com seu papel (vencedor/perdedor) + razões. Permite
                                // mostrar a decisão INLINE na lista da etapa, sem mandar pro painel.
                                const map = new Map<string, DupCtx>()
                                for (const g of duplicateGroups) {
                                    const ranked = [...g.cards]
                                        .map(c => ({ c, ...scoreCardForKeep(c) }))
                                        .sort((a, b) => b.score - a.score)
                                    const winnerId = ranked[0]?.c.id
                                    for (const r of ranked) {
                                        // Se o card já foi anotado por outro grupo, mantém a entrada
                                        // existente (caso raro — usualmente um card só está num grupo).
                                        if (map.has(r.c.id)) continue
                                        map.set(r.c.id, {
                                            numero: g.numero,
                                            totalInGroup: g.cards.length,
                                            isWinner: r.c.id === winnerId,
                                            reasons: r.reasons,
                                            score: r.score,
                                        })
                                    }
                                }
                                return map
                            })()}
                            cardsToArchive={cardsToArchive}
                            onToggleArchiveMark={toggleArchiveMark}
                            onSelectStage={(stageId) => {
                                setFilterTargetStage(prev => prev === stageId ? 'all' : stageId)
                                setShowFilters(true)
                            }}
                        />

                        {/* Auditoria de duplicatas no CRM (raio-X — independe da planilha) */}
                        <DuplicatesPanel
                            groups={duplicateGroups}
                            loading={loadingDuplicates}
                            tripExistingIds={new Set(trips.map(t => t.existingCardId).filter((id): id is string => !!id))}
                            tripVendaNumsByCardId={(() => {
                                const map = new Map<string, Set<string>>()
                                for (const t of trips) {
                                    if (!t.existingCardId) continue
                                    map.set(t.existingCardId, new Set(t.vendaNums))
                                }
                                return map
                            })()}
                            stageNameById={Object.fromEntries(TARGET_STAGE_ORDER.map(s => [s.id, s.name]))}
                            cardsToArchive={cardsToArchive}
                            onToggleArchiveMark={toggleArchiveMark}
                        />

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
                                        onToggleUpdateDates={toggleUpdateDates}
                                        onToggleSyncMondeNums={toggleSyncMondeNums}
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
                    <div className="space-y-4">
                        {/* Resumo */}
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                            <div className="flex items-start gap-4">
                                {importResult.errors === 0 ? (
                                    <CheckCircle2 className="h-10 w-10 text-emerald-500 shrink-0" />
                                ) : (
                                    <AlertTriangle className="h-10 w-10 text-amber-500 shrink-0" />
                                )}
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-slate-900 mb-3">
                                        {importResult.errors === 0 ? 'Importação concluída' : 'Importação concluída — com erros'}
                                    </h2>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        {importResult.cardsCreated > 0 && (
                                            <div>
                                                <p className="text-2xl font-bold text-emerald-600">{importResult.cardsCreated}</p>
                                                <p className="text-xs text-slate-500">Cards criados</p>
                                            </div>
                                        )}
                                        {importResult.cardsUpdated > 0 && (
                                            <div>
                                                <p className="text-2xl font-bold text-blue-600">{importResult.cardsUpdated}</p>
                                                <p className="text-xs text-slate-500">Cards atualizados</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-2xl font-bold text-slate-900">{importResult.productsImported}</p>
                                            <p className="text-xs text-slate-500">Produtos</p>
                                        </div>
                                        {importResult.errors > 0 && (
                                            <div>
                                                <p className="text-2xl font-bold text-rose-600">{importResult.errors}</p>
                                                <p className="text-xs text-slate-500">Com erro</p>
                                            </div>
                                        )}
                                        {(importResult.skipped > 0 || (importDetails?.skipped.length ?? 0) > 0) && (
                                            <div>
                                                <p className="text-2xl font-bold text-slate-400">{Math.max(importResult.skipped, importDetails?.skipped.length ?? 0)}</p>
                                                <p className="text-xs text-slate-500">Puladas</p>
                                            </div>
                                        )}
                                        {(importResult.cardsArchived ?? 0) > 0 && (
                                            <div>
                                                <p className="text-2xl font-bold text-rose-500">{importResult.cardsArchived}</p>
                                                <p className="text-xs text-slate-500">Arquivados</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
                                <Button variant="outline" onClick={handleReset}>Nova importação</Button>
                                <Link to="/pipeline">
                                    <Button>Ver no Funil</Button>
                                </Link>
                            </div>
                        </div>

                        {/* Lista detalhada de erros */}
                        {(importDetails?.failed.length ?? 0) > 0 && (
                            <div className="bg-white border border-rose-200 rounded-xl shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-rose-900 flex items-center gap-2">
                                        <XCircle className="h-4 w-4" />
                                        Viagens que NÃO subiram ({importDetails?.failed.length})
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const lines = (importDetails?.failed || []).map(f =>
                                                `${f.pagante} | vendas: ${f.vendaNums.join(', ') || '—'} | ${f.error}${f.cardId ? ` | card: ${f.cardId}` : ''}`
                                            ).join('\n')
                                            navigator.clipboard.writeText(lines)
                                            toast.success('Lista copiada')
                                        }}
                                        className="text-xs text-rose-700 hover:text-rose-900 underline"
                                    >
                                        copiar lista
                                    </button>
                                </div>
                                <ul className="divide-y divide-rose-100">
                                    {(importDetails?.failed || []).map((f, idx) => (
                                        <li key={idx} className="px-4 py-2.5 text-sm">
                                            <div className="flex items-start gap-2">
                                                <span className="text-rose-500 shrink-0 mt-0.5">✗</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-medium text-slate-900 truncate">{f.titulo}</span>
                                                        {f.cardId && (
                                                            <Link
                                                                to={`/cards/${f.cardId}`}
                                                                className="text-xs text-indigo-600 hover:underline shrink-0"
                                                            >
                                                                abrir card
                                                            </Link>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mb-1">
                                                        {f.pagante} • vendas: {f.vendaNums.join(', ') || '—'}
                                                    </div>
                                                    <div className="text-xs text-rose-700 bg-rose-50 px-2 py-1 rounded">
                                                        {f.error}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Relatório agrupado por categoria de skip — pulada por motivo + card pra abrir e investigar */}
                        {(importDetails?.skipped.length ?? 0) > 0 && (() => {
                            const SKIP_CATEGORIES: Array<{
                                key: 'planner' | 'ganho_sem_pos' | 'outra_fase' | 'sem_pagante' | 'desmarcado' | 'outro'
                                title: string
                                description: string
                                color: string
                            }> = [
                                {
                                    key: 'ganho_sem_pos',
                                    title: 'Ganho sem pós-venda',
                                    description: 'Cards já fechados em Vendas/Planner que não vão pro funil de Pós-venda',
                                    color: 'border-violet-200 bg-violet-50 text-violet-900',
                                },
                                {
                                    key: 'planner',
                                    title: 'Card em T. Planner',
                                    description: 'Fechamento ainda em andamento — não tocar pela importação de Pós-venda',
                                    color: 'border-amber-200 bg-amber-50 text-amber-900',
                                },
                                {
                                    key: 'outra_fase',
                                    title: 'Em outra fase do funil',
                                    description: 'Card está em fase fora de Pós-venda (ex: SDR, Atendendo)',
                                    color: 'border-blue-200 bg-blue-50 text-blue-900',
                                },
                                {
                                    key: 'sem_pagante',
                                    title: 'Sem identificação',
                                    description: 'Sem nome de pagante / sem CPF / sem número de venda — não dá pra criar nem casar',
                                    color: 'border-slate-300 bg-slate-100 text-slate-800',
                                },
                                {
                                    key: 'desmarcado',
                                    title: 'Desmarcadas por você',
                                    description: 'Você desmarcou estas viagens antes de aplicar',
                                    color: 'border-slate-200 bg-slate-50 text-slate-700',
                                },
                                {
                                    key: 'outro',
                                    title: 'Outras',
                                    description: 'Motivos diversos',
                                    color: 'border-slate-200 bg-slate-50 text-slate-700',
                                },
                            ]
                            const allSkipped = importDetails?.skipped || []
                            return (
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                            <MinusSquare className="h-4 w-4 text-slate-400" />
                                            Viagens puladas ({allSkipped.length}) — agrupadas por motivo
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {SKIP_CATEGORIES.map(cat => {
                                            const inCat = allSkipped.filter(s => s.category === cat.key)
                                            if (inCat.length === 0) return null
                                            return (
                                                <details key={cat.key} className="group">
                                                    <summary className={cn('px-4 py-2.5 cursor-pointer flex items-center gap-2 text-sm font-medium border-l-4', cat.color)}>
                                                        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 shrink-0" />
                                                        <span className="font-semibold">{cat.title}</span>
                                                        <span className="text-[11px] opacity-70 px-1.5 py-0.5 bg-white rounded">{inCat.length}</span>
                                                        <span className="text-xs opacity-70 ml-2 truncate">— {cat.description}</span>
                                                    </summary>
                                                    <ul className="divide-y divide-slate-100 bg-white max-h-64 overflow-y-auto">
                                                        {inCat.map((s, idx) => (
                                                            <li key={idx} className="px-6 py-2 text-sm">
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-slate-300 shrink-0 mt-0.5">·</span>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-medium text-slate-700 text-sm truncate">{s.titulo}</span>
                                                                            {s.cardId && (
                                                                                <Link to={`/cards/${s.cardId}`} className="text-xs text-indigo-600 hover:underline shrink-0">
                                                                                    abrir card
                                                                                </Link>
                                                                            )}
                                                                            {s.currentStageName && (
                                                                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                                                                                    em {s.currentStageName}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-slate-500 mt-0.5">
                                                                            {s.pagante} • vendas: {s.vendaNums.join(', ') || '—'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </details>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Relatório agrupado por etapa-destino (onde o card terminou após aplicar) */}
                        {(importDetails?.success.length ?? 0) > 0 && importDetails && (() => {
                            type SuccessItem = NonNullable<typeof importDetails>['success'][number]
                            // Agrupa successes por stageToId. Mantém ordem natural do funil.
                            const groups = new Map<string, { stageName: string; items: SuccessItem[] }>()
                            for (const s of (importDetails.success || [])) {
                                const key = s.stageToId || 'sem_etapa'
                                const name = s.stageToName || '(sem etapa)'
                                const existing = groups.get(key)
                                if (existing) existing.items.push(s)
                                else groups.set(key, { stageName: name, items: [s] })
                            }
                            const orderedKeys = [
                                STAGE_APP_CONTEUDO,
                                STAGE_PRE_EMBARQUE_GT30,
                                STAGE_PRE_EMBARQUE_LT30,
                                STAGE_EM_VIAGEM,
                                STAGE_POS_VIAGEM,
                            ]
                            const orderedGroups: Array<{ key: string; stageName: string; items: SuccessItem[] }> = []
                            for (const k of orderedKeys) {
                                const g = groups.get(k)
                                if (g) orderedGroups.push({ key: k, ...g })
                            }
                            // Outras etapas (fora do funil natural) viram último
                            for (const [k, g] of groups) {
                                if (orderedKeys.includes(k)) continue
                                orderedGroups.push({ key: k, ...g })
                            }
                            return (
                                <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
                                        <h3 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Onde os cards estão agora ({importDetails?.success.length}) — agrupados por etapa
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-emerald-100">
                                        {orderedGroups.map(g => {
                                            const created = g.items.filter(i => i.action === 'created').length
                                            const moved = g.items.filter(i => i.action === 'updated' && i.changes.stageMoved).length
                                            const unchanged = g.items.filter(i => i.action === 'updated' && !i.changes.stageMoved).length
                                            return (
                                                <details key={g.key} className="group">
                                                    <summary className="px-4 py-3 cursor-pointer flex items-center gap-2 hover:bg-emerald-50/50">
                                                        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 shrink-0" />
                                                        <span className="font-medium text-slate-900">{g.stageName}</span>
                                                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded shrink-0">
                                                            {g.items.length} {g.items.length === 1 ? 'card' : 'cards'}
                                                        </span>
                                                        <span className="text-xs text-slate-500 ml-2 truncate">
                                                            {created > 0 && <span>{created} criado{created !== 1 ? 's' : ''}</span>}
                                                            {created > 0 && (moved > 0 || unchanged > 0) && <span> · </span>}
                                                            {moved > 0 && <span>{moved} migrado{moved !== 1 ? 's' : ''} pra cá</span>}
                                                            {moved > 0 && unchanged > 0 && <span> · </span>}
                                                            {unchanged > 0 && <span>{unchanged} já {unchanged === 1 ? 'estava' : 'estavam'} aqui</span>}
                                                        </span>
                                                    </summary>
                                                    <ul className="divide-y divide-emerald-50 bg-white max-h-96 overflow-y-auto">
                                                        {g.items.map((s, idx) => {
                                                            const ch = s.changes
                                                            return (
                                                                <li key={idx} className="px-6 py-2 text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0',
                                                                            s.action === 'created' ? 'bg-emerald-100 text-emerald-700' :
                                                                            ch.stageMoved ? 'bg-blue-100 text-blue-700' :
                                                                            'bg-slate-100 text-slate-600'
                                                                        )}>
                                                                            {s.action === 'created' ? 'criado' : ch.stageMoved ? 'migrado' : 'já estava'}
                                                                        </span>
                                                                        <span className="font-medium text-slate-700 truncate flex-1">{s.titulo}</span>
                                                                        {s.cardId && (
                                                                            <Link to={`/cards/${s.cardId}`} className="text-xs text-indigo-600 hover:underline shrink-0">
                                                                                abrir
                                                                            </Link>
                                                                        )}
                                                                    </div>
                                                                    {ch.stageMoved && (
                                                                        <div className="ml-2 mt-0.5 text-xs text-slate-500">
                                                                            etapa: <span>{ch.stageFrom || '—'}</span> → <span className="font-medium text-blue-700">{ch.stageTo}</span>
                                                                        </div>
                                                                    )}
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                </details>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Lista detalhada do que mudou em cada viagem (collapsada por padrão) */}
                        {(importDetails?.success.length ?? 0) > 0 && (
                            <details className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden group">
                                <summary className="px-4 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer flex items-center gap-2 text-sm font-semibold text-slate-700">
                                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                                    Detalhes do que mudou em cada viagem ({importDetails?.success.length})
                                </summary>
                                <ul className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
                                    {(importDetails?.success || []).map((s, idx) => {
                                        const ch = s.changes
                                        const statusChanged = ch.statusFrom !== null && ch.statusFrom !== ch.statusTo
                                        const ganhoPosChanged = ch.ganhoPosFrom !== null && ch.ganhoPosFrom !== ch.ganhoPosTo
                                        const hasAnyChange = ch.stageMoved || statusChanged || ganhoPosChanged || (ch.vendasAdicionadas.length > 0 && s.action === 'updated')
                                        return (
                                            <li key={idx} className="px-4 py-2.5 text-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', s.action === 'created' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')}>
                                                        {s.action === 'created' ? 'criado' : 'atualizado'}
                                                    </span>
                                                    <span className="font-medium text-slate-700 truncate flex-1">{s.titulo}</span>
                                                    {s.cardId && (
                                                        <Link
                                                            to={`/cards/${s.cardId}`}
                                                            className="text-xs text-indigo-600 hover:underline shrink-0"
                                                        >
                                                            ver
                                                        </Link>
                                                    )}
                                                </div>
                                                {/* Mudanças detalhadas */}
                                                {s.action === 'updated' && hasAnyChange && (
                                                    <ul className="ml-4 space-y-0.5 text-xs text-slate-600">
                                                        {ch.stageMoved && (
                                                            <li>
                                                                <span className="text-slate-400">etapa:</span>{' '}
                                                                <span className="text-slate-500">{ch.stageFrom || '—'}</span>
                                                                {' → '}
                                                                <span className="font-medium text-blue-700">{ch.stageTo}</span>
                                                            </li>
                                                        )}
                                                        {!ch.stageMoved && ch.stageFrom && (
                                                            <li>
                                                                <span className="text-slate-400">etapa:</span>{' '}
                                                                <span>{ch.stageFrom}</span>
                                                                <span className="text-slate-400 italic"> (mantida)</span>
                                                            </li>
                                                        )}
                                                        {statusChanged && (
                                                            <li>
                                                                <span className="text-slate-400">status comercial:</span>{' '}
                                                                <span className="text-slate-500">{ch.statusFrom || '—'}</span>
                                                                {' → '}
                                                                <span className="font-medium text-emerald-700">{ch.statusTo}</span>
                                                                <span className="text-slate-400 italic"> (corrigido)</span>
                                                            </li>
                                                        )}
                                                        {ganhoPosChanged && (
                                                            <li>
                                                                <span className="text-slate-400">ganho pós-venda:</span>{' '}
                                                                <span className="text-slate-500">{ch.ganhoPosFrom ? 'sim' : 'não'}</span>
                                                                {' → '}
                                                                <span className="font-medium text-emerald-700">{ch.ganhoPosTo ? 'sim' : 'não'}</span>
                                                                <span className="text-slate-400 italic"> (corrigido)</span>
                                                            </li>
                                                        )}
                                                        {ch.vendasAdicionadas.length > 0 && (
                                                            <li>
                                                                <span className="text-slate-400">números de venda:</span>{' '}
                                                                <span className="font-medium text-slate-700">+ {ch.vendasAdicionadas.join(', ')}</span>
                                                                <span className="text-slate-400 italic"> (no histórico)</span>
                                                            </li>
                                                        )}
                                                    </ul>
                                                )}
                                                {s.action === 'updated' && !hasAnyChange && (
                                                    <div className="ml-4 text-xs text-slate-400 italic">sem mudanças (já estava sincronizado)</div>
                                                )}
                                                {s.action === 'created' && (
                                                    <div className="ml-4 text-xs text-slate-600">
                                                        criado em <span className="font-medium">{ch.stageTo}</span> · vendas: {ch.vendasAdicionadas.join(', ') || '—'}
                                                    </div>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
