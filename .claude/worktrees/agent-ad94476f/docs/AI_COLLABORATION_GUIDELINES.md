# 🏛️ The "Iron Dome" Protocol: AI Safety & Collaboration Standards
> **Authored by:** The Expert Consensus Panel (Simulated)
> **Context:** Preventing "Silent Regressions" and "Context Blindness" in AI-driven Development.

## 1. The Expert Panel Analysis

### 🕵️‍♂️ The SRE Perspective (Site Reliability Engineering)
**Diagnosis:** "The error was a classic 'State Assumption Failure'. The agent assumed the codebase (`.sql` files) matched the production environment (Database). In high-velocity projects, this is rarely true."
**Mandate:** **"Measure, Don't Guess."**
*   **Rule:** No destructive operation (`DROP`, `REPLACE`, `DELETE`) is permitted without a preceding **Read Operation** of the live target state in the same execution cycle.

### 🤖 The AI Safety Perspective
**Diagnosis:** "The agent suffered from 'Context Window Myopia'. It followed the rules it *saw*, but missed the rules it *couldn't see* (e.g., hidden `GEMINI.md` or implicit knowledge). It also prioritized 'Task Completion' over 'System Integrity'."
**Mandate:** **"Explicit Constraints > Implicit Goals."**
*   **Rule:** Critical constraints must be **Injected**, not just documented. If a rule is not in the active context window, it does not exist.
*   **Action:** Centralize all "Do Not Touch" rules into a single file (`.cursorrules` or `docs/AI_RULES.md`) that is forcibly read at the start of complex tasks.

### 🏗️ The System Architect Perspective
**Diagnosis:** "The system lacks 'Defensive Depth'. A single agent error caused a feature outage. This indicates a brittle deployment pipeline."
**Mandate:** **"Atomic Reversibility."**
*   **Rule:** Every migration must be verifiable. If the verification query fails (e.g., "Where is column X?"), the system must auto-rollback or alert immediately.

---

## 2. The New "Laws of Robotics" for WelcomeCRM

To guarantee this specific error (and its cousins) never happens again, we establish these 3 Immutable Laws:

### 🛡️ Law 1: The "Live State" Requirement
**"An Agent shall not modify a persistent store (DB) based solely on static code."**
*   **Implementation:** Before any `CREATE OR REPLACE VIEW`:
    1.  **READ:** Run `SELECT definition FROM pg_views...`
    2.  **DIFF:** Compare the live definition with the new code.
    3.  **ASSERT:** Ensure no existing columns are lost.

### 🛡️ Law 2: The "Context Anchoring" Requirement
**"An Agent must explicitly acknowledge the 'Constitution' before Planning."**
*   **Implementation:** The file `docs/SYSTEM_CONTEXT.md` is the Anchor.
    *   It must contain a **"Forbidden Actions"** section.
    *   The Agent must explicitly state: *"I have checked the Forbidden Actions list."*

### 🛡️ Law 3: The "Verification First" Requirement
**"An Agent shall not mark a task as Done until it has proven the absence of regression."**
*   **Implementation:**
    *   **Old Way:** "I added the column. It works."
    *   **New Way:** "I added the column. I also queried the *old* columns (`is_group_parent`) and confirmed they are still there."

---

## 3. Immediate Action Plan

1.  **Adopt `docs/SQL_SOP.md`:** This implements Law 1.
2.  **Expand `SYSTEM_CONTEXT.md`:** Add a "Forbidden Actions" section (Law 2).
3.  **Create `verification_queries.sql`:** A scratchpad file where the Agent MUST write its verification queries before finishing a task (Law 3).

*Signed,*
*The Virtual Expert Panel*
