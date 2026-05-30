import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type SofiaConfigV2, defaultSofiaConfig, normalizeToV2 } from '@/components/wsdr/sofiaConfig'

// wsdr_agent_config é módulo novo isolado, fora dos tipos gerados.
const db = supabase as unknown as SupabaseClient

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useSofiaConfig(slug = 'sofia-weddings') {
  const { org } = useOrg()
  const orgId = org?.id
  const [config, setConfig] = useState<SofiaConfigV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState('')

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
        setConfig(defaultSofiaConfig())
      } else {
        setConfig(normalizeToV2(data?.config))
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, slug])

  const save = useCallback(async (next: SofiaConfigV2) => {
    if (!orgId) return
    setStatus('saving')
    setError('')
    const { error: err } = await db
      .from('wsdr_agent_config')
      .upsert({ org_id: orgId, slug, config: next }, { onConflict: 'org_id,slug' })
    if (err) {
      setStatus('error')
      setError(err.message)
      toast.error('Erro ao salvar', { description: err.message })
      return
    }
    setStatus('success')
    toast.success('Configuração salva!')
    setTimeout(() => setStatus('idle'), 2500)
  }, [orgId, slug])

  return { config, setConfig, loading, status, error, save }
}
