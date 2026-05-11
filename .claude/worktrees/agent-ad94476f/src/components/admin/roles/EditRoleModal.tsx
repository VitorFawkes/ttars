import { useState, useEffect } from 'react';
import { useRoles, type Role } from '../../../hooks/useRoles';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { COLORS } from '../../../constants/admin';
import PermissionMatrix from './PermissionMatrix';
import type { PermissionsMap } from '../../../lib/permissions';

interface EditRoleModalProps {
    role: Role | null;
    isOpen: boolean;
    onClose: () => void;
}

export function EditRoleModal({ role, isOpen, onClose }: EditRoleModalProps) {
    const { toast } = useToast();
    const { updateRole } = useRoles();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        display_name: '',
        description: '',
        color: 'gray'
    });
    const [permissions, setPermissions] = useState<PermissionsMap>({});

    // Load role data when modal opens
    useEffect(() => {
        if (role) {
            // Extract color value from class string
            const colorClass = role.color || 'bg-gray-100 text-gray-800';
            const colorMatch = COLORS.find(c => colorClass.includes(c.bg));

            setFormData({
                display_name: role.display_name,
                description: role.description || '',
                color: colorMatch?.value || 'gray'
            });

            // Converter permissions do banco (pode ser Record<string, unknown>) para PermissionsMap
            const rawPerms = (role.permissions ?? {}) as Record<string, unknown>;
            const cleanPerms: PermissionsMap = {};
            for (const [key, val] of Object.entries(rawPerms)) {
                cleanPerms[key] = val === true;
            }
            setPermissions(cleanPerms);
        }
    }, [role]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!role) return;

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

            await updateRole.mutateAsync({
                id: role.id,
                display_name: formData.display_name,
                description: formData.description || undefined,
                color: colorClass,
                permissions,
            });

            toast({
                title: 'Role atualizado',
                description: `O role "${formData.display_name}" foi atualizado com sucesso.`,
                type: 'success'
            });

            onClose();
        } catch (error: unknown) {
            toast({
                title: 'Erro ao atualizar role',
                description: (error instanceof Error ? error.message : null) || 'Não foi possível atualizar o role.',
                type: 'error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                    <DialogTitle>Editar Role: {role?.display_name}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="details" className="py-2">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="details">Dados</TabsTrigger>
                            <TabsTrigger value="permissions">Permissões</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="space-y-4 pt-4">
                            {/* Identifier (read-only for system roles) */}
                            {role?.is_system && (
                                <div className="space-y-2">
                                    <Label>Identificador (Sistema)</Label>
                                    <Input
                                        value={role.name}
                                        disabled
                                        className="bg-muted text-muted-foreground cursor-not-allowed font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Roles do sistema não podem ter seu identificador alterado.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="edit-role-name">Nome do Role *</Label>
                                <Input
                                    id="edit-role-name"
                                    value={formData.display_name}
                                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                    placeholder="Ex: Supervisor, Analista, etc."
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="edit-role-description">Descrição</Label>
                                <Textarea
                                    id="edit-role-description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Descreva as responsabilidades e permissões deste role..."
                                    rows={3}
                                />
                            </div>

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
                        </TabsContent>

                        <TabsContent value="permissions" className="pt-4">
                            <PermissionMatrix value={permissions} onChange={setPermissions} />
                        </TabsContent>
                    </Tabs>

                    <DialogFooter className="mt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
