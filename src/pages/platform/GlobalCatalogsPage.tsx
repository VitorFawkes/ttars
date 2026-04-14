import { useCallback, useEffect, useState } from 'react'
import { Library, Loader2, Plus, Trash2, Save, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../contexts/ToastContext'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface ActivityCategory {
  key: string
  label: string
  scope: string | null
  visible: boolean
  ordem: number | null
  created_at: string
}

interface CatalogCounts {
  activity_categories: number
  integration_field_catalog: number
  integration_provider_catalog: number
  integration_health_rules: number
  system_fields: number
}

export default function GlobalCatalogsPage() {
  const [counts, setCounts] = useState<CatalogCounts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  const loadCounts = useCallback(async () => {
    setCountsLoading(true)
    try {
      const { data, error } = await db.rpc('platform_global_catalog_counts')
      if (error) throw error
      setCounts(data as CatalogCounts)
    } catch (err) {
      console.error('[GlobalCatalogs] counts error', err)
    } finally {
      setCountsLoading(false)
    }
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Library className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Catálogos globais</h1>
          <p className="text-sm text-slate-500">
            Dados compartilhados entre todas as empresas do SaaS. Editar aqui afeta todas as contas.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <CountCard label="Categorias de atividade" count={counts?.activity_categories} loading={countsLoading} editable />
        <CountCard label="Campos de integração" count={counts?.integration_field_catalog} loading={countsLoading} />
        <CountCard label="Providers de integração" count={counts?.integration_provider_catalog} loading={countsLoading} />
        <CountCard label="Regras de health check" count={counts?.integration_health_rules} loading={countsLoading} />
        <CountCard label="Campos do sistema" count={counts?.system_fields} loading={countsLoading} />
      </div>

      <ActivityCategoriesEditor />

      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700 mb-1">Catálogos não-editáveis pela UI</p>
        <p>
          Providers, campos de integração, regras de health check e campos do sistema são
          editados via migration (risco alto de quebrar integrações existentes). Consulte a equipe
          técnica antes de mexer.
        </p>
      </div>
    </div>
  )
}

function CountCard({ label, count, loading, editable }: { label: string; count?: number; loading: boolean; editable?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : (
          <span className="text-2xl font-semibold text-slate-900">{count ?? '—'}</span>
        )}
        {editable && <span className="text-[10px] text-indigo-600 font-medium">editável</span>}
      </div>
    </div>
  )
}

function ActivityCategoriesEditor() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ActivityCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db.rpc('platform_list_activity_categories')
      if (error) throw error
      setRows((data ?? []) as ActivityCategory[])
    } catch (err) {
      toast({ title: 'Erro ao carregar', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const saveRow = async (r: ActivityCategory) => {
    setSavingKey(r.key)
    try {
      const { error } = await db.rpc('platform_upsert_activity_category', {
        p_key: r.key, p_label: r.label, p_scope: r.scope ?? 'all',
        p_visible: r.visible, p_ordem: r.ordem ?? 100,
      })
      if (error) throw error
      toast({ title: 'Categoria salva', type: 'success' })
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally {
      setSavingKey(null)
    }
  }

  const deleteRow = async (r: ActivityCategory) => {
    if (!window.confirm(`Excluir a categoria "${r.label}"?\n\nA categoria sai de TODAS as empresas do SaaS.`)) return
    setSavingKey(r.key)
    try {
      const { error } = await db.rpc('platform_delete_activity_category', { p_key: r.key })
      if (error) throw error
      toast({ title: 'Excluída', type: 'success' })
      await load()
    } catch (err) {
      toast({ title: 'Erro ao excluir', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally {
      setSavingKey(null)
    }
  }

  const createRow = async () => {
    if (!newKey.trim() || !newLabel.trim()) {
      toast({ title: 'Preencha key e label', type: 'error' })
      return
    }
    setSavingKey('__new__')
    try {
      const { error } = await db.rpc('platform_upsert_activity_category', {
        p_key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
        p_label: newLabel.trim(),
        p_scope: 'all', p_visible: true, p_ordem: 100,
      })
      if (error) throw error
      toast({ title: 'Criada', type: 'success' })
      setNewKey(''); setNewLabel('')
      await load()
    } catch (err) {
      toast({ title: 'Erro ao criar', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally {
      setSavingKey(null)
    }
  }

  const updateField = (key: string, patch: Partial<ActivityCategory>) => {
    setRows((curr) => curr.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Categorias de atividade</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tipos de atividade disponíveis em todas as empresas (ligação, reunião, etc).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-8">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </header>

      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.key} className="px-5 py-2.5 flex items-center gap-2">
            <code className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0 w-28 truncate">
              {r.key}
            </code>
            <Input
              value={r.label}
              onChange={(e) => updateField(r.key, { label: e.target.value })}
              className="h-8 text-sm flex-1"
              placeholder="Label"
            />
            <Input
              type="number"
              value={r.ordem ?? 100}
              onChange={(e) => updateField(r.key, { ordem: parseInt(e.target.value, 10) || 100 })}
              className="h-8 text-sm w-20"
              placeholder="Ordem"
            />
            <button
              onClick={() => updateField(r.key, { visible: !r.visible })}
              className={cn(
                'h-8 px-2 rounded border text-xs inline-flex items-center gap-1',
                r.visible
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              )}
              title={r.visible ? 'Visível' : 'Oculta'}
            >
              {r.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <Button
              size="sm" variant="outline"
              onClick={() => saveRow(r)}
              disabled={savingKey === r.key}
              className="h-8 w-8 p-0"
              title="Salvar"
            >
              {savingKey === r.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={() => deleteRow(r)}
              disabled={savingKey === r.key}
              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center gap-2">
        <Input
          placeholder="key (ex: follow_up)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-8 text-sm w-48 font-mono"
        />
        <Input
          placeholder="Label visível"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="h-8 text-sm flex-1"
        />
        <Button size="sm" onClick={createRow} disabled={savingKey === '__new__'} className="h-8">
          {savingKey === '__new__' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
          Adicionar
        </Button>
      </div>
    </section>
  )
}
