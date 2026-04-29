import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, User as UserIcon, Users, Check } from 'lucide-react'
import { useFilterProfiles, type FilterProfile } from '../../../hooks/analytics/useFilterOptions'
import { useAuth } from '../../../contexts/AuthContext'
import type { DonoFilter } from '../../../hooks/concierge/useConciergePreferences'
import { cn } from '../../../lib/utils'

interface ConsultorPickerProps {
  value: DonoFilter
  onChange: (next: DonoFilter) => void
}

export function ConsultorPicker({ value, onChange }: ConsultorPickerProps) {
  const { profile } = useAuth()
  const { data: profiles = [], isLoading } = useFilterProfiles()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const filtered = profiles.filter(p =>
    p.nome?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedProfile: FilterProfile | null =
    value === 'me' || value === 'all' ? null : (profiles.find(p => p.id === value) ?? null)

  let label: string
  let icon = <UserIcon className="w-3 h-3" />
  if (value === 'me') {
    label = 'Minha fila'
    icon = <UserIcon className="w-3 h-3" />
  } else if (value === 'all') {
    label = 'Time todo'
    icon = <Users className="w-3 h-3" />
  } else if (selectedProfile) {
    label = selectedProfile.nome ?? 'Consultor'
    icon = <UserIcon className="w-3 h-3" />
  } else {
    label = 'Consultor'
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md border transition-colors',
          value !== 'me'
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        )}
      >
        {icon}
        <span className="truncate max-w-[140px]">{label}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-2 py-2 border-b border-slate-100 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => { onChange('me'); setOpen(false) }}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 h-7 px-2 text-[12px] font-medium rounded transition-colors',
                value === 'me' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              )}
            >
              <UserIcon className="w-3 h-3" />
              Minha fila
            </button>
            <button
              type="button"
              onClick={() => { onChange('all'); setOpen(false) }}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 h-7 px-2 text-[12px] font-medium rounded transition-colors',
                value === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              )}
            >
              <Users className="w-3 h-3" />
              Time todo
            </button>
          </div>

          <div className="px-2 py-1.5 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar consultor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full h-7 pl-7 pr-2 text-[12px] bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {isLoading && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Carregando…</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Nenhum consultor encontrado</div>
            )}
            {filtered.map(p => {
              const isSelected = value === p.id
              const isMe = profile?.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px] text-left transition-colors',
                    isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <UserIcon className="w-3 h-3 text-slate-400" />
                    {p.nome ?? 'Sem nome'}
                    {isMe && <span className="text-[10px] text-slate-400 uppercase tracking-wide">você</span>}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
