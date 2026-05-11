import { RefreshCw, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useRunHealthCheck, useHealthAlerts } from '@/hooks/useIntegrationHealth'
import PulseGrid from './PulseGrid'
import ActiveAlertsList from './ActiveAlertsList'
import HealthRulesConfig from './HealthRulesConfig'

export default function IntegrationHealthTab() {
    const [showConfig, setShowConfig] = useState(false)
    const runCheck = useRunHealthCheck()
    const { data: alerts } = useHealthAlerts(false)
    const activeCount = alerts?.filter(a => a.status === 'active').length ?? 0

    return (
        <div className="space-y-6">
            {/* Header com acoes */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                        Monitoramento de Integracoes
                    </h2>
                    <p className="text-sm text-slate-500">
                        {activeCount > 0
                            ? `${activeCount} alerta${activeCount > 1 ? 's' : ''} ativo${activeCount > 1 ? 's' : ''}`
                            : 'Todas as integracoes funcionando normalmente'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setShowConfig(!showConfig)}
                    >
                        <Settings2 className="w-4 h-4" />
                        Regras
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => runCheck.mutate()}
                        disabled={runCheck.isPending}
                    >
                        <RefreshCw className={`w-4 h-4 ${runCheck.isPending ? 'animate-spin' : ''}`} />
                        Verificar Agora
                    </Button>
                </div>
            </div>

            {/* Pulse Grid */}
            <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Pulso das Integracoes</h3>
                <PulseGrid />
            </div>

            {/* Alertas Ativos */}
            <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Alertas Ativos</h3>
                <ActiveAlertsList />
            </div>

            {/* Config de Regras (toggle) */}
            {showConfig && (
                <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-3">Configuracao de Regras</h3>
                    <HealthRulesConfig />
                </div>
            )}
        </div>
    )
}
