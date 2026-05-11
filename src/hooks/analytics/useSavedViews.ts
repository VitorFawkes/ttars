import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// TODO: remover cast quando `npx supabase gen types` rodar com as RPCs da migration 20260425f em prod
const rpc = (supabase.rpc as unknown) as (fn: string, args?: unknown) => ReturnType<typeof supabase.rpc>

export interface SavedView {
  id: string
  name: string
  description?: string
  query_spec: {
    measure: string
    group_by: string
    cross_with?: string | null
    filters?: Record<string, unknown>
    from: string
    to: string
  }
  viz: 'table' | 'bar' | 'line' | 'heatmap'
  created_at: string
  updated_at: string
}

interface UseSavedViewsResult {
  views: SavedView[]
  loading: boolean
  error: string | null
  save: (
    name: string,
    querySpec: SavedView['query_spec'],
    viz: string,
    description?: string
  ) => Promise<boolean>
  delete: (id: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useSavedViews(): UseSavedViewsResult {
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchViews = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await rpc('list_analytics_views')
      if (err) {
        setError(err.message)
        return
      }
      setViews(((data as unknown) as SavedView[]) ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const save = async (
    name: string,
    querySpec: SavedView['query_spec'],
    viz: string,
    description?: string
  ): Promise<boolean> => {
    try {
      const { error: err } = await rpc('save_analytics_view', {
        p_name: name,
        p_query_spec: querySpec,
        p_viz: viz,
        p_description: description ?? null,
      })
      if (err) {
        setError(err.message)
        return false
      }
      await fetchViews()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const deleteView = async (id: string): Promise<boolean> => {
    try {
      const { error: err } = await rpc('delete_analytics_view', {
        p_id: id,
      })
      if (err) {
        setError(err.message)
        return false
      }
      await fetchViews()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  useEffect(() => {
    fetchViews()
  }, [])

  return {
    views,
    loading,
    error,
    save,
    delete: deleteView,
    refetch: fetchViews,
  }
}
