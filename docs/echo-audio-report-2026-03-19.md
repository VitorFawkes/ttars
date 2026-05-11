# Relatório: Áudios outbound sem `message.sent` — apenas `message.status`

**Data:** 19/03/2026
**Período analisado:** 18/03/2026 00:00 UTC — 19/03/2026 15:00 UTC
**Organização:** Welcome (`1e21e01d-33a5-4a1f-8026-fa23b9adf313`)

---

## Resumo do problema

Mensagens de áudio enviadas por agentes via Echo estão chegando ao nosso webhook **apenas como evento `message.status`**, sem o evento `message.sent` correspondente. O `message.sent` é o único evento que contém o objeto `media` com a URL do arquivo de áudio. Sem ele, não temos como reproduzir o áudio no histórico da conversa.

### Impacto no período analisado

| Métrica | Valor |
|---------|-------|
| Total de áudios outbound recebidos | **88** |
| Com `message.sent` (áudio disponível) | **71** (81%) |
| Apenas `message.status` (áudio perdido) | **17** (19%) |

### Impacto por linha

| Linha | Total de áudios | Apenas `message.status` | % perdidos |
|-------|----------------|------------------------|------------|
| Trips - Travel Planner | 30 | 12 | 40% |
| SDR Weddings | 7 | 5 | 71% |
| Mariana Volpi | 35 | 0 | 0% |
| Corporativo | 16 | 0 | 0% |

**Observação:** As linhas "Mariana Volpi" e "Corporativo" não apresentam o problema. O problema está concentrado em "Trips - Travel Planner" e "SDR Weddings".

---

## Comportamento esperado vs observado

### Esperado (funciona corretamente ~81% das vezes)

Para cada áudio outbound, o webhook recebe **2 eventos** na sequência:

**1. `message.sent`** — contém a mídia:
```json
{
  "event": "message.sent",
  "message_id": "b9e2be5e-d7e9-40fd-a422-7cfd3368006e",
  "message_type": "audio",
  "media": {
    "url": "https://....supabase.co/storage/v1/object/public/attachments/.../file.ogg",
    "mime_type": "audio/ogg; codecs=opus"
  },
  "from_me": true,
  "direction": "outgoing",
  "text": "[Áudio]",
  "conversation_id": "e86c68b3-..."
}
```

**2. `message.status`** — confirma entrega:
```json
{
  "event": "message.status",
  "message_id": "b9e2be5e-d7e9-40fd-a422-7cfd3368006e",
  "message_type": "audio",
  "status_name": "delivered",
  "whatsapp_message_id": "2A00275083FDB4439FE4",
  "text": "[Áudio]",
  "conversation_id": "e86c68b3-..."
}
```

### Observado (bug — 19% dos áudios)

O webhook recebe **apenas** o evento `message.status`. O `message.sent` nunca chega:

```json
{
  "event": "message.status",
  "message_id": "f1c8967d-a969-4f2d-80e2-234091eb60c3",
  "message_type": "audio",
  "status_name": "delivered",
  "whatsapp_message_id": "3EB00AA5B3DC8BA739548C",
  "text": "[Áudio]",
  "conversation_id": "667a5d28-..."
}
```

**Campos ausentes no `message.status` que existem no `message.sent`:**
- `media` (objeto com `url`, `mime_type`, `filename`, `size_bytes`)
- `from_me`
- `direction`
- `actor_type`

Sem o campo `media.url`, não temos como baixar/reproduzir o áudio.

---

## Lista completa dos 17 áudios afetados

| # | Timestamp (UTC) | Echo `message_id` | `whatsapp_message_id` | Linha | Agente | `conversation_id` |
|---|-----------------|--------------------|-----------------------|-------|--------|--------------------|
| 1 | 2026-03-18 13:34:47 | `f1c8967d-a969-4f2d-80e2-234091eb60c3` | `3EB00AA5B3DC8BA739548C` | SDR Weddings | Sarah | `667a5d28-d759-4688-ac50-abbced1065b8` |
| 2 | 2026-03-18 13:36:20 | `06c30520-c12e-467a-8...` | `3EB0E0E3E16AABD7DA586F` | SDR Weddings | Sarah | `667a5d28-d759-4688-ac50-abbced1065b8` |
| 3 | 2026-03-18 14:19:48 | `fc23c92d-d19e-4c6b-8...` | `3EB0050AFEAA8E4F77C959` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-4dc8-80e9-...` |
| 4 | 2026-03-18 16:01:26 | `0cd72743-e64c-447e-a...` | `3EB0A4A8A22C9295F848F4` | Trips - Travel Planner | Camila Montanhini | `48e90a15-f94b-...` |
| 5 | 2026-03-18 16:27:37 | `8af1884e-6a9f-49e5-a...` | `3EB0E5430641B9A93F30E7` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 6 | 2026-03-18 16:29:48 | `e76a8a3a-b4b6-45db-b...` | `3EB0CDA03EED9C82D53CA8` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 7 | 2026-03-18 16:35:21 | `1d7cb71c-96c1-4cb7-a...` | `3EB0AA7D35EA4154A607B9` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 8 | 2026-03-18 16:53:48 | `a4b345b5-f27c-4ccc-8...` | `3EB0D8E5BFCC22EC45B6AC` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 9 | 2026-03-18 17:12:48 | `a7f50b34-5e7b-4274-9...` | `3EB0A5129FF7A58978F1CD` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 10 | 2026-03-18 17:13:34 | `553f2c47-9d18-4fc7-a...` | `3EB0663EF88941D994BA6D` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 11 | 2026-03-18 20:26:51 | `a87cbb75-045c-4130-9...` | `3EB0054202840D34FEB1EF` | SDR Weddings | Sarah | `c643746b-5222-...` |
| 12 | 2026-03-18 20:27:55 | `67b3f338-50ed-4031-a...` | `3EB069796D66107C50DFBC` | SDR Weddings | Sarah | `c643746b-5222-...` |
| 13 | 2026-03-18 20:29:17 | `a7edd66f-b55e-4df7-a...` | `3EB03CCB677B74882BC4F8` | SDR Weddings | Sarah | `c643746b-5222-...` |
| 14 | 2026-03-18 20:30:50 | `aed69241-bc03-4d25-8...` | `3EB04B52EF1F32F2837F41` | Trips - Travel Planner | Juliana Santana | `3e41dffd-3ef6-...` |
| 15 | 2026-03-18 21:13:36 | `2332c35b-cb49-4b65-b...` | `3EB0F56B83F1D352818A2F` | Trips - Travel Planner | Juliana Santana | `e86c68b3-62ad-...` |
| 16 | 2026-03-18 21:22:36 | `1677f764-4aea-4120-9...` | `3EB09179BDE178A8EEDEE4` | Trips - Travel Planner | Juliana Santana | `e86c68b3-62ad-...` |
| 17 | 2026-03-18 23:32:34 | `fcd9eb8a-5f47-4a5f-8...` | `3EB0F3F13BE67F22F4420C` | Trips - Travel Planner | Camila Montanhini | `f2606250-5f6e-...` |

---

## Pedido

Para mensagens outbound de áudio, precisamos que o evento `message.sent` **sempre** seja enviado ao webhook, pois é o único que contém o objeto `media` com a URL do arquivo.

Alternativa: incluir o objeto `media` (com `url`) também no payload do `message.status` quando `message_type` for `audio`, `image`, `document` ou `video`.

---

## Informações adicionais

- **Webhook URL:** Configurado na organização Welcome
- **Organization ID:** `1e21e01d-33a5-4a1f-8026-fa23b9adf313`
- **Linhas afetadas:** `Trips - Travel Planner` (phone_number_id: `da3edcc0-...`), `SDR Weddings` (phone_number_id: `qr_1772650382956`)
- **Linhas sem problema:** `Mariana Volpi`, `Corporativo`
