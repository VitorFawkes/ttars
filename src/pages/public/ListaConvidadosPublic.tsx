import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useListaCasalPublica } from '../../hooks/convidados/casais/useListaCasalPublica'
import { PlanilhaConvidados } from '../../components/convidados/planilha/PlanilhaConvidados'
import { ListaConvidadosSplash } from './ListaConvidadosSplash'

export default function ListaConvidadosPublic() {
  const { codigo } = useParams<{ codigo: string }>()
  const normalized = (codigo || '').toUpperCase().trim()
  const { data, isLoading, isError, error } = useListaCasalPublica(normalized)
  const status = (error as Error & { status?: number })?.status

  if (!normalized) return <ListaConvidadosSplash kind="missing" />
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-ww-display"
        style={{ background: 'linear-gradient(135deg, rgba(189,150,92,0.07) 0%, #FBF8F4 45%, rgba(234,167,148,0.06) 100%)' }}>
        <div className="text-ww-n500 inline-flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando a sua lista…
        </div>
      </div>
    )
  }
  if (isError || !data) {
    if (status === 404) return <ListaConvidadosSplash kind="not_found" codigo={normalized} />
    if (status === 403) return <ListaConvidadosSplash kind="closed" codigo={normalized} />
    return <ListaConvidadosSplash kind="error" codigo={normalized} />
  }
  return (
    <div className="min-h-screen font-ww-display"
      style={{ background: 'linear-gradient(135deg, rgba(189,150,92,0.07) 0%, #FBF8F4 45%, rgba(234,167,148,0.06) 100%)' }}>
      <PlanilhaConvidados casal={data.casal} convites={data.convites} />
    </div>
  )
}
