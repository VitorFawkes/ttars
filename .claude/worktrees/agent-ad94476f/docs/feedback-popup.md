# Feedback Popup - WelcomeCRM

Popup flutuante e arrastável para coleta de feedback dos usuários.

## Funcionalidades

- Botão flutuante com ícone de mensagem (indigo)
- Arrastável para qualquer lugar da tela
- Posicionamento inteligente do painel (não sai da tela)
- Formulário com validação Zod
- Envio via webhook configurável
- Integração com contexto de produto e autenticação
- Responsivo (mobile e desktop)

---

## Estrutura de Arquivos

```
src/components/feedback/
├── feedbackSchema.ts    # Schema Zod + tipos
├── FeedbackForm.tsx     # Formulário
└── FeedbackPopup.tsx    # Container flutuante
```

---

## Integração

O componente já está integrado no Layout principal (`src/components/layout/Layout.tsx`).

Para configurar o webhook, adicione a variável de ambiente:

```env
VITE_FEEDBACK_WEBHOOK_URL=https://seu-endpoint.com/webhook
```

---

## Payload Enviado

```json
{
  "type": "bug",
  "typeLabel": "Reportar erro ou bug",
  "title": "Título do feedback",
  "details": "Descrição detalhada do problema...",
  "user": "usuario@email.com",
  "product": "TRIPS",
  "timestamp": "2026-03-11T12:00:00.000Z",
  "url": "https://crm.welcometrips.com.br/pipeline"
}
```

---

## Tipos de Feedback

| Tipo | Label |
|------|-------|
| `support` | Suporte |
| `bug` | Reportar erro ou bug |
| `feature` | Pedido de função |
| `other` | Outro |

---

## Customização

### Mudar posição inicial

```tsx
// Em FeedbackPopup.tsx, altere as classes:
className={cn(
  "fixed z-50",
  "right-4 bottom-20"  // canto inferior direito
)}
```

### Mudar cor do botão

```tsx
className={cn(
  "bg-blue-500 hover:bg-blue-600",  // azul
  // ou
  "bg-emerald-600 hover:bg-emerald-700",  // verde
)}
```

### Adicionar mais tipos de feedback

```typescript
// Em feedbackSchema.ts:
export const FeedbackType = z.enum([
  "support",
  "bug",
  "feature",
  "other",
  "question",  // novo tipo
]);

export const feedbackTypeLabels: Record<FeedbackTypeValue, string> = {
  support: "Suporte",
  bug: "Reportar erro ou bug",
  feature: "Pedido de função",
  other: "Outro",
  question: "Dúvida",  // novo label
};
```

---

## Dependências

- `framer-motion` - Animações e drag-and-drop
- `react-hook-form` + `@hookform/resolvers` - Formulário
- `zod` - Validação
- `sonner` - Toast notifications
- `lucide-react` - Ícones
