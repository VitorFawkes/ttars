import { useState, useCallback, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

export type IssueType =
    | 'nome_duplicado'
    | 'nome_completo_no_nome'
    | 'nome_maiusculo'
    | 'nome_minusculo'
    | 'cpf_invalido'
    | 'nascimento_invalido'
    | 'sem_nascimento'

export interface QualityIssue {
    contact_id: string
    contact_nome: string | null
    contact_sobrenome: string | null
    contact_email: string | null
    contact_cpf: string | null
    contact_data_nascimento: string | null
    issue_type: IssueType
    issue_description: string
    confidence: 'high' | 'medium' | 'low'
    suggested_nome: string | null
    suggested_sobrenome: string | null
    suggested_data_nascimento: string | null
}

export interface QualityFix {
    contact_id: string
    nome?: string
    sobrenome?: string | null
    data_nascimento?: string
    clear_data_nascimento?: boolean
    clear_cpf?: boolean
}

export const ISSUE_META: Record<IssueType, { label: string; color: string }> = {
    nome_duplicado:        { label: 'Nome = Sobrenome',     color: 'red' },
    nome_completo_no_nome: { label: 'Sobrenome vazio',      color: 'amber' },
    nome_maiusculo:        { label: 'CAIXA ALTA',           color: 'orange' },
    nome_minusculo:        { label: 'tudo minúsculo',       color: 'orange' },
    cpf_invalido:          { label: 'CPF inválido',         color: 'red' },
    nascimento_invalido:   { label: 'Nascimento inválido',  color: 'red' },
    sem_nascimento:        { label: 'Sem nascimento',       color: 'slate' },
}

/** Constrói o payload de correção para um issue */
export function buildFixForIssue(i: QualityIssue): QualityFix {
    const fix: QualityFix = { contact_id: i.contact_id }

    // Correções de nome
    if (i.suggested_nome && i.suggested_nome !== i.contact_nome) {
        fix.nome = i.suggested_nome
    }
    if (i.suggested_sobrenome !== i.contact_sobrenome) {
        fix.sobrenome = i.suggested_sobrenome
    }

    // Correções de data
    if (i.issue_type === 'nascimento_invalido') {
        if (i.suggested_data_nascimento) {
            fix.data_nascimento = i.suggested_data_nascimento
        } else {
            fix.clear_data_nascimento = true
        }
    }

    // CPF inválido → limpar
    if (i.issue_type === 'cpf_invalido') {
        fix.clear_cpf = true
    }

    return fix
}

/** PostgREST max_rows = 1000 no Supabase */
const DETAIL_PAGE_SIZE = 1000

export function useContactQuality() {
    // Contagens por tipo (via RPC leve, sem limite de rows)
    const [counts, setCounts] = useState<Map<IssueType, number>>(new Map())
    const [isLoading, setIsLoading] = useState(false)

    // Detalhes carregados sob demanda por tipo
    const [typeDetails, setTypeDetails] = useState<QualityIssue[]>([])
    const [loadedType, setLoadedType] = useState<IssueType | null>(null)
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)

    const [isApplying, setIsApplying] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    const totalIssueCount = useMemo(() => {
        let total = 0
        counts.forEach(c => { total += c })
        return total
    }, [counts])

    const fixableIssueCount = useMemo(() => {
        let total = 0
        counts.forEach((c, type) => {
            if (type !== 'sem_nascimento') total += c
        })
        return total
    }, [counts])

    // Busca contagens por tipo (7 linhas, sem problema de max_rows)
    const runAudit = useCallback(async () => {
        setIsLoading(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('audit_contact_quality_counts')
            if (error) throw error
            const map = new Map<IssueType, number>()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const row of (data || []) as any[]) {
                map.set(row.issue_type as IssueType, Number(row.issue_count) || 0)
            }
            setCounts(map)
            setDismissed(false)
        } catch (err) {
            console.error('Quality audit counts failed:', err)
            toast.error('Erro ao auditar qualidade dos contatos')
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Busca detalhes de um tipo específico (até 1000 linhas por PostgREST)
    const fetchTypeDetails = useCallback(async (type: IssueType) => {
        setIsLoadingDetails(true)
        setLoadedType(type)
        setTypeDetails([])
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('audit_contact_quality', {
                p_issue_types: [type],
                p_limit: DETAIL_PAGE_SIZE
            })
            if (error) throw error
            setTypeDetails((data as QualityIssue[]) || [])
        } catch (err) {
            console.error(`Fetch details for ${type} failed:`, err)
            toast.error('Erro ao carregar detalhes')
        } finally {
            setIsLoadingDetails(false)
        }
    }, [])

    const applyFixes = useCallback(async (fixes: QualityFix[]) => {
        if (fixes.length === 0) return { fixed: 0, errors: 0 }
        setIsApplying(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('apply_contact_quality_fixes', {
                p_fixes: fixes
            })
            if (error) throw error
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = Array.isArray(data) ? data[0] : data
            const fixedCount: number = result?.fixed_count ?? 0
            const errorCount: number = result?.error_count ?? 0
            toast.success(`${fixedCount} contato${fixedCount !== 1 ? 's' : ''} corrigido${fixedCount !== 1 ? 's' : ''}`)

            // Refresh counts + detalhes do tipo atual
            await runAudit()
            if (loadedType) {
                await fetchTypeDetails(loadedType)
            }
            return { fixed: fixedCount, errors: errorCount }
        } catch (err) {
            console.error('Apply fixes failed:', err)
            toast.error('Erro ao aplicar correções')
            return { fixed: 0, errors: 1 }
        } finally {
            setIsApplying(false)
        }
    }, [runAudit, loadedType, fetchTypeDetails])

    const applyAllLoaded = useCallback(async () => {
        const fixes: QualityFix[] = typeDetails
            .filter(i => i.issue_type !== 'sem_nascimento')
            .map(i => buildFixForIssue(i))
        return applyFixes(fixes)
    }, [typeDetails, applyFixes])

    useEffect(() => { runAudit() }, [runAudit])

    return {
        counts,
        totalIssueCount,
        fixableIssueCount,
        isLoading,
        // Detalhes por tipo (lazy)
        typeDetails,
        loadedType,
        isLoadingDetails,
        fetchTypeDetails,
        // Ações
        isApplying,
        runAudit,
        applyFixes,
        applyAllLoaded,
        dismiss: () => setDismissed(true),
        isDismissed: dismissed,
    }
}
