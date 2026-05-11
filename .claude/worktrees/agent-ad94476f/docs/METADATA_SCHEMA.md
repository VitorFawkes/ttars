# Metadata Schema Governance

This document defines the expected schema for JSONB `metadata` fields used in the CRM.

---

## `tarefas.metadata` for `tipo = 'solicitacao_mudanca'`

When a task is of type `solicitacao_mudanca` (Change Request), the `metadata` field should contain:

| Key | Type | Description |
|-----|------|-------------|
| `change_reason` | `string` | The reason provided by the user for the change request |
| `original_stage_id` | `uuid` | The ID of the pipeline stage when the request was made |
| `original_owner_id` | `uuid` | The ID of the trip owner when the request was made |

### Example

```json
{
  "change_reason": "Cliente pediu para mudar destino para Maldivas",
  "original_stage_id": "6bf4eddc-831a-4a6a-915c-98ca4e422bfc",
  "original_owner_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Rules

1. **Only for Change Requests**: This schema ONLY applies when `tipo = 'solicitacao_mudanca'`.
2. **Other task types**: For other task types, `metadata` should be `null` or empty.
3. **Validation**: The frontend (`CardTasks.tsx`) enforces this schema during creation.

---

## Future Additions

When adding new metadata schemas:

1. Add a new section to this document
2. Define the task type or context
3. Specify all fields with types and descriptions
4. Include a JSON example
