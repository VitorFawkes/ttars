import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

export interface EmpresaPessoaMeio {
    id: string
    tipo: string
    valor: string
    is_principal: boolean | null
}

export interface EmpresaPessoa {
    id: string
    nome: string
    sobrenome: string | null
    cargo: string | null
    email: string | null
    telefone: string | null
    created_at: string | null
    meios: EmpresaPessoaMeio[]
}

export function useEmpresaPessoas(empresaId: string | null | undefined) {
    return useQuery<EmpresaPessoa[]>({
        queryKey: ['empresa-pessoas', empresaId],
        enabled: !!empresaId,
        staleTime: 30 * 1000,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSONB
            const { data, error } = await (supabase.rpc as any)('listar_pessoas_da_empresa', {
                p_empresa_id: empresaId,
            })
            if (error) throw error
            return (data ?? []) as EmpresaPessoa[]
        },
    })
}

interface CreatePessoaInput {
    empresa_id: string
    nome: string
    cargo?: string
    telefone?: string
    email?: string
}

export function useCriarPessoaDaEmpresa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreatePessoaInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('criar_pessoa_da_empresa', {
                p_empresa_id: input.empresa_id,
                p_nome: input.nome,
                p_cargo: input.cargo ?? null,
                p_telefone: input.telefone ?? null,
                p_email: input.email ?? null,
            })
            if (error) throw error
            return data as string
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['empresa-pessoas', vars.empresa_id] })
            toast.success('Pessoa adicionada à empresa.')
        },
        onError: (err: Error) => {
            toast.error('Erro ao adicionar pessoa: ' + (err.message || 'desconhecido'))
        },
    })
}

interface VincularInput {
    contato_id: string
    empresa_id: string
}

export function useVincularContatoEmpresa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: VincularInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('vincular_contato_a_empresa', {
                p_contato_id: input.contato_id,
                p_empresa_id: input.empresa_id,
            })
            if (error) throw error
            return data as { ok: boolean; cards_migrated: number }
        },
        onSuccess: (data, vars) => {
            qc.invalidateQueries({ queryKey: ['empresa-pessoas', vars.empresa_id] })
            qc.invalidateQueries({ queryKey: ['card-people'] })
            qc.invalidateQueries({ queryKey: ['cards'] })
            toast.success(
                data.cards_migrated > 0
                    ? `Vinculado! ${data.cards_migrated} ${data.cards_migrated === 1 ? 'atendimento migrou' : 'atendimentos migraram'} para a empresa.`
                    : 'Pessoa vinculada à empresa.'
            )
        },
        onError: (err: Error) => {
            toast.error('Erro ao vincular: ' + (err.message || 'desconhecido'))
        },
    })
}

interface UpdatePessoaInput {
    pessoa_id: string
    nome?: string
    cargo?: string | null
    email?: string | null
    empresa_id_para_invalidar: string
}

export function useUpdatePessoa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: UpdatePessoaInput) => {
            const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
            if (input.nome !== undefined) update.nome = input.nome
            if (input.cargo !== undefined) update.cargo = input.cargo
            if (input.email !== undefined) update.email = input.email
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('contatos') as any).update(update).eq('id', input.pessoa_id)
            if (error) throw error
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['empresa-pessoas', vars.empresa_id_para_invalidar] })
            toast.success('Pessoa atualizada.')
        },
        onError: (err: Error) => {
            toast.error('Erro ao atualizar pessoa: ' + (err.message || 'desconhecido'))
        },
    })
}

interface RemovePessoaInput {
    pessoa_id: string
    empresa_id: string
}

export function useDesvincularPessoa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: RemovePessoaInput) => {
            // Apenas remove o vínculo (não deleta o contato)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('contatos') as any)
                .update({ empresa_id: null, cargo: null, updated_at: new Date().toISOString() })
                .eq('id', input.pessoa_id)
            if (error) throw error
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['empresa-pessoas', vars.empresa_id] })
            toast.success('Pessoa desvinculada da empresa.')
        },
        onError: (err: Error) => {
            toast.error('Erro ao desvincular: ' + (err.message || 'desconhecido'))
        },
    })
}
