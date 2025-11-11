// src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { env } from "./config/env";
import { sensitiveRate } from "./middlewares/rate";
import { errorHandler } from "./middlewares/error";

import healthRoute from "./routes/health.route";
import productsRoute from "./routes/products.route";
import ordersRoute from "./routes/orders.route";
import adminOrdersRoute from "./routes/admin-orders.route";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(compression());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.length ? env.CORS_ORIGIN : true,
      credentials: true,
    })
  );
  app.use(morgan("combined"));
  app.use(express.json());

  // rate para endpoints críticos
  app.use(
    ["/culqi/charge", "/orders", "/orders/:id", "/cart/validate", "/orders/yape", "/orders/:id/verify-yape"],
    sensitiveRate
  );

  app.use(healthRoute);
  app.use(productsRoute);
  app.use(ordersRoute);
  app.use(adminOrdersRoute);

  app.use(errorHandler);

  return app;
}
