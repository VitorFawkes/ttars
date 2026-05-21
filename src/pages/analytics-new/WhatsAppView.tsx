import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import EngajamentoConversasView from './whatsapp/EngajamentoConversasView'
import UnderConstruction from './UnderConstruction'

export default function WhatsAppView() {
  const { product } = useCurrentProductMeta()

  if (product?.slug !== 'WEDDING') {
    return (
      <UnderConstruction
        title="WhatsApp"
        phase="Welcome Weddings"
        description="Esta análise está disponível apenas no workspace Welcome Weddings. Troque de workspace pelo seletor do topo pra acessar."
      />
    )
  }

  return <EngajamentoConversasView />
}
