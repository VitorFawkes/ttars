# 🛡️ SQL Modification Protocol (SOP)

> **Status:** MANDATORY
> **Trigger:** Any task involving `CREATE VIEW`, `CREATE FUNCTION`, or `ALTER TABLE`.

## The "Blind Surgery" Risk
SQL Views and Functions are destructive. `CREATE OR REPLACE` overwrites the existing definition. If you base your script on an outdated file, you will silently delete columns or logic added by recent migrations.

## The Protocol

### 🛑 Phase 1: The "Biopsy" (BEFORE writing code)
**Never** trust a `.sql` file in the codebase as the source of truth.
1.  **Query the Live Definition:**
    ```sql
    -- For Views
    SELECT definition FROM pg_views WHERE viewname = 'target_view_name';
    
    -- For Functions
    SELECT pg_get_functiondef('target_function_name'::regproc);
    ```
2.  **Save this output** as the `BASE_DEFINITION` in your context.

### 📝 Phase 2: The "Diff" (Planning)
1.  Compare `BASE_DEFINITION` (Live) vs. Your Proposed Change.
2.  **Explicit Check:** "Am I dropping any column that exists in `BASE_DEFINITION`?"
    *   If YES -> **STOP**. Add the missing column to your script.
    *   If NO -> Proceed.

### 🚀 Phase 3: The "Safe Apply" (Execution)
1.  Apply the migration.
2.  **Immediate Verification:** Query the view to confirm *both* the new columns AND the old critical columns exist.
    ```sql
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'target_view_name';
    ```

---
**Violation of this protocol is a Critical Engineering Failure.**
