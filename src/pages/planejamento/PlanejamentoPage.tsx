import { ClipboardList, Store, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlanejamentoBoard } from '../../components/planejamento/PlanejamentoBoard'

export default function PlanejamentoPage() {
  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FBF6E8] text-[#8A6A33]">
            <ClipboardList className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Planejamento</h1>
            <p className="text-sm text-slate-500">
              Acompanhe cada casamento pelas etapas — arraste para avançar (só quando a etapa está cumprida).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/planejamento/portfolio"
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <BarChart3 className="w-4 h-4 text-slate-500" /> Painel do gestor
          </Link>
          <Link
            to="/planejamento/fornecedores"
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Store className="w-4 h-4 text-slate-500" /> Banco de fornecedores
          </Link>
        </div>
      </header>

      <PlanejamentoBoard />
    </div>
  )
}
