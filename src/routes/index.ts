import { Router } from "express";
import { searchNcltCase } from "../controllers/ncltController";
import {
  getNcltCauseList,
  searchNcltCauseListCase,
} from "../controllers/ncltCauseListController";

export const router = Router();

router.post("/nclt/search", searchNcltCase);
router.get("/nclt/cause-list/search", searchNcltCauseListCase);
router.get("/nclt/cause-list", getNcltCauseList);
