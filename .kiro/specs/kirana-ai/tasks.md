# Implementation Plan: KiranaAI

## Overview

Implement a conversational commerce agent with provider-pattern fallback architecture. The system uses a monorepo structure with a TypeScript Node.js backend (Lambda + Express fallback) and React Vite frontend. All AWS dependencies (Bedrock, DynamoDB, ElastiCache, Cognito, etc.) are abstracted behind provider interfaces with local fallback implementations for full demo resilience.

## Tasks

- [x] 1. Project scaffolding and core interfaces
  - [x] 1.1 Initialize monorepo with backend and frontend packages
    - Create root `package.json` with workspaces config for `backend/` and `frontend/`
    - Initialize `backend/` with TypeScript, Vitest, and fast-check
    - Initialize `frontend/` with Vite + React + TypeScript template
    - Add shared `tsconfig.json` base config
    - _Requirements: 1.1, 14.1_

  - [x] 1.2 Define provider interfaces and factory pattern
    - Create `backend/src/providers/interfaces.ts` with `PreferenceStoreProvider`, `SessionStoreProvider`, `CacheProvider`, `AgentProvider`, `RecommendationProvider`, `ScoringProvider`
    - Create `backend/src/providers/factory.ts` with `ProviderFactory<T>` base and `ResilientProvider<T>` wrapper
    - Create provider registry that selects primary or fallback based on environment/health checks
    - _Requirements: 11.1, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 14.1, 14.2_

  - [x] 1.3 Define data models and shared types
    - Create `backend/src/models/` with `UserProfile`, `SessionContext`, `Product`, `CartItem`, `ConfidenceScore`, `QualityToleranceResult` interfaces
    - Create `backend/src/models/messages.ts` with WebSocket message protocol types (`ClientMessage`, `ServerMessage`, `ProductCard`, etc.)
    - Create `backend/src/models/tools.ts` with agent tool interfaces
    - _Requirements: 2.1, 8.1, 9.1_

- [x] 2. Data layer — Preference Graph
  - [x] 2.1 Implement DynamoDB Preference Store (primary provider)
    - Create `backend/src/providers/preference/dynamodb.ts`
    - Implement single-table design with PK/SK patterns for user profiles, brand loyalty, and quality preferences
    - Implement `getUserProfile`, `updateBrandLoyalty`, `setDietaryFlag`, `getPreferences` methods
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Implement Local JSON Preference Store (fallback provider)
    - Create `backend/src/providers/preference/local-json.ts`
    - Store data in a local JSON file with the same PK/SK structure
    - Implement identical interface methods with file-based persistence
    - _Requirements: 12.1_

  - [x] 2.3 Write property test: Preference Graph Round-Trip
    - **Property 3: Round-Trip Consistency**
    - Test that any valid user profile data written to either provider can be read back with identical values
    - **Validates: Requirements 2.1, 2.4**

  - [x] 2.4 Write property test: Provider Interface Equivalence — Data Layer (Preference)
    - **Property 16: Provider Interface Equivalence — Data Layer**
    - For any valid preference operation, both DynamoDB and Local JSON providers return the same result
    - **Validates: Requirements 12.1**

- [x] 3. Session and Cache layer
  - [x] 3.1 Implement Redis Session Store (primary provider)
    - Create `backend/src/providers/session/redis.ts`
    - Implement `getSession`, `saveSession`, `deleteSession` with JSON serialization
    - Support concurrent multi-user access
    - _Requirements: 8.1, 8.3_

  - [x] 3.2 Implement In-Memory Session Store (fallback provider)
    - Create `backend/src/providers/session/in-memory.ts`
    - Use a `Map<string, SessionContext>` for session storage
    - Implement identical interface methods
    - _Requirements: 12.2_

  - [x] 3.3 Implement Redis Price Cache (primary provider)
    - Create `backend/src/providers/cache/redis.ts`
    - Implement `get`, `set`, `delete` with TTL support (15-minute default)
    - _Requirements: 9.1, 9.2_

  - [x] 3.4 Implement In-Memory Price Cache (fallback provider)
    - Create `backend/src/providers/cache/in-memory.ts`
    - Use a Map with timestamp tracking for TTL-based expiration
    - Expire entries after 15 minutes and refresh from source catalog
    - _Requirements: 12.3_

  - [x] 3.5 Write property test: Session Data Round-Trip
    - **Property 13: Session Data Round-Trip**
    - Any session context written to either provider reads back identically
    - **Validates: Requirements 8.1**

  - [x] 3.6 Write property test: Price Cache TTL Expiration
    - **Property 14: Price Cache TTL Expiration**
    - After TTL elapses, cached entry is expired and next read returns refreshed value
    - **Validates: Requirements 9.1, 9.2**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Quality Tolerance Engine
  - [x] 5.1 Implement rule-based Quality Tolerance scoring
    - Create `backend/src/engines/quality-tolerance.ts`
    - Compute substitution score based on brand match, category match, price deviation, dietary compliance, quality level
    - Apply acceptance threshold (0.6) to determine accept/reject
    - Return `QualityToleranceResult` with reasons and factor breakdown
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 Write property test: Substitution Score Decision Routing
    - **Property 9: Substitution Score Decision Routing**
    - When score > threshold → suggest substitute; when below → present shortlist of alternatives
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. Basket Completion Engine
  - [x] 6.1 Implement co-occurrence rule-based Basket Completion
    - Create `backend/src/engines/basket-completion.ts`
    - Define hard-coded co-occurrence rules for the 50-SKU catalog
    - Identify complementary products based on cart contents and user history
    - Enforce max 2 suggestions per session via `SessionContext.suggestionsGiven.basketCompletion`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.2 Write property test: Basket Completion Limit
    - **Property 10: Basket Completion Limit**
    - For any session and cart contents, engine produces at most 2 suggestions
    - **Validates: Requirements 6.2**

- [x] 7. Gap-Fill Engine
  - [x] 7.1 Implement threshold-based Gap-Fill logic
    - Create `backend/src/engines/gap-fill.ts`
    - Calculate cart-to-threshold gap
    - Select product whose price fills the gap (cart total + product price >= threshold)
    - Enforce max 1 gap-fill suggestion per session via `SessionContext.suggestionsGiven.gapFill`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 7.2 Write property test: Gap-Fill Threshold Satisfaction
    - **Property 11: Gap-Fill Threshold Satisfaction**
    - The suggested product price + cart total >= free delivery threshold
    - **Validates: Requirements 7.1**

  - [x] 7.3 Write property test: Gap-Fill Suggestion Limit
    - **Property 12: Gap-Fill Suggestion Limit**
    - For any session, at most 1 gap-fill suggestion is produced
    - **Validates: Requirements 7.2**

- [ ] 8. Conversational Agent
  - [x] 8.1 Implement Bedrock Agent provider (primary)
    - Create `backend/src/providers/agent/bedrock.ts`
    - Invoke Bedrock Claude with system prompt, conversation context, and tool definitions
    - Parse tool-use responses and dispatch to domain engines
    - Compute confidence scores and route actions (auto-add / suggest / shortlist)
    - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3_

  - [x] 8.2 Implement rule-based Agent provider (fallback)
    - Create `backend/src/providers/agent/rule-based.ts`
    - Pattern-match user intents (search, substitute, add-to-cart, onboarding answers)
    - Generate templated responses with confidence scoring
    - Maintain one-question-per-turn constraint and product card formatting
    - _Requirements: 11.1, 11.2_

  - [x] 8.3 Implement onboarding flow logic
    - Create `backend/src/agent/onboarding.ts`
    - Detect cold-start users (no Preference_Graph data)
    - Generate 3-5 onboarding questions, one per turn
    - Parse answers and populate Preference_Graph with initial scores, flags, and preferences
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 8.4 Implement agent tool dispatch
    - Create `backend/src/agent/tools.ts`
    - Implement `lookup_preference`, `search_products`, `check_quality_tolerance`, `update_cart` tool handlers
    - Wire tool calls to Preference Graph, SKU catalog, Quality Tolerance Engine, and Session Store
    - _Requirements: 2.4, 5.1, 9.3_

  - [x] 8.5 Write property test: One Question Per Turn
    - **Property 1: One Question Per Turn**
    - For any user message, the agent response contains at most one interrogative question
    - **Validates: Requirements 1.4, 3.3**

  - [x] 8.6 Write property test: Confidence-Based Action Routing
    - **Property 8: Confidence-Based Action Routing**
    - Auto-add when score > 0.85, suggest when 0.55–0.85, shortlist when < 0.55
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 8.7 Write property test: Cold-Start Onboarding Trigger
    - **Property 6: Cold-Start Onboarding Trigger**
    - Users with no Preference_Graph data receive an onboarding question as first response
    - **Validates: Requirements 3.1**

  - [x] 8.8 Write property test: Onboarding Completeness
    - **Property 7: Onboarding Completeness**
    - Completed onboarding produces at least one brand loyalty score, one dietary/quality pref, 3-5 questions asked
    - **Validates: Requirements 3.2, 3.4**

- [x] 9. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. WebSocket API and Express fallback
  - [-] 10.1 Implement WebSocket Lambda handlers
    - Create `backend/src/handlers/websocket.ts` with `$connect`, `$disconnect`, `$default` handlers
    - Parse `ClientMessage`, authenticate connection, route to orchestrator
    - Return `ServerMessage` via API Gateway Management API
    - _Requirements: 1.2, 14.1_

  - [-] 10.2 Implement Orchestration handler
    - Create `backend/src/handlers/orchestrator.ts`
    - Load session context, invoke Conversational Agent with message + tools
    - Persist updated session, send response back over WebSocket
    - Trigger basket completion and gap-fill checks after agent response
    - _Requirements: 1.2, 8.1, 8.2_

  - [-] 10.3 Implement Express.js fallback server
    - Create `backend/src/server/express.ts`
    - Set up WebSocket server (ws library) with same message protocol
    - Mount same orchestrator logic with local auth middleware
    - Support `npm run dev` for local development without AWS
    - _Requirements: 14.1_

- [ ] 11. Authentication layer
  - [-] 11.1 Implement Cognito auth middleware (primary)
    - Create `backend/src/middleware/auth.ts`
    - Validate Cognito JWT tokens on WebSocket $connect and message routes
    - Extract userId from token claims
    - _Requirements: 15.1, 15.2_

  - [-] 11.2 Implement local JWT auth (fallback)
    - Create `backend/src/middleware/auth-local.ts`
    - Generate and validate local JWTs with same claim structure
    - Provide `/auth/login` endpoint for local dev token generation
    - _Requirements: 14.2, 15.1, 15.2_

  - [x] 11.3 Write property test: Authentication Enforcement
    - **Property 18: Authentication Enforcement**
    - Requests without valid tokens are rejected; no processing occurs
    - **Validates: Requirements 15.1, 15.2**

  - [x] 11.4 Write property test: Preference Data Isolation
    - **Property 19: Preference Data Isolation**
    - User A's credentials never return User B's preference data
    - **Validates: Requirements 15.3**

  - [x] 11.5 Write property test: Fallback Auth Equivalence
    - **Property 20: Fallback Auth Equivalence**
    - Local JWT extracts same identity and validates with equivalent behavior as Cognito
    - **Validates: Requirements 14.2**

- [x] 12. React Chat Widget frontend
  - [x] 12.1 Create Chat Widget component and layout
    - Create `frontend/src/components/ChatWidget.tsx` as overlay panel
    - Implement open/close toggle, message input, message list display
    - Style as non-obstructive overlay on commerce page
    - _Requirements: 1.1_

  - [x] 12.2 Implement WebSocket connection hook
    - Create `frontend/src/hooks/useWebSocket.ts`
    - Manage connection lifecycle (connect, reconnect, disconnect)
    - Handle `ClientMessage` sending and `ServerMessage` parsing
    - _Requirements: 1.2_

  - [x] 12.3 Implement ProductCard and cart actions
    - Create `frontend/src/components/ProductCard.tsx`
    - Display product name, price, recommendation reason, and add-to-cart button
    - Wire add-to-cart to `update_cart` via WebSocket message
    - _Requirements: 1.5, 6.3, 7.3_

  - [x] 12.4 Implement ChatContext state management
    - Create `frontend/src/context/ChatContext.tsx`
    - Manage messages, cart state, session ID, connection status
    - Handle optimistic cart updates and error rollback
    - _Requirements: 1.2, 8.1_

  - [x] 12.5 Write property test: Product Card Completeness
    - **Property 2: Product Card Completeness**
    - Any agent response referencing a product includes a card with name, price, and add-to-cart action
    - **Validates: Requirements 1.5, 6.3, 7.3**

- [x] 13. Demo data seeding
  - [x] 13.1 Create 50-SKU product catalog seed data
    - Create `backend/src/seed/catalog.ts` with 50 products across grocery categories
    - Include brand, price, category, dietary labels (organic, low-sugar, gluten-free, etc.)
    - Create co-occurrence rules for basket completion
    - _Requirements: 10.1_

  - [x] 13.2 Create persona seed data for Segment A and Segment B
    - Create `backend/src/seed/personas.ts`
    - Segment A (budget optimizer): brand loyalty toward value brands, price-weighted quality prefs
    - Segment B (health-conscious): dietary flags (organic, low-sugar), health-brand loyalty
    - Pre-populate Preference_Graph entries for both personas
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 13.3 Implement seed script
    - Create `backend/src/seed/index.ts` — runnable script to populate DynamoDB or local JSON
    - Seed products, co-occurrence rules, and persona profiles
    - Support `npm run seed` command
    - _Requirements: 10.1, 10.4_

  - [x] 13.4 Write property test: Persona-Based Prioritization
    - **Property 15: Persona-Based Prioritization**
    - Segment A recommendations average price ≤ catalog average; Segment B health-label proportion > catalog proportion
    - **Validates: Requirements 10.2, 10.3**

- [x] 14. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Integration wiring and end-to-end flow
  - [x] 15.1 Wire all providers through factory registry
    - Create `backend/src/providers/registry.ts`
    - Instantiate all provider factories with environment-based config
    - Export singleton registry with health-check-based provider selection
    - _Requirements: 11.1, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3, 14.1, 14.2_

  - [x] 15.2 Implement full orchestration pipeline
    - Connect orchestrator to agent, all engines, session store, and preference graph
    - Implement basket completion trigger after cart updates
    - Implement gap-fill trigger when cart total is below threshold
    - Wire dietary restriction enforcement across recommendation pipeline
    - _Requirements: 1.2, 4.1, 5.1, 6.1, 7.1, 8.2_

  - [x] 15.3 Write property test: Dietary Restriction Enforcement
    - **Property 4: Dietary Restriction Enforcement**
    - Users with dietary flags never receive recommendations violating those flags
    - **Validates: Requirements 2.3**

  - [x] 15.4 Write property test: Brand Loyalty Score Update
    - **Property 5: Brand Loyalty Score Update**
    - Purchase/acceptance events increase the relevant brand loyalty score
    - **Validates: Requirements 2.2**

  - [x] 15.5 Write property test: Fallback Agent Behavioral Equivalence
    - **Property 17: Fallback Agent Behavioral Equivalence**
    - Fallback agent maintains same format, one-question constraint, and confidence routing
    - **Validates: Requirements 11.1, 11.2**

  - [x] 15.6 Write integration tests for end-to-end flows
    - Test full WebSocket message → orchestrator → agent → response flow
    - Test onboarding flow start to completion
    - Test basket completion and gap-fill triggering
    - Test fallback provider switching on health check failure
    - _Requirements: 1.2, 3.1, 6.1, 7.1, 14.1_

- [x] 16. Serverless Framework deployment configuration
  - [x] 16.1 Create Serverless Framework config
    - Create `serverless.yml` with service definition, provider config (Node 18, ap-south-1)
    - Define Lambda functions: wsConnect, wsDisconnect, wsDefault, orchestrator
    - Define DynamoDB table, ElastiCache cluster, Cognito user pool as resources
    - Configure IAM roles for Bedrock, DynamoDB, ElastiCache access
    - _Requirements: 14.1_

  - [x] 16.2 Create environment configuration
    - Create `backend/src/config/index.ts` with environment-aware config loading
    - Support `LOCAL`, `DEV`, `PROD` environments
    - Configure provider selection based on environment (local = all fallbacks)
    - _Requirements: 11.1, 12.1, 14.1_

- [x] 17. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The provider factory pattern allows full local development with `npm run dev` using all fallback providers
- Seed data enables immediate demo with two personas without needing real user interaction history

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["2.3", "2.4", "3.5", "3.6"] },
    { "id": 4, "tasks": ["5.1", "6.1", "7.1"] },
    { "id": 5, "tasks": ["5.2", "6.2", "7.2", "7.3"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 7, "tasks": ["8.5", "8.6", "8.7", "8.8"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "11.1", "11.2"] },
    { "id": 9, "tasks": ["11.3", "11.4", "11.5", "12.1", "12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["12.5", "13.1", "13.2"] },
    { "id": 11, "tasks": ["13.3", "13.4"] },
    { "id": 12, "tasks": ["15.1", "16.1", "16.2"] },
    { "id": 13, "tasks": ["15.2"] },
    { "id": 14, "tasks": ["15.3", "15.4", "15.5", "15.6"] }
  ]
}
```
