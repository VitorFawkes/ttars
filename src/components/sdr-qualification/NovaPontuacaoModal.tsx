import { useState } from 'react'
import { User, Phone, Heart } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

type Props = {
    open: boolean
    onClose: () => void
    onStart: (dados: { nomeContato: string; nomeCasal: string; telefone: string }) => void
}

/**
 * Modal pra começar uma pontuação SDR pra lead que ainda não tem card.
 * Tudo opcional — pode começar com nada e atrelar depois.
 */
export function NovaPontuacaoModal({ open, onClose, onStart }: Props) {
    const [nomeContato, setNomeContato] = useState('')
    const [nomeCasal, setNomeCasal] = useState('')
    const [telefone, setTelefone] = useState('')

    const podeComecar = nomeContato.trim().length > 0 && telefone.trim().length > 0

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!podeComecar) return
        onStart({
            nomeContato: nomeContato.trim(),
            nomeCasal: nomeCasal.trim(),
            telefone: telefone.trim(),
        })
        setNomeContato('')
        setNomeCasal('')
        setTelefone('')
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Nova pontuação</DialogTitle>
                    <DialogDescription>
                        Pra lead que ainda não tem card. Nome e telefone obrigatórios — você atrele a um card depois,
                        manual ou quando ele for criado pelo Echo com o mesmo telefone.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div>
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mb-1">
                            <User className="w-3.5 h-3.5 text-slate-400" /> Nome da pessoa que está falando
                            <span className="text-rose-500">*</span>
                        </label>
                        <Input
                            autoFocus
                            required
                            value={nomeContato}
                            onChange={(e) => setNomeContato(e.target.value)}
                            placeholder="João"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mb-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> Telefone
                            <span className="text-rose-500">*</span>
                        </label>
                        <Input
                            type="tel"
                            required
                            value={telefone}
                            onChange={(e) => setTelefone(e.target.value)}
                            placeholder="(11) 99999-9999"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                            Com telefone, o card é vinculado sozinho assim que for criado.
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 mb-1">
                            <Heart className="w-3.5 h-3.5 text-rose-400" /> Nome do casal (opcional)
                        </label>
                        <Input
                            value={nomeCasal}
                            onChange={(e) => setNomeCasal(e.target.value)}
                            placeholder="João e Maria"
                        />
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={!podeComecar}>Começar</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
