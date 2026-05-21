import { useEffect, useRef } from 'react'
import { pdf } from '@react-pdf/renderer'
import { sbAny } from '../../../hooks/convidados/_supabaseUntyped'
import { RelatorioEnvioPDF, type LoteInfo, type MensagemEnvio } from './RelatorioEnvioPDF'

interface EnvioPdfDownloaderProps {
  loteId: string
  onDone: (ok: boolean) => void
}

function cleanCoupleName(titulo: string): string {
  return titulo.replace(/^\s*(DW|D\.?W\.?|Elopement|Elop\.?)\s*[|\-—–]\s*/i, '').trim()
}

interface LoteRow extends LoteInfo {
  id: string
  card_id: string
  cards: { titulo: string; data_viagem_inicio: string | null; produto_data: Record<string, unknown> | null } | null
}

interface MessageRow {
  contact_id: string | null
  sender_phone: string | null
  has_error: boolean | null
  error_message: string | null
  ack_status: number | null
  contatos: { nome: string | null; sobrenome: string | null; telefone: string | null } | null
}

function readString(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!obj) return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

export default function EnvioPdfDownloader({ loteId, onDone }: EnvioPdfDownloaderProps) {
  const triggered = useRef(false)

  useEffect(() => {
    if (triggered.current) return
    triggered.current = true

    ;(async () => {
      try {
        const { data: lote, error: loteErr } = await sbAny
          .from('envio_lotes')
          .select('id, card_id, template_slug, started_at, finished_at, total, sent, failed, status, cards:card_id(titulo, data_viagem_inicio, produto_data)')
          .eq('id', loteId)
          .maybeSingle()
        if (loteErr || !lote) throw loteErr ?? new Error('Lote não encontrado')

        const loteRow = lote as LoteRow

        const { data: msgs, error: msgErr } = await sbAny
          .from('whatsapp_messages')
          .select('contact_id, sender_phone, has_error, error_message, ack_status, contatos:contact_id(nome, sobrenome, telefone)')
          .eq('metadata->>envio_lote_id', loteId)
          .order('created_at', { ascending: true })
        if (msgErr) throw msgErr

        const mensagens: MensagemEnvio[] = ((msgs ?? []) as MessageRow[]).map(m => ({
          nome: `${m.contatos?.nome ?? ''}${m.contatos?.sobrenome ? ' ' + m.contatos.sobrenome : ''}`.trim() || '(sem nome)',
          telefone: m.sender_phone || m.contatos?.telefone || null,
          has_error: !!m.has_error,
          error_message: m.error_message,
          ack_status: m.ack_status,
        }))

        const wedding = {
          titulo: loteRow.cards?.titulo ?? 'Casamento',
          local: readString(loteRow.cards?.produto_data ?? null, 'ww_local', 'local'),
          wedding_date: loteRow.cards?.data_viagem_inicio ?? null,
        }

        const loteInfo: LoteInfo = {
          template_slug: loteRow.template_slug,
          started_at: loteRow.started_at,
          finished_at: loteRow.finished_at,
          total: loteRow.total,
          sent: loteRow.sent,
          failed: loteRow.failed,
        }

        const blob = await pdf(
          <RelatorioEnvioPDF wedding={wedding} lote={loteInfo} mensagens={mensagens} />,
        ).toBlob()

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const slug = cleanCoupleName(wedding.titulo).toLowerCase().replace(/\s+/g, '-')
        const ts = loteRow.started_at.slice(0, 16).replace(/[T:]/g, '-')
        a.download = `envio-${slug}-${loteRow.template_slug}-${ts}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        onDone(true)
      } catch (err) {
        console.error('[envio-pdf] falha:', err)
        onDone(false)
      }
    })()
  }, [loteId, onDone])

  return null
}
