import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import expensesRouter from "./expenses";
import contributionsRouter from "./contributions";
import budgetCategoriesRouter from "./budget-categories";
import dashboardRouter from "./dashboard";
import membersRouter from "./members";
import digestRouter from "./digest";
import savingsGoalsRouter from "./savings-goals";
import jointAccountRouter from "./joint-account";
import incomeSourcesRouter from "./income-sources";
import { requireMember } from "../middlewares/requireMember";

const router: IRouter = Router();

// Auth routes bypass member check
router.use(authRouter);

// Apply member check to everything else
router.use(requireMember);

router.use(healthRouter);
router.use(expensesRouter);
router.use(contributionsRouter);
router.use(budgetCategoriesRouter);
router.use(dashboardRouter);
router.use(membersRouter);
router.use(digestRouter);
router.use(savingsGoalsRouter);
router.use(jointAccountRouter);
router.use(incomeSourcesRouter);

export default router;
