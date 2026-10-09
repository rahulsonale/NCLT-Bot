import { Router } from "express";
import { searchNcltCase } from "../controllers/ncltController";
import { getNcltCauseList } from "../controllers/ncltCauseListController";

export const router = Router();

router.post("/nclt/search", searchNcltCase);
router.get("/nclt/cause-list", getNcltCauseList);
