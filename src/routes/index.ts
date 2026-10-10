import { Router } from "express";
import { getNcltOrders, getSavedNcltCases, searchNcltCase } from "../controllers/ncltController";
import {
  getNcltCauseList,
  searchNcltCauseListCase,
} from "../controllers/ncltCauseListController";

export const router = Router();

router.post("/nclt/search", searchNcltCase);
router.get("/nclt/cases", getSavedNcltCases);
router.get("/nclt/orders", getNcltOrders);
router.get("/nclt/cause-list/search", searchNcltCauseListCase);
router.get("/nclt/cause-list", getNcltCauseList);
