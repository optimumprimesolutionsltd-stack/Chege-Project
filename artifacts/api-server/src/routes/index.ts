import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import expensesRouter from "./expenses";
import contributionsRouter from "./contributions";
import budgetCategoriesRouter from "./budget-categories";
import dashboardRouter from "./dashboard";
import membersRouter from "./members";
import groupRouter from "./group";
import workspacesRouter from "./workspaces";
import digestRouter from "./digest";
import savingsGoalsRouter from "./savings-goals";
import jointAccountRouter from "./joint-account";
import incomeSourcesRouter from "./income-sources";
import { invitationsRouter, publicInvitationsRouter } from "./invitations";
import { inviteLinksRouter, publicInviteLinksRouter } from "./invite-links";
import photoStorageRouter from "./photo-storage";
import onboardingRouter from "./onboarding";
import budgetPlansRouter from "./budget-plans";
import { requireMember } from "../middlewares/requireMember";

const router: IRouter = Router();

// Auth routes bypass member check
router.use(authRouter);
router.use(healthRouter);
router.use(publicInvitationsRouter);
router.use(publicInviteLinksRouter);
router.use(onboardingRouter);

// Apply member check to everything else
router.use(requireMember);

router.use(expensesRouter);
router.use(contributionsRouter);
router.use(budgetCategoriesRouter);
router.use(dashboardRouter);
router.use(membersRouter);
router.use(groupRouter);
router.use(workspacesRouter);
router.use(digestRouter);
router.use(savingsGoalsRouter);
router.use(jointAccountRouter);
router.use(incomeSourcesRouter);
router.use(invitationsRouter);
router.use(inviteLinksRouter);
router.use(photoStorageRouter);
router.use(budgetPlansRouter);

export default router;
