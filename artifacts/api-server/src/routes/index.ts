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
import gmailRouter from "./gmail";
import briefingRouter from "./briefing";
import notificationsRouter from "./notifications";

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
router.use(gmailRouter);
router.use(briefingRouter);
router.use(notificationsRouter);

export default router;
