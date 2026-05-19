import { Heart, Users, Settings, CalendarDays, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useConvidadosPreferences } from '../../hooks/convidados/useConvidadosPreferences'
import { CasamentosBoard } from '../../components/convidados/casamentos/CasamentosBoard'
import { ConvidadosBoard } from '../../components/convidados/lista/ConvidadosBoard'
import { EnviosDoDiaBoard } from '../../components/convidados/envios/EnviosDoDiaBoard'
import { FiltersBar } from '../../components/convidados/lista/FiltersBar'

export default function ConvidadosPage() {
  const { prefs, setPref } = useConvidadosPreferences()

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Toggle de modo + atalho pra configurar o fluxo */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex bg-slate-100 rounded-md p-0.5">
          <ModeButton
            active={prefs.modo === 'casamentos'}
            icon={<Heart className="w-3.5 h-3.5" />}
            label="Por casamento"
            onClick={() => setPref('modo', 'casamentos')}
          />
          <ModeButton
            active={prefs.modo === 'convidados'}
            icon={<Users className="w-3.5 h-3.5" />}
            label="Lista de convidados"
            onClick={() => setPref('modo', 'convidados')}
          />
          <ModeButton
            active={prefs.modo === 'envios_hoje'}
            icon={<Send className="w-3.5 h-3.5" />}
            label="Envios do dia"
            onClick={() => setPref('modo', 'envios_hoje')}
          />
        </div>

        <div className="flex items-center gap-1">
          <Link
            to="/convidados/calendario"
            className="inline-flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Calendário
          </Link>
          <Link
            to="/convidados/fluxo"
            className="inline-flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar fluxo
          </Link>
        </div>
      </div>

      {prefs.modo === 'convidados' && <FiltersBar />}

      {prefs.modo === 'casamentos' && <CasamentosBoard />}
      {prefs.modo === 'convidados' && (
        <ConvidadosBoard
          search={prefs.search}
          statusFilter={prefs.statusFilter}
          weddingFilter={prefs.weddingFilter}
        />
      )}
      {prefs.modo === 'envios_hoje' && <EnviosDoDiaBoard />}
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
        'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
