import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// database.types.ts é gerado da produção; as migrations platform_admin
// ainda não foram promovidas. Este alias evita cast inline em cada chamada.
// Limpar (regenerar types) após promover para produção em Fase 6.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface PlatformStats {
  orgs_total: number
  orgs_active: number
  orgs_suspended: number
  orgs_archived: number
  orgs_new_30d: number
  workspaces_total: number
  users_total: number
  users_active_30d: number
  cards_total: number
  cards_open: number
  cards_new_30d: number
}

export interface PlatformOrg {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived'
  active: boolean
  created_at: string
  suspended_at: string | null
  suspended_reason: string | null
  logo_url: string | null
  workspace_count: number
  user_count: number
  card_count: number
  open_card_count: number
  last_activity: string | null
}

export interface PlatformWorkspace {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived'
  created_at: string
  user_count: number
  card_count: number
  open_card_count: number
}

export interface PlatformOrgDetail {
  organization: PlatformOrg & Record<string, unknown>
  parent: (PlatformOrg & Record<string, unknown>) | null
  workspaces: PlatformWorkspace[]
  stats: {
    users: number
    cards_total: number
    cards_open: number
    cards_won: number
    cards_lost: number
    last_card_activity: string | null
  }
  admins: Array<{
    id: string
    email: string
    nome: string | null
    org_id: string
    is_platform_admin: boolean
  }>
  products: Array<{
    id: string
    name: string
    slug: string
    pipeline_id: string | null
    org_id: string
  }>
  recent_audit: PlatformAuditEntry[]
}

export interface PlatformAuditEntry {
  id: string
  actor_id: string
  actor_email?: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export function usePlatformStats() {
  const [data, setData] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: rpcData, error: rpcError } = await db.rpc('platform_get_stats')
      if (rpcError) throw rpcError
      setData(rpcData as PlatformStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function usePlatformOrgs() {
  const [orgs, setOrgs] = useState<PlatformOrg[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await db.rpc('platform_list_organizations')
      if (rpcError) throw rpcError
      setOrgs((data ?? []) as PlatformOrg[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar organizações')
    } finally {
      setLoading(false)
    }
  }, [])

  const suspend = useCallback(async (orgId: string, reason: string | null) => {
    const { error: rpcError } = await db.rpc('platform_suspend_organization', {
      p_org_id: orgId,
      p_reason: reason,
    })
    if (rpcError) throw rpcError
    await fetch()
  }, [fetch])

  const resume = useCallback(async (orgId: string) => {
    const { error: rpcError } = await db.rpc('platform_resume_organization', {
      p_org_id: orgId,
    })
    if (rpcError) throw rpcError
    await fetch()
  }, [fetch])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { orgs, loading, error, refetch: fetch, suspend, resume }
}


export function usePlatformAuditLog(limit = 50) {
  const [entries, setEntries] = useState<PlatformAuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: qError } = await db
        .from('platform_audit_log')
        .select('id, actor_id, action, target_type, target_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (qError) throw qError

      const rawEntries = (data ?? []) as Array<PlatformAuditEntry>
      const actorIds = Array.from(new Set(rawEntries.map((e) => e.actor_id)))
      const { data: actors } = await db
        .from('profiles')
        .select('id, email')
        .in('id', actorIds)

      const emailByActor = new Map<string, string>()
      for (const a of (actors ?? []) as Array<{ id: string; email: string | null }>) {
        if (a.email) emailByActor.set(a.id, a.email)
      }

      setEntries(
        rawEntries.map((e) => ({
          ...e,
          actor_email: emailByActor.get(e.actor_id) ?? null,
          metadata: (e.metadata ?? {}) as Record<string, unknown>,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar audit log')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { entries, loading, error, refetch: fetch }
}

export interface PlatformUser {
  id: string
  email: string
  nome: string | null
  org_id: string
  org_name?: string
  active_org_id?: string
  active_org_name?: string
  is_admin: boolean
  is_platform_admin: boolean
  created_at: string
  updated_at: string
}

export function usePlatformUsers(search: string) {
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = db
        .from('profiles')
        .select('id, email, nome, org_id, active_org_id, is_admin, is_platform_admin, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100)

      if (search.trim()) {
        const s = `%${search.trim()}%`
        query = query.or(`email.ilike.${s},nome.ilike.${s}`)
      }

      const { data, error: qError } = await query
      if (qError) throw qError

      const rawUsers = (data ?? []) as Array<PlatformUser>
      const orgIds = Array.from(
        new Set([
          ...rawUsers.map((u) => u.org_id),
          ...rawUsers.map((u) => u.active_org_id).filter((id) => id),
        ])
      )
      const { data: orgs } = await db
        .from('organizations')
        .select('id, name')
        .in('id', orgIds)

      const nameByOrg = new Map<string, string>()
      for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) {
        nameByOrg.set(o.id, o.name)
      }

      setUsers(
        rawUsers.map((u) => ({
          ...u,
          org_name: nameByOrg.get(u.org_id) ?? '—',
          active_org_name: u.active_org_id ? nameByOrg.get(u.active_org_id) : undefined,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [search])

  const setPlatformAdmin = useCallback(async (userId: string, isAdmin: boolean) => {
    const { error: rpcError } = await db.rpc('platform_set_admin', {
      p_user_id: userId,
      p_is_admin: isAdmin,
    })
    if (rpcError) throw rpcError
    await fetch()
  }, [fetch])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { users, loading, error, refetch: fetch, setPlatformAdmin }
}

export interface AddWorkspaceInput {
  name: string
  slug: string
  adminEmail: string
  template: 'generic_3phase' | 'simple_2phase'
  productName: string
  productSlug: string
}

export interface InviteAdminInput {
  email: string
  role: 'admin' | 'sales' | 'support'
}

export function usePlatformOrgDetail(orgId: string | null) {
  const [detail, setDetail] = useState<PlatformOrgDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orgId) {
      setDetail(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await db.rpc('platform_get_organization', {
        p_org_id: orgId,
      })
      if (rpcError) throw rpcError
      setDetail(data as PlatformOrgDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhe da org')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const addWorkspace = useCallback(
    async (input: AddWorkspaceInput) => {
      if (!orgId) throw new Error('Organization ID not set')

      const { error: rpcError } = await db.rpc('provision_workspace', {
        p_tenant_id: orgId,
        p_name: input.name,
        p_slug: input.slug,
        p_admin_email: input.adminEmail,
        p_template: input.template,
        p_product_name: input.productName,
        p_product_slug: input.productSlug,
      })

      if (rpcError) throw rpcError
      await fetch()
    },
    [orgId, fetch]
  )

  const inviteAdmin = useCallback(
    async (input: InviteAdminInput) => {
      if (!orgId) throw new Error('Organization ID not set')

      const { error: rpcError } = await db.rpc('platform_invite_admin', {
        p_org_id: orgId,
        p_email: input.email,
        p_role: input.role,
      })

      if (rpcError) throw rpcError
      await fetch()
    },
    [orgId, fetch]
  )

  useEffect(() => {
    fetch()
  }, [fetch])

  return { detail, loading, error, refetch: fetch, addWorkspace, inviteAdmin }
}
