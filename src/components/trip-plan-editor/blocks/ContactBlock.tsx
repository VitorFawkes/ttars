import { Input } from '@/components/ui/Input'

interface ContactBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function ContactBlock({ data, onChange }: ContactBlockProps) {
    const field = (key: string) => String(data[key] || '')
    const set = (key: string, value: string) => onChange({ ...data, [key]: value })

    return (
        <div className="grid grid-cols-2 gap-2">
            <Input
                value={field('name')}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Nome"
                className="h-8 text-xs col-span-2"
            />
            <Input
                value={field('role')}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Função (ex: Guia local)"
                className="h-8 text-xs col-span-2"
            />
            <Input
                value={field('phone')}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="Telefone"
                className="h-8 text-xs"
            />
            <Input
                value={field('whatsapp')}
                onChange={(e) => set('whatsapp', e.target.value)}
                placeholder="WhatsApp"
                className="h-8 text-xs"
            />
            <Input
                value={field('email')}
                onChange={(e) => set('email', e.target.value)}
                placeholder="E-mail"
                className="h-8 text-xs col-span-2"
            />
        </div>
    )
}
