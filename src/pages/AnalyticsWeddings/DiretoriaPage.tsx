import { useOrg } from '@/contexts/OrgContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { Diretoria } from './tabs/Diretoria'

// Página standalone (link direto, oculta) — reusa a mesma aba "Operação" do Analytics.
export default function DiretoriaPage() {
  const { org } = useOrg()
  const { product } = useCurrentProductMeta()

  if (!product || product.slug !== 'WEDDING') {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-amber-900">Esta página é só para Welcome Weddings</h2>
          <p className="mt-2 text-sm text-amber-800">
            Você está na org <strong>{org?.name ?? '?'}</strong>. Troque para "Welcome Weddings" no seletor de organização (canto superior).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-ww-paper">
      <div className="max-w-[1100px] mx-auto p-6 space-y-6">
        <h1 className="font-ww-serif text-2xl font-semibold text-ww-n700 tracking-tight">Operação · Estado Geral</h1>
        <Diretoria />
      </div>
    </div>
  )
}
