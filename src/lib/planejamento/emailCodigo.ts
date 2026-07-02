// E-mail-código do casamento (D-P6, 2ª forma): um endereço único por casamento.
// Respostas e cópias mandadas pra ele caem direto na página do casamento
// (edge function email-inbound resolve o card pelo código no endereço).
//
// O domínio precisa estar configurado como INBOUND no provedor (Resend) —
// enquanto não estiver, o endereço já aparece na tela e o envio já sai com
// reply-to certo; os e-mails começam a cair sozinhos quando o domínio ligar.
// Se o domínio final for outro, trocar só aqui (o edge function não depende
// do domínio: resolve pelo código antes do @).

export const EMAIL_INBOUND_DOMAIN = 'casamentos.welcomeweddings.com.br'

/** Endereço único do casamento: casamento+<id-sem-traços>@dominio */
export function emailCodigoDoCasamento(cardId: string): string {
  return `casamento+${cardId.replace(/-/g, '')}@${EMAIL_INBOUND_DOMAIN}`
}
