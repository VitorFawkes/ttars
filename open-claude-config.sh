#!/bin/bash

# Script para abrir o arquivo de configuração do Claude
CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

echo "Abrindo arquivo de configuração do Claude..."
echo "Caminho: $CONFIG_PATH"
echo ""

# Abrir no editor de texto padrão
open -a TextEdit "$CONFIG_PATH"

echo "✅ Arquivo aberto no TextEdit!"
echo ""
echo "📝 Procure por: \"SUPABASE_ACCESS_TOKEN\""
echo "🔄 Substitua o valor pelo seu token do Supabase"
echo "💾 Salve o arquivo (⌘ + S)"
echo "🔄 Reinicie o Claude (⌘ + Q e abrir novamente)"
