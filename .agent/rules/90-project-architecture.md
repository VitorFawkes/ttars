---
trigger: always_on
---

# 🏛️ Project Architecture & Expansion Protocol

> **Activation:** ALWAYS ON.
> **Purpose:** Ensures WelcomeCRM evolves as a single, cohesive organism.
> **Source of Truth:** Verified against live Supabase schema and `CODEBASE.md`.

## 1. The "Satellite" Principle (Data Topology)
The CRM revolves around 3 Core Suns. Every new feature must orbit one of them.

-   **The Suns (Core Tables):**
    1.  `cards` (The Deal/Opportunity)
    2.  `contatos` (The Person)
    3.  `profiles` (The User/Agent - *Note: mapped from auth.users*)

-   **The Law:** You CANNOT create a table that does not Foreign Key to at least one Sun.
    -   *Violation:* A `feedback` table with no links.
    -   *Compliance:* `feedback` linked to `card_id` (Context: Deal) or `contact_id` (Context: Person).
    -   *Verified Reality:* Tables like `activities`, `api_keys`, and `card_history` already follow this strictly.

## 2. The "360° Context" Mandate (UI Integration)
A feature is not "Done" when its page is ready. It is "Done" when it appears in the Context.

-   **If you build X:** You must inject X into the `CardDetail` (360° Deal View).
-   **The Mental Model:** "If I am looking at a Client, can I see X without leaving the page?"
    -   *Action:* Update `src/pages/CardDetail.tsx` tabs/widgets.

## 3. The "Reactive System" (Event Bus)
The CRM is alive. Actions must ripple through the system.

-   **Trigger Logic:** If a new entity state implies a Business Change, automate it.
    -   *Example:* "New Contract Signed" -> "Move Deal to Won" -> "Notify Agent".
-   **Mechanism:** Use Supabase Database Triggers for data integrity.
-   **Audit:** Ensure critical actions are logged via the `log_activity` function or `activities` table.

## 4. The "Vibe" Consistency (Design Inheritance)
-   **Layout:** All pages must extend `Layout`.
-   **Components:** Use `Table` for lists, UI components from `@/components/ui/` for inputs.
-   **Visuals:** Use Elite Light Mode tokens (`bg-white`, `border-slate-200`, `shadow-sm`).
-   **Exception:** Glassmorphism is ONLY allowed inside `ThemeBoundary mode="dark"` (e.g., Sidebar).
