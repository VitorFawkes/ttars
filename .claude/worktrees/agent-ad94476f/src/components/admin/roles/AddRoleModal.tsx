import { useState } from 'react';
import { useRoles } from '../../../hooks/useRoles';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { useToast } from '../../../contexts/ToastContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../ui/dialog';
import { COLORS } from '../../../constants/admin';

interface AddRoleModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddRoleModal({ isOpen, onClose }: AddRoleModalProps) {
    const { toast } = useToast();
    const { createRole } = useRoles();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        display_name: '',
        description: '',
        color: 'gray'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.display_name.trim()) {
            toast({
                title: 'Erro',
                description: 'O nome do role é obrigatório.',
                type: 'error'
            });
            return;
        }

        setIsLoading(true);
        try {
            const colorOption = COLORS.find(c => c.value === formData.color);
            const colorClass = colorOption
                ? `${colorOption.bg} ${colorOption.text}`
                : 'bg-gray-100 text-gray-800';

            await createRole.mutateAsync({
                name: formData.display_name.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                display_name: formData.display_name,
                description: formData.description || undefined,
                color: colorClass,
            });

            toast({
                title: 'Role criado',
                description: `O role "${formData.display_name}" foi criado com sucesso.`,
                type: 'success'
            });

            // Reset form and close
            setFormData({ display_name: '', description: '', color: 'gray' });
            onClose();
        } catch (error: any) {
            toast({
                title: 'Erro ao criar role',
                description: error.message || 'Não foi possível criar o role.',
                type: 'error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({ display_name: '', description: '', color: 'gray' });
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Novo Role de Acesso</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Nome do Role *</Label>
                            <Input
                                id="role-name"
                                value={formData.display_name}
                                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                placeholder="Ex: Supervisor, Analista, etc."
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="role-description">Descrição</Label>
                            <Textarea
                                id="role-description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Descreva as responsabilidades e permissões deste role..."
                                rows={3}
                            />
                        </div>

                        {/* Color */}
                        <div className="space-y-2">
                            <Label>Cor do Badge</Label>
                            <div className="flex flex-wrap gap-2">
                                {COLORS.map((color) => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, color: color.value })}
                                        className={`
                                            w-8 h-8 rounded-full border-2 transition-all duration-200
                                            ${color.bg}
                                            ${formData.color === color.value
                                                ? 'border-primary ring-2 ring-primary/20 scale-110'
                                                : 'border-transparent hover:scale-105'
                                            }
                                        `}
                                        title={color.value}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Criando...' : 'Criar Role'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
