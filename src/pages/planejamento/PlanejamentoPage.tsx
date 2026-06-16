import { ClipboardList, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlanejamentoBoard } from '../../components/planejamento/PlanejamentoBoard'

export default function PlanejamentoPage() {
  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600">
            <ClipboardList className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Planejamento</h1>
              <span className="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200">
                WIP
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Acompanhe cada casamento pelas etapas de planejamento — arraste para mover.
            </p>
          </div>
        </div>
        <Link
          to="/planejamento/fornecedores"
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
        >
          <Store className="w-4 h-4 text-slate-500" /> Banco de fornecedores
        </Link>
      </header>

      {/* Aviso de feature em construção */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-800">
        <span className="px-1 h-4 inline-flex items-center rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-300">
          WIP
        </span>
        Área em construção — fornecedores e demais blocos do card ainda estão sendo montados.
      </div>

      <PlanejamentoBoard />
    </div>
  )
}
