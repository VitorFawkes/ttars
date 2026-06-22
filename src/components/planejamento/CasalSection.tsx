import { Heart, Phone, Mail, ExternalLink, UserPlus } from 'lucide-react'
import { useCardPeople, type CardPerson } from '../../hooks/useCardPeople'

/**
 * Bloco "Casal" da tela do casamento — os 2 contatos (clientes). Reusa
 * useCardPeople (pessoa_principal_id + cards_contatos) como fonte única. A
 * edição profunda (trocar/adicionar pessoa) acontece no card (/cards/:id),
 * onde mora o PessoasWidget completo — aqui é visão + atalho.
 */
export function CasalSection({ cardId }: { cardId: string }) {
  const { primary, travelers, isLoading } = useCardPeople(cardId)
  const pessoa2 = travelers[0] ?? null

  return (
    <section className="bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-400" />
          <h2 className="text-base font-semibold text-slate-900">Casal</h2>
        </div>
        <a
          href={`/cards/${cardId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          title="Editar as pessoas no card"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Editar no card
        </a>
      </header>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-2">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PessoaCard label="1ª pessoa" person={primary} cardId={cardId} />
          {pessoa2 ? (
            <PessoaCard label="2ª pessoa" person={pessoa2} cardId={cardId} />
          ) : (
            <a
              href={`/cards/${cardId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors min-h-[78px]"
            >
              <UserPlus className="w-4 h-4" /> Adicionar 2ª pessoa
            </a>
          )}
        </div>
      )}
    </section>
  )
}

function PessoaCard({ label, person, cardId }: { label: string; person: CardPerson | null; cardId: string }) {
  if (!person) {
    return (
      <a
        href={`/cards/${cardId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors min-h-[78px]"
      >
        <UserPlus className="w-4 h-4" /> Definir {label}
      </a>
    )
  }
  const nome = [person.nome, person.sobrenome].filter(Boolean).join(' ')
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate" title={nome}>{nome || '—'}</p>
      <div className="mt-1.5 flex flex-col gap-1">
        {person.telefone && (
          <span className="text-[12px] text-slate-600 inline-flex items-center gap-1.5 truncate">
            <Phone className="w-3 h-3 text-slate-400 shrink-0" /> {person.telefone}
          </span>
        )}
        {person.email && (
          <span className="text-[12px] text-slate-600 inline-flex items-center gap-1.5 truncate" title={person.email}>
            <Mail className="w-3 h-3 text-slate-400 shrink-0" /> {person.email}
          </span>
        )}
      </div>
    </div>
  )
}
