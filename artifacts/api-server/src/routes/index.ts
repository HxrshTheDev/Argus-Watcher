import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import openaiRouter from "./openai";
import tasksRouter from "./tasks";
import researchRouter from "./research";
import emailsRouter from "./emails";
import postsRouter from "./posts";
import workflowsRouter from "./workflows";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conversationsRouter);
router.use(openaiRouter);
router.use(tasksRouter);
router.use(researchRouter);
router.use(emailsRouter);
router.use(postsRouter);
router.use(workflowsRouter);
router.use(dashboardRouter);

export default router;
