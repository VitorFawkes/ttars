---
name: verify
description: Verificação completa de qualidade do projeto (security, lint, schema, tests, UX)
disable-model-invocation: true
---

Rode a verificação completa de qualidade:

1. `python3 .agent/scripts/checklist.py .`
2. Analise cada resultado (P0-Security até P5-SEO)
3. Se algum check falhar, corrija o problema
4. Rode novamente até tudo passar
5. Reporte resultado final ao usuário
