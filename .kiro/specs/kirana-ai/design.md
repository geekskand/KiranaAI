# Design Document

## Overview

KiranaAI is a conversational commerce agent for quick-commerce platforms. It provides intelligent product recommendations, substitution handling, basket completion, and gap-fill suggestions through a chat widget overlay. The system uses a provider pattern for all AWS service dependencies, enabling full local development and demo resilience.

## Architecture

KiranaAI follows a layered architecture with strict separation between the chat interface, orchestration layer, domain engines, and data providers. Every external AWS service dependency is abstracted behind a **Provider Interface** enabling seamless fallback to local implementations.

```
┌─────────────────────────────────────────────────────────────┐
│                   React Chat Widget (Vite SPA)               │
│                   WebSocket Connection                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              API Layer (API Gateway / Express Fallback)       │
│              Cognito Auth / Local JWT Fallback                │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Orchestration Lambda                         │
│        ┌──────────────────────────────────────┐             │
│        │    Conversational Agent (Bedrock)     │             │
│        │    Tools: lookup_preference,          │             │
│        │           search_products,            │             │
│        │           check_quality_tolerance,    │             │
│        │           update_cart                  │             │
│        └──────────────────────────────────────┘             │
└───┬──────────┬──────────┬──────────┬────────────────────────┘
    │          │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼────┐
│Pref   │ │Quality│ │Basket │ │Gap-Fill│
│Graph  │ │Toler. │ │Compl. │ │Engine  │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬────┘
    │         │         │         │
┌───▼─────────▼─────────▼─────────▼──────────────────────────┐
│              Provider Layer (Interface Abstractions)          │
│  DynamoDB/JSON  Redis/InMemory  Personalize/Rules  Bedrock  │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Chat Widget (Frontend)

**Technology:** React + Vite SPA, TypeScript

**Responsibilities:**
- Render overlay chat panel on commerce pages
- Manage WebSocket connection lifecycle
- Display message threads and product cards
- Handle add-to-cart actions from product cards

**Key Files:**
- `frontend/src/components/ChatWidget.tsx` — Main widget component
- `frontend/src/components/ProductCard.tsx` — Product display card
- `frontend/src/hooks/useWebSocket.ts` — WebSocket connection hook
- `frontend/src/context/ChatContext.tsx` — Chat state management

### 2. API Layer

**Technology:** API Gateway WebSocket API (or Express.js fallback)

**Responsibilities:**
- WebSocket connection management ($connect, $disconnect, $default)
- Route messages to Orchestration Lambda
- Authenticate connections via Cognito (or local JWT)

**Key Files:**
- `backend/src/handlers/websocket.ts` — WebSocket Lambda handlers
- `backend/src/middleware/auth.ts` — Auth middleware
- `backend/src/server/express.ts` — Express.js fallback server

### 3. Orchestration Lambda

**Technology:** Node.js Lambda, TypeScript

**Responsibilities:**
- Receive user messages from API layer
- Load session context from Session_Store
- Invoke Conversational Agent with context + tools
- Route agent tool calls to appropriate domain engines
- Persist updated session state
- Return response via WebSocket

**Key Files:**
- `backend/src/handlers/orchestrator.ts` — Main orchestration handler
- `backend/src/agent/conversationalAgent.ts` — Agent invocation logic
- `backend/src/agent/tools.ts` — Tool definitions and dispatch

### 4. Conversational Agent

**Technology:** Bedrock Claude (or rule-based fallback)

**Responsibilities:**
- Interpret user intent from messages + context
- Generate natural language responses
- Determine confidence scores for recommendations
- Enforce one-question-per-turn constraint
- Manage onboarding flow for cold-start users

**Tools Available:**
- `lookup_preference` — Query user preference graph
- `search_products` — Search SKU catalog
- `check_quality_tolerance` — Get substitution scores
- `update_cart` — Add/remove items from cart

### 5. Preference Graph Engine

**Technology:** DynamoDB single-table (or JSON/SQLite fallback)

**Responsibilities:**
- Store per-user, per-category brand loyalty scores
- Store dietary flags and quality preferences
- Update scores on purchase/confirmation events
- Provide complete profile retrieval in single query

### 6. Quality Tolerance Engine

**Technology:** Rule-based scoring (MVP), SageMaker (future)

**Responsibilities:**
- Compute substitution acceptance scores
- Compare substitute products against user preference profile
- Apply category-specific tolerance rules

### 7. Basket Completion Engine

**Technology:** Hard-coded co-occurrence rules (MVP), Personalize (future)

**Responsibilities:**
- Identify complementary products for cart contents
- Limit suggestions to 2 per session
- Provide recommendation reasons

### 8. Gap-Fill Engine

**Technology:** Fixed cadence rules (MVP), Forecast (future)

**Responsibilities:**
- Calculate cart-to-threshold gap
- Select product to fill the gap
- Limit to 1 suggestion per session

### 9. Session Store

**Technology:** ElastiCache Redis (or in-memory Map fallback)

**Responsibilities:**
- Persist conversation context per session
- Store cart state and agent reasoning history
- Support concurrent multi-user access

### 10. Price Cache

**Technology:** ElastiCache Redis (or in-memory Map fallback)

**Responsibilities:**
- Cache product prices with 15-minute TTL
- Refresh expired entries from source catalog
- Serve current prices for agent responses

### Provider Interface Pattern

All AWS service dependencies implement a common provider interface pattern:

```typescript
// Generic provider interface
interface Provider<T> {
  isAvailable(): Promise<boolean>;
  getInstance(): T;
}

// Example: Preference Store Provider
interface PreferenceStoreProvider {
  getUserProfile(userId: string): Promise<UserProfile>;
  updateBrandLoyalty(userId: string, category: string, brand: string, delta: number): Promise<void>;
  setDietaryFlag(userId: string, flag: DietaryFlag): Promise<void>;
  getPreferences(userId: string, category: string): Promise<CategoryPreferences>;
}

// Example: Session Store Provider
interface SessionStoreProvider {
  getSession(sessionId: string): Promise<SessionContext>;
  saveSession(sessionId: string, context: SessionContext): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

// Example: Cache Provider
interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// Example: Agent Provider
interface AgentProvider {
  invoke(context: AgentContext, message: string): Promise<AgentResponse>;
}

// Example: Recommendation Provider
interface RecommendationProvider {
  getBasketCompletions(cart: CartItem[], userId: string): Promise<ProductSuggestion[]>;
}

// Example: Scoring Provider
interface ScoringProvider {
  computeSubstitutionScore(
    original: Product,
    substitute: Product,
    userProfile: UserProfile
  ): Promise<number>;
}
```

### Provider Factory

```typescript
interface ProviderFactory<T> {
  createPrimary(): T;
  createFallback(): T;
  create(): T; // Returns primary if available, fallback otherwise
}

class PreferenceStoreFactory implements ProviderFactory<PreferenceStoreProvider> {
  createPrimary(): PreferenceStoreProvider {
    return new DynamoDBPreferenceStore(/* config */);
  }
  createFallback(): PreferenceStoreProvider {
    return new LocalJsonPreferenceStore(/* config */);
  }
  create(): PreferenceStoreProvider {
    try {
      const primary = this.createPrimary();
      // Health check
      return primary;
    } catch {
      return this.createFallback();
    }
  }
}
```

### WebSocket Message Protocol

```typescript
// Client → Server
interface ClientMessage {
  action: 'sendMessage';
  payload: {
    sessionId: string;
    content: string;
    timestamp: number;
  };
}

// Server → Client
interface ServerMessage {
  type: 'agentResponse' | 'productCard' | 'cartUpdate' | 'error';
  payload: AgentResponsePayload | ProductCardPayload | CartUpdatePayload | ErrorPayload;
}

interface AgentResponsePayload {
  content: string;
  products?: ProductCard[];
  action?: 'auto-added' | 'suggest' | 'shortlist';
  sessionId: string;
}

interface ProductCard {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  reason?: string; // For basket completion / gap-fill
}

interface CartUpdatePayload {
  productId: string;
  action: 'added' | 'removed';
  newTotal: number;
}
```

### Agent Tool Interfaces

```typescript
interface LookupPreferenceTool {
  name: 'lookup_preference';
  input: { userId: string; category?: string };
  output: UserProfile | CategoryPreferences;
}

interface SearchProductsTool {
  name: 'search_products';
  input: { query: string; category?: string; filters?: ProductFilters };
  output: Product[];
}

interface CheckQualityToleranceTool {
  name: 'check_quality_tolerance';
  input: { userId: string; originalProductId: string; substituteProductId: string };
  output: { score: number; acceptable: boolean; reasons: string[] };
}

interface UpdateCartTool {
  name: 'update_cart';
  input: { sessionId: string; productId: string; action: 'add' | 'remove' };
  output: { success: boolean; cartTotal: number };
}
```

## Data Models

### DynamoDB Single-Table Design

**Table:** `KiranaAI`
**Partition Key:** `PK` (string)
**Sort Key:** `SK` (string)

| Entity | PK | SK | Attributes |
|--------|----|----|------------|
| User Profile | `USER#<userId>` | `PROFILE` | `dietaryFlags`, `createdAt` |
| Brand Loyalty | `USER#<userId>` | `BRAND#<category>#<brand>` | `score`, `lastUpdated` |
| Quality Pref | `USER#<userId>` | `QUALITY#<category>` | `toleranceLevel`, `priceWeight`, `brandWeight` |
| Product | `PRODUCT#<productId>` | `METADATA` | `name`, `price`, `category`, `labels`, `brand` |
| Co-occurrence | `COOCCUR#<productId>` | `WITH#<companionId>` | `frequency`, `reason` |

**Access Patterns:**
- Get full user profile: `PK = USER#<userId>`, `SK begins_with PROFILE`
- Get all preferences for user: `PK = USER#<userId>` (returns profile + brands + quality)
- Get product by ID: `PK = PRODUCT#<productId>`, `SK = METADATA`
- Get co-occurring products: `PK = COOCCUR#<productId>`

### Session Context Model

```typescript
interface SessionContext {
  sessionId: string;
  userId: string;
  conversationHistory: Message[];
  cartState: CartItem[];
  agentReasoningHistory: ReasoningStep[];
  onboardingState?: OnboardingState;
  suggestionsGiven: {
    basketCompletion: number; // max 2
    gapFill: number;         // max 1
  };
  createdAt: number;
  lastActivityAt: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  products?: ProductCard[];
  timestamp: number;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface OnboardingState {
  questionsAsked: number;
  questionsTotal: number;
  answers: Record<string, string>;
  complete: boolean;
}
```

### User Profile Model

```typescript
interface UserProfile {
  userId: string;
  dietaryFlags: DietaryFlag[];
  brandLoyalty: BrandLoyaltyEntry[];
  qualityPreferences: QualityPreference[];
  createdAt: number;
  updatedAt: number;
}

type DietaryFlag = 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free' | 'low-sugar' | 'organic-only';

interface BrandLoyaltyEntry {
  category: string;
  brand: string;
  score: number; // 0-100
  lastUpdated: number;
}

interface QualityPreference {
  category: string;
  toleranceLevel: 'strict' | 'moderate' | 'flexible';
  priceWeight: number;  // 0-1, how much price matters
  brandWeight: number;  // 0-1, how much brand matters
}
```

### Confidence Score Model

```typescript
interface ConfidenceScore {
  value: number; // 0-1
  band: 'high' | 'medium' | 'low';
  factors: ConfidenceFactor[];
}

interface ConfidenceFactor {
  name: string;
  weight: number;
  contribution: number;
}

// Threshold configuration
const CONFIDENCE_THRESHOLDS = {
  high: 0.85,    // Auto-add
  medium: 0.55,  // Suggest-and-confirm
  // Below 0.55 = shortlist
} as const;
```

### Quality Tolerance Score Model

```typescript
interface QualityToleranceResult {
  score: number; // 0-1
  acceptable: boolean;
  reasons: string[];
  factors: {
    brandMatch: number;
    categoryMatch: number;
    priceDeviation: number;
    dietaryCompliance: number;
    qualityLevel: number;
  };
}

const ACCEPTANCE_THRESHOLD = 0.6;
```

## Error Handling

### Provider Fallback Strategy

```typescript
class ResilientProvider<T> {
  constructor(
    private primary: T,
    private fallback: T,
    private healthCheck: () => Promise<boolean>
  ) {}

  async getActiveProvider(): Promise<T> {
    try {
      if (await this.healthCheck()) {
        return this.primary;
      }
    } catch (error) {
      console.warn('Primary provider unavailable, switching to fallback', error);
    }
    return this.fallback;
  }
}
```

### Error Categories

| Category | Handling | User Impact |
|----------|----------|-------------|
| Provider unavailable | Switch to fallback | None (transparent) |
| Auth failure | Return 401 | Show login prompt |
| Invalid input | Return 400 with message | Display validation error |
| Agent timeout | Retry once, then fallback | Slight delay |
| Session expired | Create new session | Onboarding may restart |
| Product not found | Inform user | Suggest alternatives |

### WebSocket Error Handling

```typescript
interface WebSocketError {
  code: 'AUTH_FAILED' | 'SESSION_EXPIRED' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}
```

## Deployment Architecture

### Serverless Framework Configuration

```yaml
# serverless.yml (structure)
service: kirana-ai

provider:
  name: aws
  runtime: nodejs18.x
  region: ap-south-1

functions:
  wsConnect:
    handler: src/handlers/websocket.connect
    events:
      - websocket: $connect
  wsDisconnect:
    handler: src/handlers/websocket.disconnect
    events:
      - websocket: $disconnect
  wsDefault:
    handler: src/handlers/websocket.default
    events:
      - websocket: $default
  orchestrator:
    handler: src/handlers/orchestrator.handler
    timeout: 30

resources:
  Resources:
    KiranaTable:
      Type: AWS::DynamoDB::Table
    RedisCluster:
      Type: AWS::ElastiCache::ReplicationGroup
```

### Local Development Mode

When running locally, all providers default to fallback implementations:
- Express.js replaces API Gateway
- Local JWT replaces Cognito
- In-memory Map replaces Redis
- Local JSON file replaces DynamoDB
- Rule-based engine replaces Bedrock
- Hard-coded rules replace Personalize/SageMaker/Forecast

## Testing Strategy

**Unit Tests:** Vitest for all pure logic — confidence routing, quality tolerance scoring, co-occurrence rule matching, gap-fill calculation, and preference graph CRUD operations.

**Property-Based Tests:** fast-check with Vitest for universal properties — provider equivalence, threshold-based routing, data round-trips, and constraint enforcement (suggestion limits, one-question-per-turn).

**Integration Tests:** End-to-end WebSocket message flow, onboarding flow completion, and full orchestration pipeline with fallback providers active.

**Local Dev Smoke Tests:** Express.js server + all fallback providers running together to validate the full stack operates without AWS dependencies.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: One Question Per Turn

*For any* user message sent to the Conversational Agent (including during onboarding), the agent's response SHALL contain at most one interrogative question.

**Validates: Requirements 1.4, 3.3**

### Property 2: Product Card Completeness

*For any* agent response that references a product, the response payload SHALL include a product card containing the product name, current price, and an add-to-cart action.

**Validates: Requirements 1.5, 6.3, 7.3**

### Property 3: Preference Graph Round-Trip

*For any* valid user profile data (brand loyalty scores, dietary flags, quality preferences) written to the Preference Graph, a single retrieval operation SHALL return all stored data with identical values.

**Validates: Requirements 2.1, 2.4**

### Property 4: Dietary Restriction Enforcement

*For any* user with a dietary restriction flag set, all product recommendations returned by the Conversational Agent SHALL comply with that dietary restriction (no products violating the flag appear in recommendations).

**Validates: Requirements 2.3**

### Property 5: Brand Loyalty Score Update

*For any* purchase confirmation or recommendation acceptance event, the brand loyalty score for the corresponding category and brand SHALL increase from its prior value.

**Validates: Requirements 2.2**

### Property 6: Cold-Start Onboarding Trigger

*For any* user with no existing Preference Graph data, the first agent response in a new session SHALL be an onboarding question.

**Validates: Requirements 3.1**

### Property 7: Onboarding Completeness

*For any* completed onboarding flow, the resulting Preference Graph SHALL contain at least one brand loyalty score, at least one dietary flag or quality preference, and the onboarding question count SHALL be between 3 and 5.

**Validates: Requirements 3.2, 3.4**

### Property 8: Confidence-Based Action Routing

*For any* product recommendation with a computed confidence score, the agent SHALL auto-add when score > 0.85, suggest-and-confirm when 0.55 ≤ score ≤ 0.85, and present a shortlist of 2-3 alternatives when score < 0.55.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 9: Substitution Score Decision Routing

*For any* unavailable product and computed substitution score, when the score exceeds the acceptance threshold the agent SHALL suggest the substitute, and when below the threshold the agent SHALL present a shortlist of closest alternatives.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 10: Basket Completion Limit

*For any* session, the Basket Completion Engine SHALL produce at most 2 complementary product suggestions regardless of cart contents or user history.

**Validates: Requirements 6.2**

### Property 11: Gap-Fill Threshold Satisfaction

*For any* cart with total below the free delivery threshold, the gap-fill product suggestion price added to the cart total SHALL be greater than or equal to the free delivery threshold.

**Validates: Requirements 7.1**

### Property 12: Gap-Fill Suggestion Limit

*For any* session, the Gap-Fill Engine SHALL produce at most 1 gap-fill suggestion.

**Validates: Requirements 7.2**

### Property 13: Session Data Round-Trip

*For any* session context data (conversation history, cart state, reasoning history) written to the Session Store, reading that session SHALL return identical data.

**Validates: Requirements 8.1**

### Property 14: Price Cache TTL Expiration

*For any* product price stored in the Price Cache, after the 15-minute TTL has elapsed, the cached entry SHALL be considered expired and the next read SHALL return a refreshed value from the source catalog.

**Validates: Requirements 9.1, 9.2**

### Property 15: Persona-Based Prioritization

*For any* set of product recommendations generated for Segment A (budget optimizer), the average price of recommended products SHALL be less than or equal to the catalog average price. *For any* set of product recommendations for Segment B (health-conscious), the proportion of health-labeled products SHALL exceed the catalog-wide proportion of health-labeled products.

**Validates: Requirements 10.2, 10.3**

### Property 16: Provider Interface Equivalence — Data Layer

*For any* valid data operation (read or write) on the Preference Graph, Session Store, or Price Cache, executing the operation against the fallback provider SHALL produce the same result as executing it against the primary provider.

**Validates: Requirements 12.1, 12.2, 12.3**

### Property 17: Fallback Agent Behavioral Equivalence

*For any* user message processed by the fallback Conversational Agent, the response SHALL maintain the same response format (text + optional product cards), adhere to the one-question-per-turn constraint, and include confidence-based action routing.

**Validates: Requirements 11.1, 11.2**

### Property 18: Authentication Enforcement

*For any* request to the Conversational Agent or Preference Graph without a valid authentication token, the system SHALL reject the request with an appropriate error response and not process it.

**Validates: Requirements 15.1, 15.2**

### Property 19: Preference Data Isolation

*For any* authenticated user A, querying the Preference Graph with user A's credentials SHALL never return preference data belonging to a different user B.

**Validates: Requirements 15.3**

### Property 20: Fallback Auth Equivalence

*For any* valid authentication token, the local JWT fallback provider SHALL extract the same user identity and validate the token with equivalent accept/reject behavior as the Cognito provider.

**Validates: Requirements 14.2**
