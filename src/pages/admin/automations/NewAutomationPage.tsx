import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { BlockRecipeGallery } from '@/components/automations/BlockRecipeGallery'

export default function NewAutomationPage() {
    const navigate = useNavigate()

    const pickRecipe = (recipeId: string) => {
        navigate(`/settings/automations/automacao/new?recipe=${recipeId}`)
    }

    const startBlank = () => {
        navigate('/settings/automations/automacao/new')
    }

    return (
        <>
            <AdminPageHeader
                title="Nova automação"
                subtitle="Escolha uma receita pronta ou comece do zero"
                icon={<Zap className="w-5 h-5" />}
                actions={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/settings/automations')}
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                }
            />

            <div className="mt-6">
                <BlockRecipeGallery
                    onPick={(recipe) => pickRecipe(recipe.id)}
                    onSkip={startBlank}
                />
            </div>
        </>
    )
}
