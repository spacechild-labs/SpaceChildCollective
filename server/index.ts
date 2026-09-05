import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupMcpWebSocketServer } from "./websocket";
import { registerMcpHttpRoutes } from "./mcp-http";
import { taskDispatcher } from "./services/task-dispatcher";
import { agentManager } from "./services/agent-manager";
import { deliveryWorker } from "./services/loop/delivery";
import { kannakaBridge } from "./services/kannaka/bridge";
import { kannakaLoopEvents } from "./services/kannaka/events";
import { validateEnv } from "./config/env";
import { loadUser, guardMutations } from "./middleware/auth";
import { pool } from "./db";
import { aiKeyManager } from "./services/ai-key-manager";
import { parallelResearchService } from "./services/parallel-research-service";

// Fail fast on missing/insecure configuration before doing any work.
validateEnv();

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Behind a reverse proxy (Replit/hosting): needed for secure cookies and for
// rate-limit to see the real client IP.
app.set("trust proxy", 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Security headers. A tailored CSP is deferred (the SPA + wallet SDKs need a
// specific policy); the rest of helmet's hardening is safe to enable now.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Rate limiting: a general API cap plus a strict cap on auth endpoints.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Session: persistent Postgres-backed store (never an in-memory store in prod).
const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true, tableName: "user_sessions" }),
  secret: process.env.SESSION_SECRET || (isProd
    ? (() => { throw new Error("SESSION_SECRET is required in production"); })()
    : "dev-only-insecure-secret"),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  }
}));

// Populate req.user from the session, then block anonymous state changes.
app.use(loadUser);
app.use(guardMutations);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await aiKeyManager.initialize();
  log("AI provider configurations loaded");
  await parallelResearchService.initialize();
  const server = await registerRoutes(app);

  // MCP servers: WebSocket for agents + HTTP for external clients. Register the
  // HTTP route before the SPA catch-all below so it isn't shadowed by the client.
  setupMcpWebSocketServer(server);
  registerMcpHttpRoutes(app);
  log("MCP WebSocket server initialized on /mcp endpoint");

  // API error handler (after all API/MCP routes, before the SPA catch-all).
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // Serve the client: Vite dev middleware in development (full UI + HMR), or the
  // static production build otherwise. Serves both the API and the client.
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start agent manager to handle autonomous agent processes
  await agentManager.start();
  log("Agent Manager started with autonomous agent processes");

  // Start task dispatcher only if enabled (to reduce database polling)
  if (process.env.ENABLE_TASK_DISPATCHER === 'true') {
    taskDispatcher.start();
    log("Task dispatcher started (polling every 5 seconds)");
  } else {
    log("Task dispatcher disabled (set ENABLE_TASK_DISPATCHER=true to enable)");
  }

  // Kannaka constellation bridge: recall/ask for study generation, live consciousness
  // + presence, SPACECHILD.* announcements, inbound swarm feedback. Off unless configured.
  if (kannakaBridge.enabled) {
    const up = await kannakaBridge.start();
    // Wire events regardless: publishes connect lazily and subscriptions apply when the bus appears.
    await kannakaLoopEvents.start();
    log(up ? "Kannaka bridge connected (" + kannakaBridge.status().server + ")" : "Kannaka bridge configured but not reachable; will retry on demand");
  } else {
    log("Kannaka bridge disabled (set KANNAKA_NATS_URL to enable)");
  }

  // Discovery Loop delivery worker: retries queued deliveries with backoff.
  if (process.env.LOOP_ENABLE_WORKER !== 'false') {
    deliveryWorker.start();
  } else {
    log("Discovery Loop delivery worker disabled (LOOP_ENABLE_WORKER=false)");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });

  // Setup graceful shutdown
  const gracefulShutdown = async () => {
    log("Shutting down gracefully...");
    
    try {
      // Stop task dispatcher if it was started
      if (process.env.ENABLE_TASK_DISPATCHER === 'true') {
        taskDispatcher.stop();
        log("Task dispatcher stopped");
      }
      
      deliveryWorker.stop();
      kannakaLoopEvents.stop();
      await kannakaBridge.stop();

      // Stop agent manager
      await agentManager.stop();
      log("Agent Manager stopped");
      
      // Close server
      server.close(() => {
        log("Server closed");
        process.exit(0);
      });
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
})();
