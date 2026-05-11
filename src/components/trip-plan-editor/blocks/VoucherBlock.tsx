/**
 * VoucherBlock — Upload de voucher com extração IA.
 *
 * Workflow:
 * 1. Operador faz upload (PDF/imagem) ou cola URL
 * 2. Seleciona tipo (hotel/voo/transfer/experiência)
 * 3. Clica "Extrair com IA" → OpenAI Vision extrai dados
 * 4. Campos aparecem preenchidos (editáveis)
 * 5. Operador confirma
 */

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useVoucherExtraction, type VoucherType } from '@/hooks/useVoucherExtraction'
import {
    Upload,
    Loader2,
    Sparkles,
    FileDown,
    Check,
    AlertCircle,
} from 'lucide-react'

interface VoucherBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
    tripPlanId: string
}

const VOUCHER_TYPES: Array<{ value: VoucherType; label: string }> = [
    { value: 'hotel', label: 'Hotel' },
    { value: 'flight', label: 'Voo' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'experience', label: 'Experiência' },
    { value: 'generic', label: 'Outro' },
]

export function VoucherBlock({ data, onChange, tripPlanId }: VoucherBlockProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [uploadedFile, setUploadedFile] = useState<File | null>(null)
    const extraction = useVoucherExtraction()

    const fileUrl = String(data.file_url || '')
    const fileName = String(data.file_name || '')
    const voucherType = (data.voucher_type || 'generic') as VoucherType
    const extractedData = (data.extracted_data || {}) as Record<string, unknown>
    const confirmed = Boolean(data.confirmed)

    // Upload file to storage
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        setUploadedFile(file)
        try {
            const ext = file.name.split('.').pop() || 'pdf'
            const path = `vouchers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('trip-plan-assets')
                .upload(path, file, { cacheControl: '3600', upsert: true })

            if (uploadError) throw uploadError

            const { data: urlData } = supabase.storage
                .from('trip-plan-assets')
                .getPublicUrl(path)

            onChange({
                ...data,
                file_url: urlData.publicUrl,
                file_name: file.name,
            })
        } catch (err) {
            console.error('Upload error:', err)
        } finally {
            setIsUploading(false)
        }
    }, [data, onChange])

    // Extract with AI
    const handleExtract = useCallback(async () => {
        extraction.mutate(
            {
                file: uploadedFile || undefined,
                imageUrl: !uploadedFile ? fileUrl : undefined,
                voucherType,
                tripPlanId,
            },
            {
                onSuccess: (result) => {
                    if (result.success) {
                        onChange({
                            ...data,
                            extracted_data: result.extracted_data,
                            voucher_type: result.voucher_type,
                        })
                    }
                },
            }
        )
    }, [uploadedFile, fileUrl, voucherType, tripPlanId, data, onChange, extraction])

    return (
        <div className="space-y-3">
            {/* Upload area */}
            {!fileUrl ? (
                <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-amber-200 rounded-lg cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-colors">
                    {isUploading ? (
                        <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                    ) : (
                        <>
                            <Upload className="h-5 w-5 text-amber-400 mb-1" />
                            <span className="text-xs text-amber-600">Upload voucher (PDF, imagem)</span>
                        </>
                    )}
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                </label>
            ) : (
                <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <FileDown className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs text-amber-800 truncate flex-1">{fileName}</span>
                    <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-600 hover:underline shrink-0"
                    >
                        Ver
                    </a>
                </div>
            )}

            {/* Voucher type selector */}
            <div className="flex gap-1 flex-wrap">
                {VOUCHER_TYPES.map(vt => (
                    <button
                        key={vt.value}
                        onClick={() => onChange({ ...data, voucher_type: vt.value })}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                            voucherType === vt.value
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                    >
                        {vt.label}
                    </button>
                ))}
            </div>

            {/* Extract button */}
            {fileUrl && !confirmed && (
                <Button
                    size="sm"
                    onClick={handleExtract}
                    disabled={extraction.isPending}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                >
                    {extraction.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Extraindo...</>
                    ) : (
                        <><Sparkles className="h-3.5 w-3.5 mr-1" /> Extrair com IA</>
                    )}
                </Button>
            )}

            {/* Extraction result */}
            {Object.keys(extractedData).length > 0 && (
                <div className="space-y-1.5 p-2 bg-white rounded-lg border border-slate-200">
                    {Object.entries(extractedData).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 w-24 shrink-0 truncate">
                                {key.replace(/_/g, ' ')}
                            </span>
                            <Input
                                value={String(value || '')}
                                onChange={(e) => onChange({
                                    ...data,
                                    extracted_data: { ...extractedData, [key]: e.target.value },
                                })}
                                className="h-6 text-xs flex-1"
                            />
                        </div>
                    ))}

                    {!confirmed && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onChange({ ...data, confirmed: true })}
                            className="w-full mt-2"
                        >
                            <Check className="h-3.5 w-3.5 mr-1" /> Confirmar dados
                        </Button>
                    )}

                    {confirmed && (
                        <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                            <Check className="h-3 w-3" /> Dados confirmados
                        </div>
                    )}
                </div>
            )}

            {/* Extraction error */}
            {extraction.isError && (
                <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-xs text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Não foi possível extrair. Preencha manualmente.
                </div>
            )}

            {/* Manual confirmation number */}
            <Input
                value={String(data.confirmation_number || '')}
                onChange={(e) => onChange({ ...data, confirmation_number: e.target.value })}
                placeholder="Nº de confirmação"
                className="h-7 text-xs"
            />
            <Input
                value={String(data.supplier || '')}
                onChange={(e) => onChange({ ...data, supplier: e.target.value })}
                placeholder="Fornecedor (ex: Hilton, LATAM)"
                className="h-7 text-xs"
            />
        </div>
    )
}
