import { Zap, Info, AlertTriangle, FlaskConical, Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { useProductContext } from '@/hooks/useProductContext'
import { useCreateCardsSetting, useSetCreateCardsSetting } from '@/hooks/useCreateCardsSetting'

/** Card de toggle de uma fonte de leads (Leadster, Site, ...). */
function SourceToggleCard({
  settingKey,
  sourceLabel,
  description,
  canEdit,
  ariaLabel,
  warning,
}: {
  settingKey: string
  sourceLabel: string
  description: string
  canEdit: boolean
  ariaLabel: string
  warning?: ReactNode
}) {
  const { data: enabled = false, isLoading } = useCreateCardsSetting(settingKey)
  const setMutation = useSetCreateCardsSetting(settingKey, sourceLabel)
  const canToggle = canEdit && !setMutation.isPending

  return (
    <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              {sourceLabel}
              {enabled ? (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Ligado</Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                  <FlaskConical className="w-3 h-3" /> Modo ensaio
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-slate-500">{description}</CardDescription>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => setMutation.mutate(v)}
            disabled={!canToggle || isLoading}
            aria-label={ariaLabel}
          />
        </div>
      </CardHeader>
      {warning && (
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{warning}</p>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function LeadsterSettingsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin === true
  const { currentProduct } = useProductContext()
  const isSupported = currentProduct === 'TRIPS' || currentProduct === 'WEDDING'
  const isWedding = currentProduct === 'WEDDING'
  const productLabel = isWedding ? 'Casamentos' : 'Viagens'
  const canEdit = isAdmin && isSupported

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-600" />
          Fontes de Leads
        </h1>
        <p className="text-sm text-slate-500">
          Criação automática de leads de {productLabel} a partir das integrações de captação.
        </p>
      </div>

      {!isSupported && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <p>Esta configuração existe apenas nos workspaces <strong>Welcome Trips</strong> e <strong>Welcome Weddings</strong>. Troque de workspace para ajustá-la.</p>
        </div>
      )}

      <div className="space-y-4">
        <SourceToggleCard
          settingKey="leadster_create_cards"
          sourceLabel="Leadster"
          canEdit={canEdit}
          ariaLabel="Criar leads automaticamente pelo Leadster"
          description={`Quando ligado, cada lead que chega do chatbot Leadster vira um card de ${productLabel} automaticamente (sem duplicar quem já tem card aberto). Desligado, o sistema apenas registra o que chega para conferência, sem criar nada.`}
          warning={
            <>
              Para não criar leads em duplicado, ligue isto <strong>somente</strong> quando a entrada de
              leads pelo ActiveCampaign for desligada. As duas fontes não devem ficar ligadas ao mesmo tempo.
            </>
          }
        />

        {isWedding && (
          <SourceToggleCard
            settingKey="site_create_cards"
            sourceLabel="Formulário do Site"
            canEdit={canEdit}
            ariaLabel="Criar leads automaticamente pelo formulário do site"
            description="Quando ligado, cada lead que chega do formulário do site welcomeweddings.com.br vira um card de Casamentos automaticamente (sem duplicar quem já tem card aberto, inclusive se já veio pelo Leadster). Desligado, o sistema apenas registra o que chega para conferência."
          />
        )}
      </div>

      {isSupported && !isAdmin && (
        <p className="text-xs text-slate-400">Apenas administradores podem alterar estas configurações.</p>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Globe className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
        <p>
          Cada fonte entra no CRM com sua própria etiqueta de origem, então dá para saber de onde veio cada lead.
          Leads repetidos da mesma pessoa são unificados automaticamente, mesmo vindo de fontes diferentes.
        </p>
      </div>
    </div>
  )
}
