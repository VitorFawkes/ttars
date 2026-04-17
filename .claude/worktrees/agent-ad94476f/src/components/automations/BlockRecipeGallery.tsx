import { BLOCK_RECIPES, type BlockRecipe } from './blockRecipes'
import { Button } from '@/components/ui/Button'

interface Props {
    onPick: (recipe: BlockRecipe) => void
    onSkip: () => void
}

export function BlockRecipeGallery({ onPick, onSkip }: Props) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-1">
                    Escolha uma receita pronta
                </h2>
                <p className="text-sm text-slate-600">
                    Começar com um exemplo pré-preenchido é mais rápido. Você ajusta os detalhes depois.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {BLOCK_RECIPES.map((recipe) => {
                    const Icon = recipe.icon
                    const totalTasks = recipe.blocks.reduce(
                        (acc, b) => acc + b.tasks.length,
                        0,
                    )
                    return (
                        <button
                            key={recipe.id}
                            onClick={() => onPick(recipe)}
                            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all group"
                        >
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100 shrink-0">
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 text-sm">{recipe.name}</p>
                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                        {recipe.summary}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-2">
                                        {recipe.blocks.length}{' '}
                                        {recipe.blocks.length === 1 ? 'bloco' : 'blocos'} · {totalTasks}{' '}
                                        {totalTasks === 1 ? 'tarefa' : 'tarefas'}
                                    </p>
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    Nenhuma receita se aplica? Crie do zero.
                </p>
                <Button variant="outline" onClick={onSkip}>
                    Começar em branco
                </Button>
            </div>
        </div>
    )
}
