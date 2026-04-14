export type LineKind = "oficial_meta" | "nao_oficial";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function detectLineKind(phoneNumberId: string | null | undefined): LineKind {
  return phoneNumberId && UUID_RE.test(phoneNumberId) ? "nao_oficial" : "oficial_meta";
}

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  oficial_meta: "Oficial Meta",
  nao_oficial: "Não-oficial",
};

export const LINE_KIND_TOOLTIP: Record<LineKind, string> = {
  oficial_meta:
    "Linha oficial Meta Cloud API. Exige template aprovado para iniciar conversa fora da janela de 24h após o cliente responder.",
  nao_oficial:
    "Linha via provedor não-oficial (Echo/ChatPro). Aceita texto livre a qualquer momento.",
};
