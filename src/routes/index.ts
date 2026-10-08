import { Router } from "express";
import { searchNcltCase } from "../controllers/ncltController";

export const router = Router();

router.post("/nclt/search", searchNcltCase);
