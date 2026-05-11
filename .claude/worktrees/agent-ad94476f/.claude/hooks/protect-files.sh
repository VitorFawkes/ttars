#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

PROTECTED=(".env" ".env.local" ".env.development.staging" "package-lock.json" ".git/" "src/database.types.ts")

for pattern in "${PROTECTED[@]}"; do
  if [[ "$FILE" == *"$pattern"* ]]; then
    echo "BLOQUEADO: $FILE é um arquivo protegido. Não edite diretamente." >&2
    exit 2
  fi
done

exit 0
