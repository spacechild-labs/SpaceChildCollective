import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { server as mcpServer } from "./mcp-server";
import { setupMcpWebSocketServer } from "./websocket";
import { registerMcpHttpRoutes } from "./mcp-http";
import { taskDispatcher } from "./services/task-dispatcher";
import { agentManager } from "./services/agent-manager";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Session middleware for ZKP authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'spacechild-research-collective-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  }
}));

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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development" && process.env.REPL_ID) {
    await setupVite(app, server);
  } else if (app.get("env") === "development") {
    log("Skipping Vite setup (local dev without Replit). API-only mode.");
  } else {
    serveStatic(app);
  }

  // Initialize MCP servers (WebSocket for agents, HTTP for ElevenLabs/external)
  setupMcpWebSocketServer(server, mcpServer);
  registerMcpHttpRoutes(app);
  log("MCP WebSocket server initialized on /mcp endpoint");

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
