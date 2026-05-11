import { User, Volume2, Shield, Info, Ear } from 'lucide-react'
import { IdentitySection } from '../../sections/IdentitySection'
import { VoiceSection } from '../../sections/VoiceSection'
import { BoundariesSection } from '../../sections/BoundariesSection'
import { ListeningSection } from '../../sections/ListeningSection'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Área "Quem ela é" da redesign UI v3 — Fase 2.
 *
 * Funde 3 conceitos que antes ficavam em seções separadas do Playbook:
 *   - Identidade (papel, missão, descrição da empresa)
 *   - Voz (tom, formalidade, emoji, frases típicas/proibidas)
 *   - Linhas vermelhas globais (o que ela NUNCA faz)
 *
 * Princípio: cada conceito mora em UM lugar. Tom mora em "Voz" e SÓ em "Voz".
 *
 * Reusa os componentes existentes (IdentitySection, VoiceSection, BoundariesSection)
 * pra garantir paridade total de salvamento. Não duplica lógica de persistência.
 *
 * Próxima iteração: incorporar Modo de interação + Linhas WhatsApp ativas + Modo teste,
 * que hoje vivem em abas separadas do AiAgentDetailPage.
 */
export function QuemElaESection({ agentId, agentName, companyName }: Props) {
  return (
    <div className="space-y-8">
      {/* Banner explicativo */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 flex gap-3">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-0.5">
            Tudo que define quem ela é mora aqui
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Antes esses 3 blocos viviam em seções separadas. Reunimos pra você ter uma visão única
            de quem é a agente e como ela soa, com regra simples:{' '}
            <strong>identidade não muda quase nunca, voz raramente, linhas vermelhas mudam quando algo dá errado.</strong>
          </p>
        </div>
      </div>

      {/* Bloco 1 — Identidade */}
      <BlockHeader
        Icon={User}
        title="Identidade"
        subtitle="Quem ela é, missão dela, qual empresa representa."
      />
      <IdentitySection agentId={agentId} agentName={agentName} companyName={companyName} />

      {/* Bloco 2 — Voz */}
      <div className="pt-4 border-t border-slate-100">
        <BlockHeader
          Icon={Volume2}
          title="Voz"
          subtitle="Como ela soa: tom, formalidade, frases típicas e frases proibidas."
        />
        <VoiceSection agentId={agentId} agentName={agentName} companyName={companyName} />
      </div>

      {/* Bloco 3 — Linhas vermelhas globais */}
      <div className="pt-4 border-t border-slate-100">
        <BlockHeader
          Icon={Shield}
          title="Linhas vermelhas globais"
          subtitle="O que ela NUNCA faz — em qualquer momento da conversa, sem exceção."
        />
        <BoundariesSection agentId={agentId} agentName={agentName} companyName={companyName} />
      </div>

      {/* Bloco 4 — Escuta */}
      <div className="pt-4 border-t border-slate-100">
        <BlockHeader
          Icon={Ear}
          title="Escuta"
          subtitle="Como ela reage quando o cliente foge do roteiro: pergunta devolvida, comentário espontâneo, várias mensagens em sequência."
        />
        <ListeningSection agentId={agentId} />
      </div>
    </div>
  )
}

function BlockHeader({
  Icon, title, subtitle,
}: {
  Icon: typeof User
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-600" />
      </span>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}
