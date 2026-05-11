import { useState, useEffect } from 'react'
import { Globe, Image as ImageIcon, Link as LinkIcon, Save, ExternalLink } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'


interface MarketingData {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    ad_image_url?: string
    ad_preview_image?: string
    campaign_url?: string
    [key: string]: any
}

interface MarketingViewProps {
    cardId: string
    initialData: MarketingData
}

export default function MarketingView({ cardId, initialData }: MarketingViewProps) {
    const [data, setData] = useState<MarketingData>(initialData || {})
    const [isDirty, setIsDirty] = useState(false)
    const queryClient = useQueryClient()

    useEffect(() => {
        setData(initialData || {})
        setIsDirty(false)
        // eslint-disable-next-line react-hooks/set-state-in-effect
    }, [initialData])

    const updateMarketingMutation = useMutation({
        mutationFn: async (newData: MarketingData) => {
            const { error } = await supabase
                .from('cards')
                .update({ marketing_data: newData })
                .eq('id', cardId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            setIsDirty(false)
        }
    })

    const handleChange = (field: string, value: string) => {
        setData(prev => ({ ...prev, [field]: value }))
        setIsDirty(true)
    }

    const handleSave = () => {
        updateMarketingMutation.mutate(data)
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header / Actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-900">
                    <Globe className="h-5 w-5" />
                    <h3 className="font-semibold">Dados de Campanha & Mídia</h3>
                </div>
                {isDirty && (
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={updateMarketingMutation.isPending}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {updateMarketingMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                        <Save className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: UTMs & Links */}
                <div className="space-y-4">
                    <div className="bg-white/50 p-4 rounded-xl border border-indigo-100 space-y-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            Rastreamento (UTMs)
                        </h4>

                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Origem (Source)</label>
                                <Input
                                    value={data.utm_source || ''}
                                    onChange={(e) => handleChange('utm_source', e.target.value)}
                                    placeholder="ex: facebook, google, instagram"
                                    className="bg-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Mídia (Medium)</label>
                                <Input
                                    value={data.utm_medium || ''}
                                    onChange={(e) => handleChange('utm_medium', e.target.value)}
                                    placeholder="ex: cpc, stories, feed"
                                    className="bg-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Campanha (Campaign)</label>
                                <Input
                                    value={data.utm_campaign || ''}
                                    onChange={(e) => handleChange('utm_campaign', e.target.value)}
                                    placeholder="ex: verao_2025, black_friday"
                                    className="bg-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/50 p-4 rounded-xl border border-indigo-100 space-y-4">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Links
                        </h4>
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Link do Anúncio / Campanha</label>
                            <div className="flex gap-2">
                                <Input
                                    value={data.campaign_url || ''}
                                    onChange={(e) => handleChange('campaign_url', e.target.value)}
                                    placeholder="https://..."
                                    className="bg-white"
                                />
                                {data.campaign_url && (
                                    <a
                                        href={data.campaign_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                                    >
                                        <ExternalLink className="h-5 w-5" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Visuals */}
                <div className="space-y-4">
                    <div className="bg-white/50 p-4 rounded-xl border border-indigo-100 space-y-4 h-full">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Criativo do Anúncio
                        </h4>

                        {/* Image URL Input */}
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">URL da Imagem / Print</label>
                            <Input
                                value={data.ad_image_url || ''}
                                onChange={(e) => handleChange('ad_image_url', e.target.value)}
                                placeholder="Cole o link da imagem aqui..."
                                className="bg-white"
                            />
                        </div>

                        {/* Preview Area */}
                        <div className="relative aspect-video bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden group">
                            {data.ad_image_url ? (
                                <>
                                    <img
                                        src={data.ad_image_url}
                                        alt="Ad Creative"
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Erro+ao+carregar+imagem'
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <a
                                            href={data.ad_image_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-white rounded-full text-sm font-medium text-gray-900 hover:bg-gray-100"
                                        >
                                            Ver Original
                                        </a>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-6">
                                    <ImageIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">Nenhuma imagem vinculada</p>
                                </div>
                            )}
                        </div>

                        {/* Video Print (Optional Secondary Image) */}
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Print do Vídeo (Opcional)</label>
                            <Input
                                value={data.ad_preview_image || ''}
                                onChange={(e) => handleChange('ad_preview_image', e.target.value)}
                                placeholder="Link para print do vídeo..."
                                className="bg-white"
                            />
                        </div>
                        {data.ad_preview_image && (
                            <div className="relative aspect-video bg-gray-100 rounded-lg border border-gray-200 overflow-hidden h-32">
                                <img
                                    src={data.ad_preview_image}
                                    alt="Video Print"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
