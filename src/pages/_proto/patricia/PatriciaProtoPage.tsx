/**
 * /proto/patricia — Demo navegável v5
 *
 * Layout: sidebar fixa esquerda + main scrollável. Navegação 1-clique
 * entre Visão geral / 7 passos / atalhos.
 */

import { useState } from 'react'
import { PatriciaShell, type View } from './PatriciaShell'
import { TrilhaHome } from './TrilhaHome'
import { Cap1Identidade } from './Cap1Identidade'
import { Cap2ComoFala } from './Cap2ComoFala'
import { Cap3Conversa } from './Cap3Conversa'
import { Cap4SabeNegocio } from './Cap4SabeNegocio'
import { Cap5PodeFazer } from './Cap5PodeFazer'
import { Cap6ChamaHumano } from './Cap6ChamaHumano'
import { Cap7Linhas } from './Cap7Linhas'
import { AtalhoSaude, AtalhoTeste } from './Atalhos'
import { ModoAvancado } from './ModoAvancado'
import type { ChapterId } from './data-real'

export default function PatriciaProtoPage() {
  const [view, setView] = useState<View>('home')

  return (
    <PatriciaShell view={view} onChangeView={setView}>
      {view === 'home' && <TrilhaHome onOpenChapter={(id: ChapterId) => setView(id)} />}
      {view === 'cap1' && <Cap1Identidade />}
      {view === 'cap2' && <Cap2ComoFala />}
      {view === 'cap3' && <Cap3Conversa />}
      {view === 'cap4' && <Cap4SabeNegocio />}
      {view === 'cap5' && <Cap5PodeFazer />}
      {view === 'cap6' && <Cap6ChamaHumano />}
      {view === 'cap7' && <Cap7Linhas />}
      {view === 'saude' && <AtalhoSaude onClose={() => setView('home')} />}
      {view === 'teste' && <AtalhoTeste onClose={() => setView('home')} />}
      {view === 'avancado' && (
        <ModoAvancado
          onClose={() => setView('home')}
          onOpenChapter={(n: number) => setView(`cap${n}` as ChapterId)}
        />
      )}
    </PatriciaShell>
  )
}
