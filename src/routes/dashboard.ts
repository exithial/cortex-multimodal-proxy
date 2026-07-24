import express, { type Express, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";
import { dashboardService } from "../services/dashboardService";
import {
  getActiveBrainModels,
  getActiveProviderInfo,
} from "../services/providerSelector";
import { PASSTHROUGH_MODELS } from "../services/brainRegistry";
import packageJson from "../../package.json";

const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "public", "dashboard");

export function mountDashboardRoutes(
  app: Express,
  deps: { startTime: number },
): void {
  app.get("/v1/dashboard/snapshot", async (_req: Request, res: Response) => {
    if (!dashboardService.enabled) {
      res.status(503).json({
        error: "dashboard_disabled",
        message: "Dashboard is disabled (DASHBOARD_ENABLED=false)",
      });
      return;
    }
    try {
      const brainModels = getActiveBrainModels();
      const passthroughs = Array.from(PASSTHROUGH_MODELS);
      const activeModels = [
        ...Object.keys(brainModels),
        ...passthroughs,
      ];
      const snapshot = await dashboardService.getSnapshot({
        startTime: deps.startTime,
        version: packageJson.version,
        mode: process.env.BRAIN_MODE || "auto",
        providers: getActiveProviderInfo(),
        activeModels,
      });
      res.json(snapshot);
    } catch (error: unknown) {
      logger.error("Dashboard snapshot failed:", error);
      res.status(503).json({
        error: "dashboard_unavailable",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (!fs.existsSync(PUBLIC_DIR)) {
    logger.warn(
      `Dashboard public dir no encontrado en ${PUBLIC_DIR}; UI no se servira`,
    );
    return;
  }

  app.use(
    "/dashboard",
    express.static(PUBLIC_DIR, {
      fallthrough: true,
      index: "index.html",
      maxAge: "1h",
    }),
  );

  app.get(["/dashboard", "/dashboard/"], (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
}