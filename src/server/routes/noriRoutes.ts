import { Router } from "express";
import { noriChatController } from "../controllers/noriChatController";

export const noriRouter = Router();
noriRouter.post("/chat", noriChatController);
