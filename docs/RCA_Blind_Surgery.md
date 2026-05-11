# 🚨 Root Cause Analysis: The "Blind Surgery" Incident

## 1. The Event
I accidentally dropped critical columns (`is_group_parent`, `parent_card_id`) from `view_cards_acoes` while adding new columns (`briefing_inicial`). This caused a regression where Group Cards disappeared from the Kanban board.

## 2. Why it happened (The "Why" behind the "Why")
Even with strict rules ("Database is Brain", "No Regressions"), I failed because of a **Process Gap** in how I handle SQL Views.

*   **The Trap:** SQL Views are destructive. `CREATE OR REPLACE VIEW` wipes out the old definition.
*   **The Mistake:** I used a **Static Artifact** (`fix_view_cards_acoes_hotfix.sql`) as my source of truth. I assumed this file represented the *current* state of the database.
*   **The Reality:** The database had evolved (via other migrations) and the static file was stale. It lacked the group columns.
*   **The Result:** By applying the stale definition + my changes, I effectively reverted the database to an older state, erasing the group features.

## 3. Why the Rules didn't stop me
The rules (Persona, Architecture) act as a **Compass** (Direction), not a **Checklist** (Procedure).
*   They told me *where to go* ("Don't break things").
*   They didn't tell me *how to step* ("Run `pg_get_viewdef` before `CREATE VIEW`").

I relied on "Code Search" (finding the `.sql` file) instead of "System Inspection" (querying the live DB). In a complex, evolving system, **Code Search is unreliable for Database Schema**.

---

# 🛡️ The Fix: "Live Schema Verification" Protocol

To prevent this forever, I must adopt a new **Standard Operating Procedure (SOP)** for any Database View/Function modification.

## The New Protocol (Must be followed 100%)

### 🛑 Phase 1: The "Biopsy" (BEFORE writing code)
**Never** trust a `.sql` file in the codebase as the source of truth.
1.  **Query the Live Definition:**
    ```sql
    SELECT definition FROM pg_views WHERE viewname = 'target_view_name';
    -- OR for functions
    SELECT pg_get_functiondef('target_function_name'::regproc);
    ```
2.  **Save this output** as the `BASE_DEFINITION`.

### 📝 Phase 2: The "Diff" (Planning)
1.  Compare `BASE_DEFINITION` (Live) vs. My Proposed Change.
2.  **Explicit Check:** "Am I dropping any column that exists in `BASE_DEFINITION`?"
    *   If YES -> **STOP**. Add the missing column to my script.

### 🚀 Phase 3: The "Safe Apply" (Execution)
1.  Apply the migration.
2.  **Immediate Verification:** Query the view to confirm *both* the new columns AND the old critical columns exist.

---

## Action Item
I will add this specific **SQL Modification Protocol** to a new documentation file (e.g., `docs/SQL_SOP.md`) or append it to `99-qa-guardian.md` if you prefer, so it becomes a hard rule for future tasks.
