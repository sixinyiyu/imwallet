import express from "express";
import cors from "cors";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallet";
import transactionRoutes from "./routes/transaction";
import tokenRoutes from "./routes/token";
import fiatRoutes from "./routes/fiat";
import contactRoutes from "./routes/contact";
import rsaRoutes from "./routes/rsa";
import configRoutes from "./routes/config";
import adminRoutes from "./routes/admin";
import notificationRoutes from "./routes/notification";
import { initRSAKeys } from "./services/rsaService";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/wallets", walletRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/tokens", tokenRoutes);
app.use("/api/v1/fiat", fiatRoutes);
app.use("/api/v1/contacts", contactRoutes);
app.use("/api/v1/rsa", rsaRoutes);
app.use("/api/v1/config", configRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/notifications", notificationRoutes);

// Error handler
app.use(errorHandler);

// Start server
if (config.nodeEnv !== "test") {
  initRSAKeys();
  app.listen(config.port, () => {
    console.log(`🚀 imwallet server running on http://localhost:${config.port}`);
    console.log(`📋 Environment: ${config.nodeEnv}`);
  });
}

export default app;