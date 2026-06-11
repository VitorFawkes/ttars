import { Zap, Info, AlertTriangle, FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { useProductContext } from '@/hooks/useProductContext'
import { useLeadsterCreateCards, useSetLeadsterCreateCards } from '@/hooks/useLeadsterCreateCards'

export default function LeadsterSettingsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin === true
  const { currentProduct } = useProductContext()
  const isSupported = currentProduct === 'TRIPS' || currentProduct === 'WEDDING'
  const productLabel = currentProduct === 'WEDDING' ? 'Casamentos' : 'Viagens'

  const { data: enabled = false, isLoading } = useLeadsterCreateCards()
  const setMutation = useSetLeadsterCreateCards()

  const canToggle = isAdmin && isSupported && !setMutation.isPending

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-600" />
          Leadster
        </h1>
        <p className="text-sm text-slate-500">
          Criação automática de leads de {productLabel} a partir do chatbot do Leadster.
        </p>
      </div>

      {!isSupported && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <p>Esta configuração existe apenas nos workspaces <strong>Welcome Trips</strong> e <strong>Welcome Weddings</strong>. Troque de workspace para ajustá-la.</p>
        </div>
      )}

      <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                Criar leads automaticamente
                {enabled ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Ligado</Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" /> Modo ensaio
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-slate-500">
                Quando ligado, cada lead que chega do Leadster vira um card de {productLabel} automaticamente
                (sem duplicar quem já tem card aberto). Desligado, o sistema apenas registra o que chega
                para conferência, sem criar nada.
              </CardDescription>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => setMutation.mutate(v)}
              disabled={!canToggle || isLoading}
              aria-label="Criar leads automaticamente pelo Leadster"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Para não criar leads em duplicado, ligue isto <strong>somente</strong> quando a entrada de
              leads pelo ActiveCampaign for desligada. As duas fontes não devem ficar ligadas ao mesmo tempo.
            </p>
          </div>
          {!isAdmin && (
            <p className="mt-3 text-xs text-slate-400">Apenas administradores podem alterar esta configuração.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
