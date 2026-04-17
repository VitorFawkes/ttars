# MATRIZ DE DEPENDÊNCIAS - Funções Críticas WelcomeCRM

## Tabela Principal

| Function | Frontend? | Edge Functions? | Database? | Type | Implementation | Risk |
|----------|-----------|-----------------|-----------|------|-----------------|------|
| **exec_sql** | No | No | No | RPC | Missing | 🔴 CRITICAL |
| **generate_api_key** | Yes (Hook) | No | Unknown | RPC | Typed | 🟡 MEDIUM |
| **validate_api_key** | No | Yes (Auth) | Unknown | RPC | Typed | 🔴 CRITICAL |
| **revoke_api_key** | Yes (Hook) | No | Unknown | RPC | Typed | 🟡 MEDIUM |
| **describe_table** | No | No | No | RPC | Missing | 🟢 LOW |
| **list_all_tables** | No | No | Dynamic | RPC | Created at Runtime | 🟡 MEDIUM |

---

## Frontend Usage

### src/hooks/useApiKeys.ts

```
├── useCreateApiKey()
│   └── supabase.rpc('generate_api_key', {...})
│       ├── p_name: string
│       ├── p_permissions?: { read, write }
│       ├── p_rate_limit?: number
│       └── p_expires_at?: string
│       Returns: { api_key_id, plain_text_key }
│
├── useRevokeApiKey()
│   └── supabase.rpc('revoke_api_key', { p_key_id })
│       Returns: boolean
│
├── useApiKeyLogs()
│   └── FROM api_request_logs
│
└── useApiKeyStats()
    └── FROM api_request_logs
```

**Files:**
- `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/src/hooks/useApiKeys.ts`

**Lines:**
- generate_api_key: 57
- revoke_api_key: 81

---

## Edge Functions Usage

### supabase/functions/public-api/index.ts

```
├── Authentication Middleware (app.use "/*")
│   ├── Extract X-API-Key header
│   ├── Call supabase.rpc('validate_api_key', { p_key })
│   │   ├── Returns: { is_valid, key_id, rate_limit, current_count, ... }
│   │   └── On error/invalid: return 401
│   │
│   └── Log Request
│       └── Insert to api_request_logs
│           ├── api_key_id
│           ├── endpoint
│           ├── method
│           ├── status_code
│           ├── response_time_ms
│           ├── ip_address
│           └── user_agent
│
├── GET /deals
├── POST /deals
├── GET /contacts
└── POST /contacts
```

**Files:**
- `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/supabase/functions/public-api/index.ts`

**Lines:**
- validate_api_key: 37
- logging: 53-61

**Critical:** Every single request goes through validate_api_key()

---

## Scripts Usage

### scripts/supabase-admin.ts

```
├── Hardcoded Credentials (SECURITY ISSUE)
│   ├── SERVICE_ROLE_KEY: "eyJ..."
│   └── MANAGEMENT_API_KEY: "sb_secret_..."
│
├── listTables()
│   ├── Try: supabaseAdmin.rpc('pg_tables_list')
│   └── Fallback: Create list_all_tables() if missing
│       └── supabase.fetch('/rpc/list_all_tables')
│
├── runSQL()
│   └── supabase.fetch('/rpc/exec_sql', { query: sql })
│       └── Uses SERVICE_ROLE_KEY (CRITICAL)
│
├── listEdgeFunctions()
│   └── managementAPI('/functions')
│
└── getProjectInfo()
    └── fetch to Supabase Management API
```

**Files:**
- `/sessions/sleepy-epic-clarke/mnt/WelcomeCRM/scripts/supabase-admin.ts`

**Lines:**
- SERVICE_ROLE_KEY: 8-10
- list_all_tables: 37-83
- exec_sql: 86-94
- list_all_tables creation: 61-73

---

## Database Types

### src/database.types.ts

```typescript
rpc: {
  // Line 6213
  generate_api_key: {
    Args: {
      p_name: string;
      p_permissions?: Json;
      p_rate_limit?: number;
      p_expires_at?: string;
    };
    Returns: {
      api_key_id: string;
      plain_text_key: string;
    }[];
  };

  // Line 6330
  revoke_api_key: {
    Args: { p_key_id: string };
    Returns: boolean;
  };

  // Line 6383
  validate_api_key: {
    Args: { p_key: string };
    Returns: {
      is_valid: boolean;
      key_id: string;
      rate_limit: number;
      current_count: number;
      error_message: string;
      permissions: Json;
    }[];
  };
}
```

**Status:** Types are generated, actual implementation location UNKNOWN

---

## Documentation Usage

### CLAUDE.md (Line 101-102)

Mentions as available capability:
- SQL arbitrário → exec_sql
- Listar tabelas → list_all_tables

### .skills/modo-antigravity/SKILL.md (Line 33, 82)

Mentions as available capability:
- exec_sql → supabase_rpc
- list_all_tables → supabase_rpc

---

## Call Chain Analysis

### Happy Path: API Request

```
User Request (POST /deals with X-API-Key)
    ↓
Public API Edge Function
    ├─ Extract X-API-Key header
    ├─ Call validate_api_key(key)
    │   └─ Database RPC (Implementation Unknown)
    │       └─ Returns { is_valid, rate_limit, current_count, ... }
    ├─ Check is_valid == true
    ├─ Check rate_limit not exceeded
    ├─ Process Request
    │   └─ Query cards table
    └─ Log to api_request_logs
        └─ Fire and forget (no await)
    ↓
Response 200/400/500
```

### Issue: validate_api_key Missing

If function doesn't exist or returns wrong data:
```
validate_api_key() → ERROR
    ↓
Edge Function catches error
    ↓
Returns 401 "Invalid API Key"
    ↓
But logs don't show WHICH function failed!
```

---

## Dependency Graph

```
WelcomeCRM
├── Frontend (src/)
│   ├── useApiKeys.ts
│   │   ├── generate_api_key() ──┐
│   │   └── revoke_api_key() ────┤
│   └── database.types.ts        │
│       ├── Line 6213: generate_api_key Type
│       ├── Line 6330: revoke_api_key Type
│       └── Line 6383: validate_api_key Type
│
├── Edge Functions (supabase/functions/)
│   ├── public-api/index.ts
│   │   ├── validate_api_key() ──┤
│   │   └── Logging (api_request_logs)
│   └── [Other 9 functions not analyzed]
│
├── Database (Unknown Location)
│   ├── api_keys table
│   ├── api_request_logs table
│   └── RPC Functions (Missing sources for 3 functions)
│
└── Scripts (scripts/)
    ├── supabase-admin.ts
    │   ├── exec_sql() ──────────┤── NOT IMPLEMENTED
    │   └── list_all_tables() ──┘── CREATED DYNAMICALLY
    └── [Admin tools only]

Legend: ──┐ = Missing/Unknown/Risk
```

---

## Risk Summary by Function

### exec_sql (🔴 CRITICAL)
- **Used:** scripts/supabase-admin.ts (line 86)
- **Exists:** No
- **Risk:** If implemented without SECURITY DEFINER → SQL Injection
- **Recommendation:** Do NOT implement

### generate_api_key (🟡 MEDIUM)
- **Used:** Frontend hook (line 57)
- **Exists:** Type signature only, real implementation UNKNOWN
- **Risk:** If plain text not hashed → credential exposure
- **Recommendation:** Find & audit

### validate_api_key (🔴 CRITICAL)
- **Used:** Public API Auth middleware (line 37)
- **Exists:** Type signature only, real implementation UNKNOWN
- **Risk:** Every request depends on this - if it fails, entire API breaks
- **Recommendation:** URGENT: Find & audit

### revoke_api_key (🟡 MEDIUM)
- **Used:** Frontend hook (line 81)
- **Exists:** Type signature only, real implementation UNKNOWN
- **Risk:** If soft delete not done → revoked keys still work
- **Recommendation:** Find & audit

### describe_table (🟢 LOW)
- **Used:** Nowhere
- **Exists:** No
- **Risk:** None
- **Recommendation:** Can ignore

### list_all_tables (🟡 MEDIUM)
- **Used:** scripts/supabase-admin.ts (line 50, 62)
- **Exists:** Created dynamically if missing (line 61-73)
- **Risk:** Dynamic creation means wrong permissions
- **Recommendation:** Migrate to permanent migration

---

## Generated Files from Audit

| File | Purpose |
|------|---------|
| AUDIT_SUMMARY.txt | Executive summary |
| SECURITY_AUDIT_REPORT_FINAL.md | Full analysis |
| SECURITY_CODE_REFERENCES.md | Exact line numbers |
| SECURITY_RISK_ANALYSIS.md | Detailed risk scenarios |
| DEPENDENCIES_MATRIX.md | This file |

---

## Next Steps

1. ✅ Audit complete - all 6 functions mapped
2. 🔴 ACTION REQUIRED: Find SQL implementations of 3 API Key functions
3. 🔴 ACTION REQUIRED: Verify validate_api_key works correctly
4. 🟡 ACTION REQUIRED: Rotate exposed credentials
5. 🟡 ACTION REQUIRED: Assess exec_sql implementation status

