/**
 * BackendAutomationsTab — catálogo somente-leitura de tudo que o sistema
 * dispara automaticamente: triggers SQL, edge functions, jobs pg_cron,
 * motor de cadência, agentes IA e filas.
 *
 * Não é gerenciável (no toggle, no edit). É uma janela de transparência
 * pra entender o que roda em produção sem o usuário pedir.
 *
 * Conteúdo vem de src/lib/backend-automations-catalog.ts (estático).
 */
import { useMemo, useState } from 'react'
import { Search, Pencil, Loader2 } from 'lucide-react'

import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import {
  useBackendAutomationSetting,
  useSaveBackendAutomationSetting,
} from '@/hooks/useBackendAutomationSettings'
import { cn } from '@/lib/utils'
import {
  BACKEND_AUTOMATIONS,
  CATEGORY_META,
  CATEGORY_ORDER,
  type BackendAutomation,
  type BackendAutomationCategory,
} from '@/lib/backend-automations-catalog'

type CategoryFilter = 'all' | BackendAutomationCategory

function CategoryBadge({ category }: { category: BackendAutomationCategory }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
        meta.tint
      )}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function AutomationCard({ item }: { item: BackendAutomation }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-slate-900 leading-snug">{item.name}</h3>
        <CategoryBadge category={item.category} />
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500 font-medium">Quando dispara: </span>
          <span className="text-slate-700">{item.trigger}</span>
        </div>
        {item.tables.length > 0 && (
          <div>
            <span className="text-slate-500 font-medium">Afeta: </span>
            <span className="text-slate-700 font-mono">{item.tables.join(', ')}</span>
          </div>
        )}
      </div>
      {item.sourceFile && (
        <p className="text-xs text-slate-400 font-mono mt-2 truncate" title={item.sourceFile}>
          {item.sourceFile}
        </p>
      )}
    </div>
  )
}

/** Parâmetros editáveis (rótulo amigável) por chave de config, por automação. */
const EDITABLE_PARAMS: Record<string, { key: string; label: string; hint?: string }[]> = {
  ww_derive_tipo_casamento: [
    { key: 'elopement_match', label: 'Resposta de convidados que vira Elopement', hint: 'Ex: Apenas o Casal' },
    { key: 'elopement_type', label: 'Tipo quando for essa resposta', hint: 'Ex: Elopement' },
    { key: 'default_type', label: 'Tipo padrão (demais convidados)', hint: 'Ex: Destination Wedding' },
  ],
}

const PARAM_DEFAULTS: Record<string, Record<string, string>> = {
  ww_derive_tipo_casamento: {
    elopement_match: 'Apenas o Casal',
    elopement_type: 'Elopement',
    default_type: 'Destination Wedding',
  },
}

function EditableAutomationCard({ item, canEdit }: { item: BackendAutomation; canEdit: boolean }) {
  const { data: setting, isLoading } = useBackendAutomationSetting(item.id)
  const save = useSaveBackendAutomationSetting(item.id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  const params = EDITABLE_PARAMS[item.id] ?? []
  const defaults = PARAM_DEFAULTS[item.id] ?? {}
  const isActive = setting?.is_active ?? true
  const config = (setting?.config ?? {}) as Record<string, unknown>

  const startEdit = () => {
    const initial: Record<string, string> = {}
    for (const p of params) {
      initial[p.key] = String(config[p.key] ?? defaults[p.key] ?? '')
    }
    setForm(initial)
    setEditing(true)
  }

  const onSaveParams = async () => {
    await save.mutateAsync({ config: { ...defaults, ...config, ...form } })
    setEditing(false)
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-slate-900 leading-snug">{item.name}</h3>
        <CategoryBadge category={item.category} />
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-slate-500 font-medium">Quando dispara: </span>
          <span className="text-slate-700">{item.trigger}</span>
        </div>
        {item.tables.length > 0 && (
          <div>
            <span className="text-slate-500 font-medium">Afeta: </span>
            <span className="text-slate-700 font-mono">{item.tables.join(', ')}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            disabled={!canEdit || isLoading || save.isPending}
            onCheckedChange={(checked) => save.mutate({ is_active: checked })}
          />
          <span className={cn('text-sm font-medium', isActive ? 'text-emerald-700' : 'text-slate-500')}>
            {isActive ? 'Ativa' : 'Desligada'}
          </span>
        </div>
        {canEdit && params.length > 0 && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Editar parâmetros
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
          {params.map((p) => (
            <div key={p.key} className="space-y-1">
              <Label className="text-xs text-slate-600">{p.label}</Label>
              <Input
                value={form[p.key] ?? ''}
                placeholder={p.hint}
                onChange={(e) => setForm((f) => ({ ...f, [p.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSaveParams} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}

      {item.sourceFile && (
        <p className="text-xs text-slate-400 font-mono mt-2 truncate" title={item.sourceFile}>
          {item.sourceFile}
        </p>
      )}
    </div>
  )
}

export function BackendAutomationsTab() {
  const { profile } = useAuth()
  const canEdit = profile?.is_admin === true
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return BACKEND_AUTOMATIONS.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (s) {
        const hay = `${item.name} ${item.description} ${item.trigger} ${item.tables.join(' ')}`
          .toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [search, categoryFilter])

  const grouped = useMemo(() => {
    const map = new Map<BackendAutomationCategory, BackendAutomation[]>()
    for (const item of filtered) {
      const list = map.get(item.category) || []
      list.push(item)
      map.set(item.category, list)
    }
    return CATEGORY_ORDER
      .map((cat) => ({ cat, items: map.get(cat) || [] }))
      .filter(({ items }) => items.length > 0)
  }, [filtered])

  const totals = useMemo(() => {
    const map = new Map<BackendAutomationCategory, number>()
    for (const item of BACKEND_AUTOMATIONS) {
      map.set(item.category, (map.get(item.category) || 0) + 1)
    }
    return map
  }, [])

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm text-slate-700">
          Catálogo de tudo que o sistema dispara automaticamente em segundo plano.
          Inclui triggers no banco, jobs agendados, edge functions, motor de cadência,
          agentes IA e filas. A maioria é <strong>somente leitura</strong>; as marcadas
          como <strong>editáveis</strong> você liga/desliga e ajusta os parâmetros aqui.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar automação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
              categoryFilter === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            Tudo ({BACKEND_AUTOMATIONS.length})
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat]
            const Icon = meta.icon
            const active = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {meta.label} ({totals.get(cat) || 0})
              </button>
            )
          })}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhum resultado para os filtros</p>
          <p className="text-sm text-slate-500 mt-1">Tente ajustar a busca ou limpar o filtro</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ cat, items }) => {
            const meta = CATEGORY_META[cat]
            const Icon = meta.icon
            return (
              <section key={cat}>
                <header className="flex items-center gap-2 mb-3">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded-lg border',
                      meta.tint
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                      {meta.label}{' '}
                      <span className="text-slate-400 font-normal">({items.length})</span>
                    </h2>
                    <p className="text-xs text-slate-500">{meta.description}</p>
                  </div>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {items.map((item) =>
                    item.editable ? (
                      <EditableAutomationCard key={item.id} item={item} canEdit={canEdit} />
                    ) : (
                      <AutomationCard key={item.id} item={item} />
                    )
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
