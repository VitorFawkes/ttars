import { useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { NovoAtendimentoModal } from '../../components/concierge/NovoAtendimentoModal'

const tabs = [
  { name: 'Kanban', path: '/concierge', exact: true },
  { name: 'Meu Dia', path: '/concierge/meu-dia' },
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
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Concierge</h1>
            <Button
              onClick={() => setShowNovoModal(true)}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo atendimento
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {tabs.map((tab) => (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
                  isTabActive(tab.path, tab.exact)
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                )}
              >
                {tab.name}
              </Link>
            ))}
          </div>
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
