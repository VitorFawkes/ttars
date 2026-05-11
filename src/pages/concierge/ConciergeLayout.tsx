import { useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { NovoAtendimentoModal } from '../../components/concierge/NovoAtendimentoModal'

const tabs = [
  { name: 'Kanban', path: '/concierge', exact: true },
  { name: 'Painel', path: '/concierge/painel' },
  { name: 'Modelos', path: '/concierge/modelos' },
]

export default function ConciergeLayout() {
  const location = useLocation()
  const [showNovoModal, setShowNovoModal] = useState(false)

  const isTabActive = (tabPath: string, exact: boolean = false) => {
    if (exact) {
      return location.pathname === tabPath
    }
    return location.pathname.startsWith(tabPath)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header — título, tabs e botão na mesma linha pra economizar vertical */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 h-12 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6 min-w-0">
            <h1 className="text-base font-semibold text-slate-900 shrink-0">Concierge</h1>
            <nav className="flex items-center gap-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    isTabActive(tab.path, tab.exact)
                      ? 'text-indigo-600 bg-indigo-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  {tab.name}
                </Link>
              ))}
            </nav>
          </div>
          <Button
            onClick={() => setShowNovoModal(true)}
            variant="default"
            size="sm"
            className="gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo atendimento
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>

      {/* Nova Atendimento Modal */}
      {showNovoModal && (
        <NovoAtendimentoModal
          isOpen={showNovoModal}
          onClose={() => setShowNovoModal(false)}
        />
      )}
    </div>
  )
}
