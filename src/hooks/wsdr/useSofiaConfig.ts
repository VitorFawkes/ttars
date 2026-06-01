import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type SofiaConfigV2, defaultSofiaConfig, normalizeToV2 } from '@/components/wsdr/sofiaConfig'

// wsdr_agent_config é módulo novo isolado, fora dos tipos gerados.
const db = supabase as unknown as SupabaseClient

// Mescla os campos editados (v2) por cima da config BRUTA, preservando chaves v3
// que o editor v2 ainda não conhece (pricing, moments, referrals, voice.glossary,
// qualification.criteria, boundaries.comportamentos, capabilities.memory.*). Sem isso,
// salvar pela tela atual apagaria a config v3 gravada no banco.
function mergePreservandoV3(raw: Record<string, unknown> | null | undefined, next: SofiaConfigV2): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- merge tolerante a chaves v3 desconhecidas
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
  const n = next as unknown as Record<string, any>
  return {
    ...r,
    ...n,
    voice: { ...(r.voice || {}), ...(n.voice || {}) },
    qualification: { ...(r.qualification || {}), ...(n.qualification || {}) },
    boundaries: { ...(r.boundaries || {}), ...(n.boundaries || {}) },
    capabilities: {
      ...(r.capabilities || {}),
      ...(n.capabilities || {}),
      memory: { ...((r.capabilities || {}).memory || {}), ...((n.capabilities || {}).memory || {}) },
    },
  }
}

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useSofiaConfig(slug = 'sofia-weddings') {
  const { org } = useOrg()
  const orgId = org?.id
  const [config, setConfig] = useState<SofiaConfigV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState('')
  const rawRef = useRef<Record<string, unknown> | null>(null) // config bruta do banco (preserva v3)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!orgId) return
      setLoading(true)
      const { data, error: err } = await db
        .from('wsdr_agent_config')
        .select('config')
        .eq('slug', slug)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!alive) return
      if (err) {
        setError(err.message)
        rawRef.current = null
        setConfig(defaultSofiaConfig())
      } else {
        rawRef.current = (data?.config as Record<string, unknown>) ?? null
        setConfig(normalizeToV2(data?.config))
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, slug])

  const save = useCallback(async (next: SofiaConfigV2): Promise<boolean> => {
    if (!orgId) return false
    setStatus('saving')
    setError('')
    const configToSave = mergePreservandoV3(rawRef.current, next)
    const { error: err } = await db
      .from('wsdr_agent_config')
      .upsert({ org_id: orgId, slug, config: configToSave }, { onConflict: 'org_id,slug' })
    if (err) {
      setStatus('error')
      setError(err.message)
      toast.error('Erro ao salvar', { description: err.message })
      return false
    }
    rawRef.current = configToSave
    setStatus('success')
    toast.success('Configuração salva!')
    setTimeout(() => setStatus('idle'), 2500)
    return true
  }, [orgId, slug])

  return { config, setConfig, loading, status, error, save }
}
