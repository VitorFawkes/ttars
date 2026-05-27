interface Props {
  kind: 'missing' | 'not_found' | 'closed' | 'error'
  codigo?: string
}

const COPY: Record<Props['kind'], { title: string; body: string }> = {
  missing: {
    title: 'Acesse pelo seu link.',
    body: 'Cada casal recebe um link único e pessoal para preencher a lista de convidados.',
  },
  not_found: {
    title: 'Não encontramos esse código.',
    body: 'Confira o link enviado pelo time da Welcome Weddings. Se o problema persistir, fale com a sua planner.',
  },
  closed: {
    title: 'Este link foi encerrado.',
    body: 'O acesso a essa lista de convidados foi encerrado pelo time. Procure a sua planner para mais detalhes.',
  },
  error: {
    title: 'Algo deu errado ao abrir a sua lista.',
    body: 'Tente recarregar a página em alguns segundos. Se continuar, avise o time de Welcome Weddings.',
  },
}

export function ListaConvidadosSplash({ kind, codigo }: Props) {
  const c = COPY[kind]
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 font-ww-display"
      style={{
        background:
          'linear-gradient(135deg, rgba(189,150,92,0.12) 0%, #FBF8F4 45%, rgba(234,167,148,0.10) 100%)',
      }}
    >
      <article className="max-w-md w-full bg-white rounded-2xl border border-ww-sand shadow-ww-lift px-7 py-8 text-center">
        <img
          src="/brand/ww/welcome-weddings-vertical.png"
          alt="Welcome Weddings"
          className="h-16 w-auto mx-auto mb-5 object-contain"
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ww-gold mb-3">
          Lista de Convidados
        </p>
        <h1 className="font-ww-serif italic text-[26px] leading-tight text-ww-n700 mb-3">
          {c.title}
        </h1>
        <p className="text-sm text-ww-n500 leading-relaxed mb-4">{c.body}</p>
        {codigo && (
          <p className="text-[11px] text-ww-n400 mt-3">
            Código tentado:{' '}
            <code className="font-mono bg-ww-gold-soft text-ww-gold-ink px-1.5 py-0.5 rounded">
              {codigo}
            </code>
          </p>
        )}
        <p className="text-[11px] italic text-ww-n400 mt-5">
          Cada casal recebe um link único e pessoal.
        </p>
      </article>
    </div>
  )
}
