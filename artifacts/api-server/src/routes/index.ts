import { Router, type IRouter } from "express";
import healthRouter from "./health";
import competitionRouter from "./competition";

const router: IRouter = Router();

router.use(healthRouter);
router.use(competitionRouter);

export default router;
