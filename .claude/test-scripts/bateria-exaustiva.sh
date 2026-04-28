#!/bin/bash
# Bateria exaustiva do módulo Concierge — testa cada caminho como humano testaria
SVC=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
ANON=$(grep VITE_SUPABASE_ANON_KEY /Users/vitorgambetti/Documents/WelcomeCRM/.env | cut -d= -f2)
URL="https://szyrzxvlptqqheizyrxu.supabase.co"
SILVIA="0037915f-fdb8-48bf-b31e-207788878b5e"
TRIPS_ORG="b0000000-0000-0000-0000-000000000001"

# 5 cards únicos
ROMA="397d5ed5-d789-4b6f-bc93-b2d12bb30fc2"     # Roma D+45
VENEZA="25dac139-3917-4690-8b6e-aeed4e278f5c"   # Veneza D+10
PARIS="6fbb893a-9b74-473a-93ab-4476196c4881"    # Paris D+2
TOKYO="b9668198-b78e-470e-8a6d-84dae2d9cf8b"    # Tokyo em viagem
NY="6e017ad5-090c-4773-9ee4-607d568958a0"       # NY pós

PASS=0; FAIL=0; BUGS=()
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ko() { echo "  ✗ $1"; FAIL=$((FAIL+1)); BUGS+=("$1"); }

rpc() {
  curl -s -X POST "$URL/rest/v1/rpc/$1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
    -d "$2"
}
get() {
  curl -s "$URL/rest/v1/$1" -H "apikey: $ANON" -H "Authorization: Bearer $SVC"
}
patch() {
  curl -s -X PATCH "$URL/rest/v1/$1" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" -d "$2"
}
del() {
  curl -s -X DELETE "$URL/rest/v1/$1" -H "apikey: $ANON" -H "Authorization: Bearer $SVC"
}

echo "═══ BATERIA 1: criação de atendimentos (todos os tipos × diversas categorias) ═══"

# Sintomas reais que humano cria
declare -a CRIAR=(
  # card | tipo | cat | source | titulo | prazo | valor | cobrado
  "$ROMA|oferta|passeio|cadencia|Ofertar city tour Roma com guia PT|2026-06-09T18:00:00Z|1200|cliente"
  "$ROMA|oferta|assento|cadencia|Vender upgrade assento Latam executiva|2026-06-10T17:00:00Z|850|cliente"
  "$ROMA|oferta|transfer|manual|Transfer Fiumicino executivo|2026-06-11T19:00:00Z|320|cliente"
  "$ROMA|operacional|publicar_app|cadencia|Publicar App da viagem|2026-04-29T10:00:00Z||"
  "$ROMA|operacional|passaporte|cadencia|Pedir passaporte João|2026-05-22T12:00:00Z||"
  "$VENEZA|reserva|restaurante|cliente|Reservar Cipriani sábado 21h|2026-05-04T18:00:00Z||"
  "$VENEZA|oferta|ingresso|cadencia|Ingressos Palácio Ducal|2026-05-02T12:00:00Z|640|cliente"
  "$VENEZA|suporte|hotel_contato|cliente|Cliente quer trocar tipo de quarto|2026-05-01T15:00:00Z||"
  "$VENEZA|operacional|welcome_letter|cadencia|Welcome letter Belmond Cipriani|2026-05-01T17:00:00Z||"
  "$PARIS|operacional|passaporte|cadencia|Pedir foto passaporte Pedro|2026-04-22T10:00:00Z||"
  "$PARIS|operacional|check_in_oferta|cadencia|Oferecer check-in feito por nós|2026-04-23T14:00:00Z||"
  "$PARIS|oferta|seguro|manual|Vender seguro estendido AXA|2026-04-26T18:00:00Z|480|cliente"
  "$TOKYO|suporte|hotel_contato|cliente|URGENTE cliente perdeu cartao do quarto|2026-04-27T14:00:00Z||"
  "$TOKYO|suporte|hotel_contato|cliente|Voo interno KIX-NRT atrasou 4h|2026-04-27T08:00:00Z||"
  "$TOKYO|operacional|check_in_executar|cadencia|Check-in voo retorno JL047|2026-04-27T20:00:00Z||"
  "$NY|operacional|pesquisa_pos|cadencia|Pesquisa feedback Família Rocha|2026-04-27T15:00:00Z||"
  "$NY|operacional|welcome_letter|cadencia|Welcome letter hotel Plaza|2026-04-15T10:00:00Z||"
)

CREATED=()
for entry in "${CRIAR[@]}"; do
  IFS='|' read -r card tipo cat source titulo prazo valor cobrado <<< "$entry"
  PAYLOAD=$(python3 -c "
import json
d = {'p_card_id': '$card', 'p_tipo_concierge': '$tipo', 'p_categoria': '$cat',
     'p_source': '$source', 'p_titulo': '$titulo', 'p_data_vencimento': '$prazo',
     'p_responsavel_id': '$SILVIA', 'p_prioridade': 'media'}
if '$valor' and '$valor' != '': d['p_valor'] = float('$valor')
if '$cobrado': d['p_cobrado_de'] = '$cobrado'
print(json.dumps(d))")
  R=$(rpc rpc_criar_atendimento_concierge "$PAYLOAD")
  ID=$(echo "$R" | tr -d '"' | grep -E "^[a-f0-9-]{36}$")
  if [ -n "$ID" ]; then
    CREATED+=("$ID")
    ok "$cat ($tipo) → $ID"
  else
    ko "criar $cat: $R"
  fi
done

echo ""
echo "═══ BATERIA 2: edge cases (validação) ═══"

# T2.1: card inexistente
R=$(rpc rpc_criar_atendimento_concierge '{"p_card_id":"00000000-0000-0000-0000-000000000000","p_tipo_concierge":"oferta","p_categoria":"passeio","p_source":"manual","p_titulo":"X"}')
echo "$R" | grep -q "não encontrado" && ok "card inexistente bloqueado" || ko "card inexistente: $R"

# T2.2: tipo inválido
R=$(rpc rpc_criar_atendimento_concierge "{\"p_card_id\":\"$ROMA\",\"p_tipo_concierge\":\"FAKE\",\"p_categoria\":\"passeio\",\"p_source\":\"manual\",\"p_titulo\":\"X\"}")
echo "$R" | grep -q "atendimentos_concierge_tipo_concierge_check" && ok "tipo inválido bloqueado" || ko "tipo inválido: $R"

# T2.3: source inválido
R=$(rpc rpc_criar_atendimento_concierge "{\"p_card_id\":\"$ROMA\",\"p_tipo_concierge\":\"oferta\",\"p_categoria\":\"passeio\",\"p_source\":\"alien\",\"p_titulo\":\"X\"}")
echo "$R" | grep -q "source_check\|invalid input" && ok "source inválido bloqueado" || ko "source inválido: $R"

# T2.4: cobrado_de inválido
R=$(rpc rpc_criar_atendimento_concierge "{\"p_card_id\":\"$ROMA\",\"p_tipo_concierge\":\"oferta\",\"p_categoria\":\"passeio\",\"p_source\":\"manual\",\"p_titulo\":\"X\",\"p_cobrado_de\":\"galaxia\"}")
echo "$R" | grep -q "cobrado_de_check\|invalid input" && ok "cobrado_de inválido bloqueado" || ko "cobrado_de inválido: $R"

echo ""
echo "═══ BATERIA 3: marcar outcomes diversos ═══"

# Pegar 4 atendimentos pra testar cada outcome
A1="${CREATED[0]}"  # aceito
A2="${CREATED[1]}"  # recusado
A3="${CREATED[3]}"  # feito (operacional)
A4="${CREATED[2]}"  # cancelado

R=$(rpc rpc_marcar_outcome "{\"p_atendimento_id\":\"$A1\",\"p_outcome\":\"aceito\",\"p_valor_final\":1200,\"p_cobrado_de\":\"cliente\",\"p_observacao\":\"WhatsApp confirmado\"}")
[ -z "$R" ] && ok "aceito (com valor)" || ko "aceito: $R"

R=$(rpc rpc_marcar_outcome "{\"p_atendimento_id\":\"$A2\",\"p_outcome\":\"recusado\",\"p_observacao\":\"Cliente sem interesse\"}")
[ -z "$R" ] && ok "recusado" || ko "recusado: $R"

R=$(rpc rpc_marcar_outcome "{\"p_atendimento_id\":\"$A3\",\"p_outcome\":\"feito\"}")
[ -z "$R" ] && ok "feito" || ko "feito: $R"

R=$(rpc rpc_marcar_outcome "{\"p_atendimento_id\":\"$A4\",\"p_outcome\":\"cancelado\",\"p_observacao\":\"Cliente desistiu\"}")
[ -z "$R" ] && ok "cancelado" || ko "cancelado: $R"

# T3.5: outcome inválido
R=$(rpc rpc_marcar_outcome "{\"p_atendimento_id\":\"$A1\",\"p_outcome\":\"glorificado\"}")
echo "$R" | grep -q "outcome_check\|invalid input" && ok "outcome inválido bloqueado" || ko "outcome inválido: $R"

# T3.6: atendimento inexistente
R=$(rpc rpc_marcar_outcome '{"p_atendimento_id":"00000000-0000-0000-0000-000000000000","p_outcome":"feito"}')
echo "$R" | grep -q "não encontrado" && ok "atendimento inexistente bloqueado" || ko "atendimento inexistente: $R"

# Verificar tarefas foram fechadas (trigger sync)
TAREFA_IDS=$(get "atendimentos_concierge?id=in.($A1,$A2,$A3,$A4)&select=tarefa_id" | python3 -c "import sys,json; print(','.join(r['tarefa_id'] for r in json.load(sys.stdin)))")
TAR_FECHADAS=$(get "tarefas?id=in.($TAREFA_IDS)&concluida=eq.true&select=id" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$TAR_FECHADAS" = "4" ] && ok "tarefas fechadas via marcar_outcome (trigger)" || ko "tarefas fechadas: $TAR_FECHADAS de 4"

echo ""
echo "═══ BATERIA 4: trigger sync — marcar tarefa direto ═══"

# Pegar atendimento ativo
A_LIVRE="${CREATED[5]}"
TAR=$(get "atendimentos_concierge?id=eq.$A_LIVRE&select=tarefa_id" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['tarefa_id'])")
patch "tarefas?id=eq.$TAR" '{"concluida":true,"concluida_em":"2026-04-28T18:00:00Z","status":"concluida"}' > /dev/null
sleep 1
OUT_EM=$(get "atendimentos_concierge?id=eq.$A_LIVRE&select=outcome,outcome_em" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['outcome'], '|', r['outcome_em'])")
echo "$OUT_EM" | grep -q "feito" && ok "tarefa.concluida=true → atendimento.outcome='feito' (default)" || ko "trigger sync: $OUT_EM"

# Reverso: descompletar
patch "tarefas?id=eq.$TAR" '{"concluida":false,"concluida_em":null,"status":"pendente","outcome":null}' > /dev/null
sleep 1
OUT_R=$(get "atendimentos_concierge?id=eq.$A_LIVRE&select=outcome,outcome_em" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['outcome'], '|', r['outcome_em'])")
[ "$OUT_R" = "None | None" ] && ok "tarefa reaberta → outcome limpo" || ko "trigger reverso: $OUT_R"

echo ""
echo "═══ BATERIA 5: rpc_executar_em_lote ═══"

LOTE_IDS=("${CREATED[6]}" "${CREATED[7]}" "${CREATED[8]}")
LOTE_JSON=$(printf '"%s",' "${LOTE_IDS[@]}" | sed 's/,$//')
R=$(rpc rpc_executar_em_lote "{\"p_atendimento_ids\":[$LOTE_JSON],\"p_outcome\":\"feito\",\"p_observacao\":\"Lote executado\"}")
[ "$R" = "3" ] && ok "lote de 3 retornou 3" || ko "lote: esperava 3, retornou $R"

# Verificar todos marcados
LOTE_FECHADOS=$(get "atendimentos_concierge?id=in.($LOTE_JSON)&outcome=eq.feito&select=id" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$LOTE_FECHADOS" = "3" ] && ok "3 atendimentos do lote marcados feito" || ko "lote: $LOTE_FECHADOS de 3"

# Lote vazio
R=$(rpc rpc_executar_em_lote '{"p_atendimento_ids":[],"p_outcome":"feito"}')
[ "$R" = "0" ] && ok "lote vazio retorna 0" || ko "lote vazio: $R"

echo ""
echo "═══ BATERIA 6: rpc_notificar_cliente ═══"

A_NOT="${CREATED[9]}"
R=$(rpc rpc_notificar_cliente "{\"p_atendimento_id\":\"$A_NOT\"}")
[ -z "$R" ] && ok "notificar OK" || ko "notificar: $R"
NOT_EM=$(get "atendimentos_concierge?id=eq.$A_NOT&select=notificou_cliente_em" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['notificou_cliente_em'])")
[ "$NOT_EM" != "None" ] && ok "notificou_cliente_em preenchido: $NOT_EM" || ko "notificou_em vazio"

echo ""
echo "═══ BATERIA 7: stats agregados (v_card_concierge_stats) ═══"

# Verifica contadores no card Veneza (que tem mix de feitos/abertos/aceitos)
STATS=$(get "v_card_concierge_stats?card_id=eq.$VENEZA&select=*")
echo "Stats Veneza: $STATS" | python3 -m json.tool 2>&1 | head -10

ATIVOS=$(get "atendimentos_concierge?card_id=eq.$VENEZA&outcome=is.null&select=id" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "  Ativos reais (outcome IS NULL): $ATIVOS"

VENDIDO=$(get "atendimentos_concierge?card_id=eq.$VENEZA&outcome=eq.aceito&cobrado_de=eq.cliente&select=valor" | python3 -c "import sys,json; print(sum(r['valor'] for r in json.load(sys.stdin)))")
echo "  Vendido real: R\$ $VENDIDO"

echo ""
echo "═══ BATERIA 8: CRUD modelos ═══"

# Criar modelo
TPL_RESP=$(curl -s -X POST "$URL/rest/v1/cadence_templates" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"name\":\"[TESTE-MODELO] Smoke\",\"description\":\"smoke test\",\"target_audience\":\"posvenda\",\"is_active\":false,\"schedule_mode\":\"interval\",\"execution_mode\":\"linear\",\"respect_business_hours\":true,\"business_hours_start\":9,\"business_hours_end\":18,\"allowed_weekdays\":[1,2,3,4,5],\"soft_break_after_days\":14,\"require_completion_for_next\":false,\"auto_cancel_on_stage_change\":true,\"org_id\":\"$TRIPS_ORG\"}")
TPL_ID=$(echo "$TPL_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else 'ERR')")
[ "$TPL_ID" != "ERR" ] && ok "template criado: $TPL_ID" || ko "template: $TPL_RESP"

STEP_RESP=$(curl -s -X POST "$URL/rest/v1/cadence_steps" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"template_id\":\"$TPL_ID\",\"step_order\":1,\"step_key\":\"b0_t1\",\"step_type\":\"task\",\"task_config\":{\"tipo\":\"tarefa\",\"titulo\":\"Smoke task\",\"prioridade\":\"media\",\"assign_to\":\"role_owner\"},\"day_offset\":-15,\"requires_previous_completed\":false,\"gera_atendimento_concierge\":true,\"tipo_concierge\":\"operacional\",\"categoria_concierge\":\"hotel_contato\",\"condicao_extra\":{},\"org_id\":\"$TRIPS_ORG\",\"block_index\":0}")
STEP_ID=$(echo "$STEP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) else 'ERR')")
[ "$STEP_ID" != "ERR" ] && ok "step criado: $STEP_ID" || ko "step: $STEP_RESP"

# Update
patch "cadence_steps?id=eq.$STEP_ID" '{"day_offset":-30,"categoria_concierge":"vip_treatment"}' > /dev/null
NEW=$(get "cadence_steps?id=eq.$STEP_ID&select=day_offset,categoria_concierge" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['day_offset'], r['categoria_concierge'])")
[ "$NEW" = "-30 vip_treatment" ] && ok "update aplicado" || ko "update: $NEW"

# Toggle is_active
patch "cadence_templates?id=eq.$TPL_ID" '{"is_active":true}' > /dev/null
ATIVO=$(get "cadence_templates?id=eq.$TPL_ID&select=is_active" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['is_active'])")
[ "$ATIVO" = "True" ] && ok "ativo=true" || ko "toggle: $ATIVO"

# Delete (CASCADE no step)
del "cadence_templates?id=eq.$TPL_ID" > /dev/null
SOBROU_STEP=$(get "cadence_steps?id=eq.$STEP_ID&select=id" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$SOBROU_STEP" = "0" ] && ok "delete cascade no step" || ko "delete cascade: ainda tem $SOBROU_STEP"

echo ""
echo "═══ BATERIA 9: motor de cadência E2E (gera atendimento concierge) ═══"

# Card limpo pra teste isolado
TESTE_CARD=$(curl -s -X POST "$URL/rest/v1/cards" -H "apikey: $ANON" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"titulo\":\"[TESTE-MOTOR] Card limpo\",\"produto\":\"TRIPS\",\"pessoa_principal_id\":\"ea4f4128-7c79-4a34-81e5-109f7a145740\",\"concierge_owner_id\":\"$SILVIA\",\"dono_atual_id\":\"$SILVIA\",\"pipeline_id\":\"c8022522-4a1d-411c-9387-efe03ca725ee\",\"pipeline_stage_id\":\"3ce80249-b579-4a9c-9b82-f8569735cea9\",\"data_viagem_inicio\":\"2026-05-15\",\"data_viagem_fim\":\"2026-05-22\",\"valor_estimado\":15000,\"org_id\":\"$TRIPS_ORG\",\"status_comercial\":\"aberto\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "  Card de teste: $TESTE_CARD"

# Ativar Welcome letter D-7
WL_ID="4a1dfa03-2677-4e72-b680-b256eb42800a"
patch "cadence_templates?id=eq.$WL_ID" '{"is_active":true}' > /dev/null

# Iniciar cadência via cadence-engine
INST=$(curl -s -X POST "$URL/functions/v1/cadence-engine" \
  -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"action\":\"start_cadence\",\"card_id\":\"$TESTE_CARD\",\"template_id\":\"$WL_ID\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('instance_id','ERR'))")
echo "  Instance: $INST"
sleep 4

# Conferir tarefa criada
TAR_M=$(get "tarefas?card_id=eq.$TESTE_CARD&select=id,titulo,metadata" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), d[0]['titulo'] if d else 'sem')")
echo "  Tarefas: $TAR_M"

# Conferir atendimento criado (linkado via cadence_step_id)
ATD_M=$(get "atendimentos_concierge?card_id=eq.$TESTE_CARD&cadence_step_id=not.is.null&select=id,categoria,source,origem_descricao" | python3 -m json.tool)
echo "$ATD_M"
ATD_COUNT=$(echo "$ATD_M" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
[ "$ATD_COUNT" -gt "0" ] && ok "motor criou atendimento_concierge" || ko "motor não criou complemento (ATD_COUNT=$ATD_COUNT)"

# Cleanup motor test
del "atendimentos_concierge?card_id=eq.$TESTE_CARD" > /dev/null
del "tarefas?card_id=eq.$TESTE_CARD" > /dev/null
del "cadence_queue?instance_id=eq.$INST" > /dev/null
del "cadence_event_log?instance_id=eq.$INST" > /dev/null
del "cadence_instances?id=eq.$INST" > /dev/null
patch "cards?id=eq.$TESTE_CARD" "{\"deleted_at\":\"2026-04-28T18:00:00Z\"}" > /dev/null
patch "cadence_templates?id=eq.$WL_ID" '{"is_active":false}' > /dev/null
echo "  ✓ cleanup motor"

echo ""
echo "═══ RESULTADO FINAL ═══"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$FAIL" -gt "0" ]; then
  echo ""
  echo "BUGS encontrados:"
  for b in "${BUGS[@]}"; do echo "  ✗ $b"; done
fi