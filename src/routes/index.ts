// src/routes/index.ts  (opcional)
import { Router } from "express";
import healthRoute from "./health.route";
import productsRoute from "./products.route";
import ordersRoute from "./orders.route";
import adminOrdersRoute from "./admin-orders.route";

const router = Router();
router.use(healthRoute);
router.use(productsRoute);
router.use(ordersRoute);
router.use(adminOrdersRoute);

export default router;
