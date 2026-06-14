# The Intent Engine — Complete Working

> The Intent Engine is the brain of Amazon Now / Sanaya. It transforms a raw
> shopping query into **judgment**: it understands intent, retrieves relevant
> knowledge from multiple sources, fuses everything into a single context, makes
> one confident decision, and learns from the outcome.
>
> **Core principle:** *The objective is judgment, not search. Optimize for the
> correct decision, not maximum product exposure.* Sanaya behaves like a kirana
> shopkeeper, not a search engine.

---

## 1. The shift in thinking

A conventional commerce assistant does:

```
User Query → Catalog Search → Show results
```

The Intent Engine does:

```
User Query
  → Intent Understanding
  → Retrieval Planning
  → Multi-Source Retrieval (RAG)
  → Context Fusion
  → Decision Intelligence
  → Action Execution
  → Learning Feedback
```

Every step adds *judgment* so the user makes fewer decisions.

---

## 2. Pipeline overview

```
              ┌─────────────────────────────────────────────┐
  "add rice"  │ 1. Intent Router                            │
 ───────────► │    understand(message, sessionId)           │
              │    → { kind: 'add', entity: 'rice', conf }  │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 2. Retrieval Orchestrator                    │
              │    planRetrieval(intent)                     │
              │    → sources: [preference, memory, decision, │
              │       session, inventory, pricing, product]  │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 3. Multi-RAG Retrieval                       │
              │    executeRetrieval(plan, ctx)               │
              │    → fragments from each selected source     │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 4. Context Fusion Engine                     │
              │    fuseContext(...)                          │
              │    → one FusedContext object                 │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 5. Decision Intelligence Agent               │
              │    decide(fusedContext)                      │
              │    → ACT | ASK | SHORTLIST | SUBSTITUTE      │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 6. Predictive Engine                         │
              │    basket completion + gap-fill              │
              └───────────────────┬─────────────────────────┘
                                  ▼
              ┌─────────────────────────────────────────────┐
              │ 7. Learning Feedback Loop                    │
              │    update Memory + Decision RAG + Prefs      │
              └─────────────────────────────────────────────┘
```

Source: `backend/src/intent/intent-engine.ts` (`runIntentEngine`).

---

## 3. Stage 1 — Intent Router

**File:** `intent/intent-router.ts`

Classifies the message into one of:
`add · search · substitute · remove · question · greeting · help · plan · unknown`,
extracts the **entity** (the product/topic), and resolves session references.

```ts
understand("add rice", sessionId)
// → { kind: 'add', entity: 'rice', confidence: 0.93, rawText: 'add rice' }

understand("remove the second one", sessionId)
// → resolves "second one" via Session RAG → { kind: 'remove', entity: 'Eggs' }
```

If no keyword matches, the whole message is treated as a product search with
lower confidence (so bare `milk` still works).

---

## 4. Stage 2 — Retrieval Orchestrator

**File:** `intent/retrieval-orchestrator.ts`

Generates a **dynamic retrieval plan** — which knowledge sources matter for
*this* request. Different intents pull different sources:

| Query                | Retrieval plan |
|----------------------|----------------|
| `add milk`           | preference, memory, decision, session, inventory, pricing, product |
| `healthy snacks`     | preference, memory, product, decision |
| `substitute butter`  | preference, memory, product, decision, inventory |
| `plan next week`     | preference, memory, household, decision, product |
| `remove eggs`        | preference, memory, session |

Each chosen source carries a **rationale** for explainability.

---

## 5. Stage 3 — Multi-RAG Retrieval

**Files:** `intent/rag/*.ts`, `intent/semantic-store.ts`

All RAGs use an in-memory **SemanticStore** — a bag-of-words TF vector with
cosine similarity. It exposes the same interface a managed vector DB would, so it
can be swapped for Bedrock Titan embeddings + OpenSearch without touching callers.

### Memory RAG — `rag/memory-rag.ts`
Free-text conversational knowledge: complaints, rejections, brand opinions,
special instructions, shopping habits.

```
"User hates Mother Dairy milk."
"User avoids chocolates with palm oil."
"User buys snacks only on weekends."
```

Every message is auto-ingested (`ingestMessage`) using sentiment heuristics:
negative → complaint/instruction, positive → preference, recurring → habit.

### Decision Memory RAG — `rag/decision-rag.ts`
The learning system. Stores accept/reject outcomes:

```json
{ "category": "sugar", "rejected": "Tata", "accepted": "Generic", "reason": "price_sensitive" }
```

`brandsFor(userId, category)` aggregates accepted/rejected brands and price
sensitivity for future decisions.

### Session Memory RAG — `rag/session-rag.ts`
Short-term, in-session context. Tracks an item timeline so anaphora works:

```
"Add milk" → "Add eggs" → "Remove the second one"  ⇒ resolves to Eggs
```

### Product Intelligence RAG — `rag/product-rag.ts`
Category-aware semantic search over the 500-SKU catalog (name, brand, category,
labels, dietary attributes, health flags). Answers queries like
*"palm-oil-free chocolate"* or *"diabetic-friendly snacks"* without explicit
filters. Category tokens are weighted highest so `milk` returns milk, not
*Dairy Milk* chocolate.

### Household Knowledge RAG — `rag/household-rag.ts`
Per-member preferences ("Dad prefers Tata Tea", "Child likes Bournvita").
Architecture is in place; full multi-member orchestration is roadmap.

---

## 6. Stage 4 — Context Fusion Engine

**File:** `intent/context-fusion.ts`

Merges **every** source into a single `FusedContext`. The decision layer consumes
*only* this object — it never queries individual systems directly.

```ts
{
  userId, query, intent,
  preferredBrand: "Amul",        // from Preference Graph
  avoidedBrands: ["Mother Dairy"], // from Memory RAG (negative sentiment)
  dietaryFlags: ["vegetarian"],    // from Preference Graph
  priceSensitive: true,            // from Decision RAG + profile priceWeight
  rejectedBrands: ["Tata"],        // from Decision RAG
  acceptedBrands: ["Generic"],     // from Decision RAG
  memoryInsights: [...],           // free-text recalls
  recentItems: ["Milk", "Eggs"],   // from Session RAG
  cartValue: 161, deliveryGap: 38, // commerce signals
  candidates: [ ...Product ]       // from Product RAG
}
```

---

## 7. Stage 5 — Decision Intelligence Agent

**File:** `intent/decision-agent.ts`

The judgment layer. It filters candidates by **hard constraints** (dietary flags,
avoided/rejected brands), ranks the rest using fused signals, then picks an action:

| Action      | When |
|-------------|------|
| **ACT**     | Strong signal (preferred brand, accepted brand, or price-sensitive winner) → auto-add, inform |
| **ASK**     | Genuine ambiguity → ask the single highest-priority question |
| **SHORTLIST** | Search/browse intent → 2–3 curated, dietary-filtered options |
| **SUBSTITUTE** | Preferred item unavailable → compliant alternatives in the same category |
| **PREDICT** | Proactive needs (basket completion, gap-fill) |

### The one-question rule (non-negotiable)
Sanaya never asks more than one question per turn. When multiple things are
unknown, she asks only the **highest priority**:

```
Allergy  →  Dietary restriction  →  Brand preference  →  Quantity
```

### Ranking signals
```
+5  matches preferred brand
+3  previously accepted brand
+3  cheaper (when price-sensitive)
+2  organic (when organic-only flag)
+2  low-sugar (when low-sugar flag)
```

### Worked examples
```
Rahul (price-sensitive): "add rice"
  → candidates filtered, cheapest ranked top, strong signal
  → ACT: "Added Tata Rice — ₹110."

Priya (organic-only + low-sugar): "chocolate"
  → all candidates violate organic-only (hard constraint)
  → ASK: "Those don't fit your organic-only preference. Want a compliant alternative?"
```

---

## 8. Stage 6 — Predictive Engine

**File:** `intent/predictive.ts`

After a cart change, Sanaya proactively predicts needs:

- **Basket completion** — co-occurrence rules (rice → dal, bread → butter,
  tea → sugar). Max 2 per session.
- **Gap-fill** — when the cart is below the free-delivery threshold, suggests a
  useful staple priced to close the gap. Max 1 per session.
- **Usual basket** — for `plan` intents, assembles a basket from accepted
  categories.

---

## 9. Stage 7 — Learning Feedback Loop

**File:** `intent/learning.ts`

Every interaction makes Sanaya smarter:

| Event                | Updates |
|----------------------|---------|
| Message received     | Memory RAG (insights) + Session RAG |
| Item added / accepted| Decision RAG (accepted) + Preference Graph (brand loyalty +10) |
| Recommendation rejected | Decision RAG (rejected) + Memory RAG (if brand dislike) |

Over time, `priceSensitive`, `acceptedBrands`, `rejectedBrands`, and
`avoidedBrands` sharpen — so the same query yields better judgment next time.

---

## 10. How it plugs into the app

```
Frontend (Sanaya panel)
  → WebSocket message
  → Orchestration Lambda (handlers/orchestrator.ts)
  → runIntentEngine(...)            ← the whole pipeline above
  → decision + predictions
  → AgentResponse (content + product cards)
  → WebSocket back to Sanaya
```

The orchestrator maps the decision's action to a UI action
(`ACT → auto-added`, `SHORTLIST → shortlist`, etc.), applies the cart change for
ACT, and attaches basket-completion / gap-fill cards as predictions.

---

## 11. Fallback & scalability

- **Embeddings/Vector DB:** the in-memory `SemanticStore` is the fallback. Swap
  `semantic-store.ts` for Bedrock Titan embeddings + OpenSearch/pgvector with no
  caller changes.
- **LLM:** the rule-based decision logic *is* the fallback for Bedrock. When
  Bedrock is available, the same fused context can be handed to Claude for
  natural-language reasoning while keeping the hard constraints.
- **Per-user stores:** Memory/Decision/Session RAGs are keyed per user/session;
  in production these persist to DynamoDB + a vector index instead of memory.

---

## 12. File map

| File | Responsibility |
|------|----------------|
| `intent/intent-engine.ts`        | Top-level pipeline orchestration |
| `intent/intent-router.ts`        | Intent understanding + reference resolution |
| `intent/retrieval-orchestrator.ts` | Dynamic retrieval planning + execution |
| `intent/context-fusion.ts`       | Unified context object |
| `intent/decision-agent.ts`       | ACT/ASK/SHORTLIST/SUBSTITUTE judgment |
| `intent/predictive.ts`           | Basket completion + gap-fill |
| `intent/learning.ts`             | Feedback loop |
| `intent/semantic-store.ts`       | In-memory RAG retriever (TF cosine) |
| `intent/types.ts`                | Shared Intent Engine types |
| `intent/rag/memory-rag.ts`       | Conversational insights |
| `intent/rag/decision-rag.ts`     | Accept/reject learning |
| `intent/rag/session-rag.ts`      | In-session context |
| `intent/rag/product-rag.ts`      | Semantic catalog search |
| `intent/rag/household-rag.ts`    | Household member preferences |

---

*The Intent Engine is the differentiator: Amazon Now doesn't just find products —
Sanaya decides for you, like the shopkeeper who already knows your order.*
