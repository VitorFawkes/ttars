import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface Participant {
  id: string
  viagem_id: string
  nome: string
  relacao: string | null
}

const COOKIE_PREFIX = 'wc_trip_participant_'

function cookieKey(viagemId: string) {
  return `${COOKIE_PREFIX}${viagemId}`
}

function writeLocalParticipant(p: Participant) {
  try {
    localStorage.setItem(cookieKey(p.viagem_id), JSON.stringify(p))
  } catch {
    // noop
  }
}

function readLocalParticipant(viagemId: string): Participant | null {
  try {
    const raw = localStorage.getItem(cookieKey(viagemId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Participant
    if (parsed && parsed.id && parsed.viagem_id === viagemId) return parsed
    return null
  } catch {
    return null
  }
}

export function clearParticipant(viagemId: string) {
  try {
    localStorage.removeItem(cookieKey(viagemId))
  } catch {
    // noop
  }
}

interface IdentifyInput {
  token: string
  nome: string
  email?: string | null
  telefone?: string | null
  relacao?: string | null
}

/**
 * Cache-first: lê do localStorage uma vez na montagem.
 * Depois de identificar, guarda em localStorage e atualiza o state.
 * Se navegar entre viagens diferentes, o componente pai deve re-montar
 * esta hook (key prop) ou chamar refresh() após troca.
 */
export function useParticipant(viagemId: string | null | undefined) {
  const [participant, setParticipant] = useState<Participant | null>(() =>
    viagemId ? readLocalParticipant(viagemId) : null,
  )
  const ready = true

  const identify = useCallback(async (input: IdentifyInput) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('identificar_participante', {
      p_token: input.token,
      p_nome: input.nome,
      p_email: input.email ?? null,
      p_telefone: input.telefone ?? null,
      p_relacao: input.relacao ?? null,
    })
    if (error) throw error
    const result = data as { participant_id: string; nome: string; relacao: string | null }
    if (!viagemId) return null
    const p: Participant = {
      id: result.participant_id,
      viagem_id: viagemId,
      nome: result.nome,
      relacao: result.relacao,
    }
    writeLocalParticipant(p)
    setParticipant(p)
    return p
  }, [viagemId])

  const reset = useCallback(() => {
    if (viagemId) clearParticipant(viagemId)
    setParticipant(null)
  }, [viagemId])

  /** Releitura do localStorage; útil quando outro componente (ex: gate)
   * persistiu um participante novo. */
  const refresh = useCallback(() => {
    if (!viagemId) return
    setParticipant(readLocalParticipant(viagemId))
  }, [viagemId])

  return {
    participant,
    ready,
    identify,
    reset,
    refresh,
  }
}
