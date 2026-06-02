import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '../../contexts/AuthContext'
import { useOrg } from '../../contexts/OrgContext'
import { normalizePhone } from '../../utils/normalizePhone'
import { sbAny } from './_supabaseUntyped'
import { STATUS_RSVP_LIST } from './types'
import type { GuestInput, GuestUpdate, StatusRSVP } from './types'

const statusEnum = z.enum(STATUS_RSVP_LIST as [StatusRSVP, ...StatusRSVP[]])

const guestInputSchema = z.object({
  card_id: z.string().uuid('card_id inválido'),
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(200),
  sobrenome: z.string().trim().max(200).nullish(),
  telefone: z.string().trim().max(50).nullish(),
  email: z.string().trim().email('Email inválido').max(200).nullish().or(z.literal('')),
  observacoes: z.string().trim().max(2000).nullish(),
})

const guestUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  sobrenome: z.string().trim().max(200).nullish(),
  telefone: z.string().trim().max(50).nullish(),
  email: z.string().trim().email('Email inválido').max(200).nullish().or(z.literal('')),
  status_rsvp: statusEnum.optional(),
  observacoes: z.string().trim().max(2000).nullish(),
})

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['convidados'] })
}

function normalizeEmpty(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

/** Resolve a org onde o contato deve viver. Com sharing ligado, é a account pai. */
async function resolveContatoOrgId(currentOrgId: string): Promise<string> {
  const { data, error } = await sbAny
    .from('organizations')
    .select('id, parent_org_id, shares_contacts_with_children')
    .eq('id', currentOrgId)
    .single()
  if (error || !data) return currentOrgId
  // Se a org atual é workspace filho (parent_org_id setado) e a account pai
  // compartilha contatos, contatos vivem na account pai.
  if (data.parent_org_id) {
    const { data: parent } = await sbAny
      .from('organizations')
      .select('id, shares_contacts_with_children')
      .eq('id', data.parent_org_id)
      .single()
    if (parent?.shares_contacts_with_children) return parent.id as string
  }
  // Se a própria org é account (sem parent) e tem sharing, contatos vivem nela mesma.
  return data.id as string
}

interface FindOrCreateResult {
  contatoId: string
  wasCreated: boolean
}

/** Procura contato por email → telefone_normalizado → cria novo. Retorna o id.
 *  Obs: `telefone_normalizado` em `contatos` é coluna gerada — não escrevemos
 *  nela. O banco normaliza automaticamente a partir de `telefone`. */
async function findOrCreateContato(args: {
  accountOrgId: string
  nome: string
  sobrenome: string | null
  email: string | null
  telefoneNorm: string | null
  telefoneRaw: string | null
  createdBy: string | null
}): Promise<FindOrCreateResult> {
  const { accountOrgId, nome, sobrenome, email, telefoneNorm, telefoneRaw, createdBy } = args

  // 1) Por email (UNIQUE per-org)
  if (email) {
    const { data, error } = await sbAny
      .from('contatos')
      .select('id')
      .eq('org_id', accountOrgId)
      .eq('email', email)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return { contatoId: data.id as string, wasCreated: false }
  }

  // 2) Por telefone normalizado (coluna gerada — só leitura)
  if (telefoneNorm) {
    const { data, error } = await sbAny
      .from('contatos')
      .select('id')
      .eq('org_id', accountOrgId)
      .eq('telefone_normalizado', telefoneNorm)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return { contatoId: data.id as string, wasCreated: false }
  }

  // 3) Cria novo. Fallback de sobrenome para "—" porque o banco exige
  // sobrenome obrigatório (trigger check_contato_required_fields).
  const payload: Record<string, unknown> = {
    nome,
    sobrenome: sobrenome ?? '—',
    org_id: accountOrgId,
    email,
    telefone: telefoneRaw,
    created_by: createdBy,
    origem: 'convidados_casamento',
  }
  const { data, error } = await sbAny
    .from('contatos')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation — outra sessão criou com mesmo email; refaz busca
    if (error.code === '23505' && email) {
      const { data: existing } = await sbAny
        .from('contatos')
        .select('id')
        .eq('org_id', accountOrgId)
        .eq('email', email)
        .is('deleted_at', null)
        .maybeSingle()
      if (existing?.id) return { contatoId: existing.id as string, wasCreated: false }
    }
    throw error
  }
  return { contatoId: data.id as string, wasCreated: true }
}

export function useCreateGuest() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { org } = useOrg()

  return useMutation<void, Error, GuestInput>({
    mutationFn: async (input) => {
      const result = guestInputSchema.safeParse(input)
      if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? 'Dados inválidos')
      }
      const parsed = result.data
      if (!org?.id) throw new Error('Sem organização ativa')

      const email = normalizeEmpty(parsed.email ?? null)
      const telefoneRaw = normalizeEmpty(parsed.telefone ?? null)
      const telefoneNorm = normalizePhone(telefoneRaw)
      const sobrenome = normalizeEmpty(parsed.sobrenome ?? null)

      const accountOrgId = await resolveContatoOrgId(org.id)

      const { contatoId } = await findOrCreateContato({
        accountOrgId,
        nome: parsed.nome,
        sobrenome,
        email,
        telefoneNorm,
        telefoneRaw,
        createdBy: profile?.id ?? null,
      })

      // Não envia status_rsvp — banco aplica DEFAULT 'sem_reacao'.
      const { error } = await sbAny.from('wedding_guests').insert({
        card_id: parsed.card_id,
        contato_id: contatoId,
        observacoes: normalizeEmpty(parsed.observacoes ?? null),
        created_by: profile?.id ?? null,
      })

      if (error) {
        if (error.code === '23505') {
          throw new Error('Esse contato já está na lista de convidados deste casamento.')
        }
        throw error
      }
    },
    onSuccess: () => {
      invalidate(queryClient)
      toast.success('Convidado adicionado')
    },
    onError: (err) => {
      toast.error(`Não consegui adicionar: ${err.message}`)
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string; contatoId: string; patch: GuestUpdate }>({
    mutationFn: async ({ id, contatoId, patch }) => {
      const result = guestUpdateSchema.safeParse(patch)
      if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? 'Dados inválidos')
      }
      const parsed = result.data

      // Campos do CONTATO (telefone_normalizado é gerada — não escrever)
      const contatoPatch: Record<string, unknown> = {}
      if (parsed.nome !== undefined) contatoPatch.nome = parsed.nome
      if (parsed.sobrenome !== undefined) {
        contatoPatch.sobrenome = normalizeEmpty(parsed.sobrenome) ?? '—'
      }
      if (parsed.email !== undefined) {
        contatoPatch.email = normalizeEmpty(parsed.email)
      }
      if (parsed.telefone !== undefined) {
        contatoPatch.telefone = normalizeEmpty(parsed.telefone)
      }
      if (Object.keys(contatoPatch).length > 0) {
        const { error } = await sbAny.from('contatos').update(contatoPatch).eq('id', contatoId)
        if (error) throw error
      }

      // Campos do VÍNCULO
      const linkPatch: Record<string, unknown> = {}
      if (parsed.status_rsvp !== undefined) linkPatch.status_rsvp = parsed.status_rsvp
      if (parsed.observacoes !== undefined) linkPatch.observacoes = normalizeEmpty(parsed.observacoes)
      if (Object.keys(linkPatch).length > 0) {
        const { error } = await sbAny.from('wedding_guests').update(linkPatch).eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidate(queryClient)
      toast.success('Convidado atualizado')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar: ${err.message}`)
    },
  })
}

export function useDeleteGuest() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await sbAny.from('wedding_guests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(queryClient)
      toast.success('Convidado removido')
    },
    onError: (err) => {
      toast.error(`Não consegui remover: ${err.message}`)
    },
  })
}
