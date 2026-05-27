import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useListaCasalPublica } from '../../hooks/convidados/casais/useListaCasalPublica'
import { PlanilhaConvidados } from '../../components/convidados/planilha/PlanilhaConvidados'
import { ListaConvidadosSplash } from './ListaConvidadosSplash'

/**
 * O CSS global do app (src/index.css) trava html/body/#root em
 * `overflow: hidden; height: 100%` pra app autenticado com layout fixo.
 * Esta página pública precisa de scroll natural — restauramos ao montar
 * e revertemos ao desmontar pra não afetar outras rotas.
 */
function useEnableNativeScroll() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
    }
    // IMPORTANTE: só html.overflow = auto. body precisa ficar 'visible' senão
    // body vira scrolling container próprio e elementos `position: sticky`
    // dentro dele ficam presos ao body (que está sendo rolado), em vez de
    // ficarem fixos relativos à viewport. Visivelmente o sticky "some" ao rolar.
    html.style.overflow = 'auto'
    html.style.height = 'auto'
    body.style.overflow = 'visible'
    body.style.height = 'auto'
    if (root) {
      root.style.overflow = 'visible'
      root.style.height = 'auto'
    }
    return () => {
      html.style.overflow = prev.htmlOverflow
      html.style.height = prev.htmlHeight
      body.style.overflow = prev.bodyOverflow
      body.style.height = prev.bodyHeight
      if (root) {
        root.style.overflow = prev.rootOverflow || ''
        root.style.height = prev.rootHeight || ''
      }
    }
  }, [])
}

export default function ListaConvidadosPublic() {
  useEnableNativeScroll()
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
