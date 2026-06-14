# Amazon Now — Conversational Commerce, powered by Sanaya AI

> Shop groceries in minutes with a human touch. **Sanaya** is your AI shopping
> companion that thinks like a kirana shopkeeper — she knows what you like,
> picks the right product, and completes your basket so you decide less and get more.

Amazon Now is a quick-commerce web app with a real product storefront **and** a
conversational AI assistant (Sanaya) backed by a custom **Intent Engine** — a
RAG-powered intent intelligence platform that turns a shopping query into
*judgment*, not just search.

🔗 **Live demo:** https://d2j1cn28ovjl00.cloudfront.net

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [The Intent Engine](#the-intent-engine)
4. [Tech stack](#tech-stack)
5. [Project structure](#project-structure)
6. [Running locally](#running-locally)
7. [Deployment](#deployment)
8. [Fallback philosophy](#fallback-philosophy)
9. [Demo personas](#demo-personas)
10. [Further reading](#further-reading)

---

## What it does

- **Storefront** — Home, Store (500 products across 20 categories with filters,
  search, sort), Cart (qty, delivery, tax, totals), and a full Checkout flow
  (address → payment → order success).
- **Sanaya, the AI assistant** — A conversational companion on the Home page.
  Type `milk`, `add rice`, `healthy snacks`, or `substitute for butter` and
  Sanaya decides whether to **act, ask, shortlist, substitute, or predict**.
- **Intent Engine** — The brain. Understands intent → retrieves from multiple
  knowledge sources → fuses context → makes a single confident decision →
  learns from every interaction.

The guiding principle: **the objective is judgment, not search.** Optimize for
the *correct decision*, not maximum product exposure.

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │   Frontend (React + Vite)     │
                         │   Home · Store · Cart · Pay   │
                         │   Sanaya (animated SVG)       │
                         └───────────────┬───────────────┘
                                         │ WebSocket (Sanaya)
                                         ▼
                         ┌──────────────────────────────┐
                         │  API Gateway (WebSocket)       │
                         │  Express fallback (local)      │
                         └───────────────┬───────────────┘
                                         ▼
                         ┌──────────────────────────────┐
                         │      Orchestration Lambda      │
                         │  ┌──────────────────────────┐ │
                         │  │      INTENT ENGINE        │ │
                         │  │  router → retrieval →     │ │
                         │  │  fusion → decision →      │ │
                         │  │  predictive → learning    │ │
                         │  └──────────────────────────┘ │
                         └───────────────┬───────────────┘
                                         ▼
   ┌──────────┬───────────┬───────────┬────────────┬───────────┬──────────┐
   │Preference│ Memory RAG│Decision   │Session RAG │ Product   │Household │
   │ Graph    │           │Memory RAG │            │ Intel RAG │ RAG      │
   │(DynamoDB │ (semantic │(semantic  │ (semantic  │(semantic  │(semantic │
   │ /JSON)   │  store)   │  store)   │  store)    │  store)   │  store)  │
   └──────────┴───────────┴───────────┴────────────┴───────────┴──────────┘
```

Every external dependency is abstracted behind a **provider interface** with a
local fallback, so the entire system runs offline with zero AWS credentials.

---

## The Intent Engine

The Intent Engine replaces the naive `Query → Catalog → Response` pipeline with:

```
User Query
  → Intent Understanding     (what does the user actually want?)
  → Retrieval Planning       (which knowledge sources matter for this request?)
  → Multi-RAG Retrieval      (Memory, Decision, Session, Product, Household…)
  → Context Fusion           (one unified context object)
  → Decision Intelligence    (ACT / ASK / SHORTLIST / SUBSTITUTE / PREDICT)
  → Action + Prediction      (auto-add, basket completion, gap-fill)
  → Learning Feedback Loop   (gets smarter with every order)
```

👉 **Full deep-dive:** see [`INTENT_ENGINE.md`](./INTENT_ENGINE.md)

---

## Tech stack

| Layer       | Technology |
|-------------|------------|
| Frontend    | React 18, Vite, TypeScript (no UI framework — handcrafted CSS) |
| Backend     | Node.js 18, TypeScript, AWS Lambda |
| API         | API Gateway WebSocket (prod) · Express + `ws` (local fallback) |
| Data        | DynamoDB single-table (prod) · local JSON (fallback) |
| Cache/Session | ElastiCache Redis (prod) · in-memory Map (fallback) |
| LLM         | Amazon Bedrock Claude (prod) · rule-based + Intent Engine (fallback) |
| RAG         | In-memory semantic store (TF cosine) · pluggable to Bedrock embeddings + vector DB |
| Auth        | Cognito (prod) · local JWT (fallback) |
| IaC         | Serverless Framework |
| Hosting     | S3 + CloudFront (frontend) · Lambda (backend) |
| Testing     | Vitest + fast-check (property-based tests) |

---

## Project structure

```
hackon/
├── backend/
│   └── src/
│       ├── intent/            ← THE INTENT ENGINE
│       │   ├── intent-router.ts          intent understanding
│       │   ├── retrieval-orchestrator.ts dynamic retrieval planning
│       │   ├── context-fusion.ts         unified context object
│       │   ├── decision-agent.ts         ACT/ASK/SHORTLIST/SUBSTITUTE/PREDICT
│       │   ├── predictive.ts             basket completion + gap-fill
│       │   ├── learning.ts               feedback loop
│       │   ├── semantic-store.ts         in-memory RAG retriever
│       │   ├── intent-engine.ts          top-level pipeline
│       │   └── rag/
│       │       ├── memory-rag.ts         complaints, rejections, habits
│       │       ├── decision-rag.ts       accept/reject learning
│       │       ├── session-rag.ts        "the second one" resolution
│       │       ├── product-rag.ts        semantic catalog search
│       │       └── household-rag.ts      member preferences (scaffold)
│       ├── handlers/          Lambda + orchestration
│       ├── providers/         provider-pattern (primary + fallback)
│       ├── engines/           legacy engines (quality tolerance, etc.)
│       ├── seed/              500-SKU catalog + personas
│       └── server/            Express fallback server
├── frontend/
│   └── src/
│       ├── views/             Home · Store · Cart · Checkout
│       ├── components/        Navbar · ProductTile · Assistant · SanayaAvatar
│       ├── store/             CartContext (client-side cart)
│       ├── hooks/             useKiranaSocket (Sanaya WebSocket)
│       └── data/              bundled 500-product catalog
└── serverless.yml             AWS infrastructure
```

---

## Running locally

No AWS account needed — everything falls back to local implementations.

```bash
# 1. Install
npm install

# 2. Seed local data (products + personas)
cd backend && npm run seed

# 3. Start the backend (Express + WebSocket on :3000)
npm run dev

# 4. In another terminal, start the frontend (Vite on :5173)
cd ../frontend && npm run dev
```

Open http://localhost:5173 — Sanaya connects to `ws://localhost:3000/ws`.

### Tests

```bash
cd backend && npm test     # Vitest + fast-check property tests
```

---

## Deployment

```bash
# Backend → AWS Lambda + API Gateway + DynamoDB + Cognito
npm install -g serverless@3
serverless deploy --stage dev

# Frontend → S3 + CloudFront
cd frontend && npm run build
aws s3 sync dist/ s3://<your-bucket>/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

The frontend reads `VITE_WS_URL` from `.env.production` to reach the deployed
WebSocket endpoint.

---

## Fallback philosophy

Every AWS service has a drop-in local alternative, selected automatically by the
`ProviderRegistry` based on environment and health checks:

| Primary (AWS)        | Fallback (local)            |
|----------------------|-----------------------------|
| Bedrock Claude       | Rule-based + Intent Engine  |
| DynamoDB             | Local JSON store            |
| ElastiCache Redis    | In-memory Map               |
| SageMaker            | Rule-based scoring          |
| Personalize          | Co-occurrence rules         |
| Forecast             | Fixed cadence rules         |
| API Gateway          | Express.js                  |
| Cognito              | Local JWT                   |
| Vector DB / embeddings | In-memory TF cosine store |

This means the demo is resilient — it works even if a service is unavailable.

---

## Demo personas

Switch personas in Sanaya's panel to see different *judgment*:

- **Rahul — Budget Optimizer**: price-sensitive, brand-flexible. `add rice` →
  Sanaya **auto-adds the cheapest** rice (acts, doesn't ask).
- **Priya — Health-Conscious**: vegetarian, organic-only, low-sugar. `chocolate`
  → Sanaya **blocks non-compliant options** and offers a compliant alternative.

---

## Further reading

- [`INTENT_ENGINE.md`](./INTENT_ENGINE.md) — complete working of the Intent Engine
- [`.kiro/specs/kirana-ai/`](./.kiro/specs/kirana-ai/) — requirements, design, tasks

---

*Built for the Amazon HackOn. Branding: Amazon Now · Assistant: Sanaya.*
