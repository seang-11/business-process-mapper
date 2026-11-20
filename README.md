<div align="center">

# Business Process Mapper

**Map how a company actually works — every process, step, person and app — in one living diagram.**

<a href="https://YOUR-DEMO-LINK-HERE">
  <img src="https://img.shields.io/badge/▶%20Live%20Demo-Try%20it%20now-3E6FE7?style=for-the-badge" alt="Live Demo" height="44" />
</a>

<br/><br/>

![React](https://img.shields.io/badge/React-18-3E6FE7?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3E6FE7?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-ZiteJS-3E6FE7?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-3E6FE7?logo=tailwindcss&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-validated%20API-3E6FE7)

</div>

---

## The problem

Most companies run on tribal knowledge: how a client gets onboarded, who approves an invoice, which tool a lead passes through. It lives in people's heads and scattered docs, so new hires take weeks to ramp up and nobody can see the whole operation at once.

**Business Process Mapper** turns that knowledge into a single, visual, always-current map of the business — and a training tool built on top of it.

## Screenshots

| Process canvas | Company Brain |
|:---:|:---:|
| <img src="docs/screenshots/process-canvas.png" alt="Process canvas — swimlane diagram of a process" width="420" /> | <img src="docs/screenshots/company-brain.png" alt="Company Brain — every process at a glance" width="420" /> |
| *Swimlane diagram of every step, role and tool* | *The whole company's processes at a glance* |
| **Version comparison** | **Role brief** |
| <img src="docs/screenshots/compare-versions.png" alt="Comparing current and future versions" width="420" /> | <img src="docs/screenshots/role-brief.png" alt="Role brief — what a role owns" width="420" /> |
| *Current vs. future state, step by step* | *Everything one role owns and touches* |

> 📸 Add images to `docs/screenshots/` using the file names above.

## What I built

- 🔐 **Domain-restricted sign-in.** Only `@prospectautomations.com` accounts can get in, using an emailed code or Google sign-in.
- 👥 **Viewer / editor permissions.** Viewers can browse every live process, the Brain, roles and training. Editors and admins can build and change them. The backend checks this on every request, so it's not just hidden buttons.
- 🔀 **Versioning with Go Live.** Draft a future-state version of any process, compare it with the current one step by step, then **Go Live** to make it the official way of working. The old version is retired automatically.
- 🧠 **Company Brain visualizations.** Several interactive views of the whole operation, including a globe, heat map, city, factory and solar system. Each shows how processes, departments, people and apps connect.
- 🔗 **Read-only share links.** Turn on a secure link to any live process so people outside the company can view it without an account. You can switch the link off at any time.

## Features

| | |
|---|---|
| 🗺️ **Process canvas** | Swimlane, board, timeline and grid views of steps and connections |
| 👤 **Roles** | One-page briefs: everything a role owns and every step it touches |
| 🏢 **Departments** | Colors, leads and descriptions to group the work |
| 🎓 **Training** | Walk new team members through a process step by step |
| ⌨️ **Power-user UX** | Command menu (⌘K) and keyboard shortcuts |

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, framer-motion, lucide-react
- **Backend:** ~35 typed API endpoints with Zod-validated input and output
- **Data:** Relational database with a flexible element taxonomy
- **Auth:** Email code and Google sign-in, with role-based access

## Data model

Everything is built on a flexible **element taxonomy**, so new kinds of things can be added without schema changes:

- **Element types:** Process, Role, App, Department and any custom type
- **Elements:** instances of those types (e.g. *"Client Onboarding"*, *"Account Manager"*, *"HubSpot"*)
- **Versions:** each process has current, future and retired versions
- **Steps and connections:** the nodes and arrows of a version's diagram, each linked to the elements it involves

## Repository structure

```
.
├── apps/
│   └── zite-architect/
│       └── src/
│           ├── App.tsx          # Routing & access gating (viewer vs. editor)
│           ├── components/      # Canvas, Brain views, roles, training, dialogs
│           ├── api/             # Backend endpoints — one file per endpoint
│           └── lib/             # Graph layout, versioning, training logic
├── packages/
│   └── components/              # Shared design system (shadcn/ui)
└── package.json                 # npm workspaces root
```

## Running locally

```bash
npm install
cd apps/zite-architect
npx zitejs generate   # generate typed API clients
```

The app is hosted on [Zite](https://zite.com), which provides the database, auth and deployment.

---

<div align="center">
<sub>Built for <a href="https://prospectautomations.com">Prospect Automations</a> · © 2026</sub>
</div>
