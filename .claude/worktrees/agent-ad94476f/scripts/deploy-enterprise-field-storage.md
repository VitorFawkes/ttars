# Deploy: Enterprise Field Storage System

## O QUE FOI FEITO

Implementamos uma arquitetura **100% modular** onde:

1. **Cada campo mapeado agora sabe onde deve ser armazenado** - configurado no banco de dados, não no código
2. **Zero listas hardcoded** - o código lê `integration_field_map.storage_location` para decidir onde salvar
3. **Fácil de configurar** - basta UPDATE/INSERT no banco para adicionar, mudar ou mover campos

## ARQUIVOS MODIFICADOS

1. `supabase/migrations/20260128_enterprise_field_storage.sql` - Migração do banco
2. `supabase/functions/integration-process/index.ts` - Código atualizado para ser dinâmico

---

## PASSO 1: EXECUTAR A MIGRAÇÃO SQL NO SUPABASE

**Acesse:** Supabase Dashboard → SQL Editor

Cole e execute o conteúdo do arquivo:
`supabase/migrations/20260128_enterprise_field_storage.sql`

Isso irá:
- Criar o enum `field_storage_location` com valores: `column`, `produto_data`, `marketing_data`, `briefing_inicial`
- Adicionar coluna `storage_location` na tabela `integration_field_map`
- Adicionar coluna `db_column_name` na tabela `integration_field_map`
- Popular automaticamente os valores baseado nos padrões existentes

---

## PASSO 2: DEPLOY DA EDGE FUNCTION

### Opção A: Via Antigravity CLI

```bash
supabase functions deploy integration-process --project-ref XXXXX
```

(Substitua XXXXX pelo seu project ref)

### Opção B: Via Dashboard Supabase

1. Acesse: Supabase Dashboard → Edge Functions
2. Selecione `integration-process`
3. Clique em "Update"
4. Cole o código de `supabase/functions/integration-process/index.ts`
5. Deploy

---

## PASSO 3: VERIFICAR SE FUNCIONOU

Execute no SQL Editor:

```sql
SELECT
    local_field_key,
    storage_location,
    db_column_name,
    section
FROM integration_field_map
WHERE entity_type = 'deal'
  AND is_active = true
ORDER BY storage_location, local_field_key;
```

Você deve ver cada campo com seu `storage_location` definido.

---

## COMO FUNCIONA AGORA

### Para adicionar um NOVO campo que vai para uma COLUNA:

```sql
INSERT INTO integration_field_map (
    source, entity_type, external_field_id, local_field_key,
    direction, integration_id, section, external_pipeline_id,
    sync_always, is_active,
    storage_location, db_column_name
) VALUES (
    'active_campaign', 'deal', '999', 'novo_campo',
    'inbound', 'a2141b92-561f-4514-92b4-9412a068d236', 'system', '8',
    true, true,
    'column', 'nova_coluna_cards'  -- <<< DEFINE O DESTINO AQUI
);
```

### Para adicionar um campo que vai para produto_data JSON:

```sql
INSERT INTO integration_field_map (
    source, entity_type, external_field_id, local_field_key,
    direction, integration_id, section, external_pipeline_id,
    sync_always, is_active,
    storage_location, db_column_name
) VALUES (
    'active_campaign', 'deal', '888', 'meu_campo_custom',
    'inbound', 'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8',
    true, true,
    'produto_data', NULL  -- <<< VAI PARA JSONB
);
```

### Para MUDAR um campo de marketing_data para coluna:

```sql
UPDATE integration_field_map
SET storage_location = 'column',
    db_column_name = 'utm_source'
WHERE local_field_key = 'utm_source';
```

---

## RESUMO DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVE CAMPAIGN (AC)                         │
│                                                                 │
│  Webhook/Sync envia: deal[fields][20] = "Tailândia"            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  integration_field_map                          │
│                                                                 │
│  external_field_id: '20'                                        │
│  local_field_key: 'destinos'                                    │
│  storage_location: 'marketing_data'  ◄── CONFIGURÁVEL!         │
│  db_column_name: NULL                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  integration-process                            │
│                                                                 │
│  LÊ storage_location → decide onde salvar                       │
│  - 'column'         → cards.{db_column_name}                    │
│  - 'produto_data'   → cards.produto_data[key]                   │
│  - 'marketing_data' → cards.marketing_data[key]                 │
│  - 'briefing_inicial' → cards.briefing_inicial[key]             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CARDS TABLE                                │
│                                                                 │
│  Se storage_location = 'column':                                │
│    → Salva em cards.valor_estimado, cards.utm_source, etc.      │
│                                                                 │
│  Se storage_location = 'marketing_data':                        │
│    → Salva em cards.marketing_data = { destinos: "Tailândia" }  │
└─────────────────────────────────────────────────────────────────┘
```

---

## BENEFÍCIOS

✅ **Zero código para novos campos** - apenas configure no banco
✅ **Mover campo = 1 UPDATE** - mude storage_location e pronto
✅ **Auditável** - tudo está no banco, versionável
✅ **Backwards compatible** - prefixos legacy ainda funcionam como fallback
