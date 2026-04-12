import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import StudioStructure from '../../components/admin/studio/StudioStructure'
import { useAuth } from '../../contexts/AuthContext'

export default function PipelineStudio() {
    const { profile } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (profile && profile.is_admin !== true) {
            navigate('/', { replace: true })
        }
    }, [profile, navigate])

    if (!profile || profile.is_admin !== true) return null

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Settings className="w-6 h-6 text-muted-foreground" />
                        Gerenciamento de Pipeline
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Configure as etapas e regras de automação do seu funil de vendas.
                    </p>
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-card rounded-xl border border-border shadow-sm min-h-[600px]">
                <StudioStructure />
            </div>
        </div>
    )
}
