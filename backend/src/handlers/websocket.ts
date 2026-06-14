/**
 * WebSocket Lambda handlers for API Gateway WebSocket API.
 *
 * Handles $connect, $disconnect, and $default routes.
 * - $connect: Authenticates the connection via query string token
 * - $disconnect: Cleans up session tracking
 * - $default: Parses ClientMessage, routes to orchestrator, returns ServerMessage
 *
 * Requirements: 1.2, 14.1
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ClientMessage, ServerMessage } from '../models/messages.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Minimal API Gateway WebSocket event shape.
 * Avoids hard dependency on @types/aws-lambda for lighter packaging.
 */
export interface APIGatewayWebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
    authorizer?: Record<string, unknown>;
  };
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * Auth validator function type.
 * Takes a token and returns a userId if valid, null otherwise.
 */
export type AuthValidator = (token: string) => Promise<string | null>;

/**
 * Orchestrator function type.
 * Takes a userId, sessionId, message content, and connectionId, returns a ServerMessage.
 */
export type OrchestratorFn = (
  userId: string,
  sessionId: string,
  content: string,
  connectionId: string
) => Promise<ServerMessage>;

// ─── Connection Store ────────────────────────────────────────────────────────

/**
 * In-memory connection registry mapping connectionId → userId.
 * In production, this would be backed by DynamoDB for multi-Lambda coordination.
 */
const connectionStore = new Map<string, string>();

export function getConnectionUserId(connectionId: string): string | undefined {
  return connectionStore.get(connectionId);
}

export function setConnection(connectionId: string, userId: string): void {
  connectionStore.set(connectionId, userId);
}

export function removeConnection(connectionId: string): void {
  connectionStore.delete(connectionId);
}

/** For testing: clear all connections */
export function clearConnections(): void {
  connectionStore.clear();
}

// ─── API Gateway Management Client Factory ───────────────────────────────────

/**
 * Creates an ApiGatewayManagementApiClient for sending messages back
 * to connected WebSocket clients.
 */
export function createApiGwClient(
  domainName: string,
  stage: string
): ApiGatewayManagementApiClient {
  const endpoint = `https://${domainName}/${stage}`;
  return new ApiGatewayManagementApiClient({ endpoint });
}

// ─── Send Message to Client ──────────────────────────────────────────────────

/**
 * Sends a ServerMessage to a specific WebSocket connection.
 */
export async function sendToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  message: ServerMessage
): Promise<void> {
  const command = new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(message)),
  });
  await client.send(command);
}

// ─── Handler Dependencies ────────────────────────────────────────────────────

/**
 * Injectable dependencies for WebSocket handlers.
 * Allows testing with mocked services.
 */
export interface WebSocketHandlerDeps {
  authValidator: AuthValidator;
  orchestrator: OrchestratorFn;
  apiGwClientFactory?: (domainName: string, stage: string) => ApiGatewayManagementApiClient;
}

// ─── $connect Handler ────────────────────────────────────────────────────────

/**
 * Handles WebSocket $connect route.
 * Authenticates the connection using a token from query string parameters.
 * On success, registers the connectionId → userId mapping.
 */
export function createConnectHandler(deps: WebSocketHandlerDeps) {
  return async (event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    const token = event.queryStringParameters?.['token'] ?? null;

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Missing authentication token' }),
      };
    }

    try {
      const userId = await deps.authValidator(token);

      if (!userId) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Invalid authentication token' }),
        };
      }

      setConnection(connectionId, userId);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Connected' }),
      };
    } catch (error) {
      console.error('Auth error during $connect:', error);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Authentication failed' }),
      };
    }
  };
}

// ─── $disconnect Handler ─────────────────────────────────────────────────────

/**
 * Handles WebSocket $disconnect route.
 * Removes the connectionId from the connection store.
 */
export function createDisconnectHandler() {
  return async (event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    removeConnection(connectionId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' }),
    };
  };
}

// ─── $default Handler ────────────────────────────────────────────────────────

/**
 * Handles WebSocket $default route.
 * Parses the incoming ClientMessage, validates the connection,
 * routes to the orchestrator, and sends the response back over WebSocket.
 */
export function createDefaultHandler(deps: WebSocketHandlerDeps) {
  const clientFactory = deps.apiGwClientFactory ?? createApiGwClient;

  return async (event: APIGatewayWebSocketEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    const { domainName, stage } = event.requestContext;

    // Verify the connection is authenticated
    const userId = getConnectionUserId(connectionId);
    if (!userId) {
      const client = clientFactory(domainName, stage);
      const errorMessage: ServerMessage = {
        type: 'error',
        payload: {
          code: 'AUTH_FAILED',
          message: 'Connection not authenticated. Please reconnect.',
        },
      };
      try {
        await sendToConnection(client, connectionId, errorMessage);
      } catch {
        // Connection may already be closed
      }
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Parse the incoming message body
    if (!event.body) {
      const client = clientFactory(domainName, stage);
      const errorMessage: ServerMessage = {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'Empty message body',
        },
      };
      try {
        await sendToConnection(client, connectionId, errorMessage);
      } catch {
        // Connection may already be closed
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Empty message body' }),
      };
    }

    let clientMessage: ClientMessage;
    try {
      clientMessage = JSON.parse(event.body) as ClientMessage;
    } catch {
      const client = clientFactory(domainName, stage);
      const errorMessage: ServerMessage = {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'Invalid message format',
        },
      };
      try {
        await sendToConnection(client, connectionId, errorMessage);
      } catch {
        // Connection may already be closed
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid message format' }),
      };
    }

    // Validate message structure
    if (
      clientMessage.action !== 'sendMessage' ||
      !clientMessage.payload?.sessionId ||
      !clientMessage.payload?.content
    ) {
      const client = clientFactory(domainName, stage);
      const errorMessage: ServerMessage = {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'Invalid message structure. Expected action: sendMessage with sessionId and content.',
        },
      };
      try {
        await sendToConnection(client, connectionId, errorMessage);
      } catch {
        // Connection may already be closed
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid message structure' }),
      };
    }

    // Route to orchestrator
    try {
      const { sessionId, content } = clientMessage.payload;
      const response = await deps.orchestrator(userId, sessionId, content, connectionId);

      // Send response back to the client via API Gateway Management API
      const client = clientFactory(domainName, stage);
      await sendToConnection(client, connectionId, response);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Message processed' }),
      };
    } catch (error) {
      console.error('Orchestrator error:', error);
      const client = clientFactory(domainName, stage);
      const errorMessage: ServerMessage = {
        type: 'error',
        payload: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred processing your message. Please try again.',
        },
      };
      try {
        await sendToConnection(client, connectionId, errorMessage);
      } catch {
        // Connection may already be closed
      }
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

// ─── Exported Handler Instances ──────────────────────────────────────────────

/**
 * Default no-op auth validator for local dev (accepts any token as userId).
 * In production, this is replaced by Cognito JWT validation.
 */
const defaultAuthValidator: AuthValidator = async (token: string) => {
  // Minimal local validation: treat token as a userId if non-empty
  return token.length > 0 ? token : null;
};

/**
 * Default no-op orchestrator stub.
 * In production, this is replaced by the real orchestration pipeline.
 */
const defaultOrchestrator: OrchestratorFn = async (userId, sessionId, content) => {
  return {
    type: 'agentResponse' as const,
    payload: {
      content: `Echo: ${content}`,
      sessionId,
    },
  };
};

// Default handler instances with stub implementations
const defaultDeps: WebSocketHandlerDeps = {
  authValidator: defaultAuthValidator,
  orchestrator: defaultOrchestrator,
};

/**
 * Lambda handler for $connect route.
 */
export const connect = createConnectHandler(defaultDeps);

/**
 * Lambda handler for $disconnect route.
 */
export const disconnect = createDisconnectHandler();

/**
 * Lambda handler for $default route.
 */
export const defaultHandler = createDefaultHandler(defaultDeps);
