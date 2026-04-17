# 📊 Analytics Dashboard Documentation

This document describes the validation logic, data sources, and calculations behind the Analytics Dashboard (`/analytics`).

## 1. Data Sources

The dashboard pulls real-time data from the following Supabase tables:

| Entity | Supabase Table | Purpose |
| :--- | :--- | :--- |
| **Leads** | `cards` | Primary source for all lead/deal data. |
| **Trips** | `cards` | Subset of cards where `status_comercial` is `'ganho'` (Won). |
| **Staff** | `profiles` | Used to map SDRs and Planners to deals. |
| **Funnel** | `pipeline_stages` | Used to define the funnel steps and efficient filtering. |

### Key Column Mappings

| Metric Entity | Database Column (`cards` table) | Fallback |
| :--- | :--- | :--- |
| **Lead Value** | `valor_final` | `valor_estimado` |
| **Trip Start Date** | `data_viagem_inicio` | `undefined` (Strict) |
| **Trip End Date** | `data_viagem_fim` | `undefined` (Strict) |
| **Won Date** | `taxa_data_status` | `undefined` |
| **Creation Date** | `created_at` | `Date.now()` |
| **Product** | `produto` | - |

---

## 2. Logic & Metrics

### 2.1 Lead Transformation
Every row in `cards` is treated as a **Lead**.
- **Status**:
  - `won`: If `status_comercial === 'ganho'`
  - `lost`: If `status_comercial === 'perdido'` OR `deleted_at` is not null.
  - `open`: Everything else.

### 2.2 Trip Definition
A **Trip** is strictly defined as a Lead that has been **Won**.
- **Logic**: `SELECT * FROM leads WHERE status = 'won'`
- **Margin**: Currently hardcoded as **10%** of the Trip Value (`value * 0.1`).

### 2.3 Funnel Metrics (Conversion Rate)

The dashboard tracks the percentage of leads that reach specific milestones **regardless of their current state** (historical reach).

| Metric | Target Stage | Logic |
| :--- | :--- | :--- |
| **% Taxa Paga** | `Taxa Paga / Cliente Elegível` | Count of leads >= this stage index / Total Leads |
| **% Briefing** | `Briefing Realizado` | Count of leads >= this stage index / Total Leads |
| **% Proposta** | `Proposta Enviada` | Count of leads >= this stage index / Total Leads |
| **% Confirmada** | `Viagem Confirmada (Ganho)` | Count of leads >= this stage index / Total Leads |

### 2.4 Financial Metrics

| KPI | Formula | Note |
| :--- | :--- | :--- |
| **Viagens Confirmadas** | `COUNT(cards)` where Stage >= 'Viagem Confirmada' | Strictly counts confirmed sales. |
| **Faturamento (Confirmadas)** | `SUM(valor_final)` of Confirmed Trips | Real revenue. |
| **Receita (Margem)** | `SUM(valor_final * 0.1)` | Estimated margin (10%). |
| **Ticket Médio** | `Faturamento / Count` | Average deal size. |

---

## 3. Filters & Scopes

- **Date Range**: Filters Leads by `createdAt` (Cohort Mode) or `contactedAt`/`wonAt` (Action Mode).
- **Granularity**: Groups charts by Day, Week, or Month.
- **View Mode**:
  - `All`: Shows full pipeline.
  - `SDR`: Shows only pre-sales stages.
  - `Planner`: Shows planning/proposal stages.
  - `Pos`: Shows operational/delivery stages.

## 4. Known Assumptions

1.  **Margin**: Calculated as flat 10% until a dedicated cost column is added.
2.  **Trip Dates**: Relies on `data_viagem_inicio`. If null, the trip is excluded from timeline-based revenue charts but included in totals.
