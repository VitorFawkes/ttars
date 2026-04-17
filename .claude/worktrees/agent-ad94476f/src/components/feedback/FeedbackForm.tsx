import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useProductContext } from "@/hooks/useProductContext";

import {
    feedbackSchema,
    type FeedbackFormData,
    type FeedbackTypeValue,
    feedbackTypeLabels,
} from "./feedbackSchema";

interface FeedbackFormProps {
    onClose: () => void;
}

export default function FeedbackForm({ onClose }: FeedbackFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user } = useAuth();
    const { currentProduct } = useProductContext();

    const form = useForm<FeedbackFormData>({
        resolver: zodResolver(feedbackSchema),
        defaultValues: {
            type: undefined,
            title: "",
            details: "",
        },
    });

    const selectedType = form.watch("type");

    const onSubmit = async (data: FeedbackFormData) => {
        setIsSubmitting(true);
        try {
            const webhookUrl = import.meta.env.VITE_FEEDBACK_WEBHOOK_URL;

            const payload = {
                type: data.type,
                typeLabel: feedbackTypeLabels[data.type],
                title: data.title,
                details: data.details,
                user: user?.email ?? null,
                product: currentProduct,
                timestamp: new Date().toISOString(),
                url: window.location.href,
            };

            if (webhookUrl) {
                await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                console.log("Feedback submitted (no webhook configured):", payload);
            }

            toast.success("Feedback enviado!", {
                description: "Obrigado pelo seu feedback.",
            });

            form.reset();
            onClose();
        } catch (error) {
            console.error("Failed to submit feedback:", error);
            toast.error("Erro ao enviar", {
                description: "Tente novamente mais tarde.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const feedbackTypes = Object.entries(feedbackTypeLabels) as [
        FeedbackTypeValue,
        string
    ][];

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-4 sm:p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Enviar Feedback</h3>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8 rounded-full"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Feedback Type Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                        Tipo de feedback
                    </label>
                    <div className="space-y-2">
                        {feedbackTypes.map(([value, label]) => (
                            <div
                                key={value}
                                className={cn(
                                    "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                    form.watch("type") === value
                                        ? "border-indigo-500 bg-indigo-50"
                                        : "border-slate-200 hover:bg-slate-50"
                                )}
                                onClick={() => form.setValue("type", value)}
                            >
                                <input
                                    type="radio"
                                    name="type"
                                    value={value}
                                    checked={form.watch("type") === value}
                                    onChange={() => form.setValue("type", value)}
                                    className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-900">{label}</span>
                            </div>
                        ))}
                    </div>
                    {form.formState.errors.type && (
                        <p className="text-sm text-red-500">
                            {form.formState.errors.type.message}
                        </p>
                    )}
                </div>

                {/* Title and Details - Shows after type selection */}
                <AnimatePresence>
                    {selectedType && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    Título
                                </label>
                                <Input
                                    {...form.register("title")}
                                    placeholder="Resumo do seu feedback..."
                                    className="w-full"
                                />
                                {form.formState.errors.title && (
                                    <p className="text-sm text-red-500">
                                        {form.formState.errors.title.message}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                    Detalhes
                                </label>
                                <Textarea
                                    {...form.register("details")}
                                    placeholder="Descreva seu feedback em detalhes..."
                                    rows={4}
                                    className="w-full resize-none"
                                />
                                {form.formState.errors.details && (
                                    <p className="text-sm text-red-500">
                                        {form.formState.errors.details.message}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Submit Button */}
                <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || !selectedType}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-4 w-4" />
                            Enviar Feedback
                        </>
                    )}
                </Button>
            </form>
        </div>
    );
}
