import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useOrg } from '../../contexts/OrgContext'
import { useAuth } from '../../contexts/AuthContext'
import { emailCodigoDoCasamento } from '../../lib/planejamento/emailCodigo'

// E-mails do card (D-P6): toda a conversa por e-mail num lugar só, dentro do
// casamento. Reusa a tabela NATIVA `mensagens` (canal='email') + a edge function
// send-email (Resend). Enquanto o provedor (Resend) não estiver configurado, o
// envio roda em "modo de teste" (dry-run): a mensagem fica registrada aqui, mas
// não sai de verdade — a UI avisa isso.

export interface CardEmail {
  id: string
  lado: 'in' | 'out' | string
  assunto: string | null
  conteudo: string | null
  data_hora: string | null
  metadados: Record<string, unknown> | null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function useCardEmails(cardId: string | null | undefined) {
  const { org } = useOrg()
  const { profile } = useAuth()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<CardEmail[]>({
    queryKey: ['planejamento', 'emails', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('mensagens')
        .select('id, lado, assunto, conteudo, data_hora, metadados')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .eq('canal', 'email')
        .order('data_hora', { ascending: true })
      if (error) throw error
      return (data ?? []) as CardEmail[]
    },
  })

  const send = useMutation<{ dryRun: boolean }, Error, { to: string; assunto: string; mensagem: string }>({
    mutationFn: async ({ to, assunto, mensagem }) => {
      if (!cardId || !orgId) throw new Error('Casamento não identificado.')
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#211F1D;line-height:1.6">${escapeHtml(mensagem).replace(/\n/g, '<br>')}</div>`

      // 1) registra a mensagem no histórico do card (mensagens nativa)
      const { data: inserted, error: insErr } = await sbAny
        .from('mensagens')
        .insert({
          card_id: cardId,
          org_id: orgId,
          lado: 'out',
          canal: 'email',
          assunto,
          conteudo: mensagem,
          remetente_interno_id: profile?.id ?? null,
          metadados: { to },
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      // 2) tenta enviar de verdade via send-email (Resend). Sem Resend → dry-run.
      // reply_to = e-mail-código do casamento: a resposta do casal volta pro card.
      let dryRun = false
      try {
        const { data: res, error: fnErr } = await supabase.functions.invoke('send-email', {
          body: { to, subject: assunto, html, text: mensagem, reply_to: emailCodigoDoCasamento(cardId) },
        })
        if (fnErr) throw fnErr
        dryRun = !!(res && (res as { dry_run?: boolean }).dry_run)
        // carimba o resultado do envio na própria mensagem
        await sbAny.from('mensagens').update({
          metadados: { to, dry_run: dryRun, sent: !dryRun, provider_id: (res as { id?: string })?.id ?? null },
        }).eq('id', inserted.id)
      } catch (e) {
        // o registro fica; o envio falhou (provavelmente provedor não configurado)
        dryRun = true
        await sbAny.from('mensagens').update({ metadados: { to, dry_run: true, send_error: String(e) } }).eq('id', inserted.id)
      }

      return { dryRun }
    },
    onSuccess: async ({ dryRun }) => {
      await queryClient.invalidateQueries({ queryKey: ['planejamento', 'emails', orgId, cardId] })
      if (dryRun) {
        toast.message('E-mail registrado (modo de teste)', {
          description: 'O envio de e-mail ainda não está ligado. A mensagem ficou no histórico, mas não saiu de verdade.',
        })
      } else {
        toast.success('E-mail enviado.')
      }
    },
    onError: (err) => toast.error(`Não consegui registrar o e-mail: ${err.message}`),
  })

  return { emails: query.data ?? [], isLoading: query.isLoading, send }
}
