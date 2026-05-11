#!/bin/bash
input=$(cat)
MODEL=$(echo "$input" | jq -r '.model.display_name')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')

if [ "$PCT" -gt 70 ]; then
  echo "[$MODEL] WARNING ${PCT}% contexto | \$${COST}"
else
  echo "[$MODEL] ${PCT}% contexto | \$${COST}"
fi
