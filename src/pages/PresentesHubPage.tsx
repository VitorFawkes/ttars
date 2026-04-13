import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Send, Crown, Package, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import CentralEnvios from '@/components/presentes/CentralEnvios'
import PresentesPremium from '@/components/presentes/PresentesPremium'
import EstoqueTab from '@/components/presentes/EstoqueTab'
import PresentesRelatorios from '@/components/presentes/PresentesRelatorios'

const tabs = [
    { key: 'envios', label: 'Central de Envios', icon: Send },
    { key: 'premium', label: 'Presentes Premium', icon: Crown },
    { key: 'estoque', label: 'Estoque', icon: Package },
    { key: 'relatorios', label: 'Relatórios', icon: BarChart3 },
] as const

type TabKey = typeof tabs[number]['key']

export default function PresentesHubPage() {
    const { profile, loading } = useAuth()
    const [activeTab, setActiveTab] = useState<TabKey>('envios')

    if (loading) return null
    const canAccess = profile?.is_admin === true || profile?.role === 'pos_venda'
    if (!canAccess) return <Navigate to="/dashboard" replace />


    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Presentes</h1>
                        <p className="text-sm text-slate-500 mt-1">Centro de controle de presentes e estoque</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                                    activeTab === tab.key
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* Content */}
                {activeTab === 'envios' && <CentralEnvios />}
                {activeTab === 'premium' && <PresentesPremium />}
                {activeTab === 'estoque' && <EstoqueTab />}
                {activeTab === 'relatorios' && <PresentesRelatorios />}
            </div>
        </div>
    )
}
