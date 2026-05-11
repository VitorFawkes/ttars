---
name: deploy
description: Deploy edge function para o Supabase
disable-model-invocation: true
argument-hint: "[nome-da-function]"
---

Deploy da edge function $ARGUMENTS para produção.

1. Verificar que a function existe em `supabase/functions/$ARGUMENTS/`
2. Rodar `npx tsc --noEmit` para verificar tipos
3. Executar: `npx supabase functions deploy $ARGUMENTS --project-ref szyrzxvlptqqheizyrxu`
4. Verificar se o deploy foi bem sucedido
5. Reportar resultado ao usuário
