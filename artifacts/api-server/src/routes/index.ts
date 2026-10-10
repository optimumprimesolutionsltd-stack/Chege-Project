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
import possibleDuplicatesRouter from "./possible-duplicates";
import jointAccountRouter from "./joint-account";
import incomeSourcesRouter from "./income-sources";
import { invitationsRouter, publicInvitationsRouter } from "./invitations";
import { inviteLinksRouter, publicInviteLinksRouter } from "./invite-links";
import { viewLinksRouter, publicViewLinksRouter } from "./view-links";
import contributorsRouter from "./contributors";
import payoutsRouter from "./payouts";
import photoStorageRouter from "./photo-storage";
import onboardingRouter from "./onboarding";
import feedbackRouter from "./feedback";
import budgetPlansRouter from "./budget-plans";
import aiRouter from "./ai";
import parserRouter from "./parser";
import mpesaImportRouter from "./mpesa-import";
import importSaveJobsRouter from "./import-save-jobs";
import debtLinksRouter from "./debt-links";
import mpesaNamesRouter from "./mpesa-names";
import entriesToSortRouter from "./entries-to-sort";
import ownerBusinessRouter from "./owner-business";
import businessAccountsRouter from "./business-accounts";
import standardCategoriesRouter from "./standard-categories";
import businessesRouter from "./businesses";
import categoryPlacesRouter from "./category-places";
import payeeRulesRouter from "./payee-rules";
import transactionSplitsRouter from "./transaction-splits";
import budgetKnowledgeRouter from "./budget-knowledge";
import deleteYearRouter from "./delete-year";
import {
  publicSubscriptionPlansRouter,
  subscriptionPlansRouter,
} from "./subscription-plans";
import { paymentsRouter, publicPaymentsRouter } from "./payments";
import { crmSyncRouter } from "./crm-sync";
import { requireMember } from "../middlewares/requireMember";
import { reportCache } from "../lib/report-cache";
import { requireWriteAccess } from "../middlewares/requireWriteAccess";

const router: IRouter = Router();

// Auth routes bypass member check
router.use(authRouter);
router.use(healthRouter);
router.use(publicInvitationsRouter);
router.use(publicInviteLinksRouter);
router.use(publicViewLinksRouter);
router.use(onboardingRouter);
router.use(feedbackRouter);
router.use(parserRouter);
router.use(publicSubscriptionPlansRouter);
router.use(publicPaymentsRouter);
// Read-only, its own bearer-token gate (CRM_SYNC_KEY) — not a member session,
// so it must not sit behind requireMember.
router.use(crmSyncRouter);

// Apply member check to everything else
router.use(requireMember);
// Then the write gate. A viewer reaches every read below and no write, and a
// route added later is covered without anybody remembering to guard it.
router.use(requireWriteAccess);
// Reports remembered until their budget changes (lib/report-cache): the database
// has a tenth of a CPU, and most Reports requests found nothing had changed.
router.use(reportCache);

router.use(expensesRouter);
router.use(contributionsRouter);
router.use(contributorsRouter);
router.use(payoutsRouter);
router.use(budgetCategoriesRouter);
router.use(dashboardRouter);
router.use(membersRouter);
router.use(groupRouter);
router.use(workspacesRouter);
router.use(digestRouter);
router.use(savingsGoalsRouter);
router.use(possibleDuplicatesRouter);
router.use(jointAccountRouter);
router.use(mpesaImportRouter);
router.use(importSaveJobsRouter);
router.use(debtLinksRouter);
router.use(mpesaNamesRouter);
router.use(entriesToSortRouter);
router.use(ownerBusinessRouter);
router.use(businessAccountsRouter);
router.use(standardCategoriesRouter);
router.use(businessesRouter);
router.use(categoryPlacesRouter);
router.use(payeeRulesRouter);
router.use(transactionSplitsRouter);
router.use(budgetKnowledgeRouter);
router.use(deleteYearRouter);
router.use(incomeSourcesRouter);
router.use(invitationsRouter);
router.use(inviteLinksRouter);
router.use(viewLinksRouter);
router.use(photoStorageRouter);
router.use(budgetPlansRouter);
router.use(aiRouter);
router.use(subscriptionPlansRouter);
router.use(paymentsRouter);

export default router;
