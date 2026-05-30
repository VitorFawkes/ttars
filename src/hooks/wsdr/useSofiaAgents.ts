import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const db = supabase as unknown as SupabaseClient

export interface WsdrAgent {
  slug: string
  display_name: string
  role_template: string
  active: boolean
}

// NFD decompõe acentos em base + marca combinante; remover tudo que não é a-z0-9
// já elimina as marcas e os espaços, então não precisamos do range combinante.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'agente'
}

export function useSofiaAgents() {
  const { org } = useOrg()
  const orgId = org?.id
  const [agents, setAgents] = useState<WsdrAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const refetch = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const { data } = await db
      .from('wsdr_agents')
      .select('slug, display_name, role_template, active')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    setAgents((data as WsdrAgent[]) || [])
    setLoading(false)
  }, [orgId])

  useEffect(() => { refetch() }, [refetch])

  const spawn = useCallback(async (displayName: string, templateSlug = 'sofia-weddings'): Promise<string | null> => {
    if (!orgId) return null
    setCreating(true)
    const newSlug = `${slugify(displayName)}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await db.rpc('wsdr_spawn_agent_from_template', {
      p_template_slug: templateSlug,
      p_new_slug: newSlug,
      p_display_name: displayName,
    })
    setCreating(false)
    if (error) {
      toast.error('Não consegui criar o agente', { description: error.message })
      return null
    }
    toast.success(`Agente "${displayName}" criado!`)
    await refetch()
    const slug = (data as { slug?: string } | null)?.slug ?? newSlug
    return slug
  }, [orgId, refetch])

  return { agents, loading, creating, spawn, refetch }
}
