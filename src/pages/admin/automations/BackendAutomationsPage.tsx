import { Server } from 'lucide-react'

import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { BackendAutomationsTab } from './components/BackendAutomationsTab'
import { BACKEND_AUTOMATIONS, CATEGORY_META, CATEGORY_ORDER } from '@/lib/backend-automations-catalog'

export default function BackendAutomationsPage() {
  const stats = CATEGORY_ORDER.map((cat) => ({
    label: CATEGORY_META[cat].label,
    value: BACKEND_AUTOMATIONS.filter((item) => item.category === cat).length,
  })).filter((s) => s.value > 0)

  return (
    <>
      <AdminPageHeader
        title="Backend"
        subtitle="Catálogo de tudo que o sistema dispara automaticamente em segundo plano — triggers no banco, edge functions, jobs agendados, motor de cadência, agentes IA e filas"
        icon={<Server className="w-5 h-5" />}
        stats={stats}
      />
      <BackendAutomationsTab />
    </>
  )
}
