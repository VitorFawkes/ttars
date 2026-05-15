import { Heart, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useConvidadosPreferences } from '../../hooks/convidados/useConvidadosPreferences'
import { CasamentosBoard } from '../../components/convidados/casamentos/CasamentosBoard'
import { ConvidadosBoard } from '../../components/convidados/lista/ConvidadosBoard'
import { FiltersBar } from '../../components/convidados/lista/FiltersBar'

export default function ConvidadosPage() {
  const { prefs, setPref } = useConvidadosPreferences()

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ModeButton
          active={prefs.modo === 'casamentos'}
          icon={<Heart className="w-4 h-4" />}
          label="Por casamento"
          onClick={() => setPref('modo', 'casamentos')}
        />
        <ModeButton
          active={prefs.modo === 'convidados'}
          icon={<Users className="w-4 h-4" />}
          label="Lista de convidados"
          onClick={() => setPref('modo', 'convidados')}
        />
      </div>

      {prefs.modo === 'convidados' && (
        <FiltersBar />
      )}

      {prefs.modo === 'casamentos' ? (
        <CasamentosBoard />
      ) : (
        <ConvidadosBoard
          search={prefs.search}
          statusFilter={prefs.statusFilter}
          weddingFilter={prefs.weddingFilter}
        />
      )}
    </div>
  )
}

interface ModeButtonProps {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function ModeButton({ active, icon, label, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border',
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
