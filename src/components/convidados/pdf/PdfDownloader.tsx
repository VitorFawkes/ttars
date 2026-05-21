import { useEffect, useRef } from 'react'
import { pdf } from '@react-pdf/renderer'
import { useWedding } from '../../../hooks/convidados/useWedding'
import { useGuests } from '../../../hooks/convidados/useGuests'
import type { RsvpCounts } from '../../../hooks/convidados/types'
import { RelatorioConvidadosPDF } from './RelatorioConvidadosPDF'

const ZERO_COUNTS: RsvpCounts = { nao_vai: 0, sem_reacao: 0, intencao: 0, confirmado: 0, total: 0 }

interface PdfDownloaderProps {
  cardId: string
  onDone: (ok: boolean) => void
}

function cleanCoupleName(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}

/** Carrega wedding + guests, gera blob do PDF e dispara download. Usado via
 *  lazy import — o bundle do @react-pdf só entra no chunk separado. */
export default function PdfDownloader({ cardId, onDone }: PdfDownloaderProps) {
  const { data: wedding, isLoading: weddingLoading, isError: weddingErr } = useWedding(cardId)
  const { data: guests = [], isLoading: guestsLoading, isError: guestsErr } = useGuests(cardId)
  const triggered = useRef(false)

  useEffect(() => {
    if (triggered.current) return
    if (weddingLoading || guestsLoading) return
    if (weddingErr || guestsErr || !wedding) {
      triggered.current = true
      console.error('[pdf] falha ao carregar dados', { weddingErr, guestsErr, wedding })
      onDone(false)
      return
    }
    triggered.current = true

    const counts = guests.reduce<RsvpCounts>((acc, g) => {
      acc[g.status_rsvp] += 1
      acc.total += 1
      return acc
    }, { ...ZERO_COUNTS })

    ;(async () => {
      try {
        const blob = await pdf(
          <RelatorioConvidadosPDF
            wedding={{
              titulo: wedding.titulo,
              local: wedding.local,
              wedding_date: wedding.wedding_date,
              site_url: wedding.site_url,
            }}
            guests={guests}
            counts={counts}
          />,
        ).toBlob()

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `convidados-${cleanCoupleName(wedding.titulo).toLowerCase().replace(/\s+/g, '-')}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        onDone(true)
      } catch (err) {
        console.error('[pdf] falha ao gerar', err)
        onDone(false)
      }
    })()
  }, [cardId, wedding, guests, weddingLoading, guestsLoading, weddingErr, guestsErr, onDone])

  return null
}
