import { useState } from 'react'
import { FileClock, Loader2, RefreshCw, ChevronRight } from 'lucide-react'
import { usePlatformAuditLog } from '../../hooks/usePlatformData'
import { Button } from '../../components/ui/Button'

const ACTION_COLORS: Record<string, string> = {
  'org.create': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'org.suspend': 'bg-amber-50 text-amber-700 border-amber-200',
  'org.resume': 'bg-blue-50 text-blue-700 border-blue-200',
  'platform.promote': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'platform.revoke': 'bg-slate-100 text-slate-600 border-slate-200',
  'user.impersonate': 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function AuditPage() {
  const { entries, loading, error, refetch } = usePlatformAuditLog(200)
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileClock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Audit Log</h1>
            <p className="text-sm text-slate-500">Ações executadas por platform admins.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Nenhuma ação registrada ainda.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => {
              const isExpanded = expanded === e.id
              const colorClass = ACTION_COLORS[e.action] ?? 'bg-slate-100 text-slate-700 border-slate-200'
              return (
                <li key={e.id} className="px-5 py-3">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : e.id)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-xs font-mono font-medium border rounded-full px-2 py-0.5 ${colorClass}`}>
                          {e.action}
                        </span>
                        <span className="text-sm text-slate-700">
                          por <span className="font-medium">{e.actor_email ?? e.actor_id.slice(0, 8)}</span>
                        </span>
                        <span className="text-xs text-slate-400">
                          · {e.target_type}{e.target_id ? ` ${e.target_id.slice(0, 8)}` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(e.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </button>
                  {isExpanded && Object.keys(e.metadata ?? {}).length > 0 && (
                    <pre className="mt-2 ml-7 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-mono text-slate-700 overflow-x-auto">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
