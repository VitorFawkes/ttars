import { parsePromptToHumanBlocks, type HumanBlock } from '@/lib/playbook/parsePromptToHumanBlocks'

interface Props {
  prompt: string
}

export function PromptHumanView({ prompt }: Props) {
  const blocks = parsePromptToHumanBlocks(prompt)

  if (blocks.length === 0) {
    return (
      <p className="text-center text-xs text-slate-400 py-8">
        Não foi possível ler o prompt. Tente carregar de novo.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <BlockCard key={`${block.kind}-${i}`} block={block} />
      ))}
    </div>
  )
}

function BlockCard({ block }: { block: HumanBlock }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{block.emoji}</span>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{block.title}</h3>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{block.description}</p>
      </header>

      <div className="px-3 py-2.5">
        {block.subBlocks && block.subBlocks.length > 0 ? (
          <div className="space-y-2.5">
            {block.subBlocks.map((sub, i) => (
              <div key={i}>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">
                  {sub.label}
                </div>
                <pre className="text-[12px] text-slate-800 whitespace-pre-wrap font-sans leading-snug">
                  {sub.content}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[12px] text-slate-800 whitespace-pre-wrap font-sans leading-snug">
            {block.content}
          </pre>
        )}
      </div>
    </div>
  )
}
