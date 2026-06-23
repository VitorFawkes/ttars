/**
 * Helpers para os "baldes" JSONB do card (briefing_inicial / produto_data).
 *
 * Contexto: o conteúdo da viagem mora em duas colunas JSONB separadas em `cards`.
 * O SDR preenche `briefing_inicial`; a Travel Planner trabalha em `produto_data`.
 * Ao fazer o handoff, a visão da planner lê de `produto_data` (vazio logo após a
 * passagem) e o que o SDR preencheu "some" da tela — embora siga intacto no banco.
 *
 * `mergeProdutoOverBriefing` resolve isso na LEITURA: mostra `produto_data` com
 * prioridade e cai pra `briefing_inicial` onde estiver vazio. Espelha o merge que
 * já existe em CardHeader.tsx (campo de valor). O caminho de save não muda — a
 * planner continua gravando em `produto_data`.
 */

type CardJsonData = Record<string, unknown>

/**
 * Mescla produto_data por cima de briefing_inicial para exibição nas fases não-SDR.
 * produto_data vence; briefing_inicial preenche as lacunas. Objetos aninhados
 * conhecidos (orcamento, epoca_viagem) caem como um todo quando ausentes no produto.
 */
export function mergeProdutoOverBriefing<T extends CardJsonData>(
    produto: T | null | undefined,
    briefing: T | null | undefined,
): T {
    const p = (produto || {}) as CardJsonData
    const b = (briefing || {}) as CardJsonData
    return {
        ...b,
        ...p,
        orcamento: p.orcamento ?? b.orcamento,
        epoca_viagem: p.epoca_viagem ?? b.epoca_viagem,
    } as unknown as T
}
