# WelcomeCRM - System Context & Architecture

> **🚨 AI PROTOCOL (READ FIRST) 🚨**
> 
> **To the AI Agent working on this project:**
> 1.  **MANDATORY CONTEXT:** You MUST read this file at the start of every `PLANNING` phase. Do not assume you know the architecture.
> 2.  **SAFETY PROTOCOL:** You MUST read `.cursorrules` immediately to load the "Iron Dome" safety protocols.
> 3.  **SINGLE SOURCE OF TRUTH:** This file is the absolute truth. If code contradicts this file, flag it to the user.
> 3.  **UPDATE ON CHANGE:** If you modify the DB Schema, add a new Hook, or change a Business Rule, you **MUST** update this file immediately after the Execution phase. Do not wait for the user to ask.
> 4.  **INTEGRATION INTELLIGENCE:** Before suggesting a new library or pattern, check Section 3 ("Frontend Patterns") and Section 4 ("Integrations"). Consistency > Novelty.
> 5.  **NO REGRESSIONS:** Before deleting or refactoring, check Section 2 ("Data Model") to ensure you are not breaking hidden dependencies (like Triggers or Views).
> 6.  **EVOLUTION PROTOCOL:** When a new architectural decision is made (e.g., "All constants must be in X"), you MUST update this document immediately. This file is the "Living Constitution" of the project.
> 7.  **AUTOMATION IMPERATIVE:** Before marking a task as DONE, you MUST ask: *"Could this error happen again?"* If yes, you MUST propose an automated fix (Lint/Type/Test) immediately. Do not wait for the user to ask.
> 8.  **ARCHITECTURAL ALIGNMENT:** When designing new features, you MUST explicitly reference an existing feature as a "Template". (e.g., "I will build the *Invoices* module following the exact pattern of the *Contacts* module"). Consistency > Creativity.

---

# 1. Core Architecture
- **Stack:** React (Vite) + TypeScript + TailwindCSS.
- **Backend:** Supabase (PostgreSQL + Auth + Storage).
- **State Management:** React Query (Server State) + Context API (Auth/Toast) + **Zustand (User Preferences/Persistence)**.
- **Philosophy:** "Database as the Brain". Business logic (validations, status updates, logs) prefers to live in PostgreSQL Triggers/Functions rather than Frontend code.

## 2. Data Model (Critical Rules)

### Cards (`cards`)
- **Central Entity:** Represents a Deal/Trip.
- **Identity:** `id` (UUID).
- **Status:** `status_comercial` ('aberto', 'ganho', 'perdido').
    - **Automation:** `trigger_card_status_automation` automatically sets this based on `pipeline_stages.is_won` / `is_lost`.
    - **Rule:** Do NOT manually update `status_comercial` from Frontend unless overriding automation.
- **Contacts:**
    - `pessoa_principal_id`: FK to `contatos`. The payer/negotiator.
    - `cards_contatos`: Many-to-Many table for companions/travelers.
    - **Rule:** A contact cannot be both Principal and Companion on the same card. The `useCardContacts` hook enforces this (DB Trigger was removed to avoid transaction conflicts).

### Contacts (`contatos`)
- **Identity:** `email` or `telefone` should be unique (soft rule).
- **Fields:** `nome`, `email`, `telefone`, `cpf`, `data_nascimento`.
- **Validation:** `telefone` is often used for WhatsApp integration. Must be kept clean (digits only) in DB or cleaned on read.

### Pipeline (`pipeline_stages`)
- **Structure:** `id`, `nome`, `ordem`, `fase`.
- **Governance Flags:**
    - `is_won`: Marks stage as "Ganho" (sets `status_comercial` = 'ganho').
    - `is_lost`: Marks stage as "Perdido" (sets `status_comercial` = 'perdido').
    - `target_role`: Enforces owner role (e.g., 'vendas', 'concierge') upon entry.
- **Phases:** 'SDR', 'Planner', 'Pós-venda'.
- **Quality Gates:** `pode_avancar_etapa` (DB Function) checks if a card can move.
    - **Rule:** Moving to > "Qualificado pelo SDR" requires `taxa_status` to be 'paga' or 'cortesia' (if product is TRIPS).

## 3. Frontend Patterns ("Paved Road")

### Data Fetching
- **Library:** `@tanstack/react-query`.
- **Keys:** `['card', id]`, `['contact', id]`, `['pipeline']`.
- **Pattern:** Use Custom Hooks for complex logic.
    - `useCardContacts(cardId)`: Manages all contact linking logic.
    - `useQualityGate()`: Checks if card can move stages.

### Design System (The Law)
-   **MANDATORY REFERENCE:** You MUST read `docs/DESIGN_SYSTEM.md` before writing any UI code.
    -   **Rule #1:** Light Mode First. Never assume dark backgrounds.
    -   **Rule #2:** No `text-white` on default backgrounds.

### Design System & UX (Premium Standards)
- **Layout Architecture:**
    - **Viewport Units:** Use `dvh` (Dynamic Viewport Height) for full-screen layouts to handle mobile browser bars correctly.
    - **Global Overflow:** Enforce `overflow: hidden` on `html`/`body` and `overscroll-behavior: none` to mimic native app feel.
- **Component Polish:**
    - **Inputs:** Standardize "Premium Input" styles (height, background, border, focus ring) for consistency.
    - **Performance:** Avoid `backdrop-blur` on large scrollable areas (like Kanban columns) to prevent rendering artifacts. Use solid colors (e.g., `bg-gray-50`).
- **State Persistence:**
    - **Pattern:** Use `zustand/middleware`'s `persist` to save user preferences (filters, view modes, collapsed states) to `localStorage`.

### Code Quality & Safety
- **Date Handling:** Never use `.toISOString()` on string dates directly without validation.
- **Type Safety:** Enforce strict types for filters (`FilterState`) to prevent runtime errors.

### UI Components
- **Widgets:** `PessoasWidget`, `CardHeader`, `ActionButtons`.
- **Rule:** Widgets should receive data via Props or Hooks, never fetch directly if possible. `PessoasWidget` strictly uses `useCardContacts`.

### Admin Module Standards
- **Single Source of Truth:** All static definitions (Sections, Field Types, Colors, Macro Stages) MUST live in `src/constants/admin.ts`.
- **Rule:** Do NOT hardcode lists in components (e.g., `StudioUnified`, `FieldInspectorDrawer`). Import them from constants.

## 4. Integrations & External Services
- **WhatsApp:** Direct link generation (`wa.me`). Depends on `contatos.telefone`.
- **Email:** `mailto:` links. Depends on `contatos.email`.

## 5. Security (RLS)
- **Policy:** "Permissive for Authenticated".
- **Rule:** Most tables allow `SELECT/INSERT/UPDATE` for `authenticated` role.
- **Sensitive Data:** `profiles` table controls access levels (admin, gestor, sdr).

## 5.1. Field Governance System (Jan 2025)

### Architecture
- **Tables:** `system_fields`, `stage_field_config`.
- **Separation of Concerns:**
    - **Cadastro de Campos** (`/settings/system/fields`): CRUD of all system fields (type, section, active status).
    - **Governança de Dados** (`/settings/system/governance`): Visibility/required rules per stage (only for governable sections).

### Sections
- **Governable (Dynamic Rules):** `trip_info`, `observacoes_criticas`.
- **Global (Always Visible):** `people`, `payment`, `system`.

### Key Files
- `src/constants/admin.ts`: `SECTIONS`, `GOVERNABLE_SECTIONS`, `FIELD_TYPES`.
- `src/components/admin/FieldManager.tsx`: Admin UI for field CRUD.
- `src/components/admin/studio/StudioUnified.tsx`: Governance matrix.
- `src/hooks/useFieldConfig.ts`: Returns visible/required fields per stage.

### Rules
1. **Default Visibility:** Fields without explicit `stage_field_config` are visible by default.
2. **No Hardcoded Fields:** Use `useFieldConfig()` hook for all field rendering.
3. **Phase Filter:** Only applies to `GOVERNABLE_SECTIONS` in integrations mapping.

## 6. User Management & Auth (Invite System)
- **Philosophy:** "Invite Only". Public registration is DISABLED.
- **Core Table:** `invitations` (email, role, token, expires_at).
- **Flow:**
    1.  **Admin** creates invite via `UserManagement.tsx` -> `generate_invite_token` (RPC).
    2.  **User** receives link (`/invite/:token`) -> `InvitePage.tsx`.
    3.  **Validation:** `get_invite_details` (RPC) checks validity before showing form.
    4.  **Signup:** `supabase.auth.signUp()` triggers `check_invite_whitelist` (DB Trigger).
    5.  **Activation:** Success triggers `mark_invite_used` and `handle_new_user` (creates Profile).
- **Security:**
    -   `check_invite_whitelist`: BLOCKS any signup where email is not in `invitations` or token is expired.
    -   `invitations` RLS: Only Admins can SELECT/INSERT/DELETE.

## 6.1. Roles & Teams (RBAC - Jan 2025)

### Architecture
The system separates **Access Control** (what you can do) from **Organizational Assignment** (who you work with).

- **Roles (Access Control):**
    - **Table:** `roles` (id, name, display_name, description, permissions, is_system, color)
    - **Relationship:** `profiles.role_id` -> `roles.id`
    - **Default Roles:** `admin`, `manager`, `member`, `viewer`
    - **Hook:** `useRoles()` for CRUD and `useRoleOptions()` for Selects
    
- **Teams (Organizational):**
    - **Table:** `teams` (id, name, department_id, leader_id, is_active, color)
    - **Hierarchy:** `departments` -> `teams` -> `profiles`
    - **Relationship:** `profiles.team_id` -> `teams.id`
    - **Hook:** `useTeams()` for CRUD and `useTeamOptions()` for Selects

### Key Functions
- `is_admin()`: Checks if user has admin role or is_admin flag
- `has_role(role_name)`: Checks if user has specific role
- `is_manager_or_admin()`: Checks if user has manager or admin access

### Key Files
- `src/hooks/useRoles.ts`: Role CRUD operations
- `src/hooks/useTeams.ts`: Team CRUD operations
- `src/components/admin/roles/RoleManagement.tsx`: Admin UI for role management
- `src/components/admin/users/EditUserModal.tsx`: Separate sections for Role and Team

### Rules
1. **Roles = Access:** Role determines what a user can do (permissions).
2. **Teams = Organization:** Team determines who the user works with.
3. **Dynamic Roles:** Use `useRoles()` hook, NOT hardcoded constants.
4. **Legacy Compatibility:** `profiles.role` (enum) still exists for backward compat; prefer `role_id`.

## 7. Known "Gotchas"
- **Ghost Contacts:** `view_cards_acoes` has `pessoa_nome`. Always prefer this over fetching `contatos` again to avoid sync issues.
- **Optimistic Updates:** Frontend must update Cache immediately for good UX, but must handle Rollback on error. `useCardContacts` implements this correctly.

## 7. Recent Architecture Updates (Dec 2025)

### Kanban Board 2.0 (UX Polish)
- **Infinite Columns:** Columns must extend to the bottom of the viewport using `h-full` and `flex-1` correctly.
- **Auto-Scroll:** Collapsing a phase must auto-scroll the board to the start (`left: 0`) for immediate visibility.
- **Unified Header:** Collapsed phases must display Name and Count side-by-side (Horizontal) above the column, matching the open state.

### Task Management (`tarefas`)
- **Single Source of Truth:** The `tarefas` table is the only source for "Next Steps".
- **View Logic:** `view_cards_acoes` aggregates the *next pending task* for each card.
    - **Logic:** `ORDER BY data_vencimento ASC, created_at DESC`.
    - **Fix:** We recently fixed a bug where "No next step" appeared incorrectly. The view now robustly handles this.
- **Rescheduling:**
    - **Pattern:** When rescheduling, we do NOT just update the date.
    - **Flow:** 1. Mark old task as `completed` (outcome: 'rescheduled'). 2. Create NEW task with new date. 3. Log `task_rescheduled` activity.

### Activity Logging (`log_tarefa_activity`)
- **Comprehensive Logging:** We moved from ad-hoc logging to a centralized Trigger-based approach.
- **Trigger:** `log_tarefa_activity` captures INSERT/UPDATE on `tarefas` and automatically inserts into `atividades`.
- **Rule:** Do NOT manually insert into `atividades` from the Frontend for task-related actions. Let the DB trigger handle it.

### Header Logic
- **Dense & Honest:** The Card Header must show real data only.
    - **Budget/Dates:** If null, show nothing. Do not show placeholders.
    - **Next Step:** Derived strictly from `view_cards_acoes`.

### Pipeline Governance 2.0
- **Data-Driven Rules:** Moved from hardcoded stage names/IDs to database columns (`is_won`, `is_lost`, `target_role`).
- **Owner Handoff:** `KanbanBoard` checks `target_role` on drag-end. If set, it triggers `StageChangeModal` to enforce role compliance (e.g., SDR -> Planner).
- **Automation:** `trigger_card_status_automation` now uses `is_won`/`is_lost` flags instead of string matching.

### Organizational OS (Team Studio)
- **Hierarchy:** The system now enforces a strict hierarchy: `Departments` (Macro Areas) -> `Teams` -> `Members`.
- **Team Management:**
    - **CRUD:** Teams are managed via `TeamManagement.tsx` and persisted in the `teams` table.
    - **Association:** Users are linked to teams via `profiles.team_id`.
- **Bulk Operations:**
    - **Pattern:** Use "Selection State" + "Floating Action Bar" for bulk actions (e.g., `UserManagement.tsx`).
    - **Mutation:** Prefer single batch mutations (e.g., `update().in('id', ids)`) over iterating in the frontend.

## 8. Database Operations Protocol (MANDATORY)
-   **The "Blind Surgery" Rule:** Never modify a View or Function based on a `.sql` file in the codebase.
-   **SOP:** You MUST follow the **Live Schema Verification** protocol defined in `docs/SQL_SOP.md`.
    1.  Query `pg_views` / `pg_get_functiondef` to get the *real* definition.
    2.  Diff against your changes.
    3.  Apply & Verify.

## 9. Proposals Platform (Jan 2025)

### Core Tables
- `proposals`: Main entity, linked to `cards` via `card_id`.
- `proposal_versions`, `proposal_sections`, `proposal_items`, `proposal_options`.
- `proposal_events`, `proposal_client_selections`.

### Content Library (`proposal_library`)
- **Purpose:** Reusable items (hotels, experiences, transfers) for proposal building.
- **Fuzzy Search:** Uses `pg_trgm` + `unaccent` extensions for typo-tolerant search.
- **RLS:** Shared items visible to all; private items only to owner.
- **Hooks:** `useLibrarySearch()`, `useSaveToLibrary()`.
- **UI:** `LibrarySearch.tsx` integrated in `AddItemMenu.tsx`.
