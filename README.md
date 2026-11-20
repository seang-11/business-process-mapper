<div align="center">

<img src="https://images.fillout.com/orgid-446582/flowpublicid-ouwxsottkm/widgetid-default/fQkAzc5ruAbf2yKGG3m8YS/NewBetterSize-AnimatedLogo3333.jpg" alt="Business Process Mapper" width="560" />

# Business Process Mapper

**Map how your company actually works — every process, step, person and app — in one living diagram.**

Built by [Prospect Automations](https://prospectautomations.com) · Powered by [Zite](https://zite.com)

![React](https://img.shields.io/badge/React-18-3E6FE7?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3E6FE7?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-ZiteJS-3E6FE7?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-3E6FE7?logo=tailwindcss&logoColor=white)

</div>

---

## Overview

Business Process Mapper turns tribal knowledge into a clear, shareable map of the business. Teams document each process as a **swimlane diagram** of steps, see which **roles, departments and apps** each step touches, compare **current vs. future-state versions**, and onboard new hires with built-in **training** views.

## Features

| | |
|---|---|
| 🗺️ **Process canvas** | Swimlane, board, timeline and grid views of every step and how they connect |
| 🧠 **Company Brain** | A bird's-eye view of every process, its department, owner, people and tools — with globe, heat-map and city visualizations |
| 🔀 **Versions** | Draft future-state versions, compare them step by step, and *Go Live* when ready |
| 👥 **Roles** | One-page briefs showing everything a role owns and every step it touches |
| 🏢 **Departments** | Colors, leads and descriptions to group processes |
| 🎓 **Training** | Walk new team members through a process, step by step |
| 🔗 **Share links** | Read-only links to a live process — no sign-in required |
| 🔐 **Permissions** | Viewers see everything; editors and admins can change it |
| ⌨️ **Power-user UX** | Command menu and keyboard shortcuts |

## Repository structure

```
.
├── apps/
│   ├── zite-architect/                # Business Process Mapper — the main app (sign-in required)
│   └── business-process-mapper-copy/  # Business Process Mapper (website) — open variant
│       └── src/
│           ├── App.tsx                # Routes & access gating
│           ├── components/            # UI: canvas, Brain, roles, training, dialogs…
│           ├── api/                   # Backend endpoints (one file = one endpoint)
│           └── lib/                   # Shared helpers
├── packages/
│   └── components/                    # Shared design system (shadcn/ui primitives)
├── zite.config.json                   # Workspace configuration
└── package.json                       # npm workspaces root
```

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, framer-motion, lucide-react
- **Backend:** ZiteJS endpoints (`src/api/*.ts`) validated with Zod
- **Data:** Zite Database (shared across both apps)
- **Auth:** Zite auth — email code & Google sign-in, restricted to `@prospectautomations.com`

## Data model

Everything is built on a flexible **element taxonomy**:

- **Element types** — Process, Person/Role, App, Department, and any custom type
- **Elements** — instances of those types (e.g. *"Onboarding"*, *"Account Manager"*, *"HubSpot"*)
- **Versions** — each process has current, future and retired versions
- **Steps & connections** — the nodes and arrows of a version's diagram, each linked to the elements it involves

## Getting started

This project is developed and hosted on **Zite**. To work on it locally:

```bash
npm install
cd apps/zite-architect
npx zitejs generate   # regenerate typed SDKs after changing endpoints
```

Changes are made in the Zite editor and published from there; the database, auth and integrations are managed by the platform.

## Branding

Styled with the **Prospect Automations** brand kit (primary `#3E6FE7`, Roboto).

---

<div align="center">
<sub>© 2026 Prospect Automations. All rights reserved.</sub>
</div>
