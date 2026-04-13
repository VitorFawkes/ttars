/**
 * Parser de erros Supabase/PostgreSQL → mensagens amigáveis em PT-BR
 * Foco em erros de contato (unique constraints, FK violations, etc.)
 */

export interface ParsedSupabaseError {
    message: string
    field?: string
    isDuplicate: boolean
}

export function parseSupabaseContactError(error: unknown): ParsedSupabaseError {
    const raw = error as Record<string, unknown>
    const code = String(raw?.code || '')
    const message = String(raw?.message || raw?.msg || '')
    const details = String(raw?.details || '')

    // PostgreSQL 23505 = unique_violation
    if (code === '23505') {
        if (message.includes('cpf_normalizado')) {
            return {
                message: 'Já existe um contato com este CPF.',
                field: 'cpf',
                isDuplicate: true,
            }
        }

        if (message.includes('contato_meios') || message.includes('idx_contato_meios_unique')) {
            if (message.includes('telefone') || details.includes('telefone')) {
                return {
                    message: 'Este telefone já está cadastrado em outro contato.',
                    field: 'telefone',
                    isDuplicate: true,
                }
            }
            if (message.includes('email') || details.includes('email')) {
                return {
                    message: 'Este email já está cadastrado em outro contato.',
                    field: 'email',
                    isDuplicate: true,
                }
            }
            return {
                message: 'Este dado de contato já está cadastrado.',
                isDuplicate: true,
            }
        }

        // Generic unique violation
        return {
            message: 'Já existe um registro com estes dados. Verifique CPF, email ou telefone.',
            isDuplicate: true,
        }
    }

    // PostgreSQL 23503 = foreign_key_violation
    if (code === '23503') {
        return {
            message: 'Referência inválida. O registro vinculado não existe.',
            isDuplicate: false,
        }
    }

    // PostgreSQL 23514 = check_violation
    if (code === '23514') {
        return {
            message: 'Dados inválidos. Verifique os campos preenchidos.',
            isDuplicate: false,
        }
    }

    // PostgREST PGRST116 = "Cannot coerce the result to a single JSON object"
    // Acontece quando UPDATE/SELECT com .single() retorna 0 linhas.
    // Causa típica: RLS bloqueia a operação silenciosamente (contato pertence a outra org).
    if (code === 'PGRST116' || message.includes('Cannot coerce the result to a single JSON object')) {
        return {
            message: 'Não foi possível salvar este contato. Ele pode pertencer a outra organização ou ter sido removido. Atualize a página e tente novamente.',
            isDuplicate: false,
        }
    }

    // Fallback
    return {
        message: message || 'Erro desconhecido ao salvar contato.',
        isDuplicate: false,
    }
}
