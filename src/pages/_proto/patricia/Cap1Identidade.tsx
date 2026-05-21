/**
 * Capítulo 1 — Quem é a Patricia?
 *
 * Dados reais cobertos:
 *  - ai_agents: nome, persona, descricao, tipo
 *  - ai_agent_business_config: company_name, company_description, methodology_text
 *
 * Esta tela substitui visualmente a aba "Identidade" do editor v2,
 * mas APRESENTA também o contexto da empresa (que hoje vive em outra aba),
 * porque pro leigo isso é uma decisão só: "quem está atrás da Patricia".
 */

import { Card, Field, TextInput, TextArea, Pill, ChapterHeader } from './Ui'
import { PATRICIA, BUSINESS } from './data-real'

const TIPO_LABEL: Record<typeof PATRICIA.tipo, string> = {
  sales: 'Vendas',
  // suporte e pós-venda existem no enum mas Patricia é 'sales'
}

export function Cap1Identidade() {
  const personaLen = PATRICIA.persona.length
  const personaShort = personaLen < 80

  return (
    <article>
      <ChapterHeader
        num={1}
        total={7}
        title="Quem é a Patricia?"
        subtitle="Como ela se apresenta nas conversas e em que negócio ela trabalha."
      />

      <div className="space-y-5">
        <Card title="A agente" hint="Esses campos viram parte do prompt e aparecem em handoffs internos.">
          <div className="grid grid-cols-[80px_1fr] gap-5 items-start">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 grid place-items-center text-xl font-semibold">
                P
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Nome" required>
                <TextInput defaultValue={PATRICIA.nome} />
              </Field>

              <Field
                label="Persona"
                hint="Frase curta que define o caráter dela. Vai em todo prompt."
              >
                <TextInput defaultValue={PATRICIA.persona} />
                {personaShort && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Persona curta ({personaLen} caracteres). Patricia funciona melhor com 80-160 chars de contexto.
                  </p>
                )}
              </Field>

              <Field label="Descrição interna" hint="Usada em handoffs e logs.">
                <TextArea rows={3} defaultValue={PATRICIA.descricao} />
              </Field>

              <Field label="Tipo">
                <div className="flex items-center gap-2">
                  <Pill tone="indigo">{TIPO_LABEL[PATRICIA.tipo] ?? PATRICIA.tipo}</Pill>
                  <span className="text-[11px] text-slate-500">
                    Define o domínio do prompt e as ferramentas disponíveis.
                  </span>
                </div>
              </Field>
            </div>
          </div>
        </Card>

        <Card title="A empresa" hint="Contexto da marca que Patricia carrega em toda conversa.">
          <div className="space-y-4">
            <Field label="Nome da empresa">
              <TextInput defaultValue={BUSINESS.company_name} />
            </Field>

            <Field label="Descrição da empresa" hint="Patricia usa isso pra falar sobre Welcome Weddings quando o cliente pergunta.">
              <TextArea rows={4} defaultValue={BUSINESS.company_description} />
            </Field>

            <Field label="Metodologia" hint="Como Patricia explica o jeito Welcome de fazer casamento.">
              <TextArea rows={3} defaultValue={BUSINESS.methodology_text} />
            </Field>

            <div className="flex items-center gap-3 text-[12px]">
              <Pill tone="slate">{BUSINESS.language}</Pill>
              <Pill tone="violet">tom: {BUSINESS.tone}</Pill>
              {BUSINESS.has_secondary_contacts && (
                <Pill tone="indigo">Suporta {BUSINESS.secondary_contact_role}</Pill>
              )}
            </div>
          </div>
        </Card>
      </div>
    </article>
  )
}
