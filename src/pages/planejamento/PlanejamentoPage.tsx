import { ClipboardList } from 'lucide-react'
import { PlanejamentoBoard } from '../../components/planejamento/PlanejamentoBoard'

export default function PlanejamentoPage() {
  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600">
          <ClipboardList className="w-4 h-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Planejamento</h1>
          <p className="text-sm text-slate-500">
            Acompanhe cada casamento pelas etapas de planejamento — arraste para mover.
          </p>
        </div>
      </header>

      <PlanejamentoBoard />
    </div>
  )
}
