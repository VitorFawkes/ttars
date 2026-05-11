# 🎨 WelcomeCRM Design System (Elite Standard)

> **Status:** MANDATORY
> **Principle:** Light Mode First.
> **Goal:** Create a "Premium SaaS" feel (like Linear/Vercel) without breaking readability.

## 1. The "Light Mode First" Law
The application runs in **Light Mode** by default.
-   **NEVER** assume a dark background.
-   **NEVER** use `text-white` on a container unless you explicitly set that container's background to a dark color (e.g., `bg-slate-900`).
-   **NEVER** use `bg-white/10` (Glassmorphism) on a white background. It is invisible.

## 2. The "Elite" Card Pattern
To achieve the "Elite" look in Light Mode, use **Depth** and **Borders**, not transparency.

### ✅ DO THIS (Elite Light Card):
```tsx
<div className="bg-white border border-slate-200 shadow-sm rounded-xl hover:shadow-md transition-all">
  <h3 className="text-slate-900 font-semibold">Title</h3>
  <p className="text-slate-500">Description</p>
</div>
```

### ❌ DO NOT DO THIS (Broken Dark Glass):
```tsx
// ⛔️ This is invisible on white backgrounds!
<div className="bg-white/10 backdrop-blur border-white/20">
  <h3 className="text-white">Title</h3>
</div>
```

## 3. Color Palette (Semantic)

| Token | Tailwind Class | Usage |
|-------|----------------|-------|
| **Surface** | `bg-white` | Cards, Modals, Dropdowns |
| **Background** | `bg-slate-50` or `bg-white` | Page background |
| **Text Primary** | `text-slate-900` | Headings, Strong text |
| **Text Secondary** | `text-slate-500` | Descriptions, Metadata |
| **Border** | `border-slate-200` | Dividers, Card borders |
| **Primary Brand** | `text-indigo-600` / `bg-indigo-600` | Actions, Links |

## 4. Glassmorphism Usage
Glassmorphism is allowed **ONLY** in specific contexts:
1.  **Overlays:** Modals (`bg-black/20 backdrop-blur-sm`).
2.  **Sticky Headers:** (`bg-white/80 backdrop-blur-md border-b border-slate-200`).
3.  **Dark Mode Sections:** If a specific section is explicitly dark (e.g., a Sidebar).

## 5. Typography
-   Use `tracking-tight` for headings to give a modern feel.
-   Use `text-sm` as the default for UI density.
-   Use `font-medium` for interactive elements.

---
**Rule of Thumb:** If you can't read the text on a white piece of paper, it's wrong.
