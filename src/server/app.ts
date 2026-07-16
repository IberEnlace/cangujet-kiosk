import express, { type NextFunction, type Request, type Response } from "express";
import { noriRouter } from "./routes/noriRoutes";
import type { NoriChatError } from "./types/noriChat";

export const serverApp = express();
serverApp.disable("x-powered-by");
serverApp.use(express.json({ limit: "128kb" }));
serverApp.use("/api/nori", noriRouter);
serverApp.get("/api/health", (_request, response) => response.json({ status: "ok" }));
serverApp.use((_request: Request, response: Response<NoriChatError>) => response.status(404).json({ error: "Route not found." }));
serverApp.use((error: unknown, _request: Request, response: Response<NoriChatError>, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Nori service failed to process the request." });
});
