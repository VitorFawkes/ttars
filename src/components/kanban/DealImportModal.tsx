import React, { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, Check, Loader2, FileSpreadsheet, ExternalLink, X, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import type { Database } from '../../database.types'

type Product = Database['public']['Enums']['app_product']

interface DealImportModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    currentProduct: Product | 'ALL'
}

interface Mapping {
    [key: string]: string
}

const DEAL_FIELDS = [
    { key: 'titulo', label: 'Título da Venda', required: true },
    { key: 'valor', label: 'Valor Total (Faturamento)', required: false },
    { key: 'receita', label: 'Receita (Margem)', required: false },
    { key: 'email_contato', label: 'Email do Contato', required: false },
    { key: 'cpf', label: 'CPF', required: false },
    { key: 'telefone', label: 'Telefone/Celular', required: false },
    { key: 'nome_contato', label: 'Nome do Pagante', required: false },
    { key: 'data_fechamento', label: 'Data da Venda', required: false },
    { key: 'data_viagem_inicio', label: 'Data Início (uso produto)', required: false },
    { key: 'data_viagem_fim', label: 'Data Fim (uso produto)', required: false },
    { key: 'passageiros', label: 'Passageiros (vírgula)', required: false },
    { key: 'produtos', label: 'Produtos (vírgula)', required: false },
    { key: 'fornecedores', label: 'Fornecedores (vírgula)', required: false },
    { key: 'consultor', label: 'Consultora/Vendedor', required: false },
]

type RowData = Record<string, unknown>

/** Fix UTF-8 double-encoding (mojibake): "Ã¡" → "á", "Ã§" → "ç", etc. */
function fixMojibake(str: string): string {
    try {
        const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)))
        // If any codepoint > 255, can't be Latin-1 mojibake
        if ([...str].some(c => c.charCodeAt(0) > 255)) return str
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        return decoded !== str ? decoded : str
    } catch {
        return str
    }
}

export default function DealImportModal({ isOpen, onClose, onSuccess, currentProduct }: DealImportModalProps) {
    const { session } = useAuth()
    const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'results'>('upload')
    const [fileData, setFileData] = useState<RowData[]>([])
    const [headers, setHeaders] = useState<string[]>([])
    const [mapping, setMapping] = useState<Mapping>({})
    const [isImporting, setIsImporting] = useState(false)
    const [importResults, setImportResults] = useState<{ success: number; skipped: number; duplicates: number; errors: string[] }>({ success: 0, skipped: 0, duplicates: 0, errors: [] })
    const [importedCards, setImportedCards] = useState<{ id: string; titulo: string; valor: number }[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Progress tracking
    const [progress, setProgress] = useState({ current: 0, total: 0, startTime: 0 })
    const abortRef = useRef(false)

    // Resolve effective product (default to TRIPS if ALL)
    const effectiveProduct: Product = currentProduct === 'ALL' ? 'TRIPS' : currentProduct
    const currentUserId = session?.user?.id

    // Fetch Pipeline ID
    const { data: pipeline } = useQuery({
        queryKey: ['pipeline-for-product', effectiveProduct],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipelines')
                .select('id')
                .eq('produto', effectiveProduct)
                .eq('ativo', true)
                .single()
            return data
        },
        enabled: isOpen
    })

    // Fetch Stages - prioritize "Ganho" stage for won deals
    const { data: stages } = useQuery({
        queryKey: ['stages-for-pipeline', pipeline?.id],
        queryFn: async () => {
            if (!pipeline?.id) return []
            const { data } = await supabase
                .from('pipeline_stages')
                .select('id, nome')
                .eq('pipeline_id', pipeline.id)
                .eq('ativo', true)
                .order('ordem', { ascending: true })
            return data || []
        },
        enabled: !!pipeline?.id
    })

    // Find the "Viagem Concluída" stage for imported sales (already completed trips)
    const viagemConcluidaStage = stages?.find(s =>
        s.nome.toLowerCase().includes('conclu') ||
        s.nome.toLowerCase().includes('finalizada')
    ) || stages?.find(s =>
        s.nome.toLowerCase().includes('ganho') ||
        s.nome.toLowerCase().includes('confirmada')
    )

    const handleDownloadTemplate = () => {
        const template = [
            {
                'Titulo da Venda': 'Viagem Maceió - João Silva',
                'Valor Total (Faturamento)': 64918,
                'Receita (Margem)': 5747.44,
                'Email do Contato': 'cliente@email.com',
                'CPF': '12345678900',
                'Telefone': '41996717848',
                'Nome do Pagante': 'João Silva',
                'Data Venda': '2024-01-15',
                'Data Inicio Viagem': '2024-02-07',
                'Data Fim Viagem': '2024-02-11',
                'Passageiros': 'João Silva, Maria Silva',
                'Produtos': 'Diárias de Hospedagem, Transfer',
                'Fornecedores': 'Hotel Resort, Transfer Service',
                'Consultora/Vendedor': 'Ana Consultora',
            }
        ]
        const ws = XLSX.utils.json_to_sheet(template)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Modelo Importação Vendas')
        XLSX.writeFile(wb, 'modelo_importacao_vendas.xlsx')
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (evt) => {
            const arrayBuffer = evt.target?.result
            const wb = XLSX.read(arrayBuffer, { type: 'array', codepage: 65001 })
            const wsname = wb.SheetNames[0]
            const ws = wb.Sheets[wsname]
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

            if (rows.length === 0) {
                toast.error('O arquivo está vazio')
                return
            }

            const sheetHeaders = (rows[0] as unknown[]).map(h => fixMojibake(String(h || '').trim())).filter(h => h !== '')
            const rawData = XLSX.utils.sheet_to_json(ws) as RowData[]
            // Fix mojibake in all string values from Excel
            const parsedData = rawData.map(row => {
                const fixed: RowData = {}
                for (const [key, val] of Object.entries(row)) {
                    fixed[fixMojibake(key)] = typeof val === 'string' ? fixMojibake(val) : val
                }
                return fixed
            })

            setHeaders(sheetHeaders)
            setFileData(parsedData)

            // Auto-mapping with extra keyword aliases for common Brazilian headers
            const fieldAliases: Record<string, string[]> = {
                valor: ['valor', 'faturamento', 'valor total', 'total venda', 'valor venda', 'preco', 'preço', 'price', 'total'],
                receita: ['receita', 'margem', 'lucro', 'markup', 'comissão', 'comissao', 'profit'],
                titulo: ['titulo', 'título', 'nome venda', 'deal', 'venda'],
                email_contato: ['email', 'e-mail'],
                cpf: ['cpf', 'documento'],
                telefone: ['telefone', 'celular', 'phone', 'tel', 'whatsapp'],
                nome_contato: ['pagante', 'nome contato', 'nome cliente', 'cliente', 'comprador'],
                data_fechamento: ['data venda', 'data da venda', 'data fechamento', 'data do fechamento',
                                  'sale date', 'closing date', 'data pagamento', 'fechamento'],
                data_viagem_inicio: ['data inicio', 'data início', 'inicio viagem', 'início viagem',
                                     'check-in', 'checkin', 'ida', 'data saida', 'data saída',
                                     'embarque', 'partida', 'data embarque', 'departure'],
                data_viagem_fim: ['data fim', 'data final', 'fim viagem', 'check-out', 'checkout',
                                  'volta', 'retorno', 'data retorno', 'chegada', 'arrival'],
                passageiros: ['passageiro', 'viajante', 'pax', 'traveler'],
                produtos: ['produto', 'serviço', 'servico', 'item', 'product'],
                fornecedores: ['fornecedor', 'supplier', 'operador', 'operadora'],
                consultor: ['consultor', 'vendedor', 'assessor', 'responsavel', 'responsável'],
            }

            const initialMapping: Mapping = {}
            DEAL_FIELDS.forEach(field => {
                const match = sheetHeaders.find(h => {
                    const hl = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    const fl = field.label.toLowerCase()
                    const fk = field.key.toLowerCase()
                    // Exact match
                    if (hl === fl || hl === fk) return true
                    // Substring match
                    if (hl.includes(fl) || fl.includes(hl)) return true
                    if (fk.length > 3 && hl.includes(fk)) return true
                    // Alias keywords match
                    const aliases = fieldAliases[field.key] || []
                    return aliases.some(alias => hl.includes(alias))
                })
                if (match) initialMapping[field.key] = match
            })
            setMapping(initialMapping)
            setStep('mapping')
        }
        reader.readAsArrayBuffer(file)
    }

    // Parse Brazilian number formats: "R$ 64.918,00", "64.918,00", "5.747,44", "64918", etc.
    const parseBRNumber = (value: unknown): number => {
        if (value === null || value === undefined) return 0
        if (typeof value === 'number') return isNaN(value) ? 0 : value

        let str = String(value).trim()
        // Remove currency symbol and whitespace
        str = str.replace(/^R\$\s*/i, '').trim()
        if (!str) return 0

        const hasComma = str.includes(',')
        const hasDot = str.includes('.')

        if (hasComma && hasDot) {
            // Both: determine order to detect format
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                // Comma after dot → BR: "64.918,00" → remove dots, comma→dot
                str = str.replace(/\./g, '').replace(',', '.')
            } else {
                // Dot after comma → US: "64,918.00" → remove commas
                str = str.replace(/,/g, '')
            }
        } else if (hasComma) {
            // Only comma → BR decimal: "5747,44" → comma→dot
            str = str.replace(',', '.')
        }
        // Only dot or no separator → already valid for Number()

        const num = Number(str)
        return isNaN(num) ? 0 : num
    }

    const formatDateBR = (iso: string): string => {
        const [y, m, d] = iso.split('-')
        return `${d}/${m}/${y}`
    }

    const cleanPhone = (phone: unknown) => String(phone || '').replace(/\D/g, '')

    const splitName = (fullName: string) => {
        const parts = fullName.trim().split(/\s+/)
        if (parts.length <= 1) return { nome: parts[0] || '', sobrenome: '' }
        return { nome: parts[0], sobrenome: parts.slice(1).join(' ') }
    }

    const findContact = async (row: RowData) => {
        // Priority 1: Email
        const email = row['email_contato'] ? String(row['email_contato']).trim() : null
        if (email) {
            const { data } = await supabase.from('contatos').select('id').ilike('email', email).maybeSingle()
            if (data) return data.id
        }

        // Priority 2: CPF
        const cpfRaw = row['cpf'] ? String(row['cpf']).replace(/\D/g, '') : null
        if (cpfRaw && cpfRaw.length >= 11) {
            const { data } = await supabase.from('contatos').select('id').eq('cpf', cpfRaw).maybeSingle()
            if (data) return data.id
        }

        // Priority 3: Phone (Last 8 digits)
        const phoneRaw = cleanPhone(row['telefone'])
        if (phoneRaw && phoneRaw.length >= 8) {
            const { data: dataTel } = await supabase.from('contatos').select('id').ilike('telefone', `%${phoneRaw.slice(-8)}`).limit(1)
            if (dataTel && dataTel.length > 0) return dataTel[0].id
        }

        // Priority 4: Name (busca nome e sobrenome)
        const name = row['nome_contato'] ? String(row['nome_contato']).trim() : null
        if (name) {
            const { data } = await supabase.from('contatos').select('id')
                .or(`nome.ilike.%${name}%,sobrenome.ilike.%${name}%`)
                .limit(1)
            if (data && data.length > 0) return data[0].id
        }

        return null
    }

    const findOrCreateContact = async (row: RowData): Promise<string | null> => {
        const existingId = await findContact(row)
        if (existingId) return existingId

        // Create new contact from available data
        const name = row['nome_contato'] ? String(row['nome_contato']).trim() : null
        if (!name) return null

        const { nome, sobrenome } = splitName(name)
        const cpfRaw = row['cpf'] ? String(row['cpf']).replace(/\D/g, '') : null
        const email = row['email_contato'] ? String(row['email_contato']).trim() : null
        const telefone = cleanPhone(row['telefone']) || null

        const { data, error } = await supabase.from('contatos').insert({
            nome,
            sobrenome: sobrenome || null,
            cpf: cpfRaw && cpfRaw.length >= 11 ? cpfRaw : null,
            email,
            telefone,
        }).select('id').single()

        if (error) {
            console.error('Erro ao criar contato:', error)
            return null
        }
        return data.id
    }

    const findOrCreatePassenger = async (fullName: string): Promise<string | null> => {
        const trimmed = fullName.trim()
        if (!trimmed) return null

        // Try to find by name
        const { nome, sobrenome } = splitName(trimmed)
        const { data: existing } = await supabase
            .from('contatos')
            .select('id')
            .ilike('nome', nome)
            .ilike('sobrenome', sobrenome || '')
            .limit(1)
        if (existing && existing.length > 0) return existing[0].id

        // Create with just name
        const { data, error } = await supabase.from('contatos').insert({
            nome,
            sobrenome: sobrenome || null,
        }).select('id').single()

        if (error) {
            console.error('Erro ao criar passageiro:', error)
            return null
        }
        return data.id
    }

    const resolveConsultor = async (consultorName: string | null): Promise<string | null> => {
        if (!consultorName) return null
        const trimmed = String(consultorName).trim()
        if (!trimmed) return null

        // 1. Try exact substring match (handles "Daniele Adamo" → "Daniele Adamo")
        const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('active', true)
            .or(`nome.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
            .limit(1)
        if (data && data.length > 0) return data[0].id

        // 2. Fallback: match ALL words individually (handles "Tiago Abdul" → "Tiago de Mello Abdul Hak")
        const words = trimmed.split(/\s+/).filter(w => w.length >= 3)
        if (words.length >= 2) {
            let query = supabase.from('profiles').select('id').eq('active', true)
            for (const word of words) {
                query = query.ilike('nome', `%${word}%`)
            }
            const { data: wordMatch } = await query.limit(1)
            if (wordMatch && wordMatch.length > 0) return wordMatch[0].id
        }

        return null
    }

    // Helpers para chunked processing
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    const excelDateToISO = (serial: unknown): string | null => {
        if (!serial) return null
        if (typeof serial === 'string') {
            const brMatch = serial.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
            if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`
            if (/^\d{4}-\d{2}-\d{2}/.test(serial)) return serial.slice(0, 10)
            return serial
        }
        const serialNum = Number(serial)
        if (!isNaN(serialNum)) {
            const date = new Date((serialNum - 25569) * 86400 * 1000)
            return date.toISOString().split('T')[0]
        }
        return null
    }

    // Detecção de duplicatas: checa se card já existe com mesma chave composta
    const checkDuplicate = useCallback(async (titulo: string, pessoaPrincipalId: string, dataFechamento: string | null): Promise<boolean> => {
        let query = supabase.from('cards').select('id', { count: 'exact', head: true })
            .eq('titulo', titulo)
            .eq('pessoa_principal_id', pessoaPrincipalId)
        if (dataFechamento) {
            query = query.eq('data_fechamento', dataFechamento)
        }
        const { count } = await query
        return (count ?? 0) > 0
    }, [])

    const handleImport = async () => {
        if (!pipeline) {
            toast.error('Pipeline não encontrado.')
            return
        }

        const requiredMissing = DEAL_FIELDS.filter(f => f.required && !mapping[f.key])
        if (requiredMissing.length > 0) {
            toast.error(`Mapeamento obrigatório ausente: ${requiredMissing.map(f => f.label).join(', ')}`)
            return
        }

        setIsImporting(true)
        setStep('importing')
        setImportedCards([])
        abortRef.current = false

        const batchId = `import-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
        let successCount = 0
        let skippedCount = 0
        let duplicateCount = 0
        const errors: string[] = []
        const recentCards: { id: string; titulo: string; valor: number }[] = []
        const MAX_RECENT_CARDS = 50
        const MAX_ERRORS = 200
        const CHUNK_SIZE = 25
        const CHUNK_DELAY = 500
        const ROW_DELAY_INTERVAL = 5
        const ROW_DELAY = 50

        const startTime = Date.now()
        setProgress({ current: 0, total: fileData.length, startTime })

        // Cache de consultores para evitar queries repetidas
        const consultorCache = new Map<string, string | null>()
        const cachedResolveConsultor = async (name: string | null): Promise<string | null> => {
            if (!name) return null
            const trimmed = String(name).trim()
            if (!trimmed) return null
            if (consultorCache.has(trimmed)) return consultorCache.get(trimmed)!
            const result = await resolveConsultor(trimmed)
            consultorCache.set(trimmed, result)
            return result
        }

        const showPartialResults = () => {
            setImportResults({ success: successCount, skipped: skippedCount, duplicates: duplicateCount, errors: errors.slice(0, MAX_ERRORS) })
            setImportedCards([...recentCards])
            setStep('results')
        }

        try {
            for (let i = 0; i < fileData.length; i++) {
                // Check abort
                if (abortRef.current) {
                    errors.push(`Importação cancelada pelo usuário na linha ${i + 2}`)
                    break
                }

                // Inter-chunk delay
                if (i > 0 && i % CHUNK_SIZE === 0) {
                    await sleep(CHUNK_DELAY)
                }
                // Intra-chunk micro-delay
                if (i > 0 && i % ROW_DELAY_INTERVAL === 0) {
                    await sleep(ROW_DELAY)
                }

                setProgress({ current: i + 1, total: fileData.length, startTime })

                const rawRow = fileData[i]
                const row: RowData = {}
                Object.keys(mapping).forEach(key => {
                    row[key] = rawRow[mapping[key]]
                })

                try {
                    // 1. Resolve Contact
                    const contactId = await findOrCreateContact(row)

                    if (!contactId) {
                        skippedCount++
                        if (errors.length < MAX_ERRORS) {
                            errors.push(`Linha ${i + 2}: Sem dados suficientes para criar contato (Nome: ${row['nome_contato']})`)
                        }
                        continue
                    }

                    // 2. Parse dates and values
                    const dataFechamento = excelDateToISO(row['data_fechamento'])
                    const titulo = String(row['titulo'] || '')

                    // 3. Check duplicate — skip silenciosamente se já existe
                    const isDuplicate = await checkDuplicate(titulo, contactId, dataFechamento)
                    if (isDuplicate) {
                        duplicateCount++
                        continue
                    }

                    // 4. Resolve Stage & Consultor
                    const stageId = viagemConcluidaStage?.id || stages?.[0]?.id || null
                    const consultorId = await cachedResolveConsultor(row['consultor'] as string | null)

                    const valorTotal = parseBRNumber(row['valor'])
                    const receita = parseBRNumber(row['receita'])
                    const dataInicio = excelDateToISO(row['data_viagem_inicio'])
                    const dataFim = excelDateToISO(row['data_viagem_fim'])

                    const epocaViagem = dataInicio ? {
                        tipo: 'data_exata',
                        data_inicio: dataInicio,
                        data_fim: dataFim || dataInicio,
                        ano: parseInt(dataInicio.split('-')[0]),
                        display: dataFim && dataFim !== dataInicio
                            ? `${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`
                            : formatDateBR(dataInicio),
                        flexivel: false
                    } : { tipo: 'indefinido', display: 'A definir' }

                    // 5. Create Card
                    const cardData: Record<string, unknown> = {
                        titulo,
                        pessoa_principal_id: contactId,
                        pipeline_id: pipeline.id,
                        pipeline_stage_id: stageId,
                        produto: effectiveProduct,
                        valor_estimado: valorTotal,
                        valor_final: valorTotal,
                        receita,
                        receita_source: 'manual',
                        data_fechamento: dataFechamento || new Date().toISOString().split('T')[0],
                        data_viagem_inicio: dataInicio,
                        data_viagem_fim: dataFim,
                        epoca_tipo: epocaViagem.tipo,
                        ganho_planner: true,
                        ganho_planner_at: dataFechamento || new Date().toISOString(),
                        produto_data: { epoca_viagem: epocaViagem },
                        origem: 'manual',
                        status_comercial: 'ganho',
                        estado_operacional: 'finalizado',
                        moeda: 'BRL',
                        dono_atual_id: consultorId || currentUserId,
                        vendas_owner_id: consultorId || null,
                        briefing_inicial: {
                            importado_em: new Date().toISOString(),
                            lote_importacao: batchId,
                            produtos: row['produtos'] || null,
                            fornecedores: row['fornecedores'] || null,
                        }
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: insertedCard, error } = await supabase.from('cards').insert(cardData as any).select('id').single()

                    if (error || !insertedCard) {
                        console.error('Erro Supabase (Insert Card):', error)
                        throw error || new Error('Card insert retornou null')
                    }

                    const cardId = insertedCard.id

                    // 6. Link titular
                    await supabase.from('cards_contatos').insert({
                        card_id: cardId,
                        contato_id: contactId,
                        tipo_viajante: 'titular',
                    })

                    // 7. Link passengers
                    if (row['passageiros']) {
                        const paganteName = row['nome_contato'] ? String(row['nome_contato']).trim().toLowerCase() : ''
                        const passengers = String(row['passageiros']).split(',').map((p: string) => p.trim()).filter(Boolean)

                        for (const passengerName of passengers) {
                            if (passengerName.toLowerCase() === paganteName) continue
                            const passengerId = await findOrCreatePassenger(passengerName)
                            if (passengerId) {
                                await supabase.from('cards_contatos').insert({
                                    card_id: cardId,
                                    contato_id: passengerId,
                                    tipo_viajante: 'acompanhante',
                                })
                            }
                        }
                    }

                    // 8. Financial item + recalculate
                    if (valorTotal > 0) {
                        const supplierCost = valorTotal - receita
                        await supabase.from('card_financial_items').insert({
                            card_id: cardId,
                            product_type: 'custom',
                            description: String(row['produtos'] || 'Importação histórica'),
                            sale_value: valorTotal,
                            supplier_cost: supplierCost > 0 ? supplierCost : 0,
                        })
                        await supabase.rpc('recalcular_financeiro_manual', { p_card_id: cardId })
                    }

                    // Sliding window de cards recentes (memória)
                    recentCards.push({ id: cardId, titulo, valor: valorTotal })
                    if (recentCards.length > MAX_RECENT_CARDS) recentCards.shift()
                    successCount++

                } catch (err: unknown) {
                    skippedCount++
                    if (errors.length < MAX_ERRORS) {
                        const e = err as Record<string, string>
                        const errorMsg = e.details || e.message || JSON.stringify(err)
                        errors.push(`Linha ${i + 2}: Erro ao criar venda - ${errorMsg}`)
                    }
                }
            }

            showPartialResults()

        } catch (error: unknown) {
            console.error('Import fatal error:', error)
            // Mostrar resultados parciais em vez de perder tudo
            if (successCount > 0) {
                errors.push(`ERRO FATAL: ${error instanceof Error ? error.message : String(error)}`)
                showPartialResults()
            } else {
                toast.error(`Erro fatal na importação: ${error instanceof Error ? error.message : String(error)}`)
                setStep('mapping')
            }
        } finally {
            setIsImporting(false)
            abortRef.current = false
        }
    }

    const reset = () => {
        setStep('upload')
        setFileData([])
        setHeaders([])
        setMapping({})
        setImportedCards([])
        setProgress({ current: 0, total: 0, startTime: 0 })
        abortRef.current = false
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/90 backdrop-blur-md border border-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold text-slate-900">Importar Vendas (Excel)</DialogTitle>
                    <DialogDescription>
                        Importe vendas históricas com contatos, passageiros e dados financeiros.
                        <br />
                        <span className="text-emerald-600 font-medium text-xs">
                            Contatos não encontrados serão criados automaticamente. Passageiros serão vinculados à viagem.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4">
                    {step === 'upload' && (
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 transition-colors hover:bg-slate-50">
                            <Upload className="h-12 w-12 text-slate-400 mb-4" />
                            <h3 className="text-lg font-medium text-slate-900 mb-2">Selecione seu arquivo</h3>
                            <div className="flex gap-4 mt-4">
                                <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                                    <Download className="h-4 w-4" /> Modelo
                                </Button>
                                <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                                    <FileSpreadsheet className="h-4 w-4" /> Escolher Arquivo
                                </Button>
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                        </div>
                    )}

                    {step === 'mapping' && (
                        <div className="space-y-6">
                            <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-slate-50 border-b">
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-slate-700">Campo Sistema</th>
                                            <th className="text-left py-2 px-3 font-semibold text-slate-700">Coluna Excel</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {DEAL_FIELDS.map(field => (
                                            <tr key={field.key}>
                                                <td className="py-3 px-3">
                                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <select
                                                        value={mapping[field.key] || ''}
                                                        onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                                                        className="w-full h-9 px-2 bg-white border border-slate-200 rounded text-sm"
                                                    >
                                                        <option value="">Ignorar</option>
                                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {fileData.length > 0 && (
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                    <h4 className="text-xs font-medium text-slate-500 mb-2">Preview da linha 1</h4>
                                    {DEAL_FIELDS.map(field => {
                                        const header = mapping[field.key]
                                        const value = header ? fileData[0][header] : null
                                        const isEmpty = !value && value !== 0
                                        const isNumeric = field.key === 'valor' || field.key === 'receita'
                                        const parsedNum = isNumeric && !isEmpty ? parseBRNumber(value) : null
                                        return (
                                            <div key={field.key} className="flex justify-between text-sm py-0.5">
                                                <span className="text-slate-600">{field.label}</span>
                                                <span className={isEmpty ? 'text-red-400 italic text-xs' : 'text-slate-900 font-medium'}>
                                                    {isEmpty ? '(vazio)' : isNumeric && parsedNum !== null
                                                        ? `${parsedNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (raw: ${String(value)})`
                                                        : String(value)}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            <div className="flex justify-between pt-4">
                                <Button variant="ghost" onClick={reset}>Voltar</Button>
                                <Button onClick={handleImport} disabled={isImporting}>
                                    {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                                    Importar {fileData.length} linhas
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />

                            {/* Counter */}
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {progress.current} <span className="text-slate-400 font-normal text-lg">/ {progress.total}</span>
                                </p>
                                <p className="text-sm text-slate-500 mt-1">Processando vendas e contatos...</p>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full max-w-md">
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-300"
                                        style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2 text-xs text-slate-400">
                                    <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
                                    <span>
                                        {(() => {
                                            if (progress.current < 5 || !progress.startTime) return 'Calculando...'
                                            const elapsed = (Date.now() - progress.startTime) / 1000
                                            const perRow = elapsed / progress.current
                                            const remaining = perRow * (progress.total - progress.current)
                                            if (remaining < 60) return `~${Math.ceil(remaining)}s restantes`
                                            return `~${Math.ceil(remaining / 60)}min restantes`
                                        })()}
                                    </span>
                                </div>
                            </div>

                            {/* Cancel Button */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { abortRef.current = true }}
                                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                            >
                                <X className="h-4 w-4" />
                                Cancelar Importação
                            </Button>
                        </div>
                    )}

                    {step === 'results' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-4 bg-green-50 border border-green-100 rounded-lg text-center">
                                    <div className="text-2xl font-bold text-green-600">{importResults.success}</div>
                                    <div className="text-sm text-green-800">Importados</div>
                                </div>
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-center">
                                    <div className="text-2xl font-bold text-blue-600">{importResults.duplicates}</div>
                                    <div className="text-sm text-blue-800">Duplicatas (pulos)</div>
                                </div>
                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-center">
                                    <div className="text-2xl font-bold text-amber-600">{importResults.skipped}</div>
                                    <div className="text-sm text-amber-800">Erros</div>
                                </div>
                            </div>

                            {importResults.errors.some(e => e.includes('ERRO FATAL') || e.includes('cancelada')) && (
                                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    <span>Importação interrompida. Os cards acima foram importados com sucesso antes da interrupção.</span>
                                </div>
                            )}

                            {importedCards.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-700 mb-2">Cards importados</h4>
                                    <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        {importedCards.map((card) => (
                                            <a
                                                key={card.id}
                                                href={`/cards/${card.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors group"
                                            >
                                                <span className="text-sm text-slate-700 truncate">{card.titulo}</span>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {card.valor > 0 && (
                                                        <span className="text-xs text-slate-500">
                                                            {card.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                    )}
                                                    <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-indigo-500" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {importResults.errors.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-red-700 mb-2">Erros</h4>
                                    <div className="max-h-[150px] overflow-y-auto p-3 bg-red-50 border border-red-100 rounded text-xs font-mono text-red-700">
                                        {importResults.errors.map((err, i) => <div key={i}>{err}</div>)}
                                    </div>
                                </div>
                            )}

                            <Button onClick={() => { onSuccess(); onClose() }} className="w-full">Concluir</Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
