/** Faz parse de uma data de calendário evitando o off-by-one de fuso.
 *
 *  Cobre os dois formatos usados na área de Convidados:
 *  - data pura "YYYY-MM-DD" (ex: ww_data_final_acao em produto_data)
 *  - timestamptz à meia-noite UTC "YYYY-MM-DDT00:00:00+00:00" (ex: coluna
 *    data_viagem_inicio), onde só o dia importa.
 *
 *  Em ambos extrai o prefixo YYYY-MM-DD e constrói a data no fuso local, então
 *  `.getDate()`/`.getMonth()` devolvem o dia pretendido (e não o anterior, como
 *  acontece com `new Date('YYYY-MM-DD')`, que assume UTC).
 *
 *  ATENÇÃO: use apenas para campos de data de calendário. Para timestamps reais
 *  com hora significativa (sent_at, agendamentos), use `new Date(iso)` direto. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}
