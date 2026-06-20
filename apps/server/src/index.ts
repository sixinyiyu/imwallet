import express from "express";
import cors from "cors";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import deviceRoutes from "./routes/device";
import walletRoutes from "./routes/wallet";
import transactionRoutes from "./routes/transaction";
import assetRoutes from "./routes/asset";
import fiatRoutes from "./routes/fiat";
import contactRoutes from "./routes/contact";
import rsaRoutes from "./routes/rsa";
import configRoutes from "./routes/config";
import accountRoutes from "./routes/account";
import notificationRoutes from "./routes/notification";
import logRoutes from "./routes/log";
import rechargeRoutes from "./routes/recharge";
import { initRSAKeys } from "./services/rsaService";
import { runMigrations } from "./services/migrator";
import { runSeed } from "./services/seedService";
import { logger } from "./utils/logger";

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://imwallet.dpdns.org",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-device-id", "x-signature", "x-timestamp", "x-nonce"],
  credentials: true,
}));
app.use(express.json({ limit: "100kb" }));

// Request logging middleware - log all HTTP requests
app.use(requestLogger);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API routes
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/wallets", walletRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1/fiat", fiatRoutes);
app.use("/api/v1/contacts", contactRoutes);
app.use("/api/v1/rsa", rsaRoutes);
app.use("/api/v1/config", configRoutes);
app.use("/api/v1/accounts", accountRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/recharges", rechargeRoutes);

// Error handler
app.use(errorHandler);

// Start server
if (config.nodeEnv !== "test") {
  (async () => {
    try {
      // 1. Auto-run pending database migrations (Flyway-style)
      await runMigrations();

      // 2. Auto-run seed data (idempotent)
      await runSeed();

      // 3. Initialize RSA keys
      initRSAKeys();

      // 4. Start HTTP server
      app.listen(config.port, () => {
        logger.info("SERVER", `🚀 imwallet server running on http://localhost:${config.port}`);
        logger.info("SERVER", `📋 Environment: ${config.nodeEnv}`);
        logger.info("SERVER", `🔑 Auth mode: Device Ed25519 signature verification`);
      });
    } catch (err) {
      logger.error("SERVER", `Fatal startup error: ${err}`);
      process.exit(1);
    }
  })();
}

export default app;