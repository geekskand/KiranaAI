# Requirements Document

## Introduction

KiranaAI is a conversational commerce agent for quick-commerce platforms. The system provides intelligent product recommendations, substitution handling, basket completion, and gap-fill suggestions through a chat widget overlay. The MVP targets 50 SKUs with rule-based quality tolerance, a working chat UI, preference graph, basket completion, and gap-fill capabilities. Every AWS service dependency has a local/alternative fallback implementation providing full redundancy.

## Glossary

- **Conversational_Agent**: The Bedrock-powered (or fallback) language model component that interprets user intent and generates responses within the chat interface
- **Preference_Graph**: A per-user DynamoDB-backed (or fallback JSON/SQLite store) data structure storing brand loyalty scores, dietary flags, and quality preferences per category
- **Quality_Tolerance_Engine**: A rule-based scoring system (MVP) that predicts whether a user will accept a product substitution based on their preference history
- **Basket_Completion_Engine**: A recommendation component using Personalize (or fallback hard-coded co-occurrence rules) to suggest co-occurring items for the current cart
- **Gap_Fill_Engine**: A component that suggests items to help the user reach a free delivery threshold
- **Session_Store**: An ElastiCache Redis instance (or fallback in-memory Map) holding conversation state and context for active user sessions
- **Price_Cache**: A Redis-backed cache (or fallback in-memory Map) storing real-time product pricing with a 15-minute TTL
- **Chat_Widget**: A React-based overlay UI component rendered on top of existing commerce pages
- **Confidence_Threshold**: A numeric score determining agent behavior — auto-add (high), suggest-and-confirm (medium), or shortlist options (low)
- **Onboarding_Flow**: A 3–5 question conversational sequence for cold-start users to bootstrap the Preference_Graph
- **SKU_Catalog**: The set of 50 products available in the MVP product database
- **Fallback_Provider**: A local/alternative implementation that replaces an AWS service dependency with equivalent behavior when the primary service is unavailable

## Requirements

### Requirement 1: Conversational Chat Interface

**User Story:** As a shopper, I want to interact with a chat widget on the commerce page, so that I can get product recommendations without leaving the shopping experience.

#### Acceptance Criteria

1. THE Chat_Widget SHALL render as an overlay on the existing commerce UI without obstructing product browsing.
2. WHEN the user sends a message, THE Chat_Widget SHALL transmit the message to the Conversational_Agent and display the response within the same chat thread.
3. THE Conversational_Agent SHALL respond with a p50 latency of less than 800 milliseconds measured from message receipt to response delivery.
4. THE Conversational_Agent SHALL include no more than one question per response turn.
5. WHEN the Conversational_Agent generates a response, THE Chat_Widget SHALL display product cards with name, price, and an add-to-cart action for any referenced products.

### Requirement 2: User Preference Graph

**User Story:** As a returning shopper, I want the system to remember my brand preferences and dietary needs, so that recommendations match my habits without re-explaining them.

#### Acceptance Criteria

1. THE Preference_Graph SHALL store per-user, per-category brand loyalty scores, dietary flags, and quality preferences.
2. WHEN a user completes a purchase or confirms a recommendation, THE Preference_Graph SHALL update the relevant brand loyalty score for that category.
3. WHEN a user explicitly states a dietary restriction, THE Preference_Graph SHALL persist that flag and apply the restriction to all future recommendations for that user.
4. THE Preference_Graph SHALL support retrieval of a complete user profile in a single query operation.

### Requirement 3: Cold-Start Onboarding

**User Story:** As a new user, I want to answer a few quick questions so that the system can personalize recommendations from my first session.

#### Acceptance Criteria

1. WHEN a user with no existing Preference_Graph data starts a session, THE Conversational_Agent SHALL initiate the Onboarding_Flow.
2. THE Onboarding_Flow SHALL consist of between 3 and 5 conversational questions.
3. THE Onboarding_Flow SHALL ask no more than one question per response turn.
4. WHEN the Onboarding_Flow completes, THE Preference_Graph SHALL contain initial brand loyalty scores, dietary flags, and quality preferences derived from the user's answers.

### Requirement 4: Confidence-Based Agent Actions

**User Story:** As a shopper, I want the agent to auto-add items it is confident about and ask me only when uncertain, so that I can shop faster.

#### Acceptance Criteria

1. WHEN the Confidence_Threshold for a product recommendation exceeds the high threshold, THE Conversational_Agent SHALL auto-add the product to the cart and inform the user.
2. WHEN the Confidence_Threshold for a product recommendation falls within the medium range, THE Conversational_Agent SHALL suggest the product and request user confirmation before adding to cart.
3. WHEN the Confidence_Threshold for a product recommendation falls below the medium range, THE Conversational_Agent SHALL present a shortlist of 2 to 3 alternative products for the user to choose from.

### Requirement 5: Quality Tolerance and Substitution

**User Story:** As a shopper, I want the system to suggest acceptable substitutes when my preferred product is unavailable, so that I do not have to search manually.

#### Acceptance Criteria

1. WHEN a preferred product is unavailable, THE Quality_Tolerance_Engine SHALL compute a substitution acceptance score using rule-based criteria against the user's Preference_Graph.
2. WHEN the substitution acceptance score exceeds the acceptance threshold, THE Conversational_Agent SHALL suggest the substitute product to the user.
3. WHEN the substitution acceptance score falls below the acceptance threshold, THE Conversational_Agent SHALL inform the user that no suitable substitute is available and present the closest alternatives as a shortlist.

### Requirement 6: Basket Completion

**User Story:** As a shopper, I want the system to suggest items that complement my cart, so that I do not forget commonly purchased companions.

#### Acceptance Criteria

1. WHEN the user has items in the cart, THE Basket_Completion_Engine SHALL identify co-occurring products based on the current cart contents and user history.
2. THE Basket_Completion_Engine SHALL suggest no more than 2 complementary products per session.
3. WHEN the Basket_Completion_Engine identifies a suggestion, THE Conversational_Agent SHALL present the suggestion with product name, price, and reason for recommendation.

### Requirement 7: Gap-Fill for Free Delivery

**User Story:** As a shopper, I want the system to suggest an item to reach the free delivery threshold, so that I can save on delivery costs.

#### Acceptance Criteria

1. WHEN the cart total is below the free delivery threshold, THE Gap_Fill_Engine SHALL identify a product that brings the cart total to or above the threshold.
2. THE Gap_Fill_Engine SHALL suggest no more than 1 gap-fill product per session.
3. WHEN suggesting a gap-fill product, THE Conversational_Agent SHALL display the current cart total, the free delivery threshold, and the suggested product with its price.

### Requirement 8: Session State Management

**User Story:** As a shopper, I want my conversation context preserved during a session, so that I do not need to repeat myself.

#### Acceptance Criteria

1. THE Session_Store SHALL persist conversation context, cart state, and agent reasoning history for the duration of an active session.
2. WHEN a user sends a message, THE Conversational_Agent SHALL retrieve the full session context from the Session_Store before generating a response.
3. THE Session_Store SHALL support concurrent access for multiple active user sessions without data corruption.

### Requirement 9: Real-Time Pricing

**User Story:** As a shopper, I want product prices to reflect current values, so that I am not surprised at checkout.

#### Acceptance Criteria

1. THE Price_Cache SHALL store product prices with a time-to-live of 15 minutes.
2. WHEN the Price_Cache entry for a product has expired, THE Price_Cache SHALL refresh the price from the source catalog before serving the value.
3. WHEN the Conversational_Agent references a product, THE Conversational_Agent SHALL retrieve the price from the Price_Cache and include it in the response.

### Requirement 10: Demo Personas

**User Story:** As a hackathon evaluator, I want to see two distinct user personas demonstrating different recommendation behaviors, so that I can assess personalization quality.

#### Acceptance Criteria

1. THE SKU_Catalog SHALL contain 50 products spanning categories relevant to both demo personas.
2. WHEN Segment A (budget optimizer) persona is active, THE Conversational_Agent SHALL prioritize lower-priced options and value-based recommendations.
3. WHEN Segment B (health-conscious) persona is active, THE Conversational_Agent SHALL prioritize organic, low-sugar, and health-labeled products.
4. THE Preference_Graph SHALL contain pre-populated data for both Segment A and Segment B personas to demonstrate cold-start bypass.

### Requirement 11: Service Fallback — Conversational Agent

**User Story:** As a developer, I want the system to continue operating when Bedrock is unavailable, so that the demo remains functional regardless of AWS service availability.

#### Acceptance Criteria

1. IF the Bedrock service is unavailable, THEN THE Conversational_Agent SHALL switch to the Fallback_Provider using local LLM or rule-based response generation with equivalent conversational behavior.
2. WHEN the Fallback_Provider is active for the Conversational_Agent, THE Conversational_Agent SHALL maintain the same response format, confidence-based actions, and one-question-per-turn constraint.

### Requirement 12: Service Fallback — Data Layer

**User Story:** As a developer, I want the data layer to continue operating when DynamoDB or ElastiCache is unavailable, so that user preferences and session state remain accessible.

#### Acceptance Criteria

1. IF DynamoDB is unavailable, THEN THE Preference_Graph SHALL switch to the Fallback_Provider using a local JSON store or SQLite with equivalent read and write behavior.
2. IF ElastiCache is unavailable, THEN THE Session_Store SHALL switch to the Fallback_Provider using an in-memory Map with equivalent session management behavior.
3. IF ElastiCache is unavailable, THEN THE Price_Cache SHALL switch to the Fallback_Provider using an in-memory Map with equivalent TTL-based expiration behavior.

### Requirement 13: Service Fallback — ML and Recommendation

**User Story:** As a developer, I want ML-dependent features to continue operating when SageMaker, Personalize, or Forecast is unavailable, so that quality scoring and recommendations remain functional.

#### Acceptance Criteria

1. IF SageMaker is unavailable, THEN THE Quality_Tolerance_Engine SHALL switch to the Fallback_Provider using rule-based substitution scoring with equivalent acceptance prediction behavior.
2. IF Personalize is unavailable, THEN THE Basket_Completion_Engine SHALL switch to the Fallback_Provider using hard-coded co-occurrence rules with equivalent product suggestion behavior.
3. IF Forecast is unavailable, THEN THE Gap_Fill_Engine SHALL switch to the Fallback_Provider using fixed cadence rules with equivalent suggestion behavior.

### Requirement 14: Service Fallback — Infrastructure

**User Story:** As a developer, I want the API and auth layers to continue operating when API Gateway or Cognito is unavailable, so that the full stack remains demonstrable locally.

#### Acceptance Criteria

1. IF API Gateway is unavailable, THEN THE system SHALL switch to the Fallback_Provider using an Express.js local server with equivalent routing and request handling behavior.
2. IF Cognito is unavailable, THEN THE system SHALL switch to the Fallback_Provider using JWT-based local authentication with equivalent token validation and user identity behavior.

### Requirement 15: Authentication and Authorization

**User Story:** As a shopper, I want my sessions and preferences to be securely tied to my identity, so that other users cannot access my data.

#### Acceptance Criteria

1. THE system SHALL authenticate users via Cognito (or Fallback_Provider) before granting access to the Conversational_Agent or Preference_Graph.
2. WHEN an unauthenticated request is received, THE system SHALL reject the request with an appropriate error response.
3. THE Preference_Graph SHALL restrict data access to the authenticated user's own records.
