# /review — Code Review antes de commit

Revisa as mudanças atuais usando o agente code-reviewer especializado.

## Quando usar
- Antes de commits com mudanças significativas (100+ linhas)
- Quando o stop hook sugerir
- Manualmente quando quiser uma revisão extra

## Instruções

1. Obtenha os arquivos modificados:
```bash
git diff --name-only
```

2. Lance o agente code-reviewer (subagent_type: "code-reviewer") com prompt:
```
Revise as seguintes mudanças no WelcomeCRM. Foque em:
- Duplicações de código ou lógica
- Imports não utilizados ou quebrados
- Secrets hardcoded ou expostos
- Tipos TypeScript incorretos ou faltantes
- Consistência com padrões existentes
- Problemas de design (glassmorphism em light mode, cores hex, etc.)

Arquivos modificados: [lista dos arquivos]

Para cada arquivo, leia o conteúdo e analise contra os padrões documentados em sua memória.
Reporte apenas problemas REAIS — não sugira melhorias estéticas.
```

3. Apresente o resultado ao usuário com severidade (ALTO/MEDIO/BAIXO) por item.

4. Se encontrar novos padrões de erro, registre no code-reviewer MEMORY.md seguindo o protocolo de escrita.
