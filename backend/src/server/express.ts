/**
 * Express.js fallback server for local development.
 *
 * Replaces API Gateway + Lambda when running locally via `npm run dev`.
 * Provides:
 * - HTTP health check endpoint (GET /health)
 * - WebSocket server using the `ws` library
 * - Same ClientMessage/ServerMessage protocol as the Lambda handlers
 * - Local JWT authentication on WebSocket connections
 *
 * Requirements: 14.1
 */

import http from 'node:http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';

import type { ClientMessage, ServerMessage } from '../models/messages.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] || '3000', 10);
const JWT_SECRET = process.env['JWT_SECRET'] || 'kirana-ai-local-dev-secret';

// ─── JWT Auth Helpers ────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  sessionId?: string;
}

/**
 * Verify a JWT token and extract the user payload.
 * Used as local auth middleware on WebSocket connection.
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (!decoded || typeof decoded.sub !== 'string') {
      return null;
    }
    return {
      userId: decoded.sub,
      sessionId: typeof decoded.sessionId === 'string' ? decoded.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a local JWT for dev/testing. Not exposed in production.
 */
export function generateToken(userId: string, sessionId?: string): string {
  return jwt.sign(
    { sub: userId, sessionId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

import { orchestrate } from '../handlers/orchestrator.js';
import { getRegistry } from '../providers/registry.js';

// ─── Orchestrator Integration ────────────────────────────────────────────────

/**
 * Process an incoming client message through the full orchestration pipeline.
 * Uses the ProviderRegistry to resolve all providers and invoke the agent.
 */
export async function handleClientMessage(
  message: ClientMessage,
  userId: string
): Promise<ServerMessage> {
  // Validate message structure
  if (message.action !== 'sendMessage' || !message.payload?.content) {
    return {
      type: 'error',
      payload: {
        code: 'INVALID_MESSAGE',
        message: 'Message must have action "sendMessage" with a payload containing content.',
      },
    };
  }

  const { sessionId, content } = message.payload;

  try {
    const registry = getRegistry();
    const result = await orchestrate(
      {
        sessionId: sessionId || `session-${userId}-${Date.now()}`,
        userId,
        message: content,
      },
      registry
    );

    // Build the response with products from agent + suggestions
    const products = [
      ...(result.response.products || []),
      ...(result.basketSuggestions?.map((s) => ({
        productId: s.product.productId,
        name: s.product.name,
        price: s.product.price,
        reason: s.reason,
      })) || []),
      ...(result.gapFillSuggestion
        ? [{
            productId: result.gapFillSuggestion.product.productId,
            name: result.gapFillSuggestion.product.name,
            price: result.gapFillSuggestion.product.price,
            reason: result.gapFillSuggestion.reason,
          }]
        : []),
    ];

    return {
      type: 'agentResponse',
      payload: {
        content: result.response.content,
        products: products.length > 0 ? products : undefined,
        sessionId: result.sessionId,
        action: result.response.action,
      },
    };
  } catch (error) {
    console.error('[Orchestrator Error]', error);
    return {
      type: 'error',
      payload: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process your message. Please try again.',
      },
    };
  }
}

// ─── Express App Setup ───────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // Enable CORS for local development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'KiranaAI',
      timestamp: Date.now(),
    });
  });

  // Token generation endpoint for local dev
  app.post('/auth/token', (req, res) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const token = generateToken(userId);
    res.json({ token, userId });
  });

  return app;
}

// ─── WebSocket Server Setup ──────────────────────────────────────────────────

/**
 * Extract the auth token from a WebSocket upgrade request.
 * Looks in the `Authorization` header or `token` query parameter.
 */
function extractToken(req: IncomingMessage): string | null {
  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('token');
}

export interface ServerInstance {
  httpServer: http.Server;
  wss: WebSocketServer;
  app: express.Application;
  close: () => void;
}

/**
 * Create and start the Express + WebSocket server.
 */
export function createServer(port?: number): ServerInstance {
  const app = createApp();
  const httpServer = http.createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate the connection
    const token = extractToken(req);
    if (!token) {
      sendError(ws, 'AUTH_FAILED', 'No authentication token provided');
      ws.close(4001, 'Authentication required');
      return;
    }

    const auth = verifyToken(token);
    if (!auth) {
      sendError(ws, 'AUTH_FAILED', 'Invalid or expired token');
      ws.close(4001, 'Invalid token');
      return;
    }

    // Attach userId to the connection for message handling
    const userId = auth.userId;

    ws.on('message', async (data) => {
      try {
        const raw = data.toString();
        const clientMessage: ClientMessage = JSON.parse(raw);
        const response = await handleClientMessage(clientMessage, userId);
        ws.send(JSON.stringify(response));
      } catch (err) {
        sendError(ws, 'INTERNAL_ERROR', 'Failed to process message');
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Connection error:', err.message);
    });
  });

  return { httpServer, wss, app, close: () => { httpServer.close(); wss.close(); } };
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const errorMsg: ServerMessage = {
    type: 'error',
    payload: { code, message },
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorMsg));
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

function main(): void {
  const { httpServer } = createServer();

  httpServer.listen(PORT, () => {
    console.log(`[KiranaAI] Express server running on http://localhost:${PORT}`);
    console.log(`[KiranaAI] WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(`[KiranaAI] Health check: http://localhost:${PORT}/health`);
    console.log(`[KiranaAI] Token gen: POST http://localhost:${PORT}/auth/token`);
    console.log(`[KiranaAI] Environment: LOCAL`);
  });
}

// Run if this is the entry point
main();
