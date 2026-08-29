ntributionParams = zod.object({
  "id": zod.coerce.number()
})

export const DeleteContributionResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary List contributions
 */
export const GetContributionsQueryParams = zod.object({
  "month": zod.coerce.number().optional(),
  "year": zod.coerce.number().optional()
})

export const GetContributionsResponseItem = zod.object({
  "id": zod.number(),
  "userId": zod.string(),
  "userName": zod.string(),
  "amount": zod.number().describe('Amount in KES'),
  "month": zod.number(),
  "year": zod.number(),
  "note": zod.string().nullish(),
  "createdAt": zod.coerce.date()
})
export const GetContributionsResponse = zod.array(GetContributionsResponseItem)


/**
 * @summary Record a contribution
 */
export const createContributionBodyAmountMultipleOf = 1;

export const createContributionBodyMonthMax = 12;
export const createContributionBodyMonthMultipleOf = 1;

export const createContributionBodyYearMin = 2000;
export const createContributionBodyYearMax = 2200;
export const createContributionBodyYearMultipleOf = 1;



export const CreateContributionBody = zod.object({
  "amount": zod.number().min(1).multipleOf(createContributionBodyAmountMultipleOf),
  "month": zod.number().min(1).max(createContributionBodyMonthMax).multipleOf(createContributionBodyMonthMultipleOf),
  "year": zod.number().min(createContributionBodyYearMin).max(createContributionBodyYearMax).multipleOf(createContributionBodyYearMultipleOf),
  "note": zod.string().optional(),
  "forUserId": zod.string().optional().describe('Record this contribution on behalf of another household member (their ID)')
})

export const CreateContributionResponse = zod.object({
  "id": zod.number(),
  "userId": zod.string(),
  "userName": zod.string(),
  "amount": zod.number().describe('Amount in KES'),
  "month": zod.number(),
  "year": zod.number(),
  "note": zod.string().nullish(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Monthly budget summary — total budget, total spent, remaining, per-category spent
 */
export const GetDashboardSummaryQueryParams = zod.object({
  "month": zod.coerce.number().optional(),
  "year": zod.coerce.number().optional()
})

export const GetDashboardSummaryResponse = zod.object({
  "month": zod.number(),
  "year": zod.number(),
  "totalBudget": zod.number(),
  "totalSpent": zod.number(),
  "remaining": zod.number(),
  "chegeContributed": zod.number(),
  "lydiahContributed": zod.number(),
  "chegeSpent": zod.number(),
  "lydiahSpent": zod.number(),
  "chegeNet": zod.number(),
  "lydiahNet": zod.number(),
  "chegeTarget": zod.number(),
  "lydiahTarget": zod.number(),
  "expenseCount": zod.number()
})


/**
 * @summary Household activity feed — latest items or all activity for a selected month
 */
export const GetDashboardActivityQueryParams = zod.object({
  "month": zod.coerce.number().optional(),
  "year": zod.coerce.number().optional()
})


export const getDashboardActivityResponseCategoryAllocationsItemAmountMultipleOf = 1;



export const GetDashboardActivityResponseItem = zod.object({
  "id": zod.string(),
  "editTarget": zod.enum(['expense', 'deposit']).optional().describe('The matching record can be opened in its existing editor.'),
  "type": zod.string().describe('expense or contribution'),
  "amount": zod.number(),
  "description": zod.string(),
  "userName": zod.string().describe('Display name of the actor. \"Joint bank\" for shared deposits\/ disbursements with no individual attribution.\n'),
  "category": zod.string().nullish(),
  "categoryAllocations": zod.array(zod.object({
  "category": zod.string().min(1),
  "amount": zod.number().min(1).multipleOf(getDashboardActivityResponseCategoryAllocationsItemAmountMultipleOf)
})).optional().describe('Category portions for an expense activity item. Legacy expenses return one portion.'),
  "date": zod.coerce.date()
})
export const GetDashboardActivityResponse = zod.array(GetDashboardActivityResponseItem)


/**
 * @summary Spending breakdown per category for a given month
 */
export const GetDashboardCategoryBreakdownQueryParams = zod.object({
  "month": zod.coerce.number().optional(),
  "year": zod.coerce.number().optional()
})

export const GetDashboardCategoryBreakdownResponseItem = zod.object({
  "category": zod.string(),
  "budgetAmount": zod.number(),
  "spentAmount": zod.number(),
  "remaining": zod.number(),
  "percentUsed": zod.number(),
  "priority": zod.number(),
  "color": zod.string(),
  "isRecurring": zod.boolean(),
  "activeMonth": zod.number().nullish(),
  "activeYear": zod.number().nullish(),
  "isBudgeted": zod.boolean().describe('False for actual spending that has no active budget in the selected month')
})
export const GetDashboardCategoryBreakdownResponse = zod.array(GetDashboardCategoryBreakdownResponseItem)


/**
 * @summary Expense and bank-disbursement entries behind a category breakdown row
 */
export const getDashboardCategoryLedgerQueryMonthMax = 12;




export const GetDashboardCategoryLedgerQueryParams = zod.object({
  "month": zod.coerce.number().min(1).max(getDashboardCategoryLedgerQueryMonthMax).optional(),
  "year": zod.coerce.number().optional(),
  "category": zod.coerce.string().min(1),
  "isBudgeted": zod.coerce.boolean().describe('Whether this is an active budget category or the synthetic Unbudgeted spending row')
})

export const GetDashboardCategoryLedgerResponse = zod.object({
  "category": zod.string(),
  "total": zod.number(),
  "entries": zod.array(zod.object({
  "id": zod.string(),
  "source": zod.enum(['expense', 'bank_disbursement']),
  "category": zod.string().describe('The original category attached to this transaction'),
  "description": zod.string(),
  "amount": zod.number(),
  "payerName": zod.string(),
  "date": zod.coerce.date()
}))
})


/**
 * @summary Income-stream funding totals for the active group and selected month
 */
export const getDashboardIncomeStreamsQueryMonthMax = 12;

export const getDashboardIncomeStreamsQueryYearMin = 2000;
export const getDashboardIncomeStreamsQueryYearMax = 2200;



export const GetDashboardIncomeStreamsQueryParams = zod.object({
  "month": zod.coerce.number().min(1).max(getDashboardIncomeStreamsQueryMonthMax).optional(),
  "year": zod.coerce.number().min(getDashboardIncomeStreamsQueryYearMin).max(getDashboardIncomeStreamsQueryYearMax).optional()
})

export const GetDashboardIncomeStreamsResponse = zod.object({
  "month": zod.number(),
  "year": zod.number(),
  "totalFunding": zod.number().describe('Total personal funding recorded across streams and the Unattributed bucket'),
  "totalExpected": zod.number(),
  "remainingBalance": zod.number(),
  "streams": zod.array(zod.object({
  "incomeSourceId": zod.number().nullish(),
  "sourceName": zod.string(),
  "ownerId": zod.string().nullish(),
  "ownerName": zod.string(),
  "total": zod.number().describe('Funding amount in KES'),
  "expectedMonthlyAmount": zod.number(),
  "remainingBalance": zod.number().describe('Expected monthly amount less recorded funding'),
  "variance": zod.number().describe('Recorded funding less expected monthly amount'),
  "sharePercent": zod.number().describe('Share of the month\'s recorded personal funding'),
  "transactionCount": zod.number(),
  "entries": zod.array(zod.object({
  "recordType": zod.enum(['expense', 'deposit', 'savings']),
  "recordId": zod.number(),
  "amount": zod.number().describe('Funding amount in KES'),
  "description": zod.string(),
  "date": zod.string()
})).describe('Individual funding entries that make up this stream total.')
}))
})


/**
 * @summary Workspace totals across an inclusive date range
 */
export const GetDashboardPeriodTotalsQueryParams = zod.object({
  "startDate": zod.date(),
  "endDate": zod.date()
})

export const GetDashboardPeriodTotalsResponse = zod.object({
  "startDate": zod.coerce.date(),
  "endDate": zod.coerce.date(),
  "expenseTotal": zod.number().describe('All recorded expenses in the period'),
  "spendingTotal": zod.number().describe('Expenses plus standalone categorised bank disbursements, counted once'),
  "contributionTotal": zod.number().describe('Personal expense funding, qualifying bank deposits, and personal savings additions'),
  "bankDepositTotal": zod.number().describe('External deposits into bank accounts, excluding transfers from savings'),
  "bankDisbursementTotal": zod.number().describe('Bank disbursements recorded in the period, excluding bank charges'),
  "savingsTotal": zod.number().describe('Personal additions to savings goals'),
  "netMovement": zod.number().describe('Contributions or funding less spending'),
  "expenseCount": zod.number(),
  "bankDepositCount": zod.number(),
  "bankDisbursementCount": zod.number(),
  "savingsCount": zod.number()
})


/**
 * @summary Download a monthly report PDF for the active group
 */
export const getDashboardMonthlyReportPdfQueryMonthMax = 12;

export const getDashboardMonthlyReportPdfQueryYearMin = 2000;
export const getDashboardMonthlyReportPdfQueryYearMax = 2200;



export const GetDashboardMonthlyReportPdfQueryParams = zod.object({
  "month": zod.coerce.number().min(1).max(getDashboardMonthlyReportPdfQueryMonthMax).optional(),
  "year": zod.coerce.number().min(getDashboardMonthlyReportPdfQueryYearMin).max(getDashboardMonthlyReportPdfQueryYearMax).optional()
})

export const GetDashboardMonthlyReportPdfResponse = zod.unknown()


/**
 * @summary Month-over-month spending totals for the last N months
 */
export const GetDashboardTrendsQueryParams = zod.object({
  "months": zod.coerce.number().optional()
})

export const GetDashboardTrendsResponseItem = zod.object({
  "month": zod.number(),
  "year": zod.number(),
  "label": zod.string().describe('Human-readable label e.g. \"Aug 2026\"'),
  "totalSpent": zod.number(),
  "expenseCount": zod.number()
})
export const GetDashboardTrendsResponse = zod.array(GetDashboardTrendsResponseItem)


/**
 * @summary List all savings goals
 */
export const GetSavingsGoalsResponseItem = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "targetAmount": zod.number().describe('Target amount in KES'),
  "currentAmount": zod.number().describe('Current saved amount in KES'),
  "deadline": zod.coerce.date().nullish().describe('Optional deadline date'),
  "createdByUserId": zod.string(),
  "isCompleted": zod.boolean(),
  "createdAt": zod.coerce.date()
})
export const GetSavingsGoalsResponse = zod.array(GetSavingsGoalsResponseItem)


/**
 * @summary Create a new savings goal
 */
export const CreateSavingsGoalBody = zod.object({
  "name": zod.string(),
  "targetAmount": zod.number(),
  "deadline": zod.coerce.date().optional().describe('Optional deadline date')
})

export const CreateSavingsGoalResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "targetAmount": zod.number().describe('Target amount in KES'),
  "currentAmount": zod.number().describe('Current saved amount in KES'),
  "deadline": zod.coerce.date().nullish().describe('Optional deadline date'),
  "createdByUserId": zod.string(),
  "isCompleted": zod.boolean(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Get one account when accountId is supplied, or aggregate all workspace accounts when omitted
 */



export const GetJointAccountQueryParams = zod.object({
  "accountId": zod.coerce.number().min(1).optional().describe('Optional account selection. When omitted, accountId identifies the earliest account and accountName is All accounts.')
})

export const getJointAccountResponseTransactionsItemContributorSplitsItemAmountMultipleOf = 1;




export const GetJointAccountResponse = zod.object({
  "openingBalance": zod.number().describe('Manually entered balance carried into the first recorded transaction'),
  "accountId": zod.number(),
  "accountName": zod.string(),
  "accountNumber": zod.string().nullable(),
  "balance": zod.number().describe('Current balance after applying the opening balance and all transactions'),
  "closingBalance": zod.number().describe('Opening balance plus deposits minus withdrawals'),
  "totalDeposits": zod.number(),
  "totalDisbursements": zod.number(),
  "transactions": zod.array(zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(getJointAccountResponseTransactionsItemContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
}))
})


/**
 * @summary Set the manual opening balance for a bank account
 */
export const updateJointAccountOpeningBalanceBodyOpeningBalanceMin = 0;
export const updateJointAccountOpeningBalanceBodyOpeningBalanceMultipleOf = 1;




export const UpdateJointAccountOpeningBalanceBody = zod.object({
  "openingBalance": zod.number().min(updateJointAccountOpeningBalanceBodyOpeningBalanceMin).multipleOf(updateJointAccountOpeningBalanceBodyOpeningBalanceMultipleOf),
  "accountId": zod.number().min(1).optional().describe('Manual starting balance in whole KES')
})

export const updateJointAccountOpeningBalanceResponseOpeningBalanceMin = 0;
export const updateJointAccountOpeningBalanceResponseOpeningBalanceMultipleOf = 1;



export const UpdateJointAccountOpeningBalanceResponse = zod.object({
  "openingBalance": zod.number().min(updateJointAccountOpeningBalanceResponseOpeningBalanceMin).multipleOf(updateJointAccountOpeningBalanceResponseOpeningBalanceMultipleOf),
  "accountId": zod.number()
})


/**
 * @summary Deposit money into a bank account
 */
export const createDepositBodyAmountMultipleOf = 1;


export const createDepositBodyContributorSplitsItemAmountMultipleOf = 1;





export const CreateDepositBody = zod.object({
  "amount": zod.number().min(1).multipleOf(createDepositBodyAmountMultipleOf).describe('Whole KES only; must be a positive integer amount'),
  "description": zod.string(),
  "date": zod.coerce.date(),
  "madeById": zod.string().nullish().describe('ID of the household member who made this deposit. Omit or pass null to attribute to the Joint bank (shared). Must be a valid household member ID when non-null.\n'),
  "incomeSourceId": zod.number().min(1).optional().describe('Optional income-source preset that funded this deposit. Used only with a single named depositor.\n'),
  "sourceKind": zod.enum(['income_source', 'other']).optional().describe('Choose other only when the required description is a narration.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(createDepositBodyContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional().describe('Whole-KES household contributor portions that must equal amount exactly.'),
  "accountId": zod.number().min(1).optional()
})

export const createDepositResponseContributorSplitsItemAmountMultipleOf = 1;




export const CreateDepositResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(createDepositResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Withdraw money from a bank account
 */
export const createDisbursementBodyAmountMultipleOf = 1;




export const CreateDisbursementBody = zod.object({
  "amount": zod.number().min(1).multipleOf(createDisbursementBodyAmountMultipleOf).describe('Whole KES only; must be a positive integer amount'),
  "description": zod.string().optional(),
  "date": zod.coerce.date(),
  "madeById": zod.string().nullish().describe('ID of the household member responsible for this disbursement. Omit or pass null for Joint bank. Must be a valid household member ID when non-null.\n'),
  "expenseCategory": zod.string().describe('Required budget category this disbursement is paying for'),
  "destinationKind": zod.enum(['category', 'other']).optional().describe('Choose other only when the required description is a narration.'),
  "accountId": zod.number().min(1).optional()
})

export const createDisbursementResponseContributorSplitsItemAmountMultipleOf = 1;




export const CreateDisbursementResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(createDisbursementResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Record a bank fee or charge against the selected account
 */
export const createBankChargeBodyAmountMultipleOf = 1;

export const createBankChargeBodyNarrationMax = 200;




export const CreateBankChargeBody = zod.object({
  "amount": zod.number().min(1).multipleOf(createBankChargeBodyAmountMultipleOf),
  "narration": zod.string().min(1).max(createBankChargeBodyNarrationMax).describe('Required explanation from the bank statement, for example monthly account fee'),
  "date": zod.coerce.date(),
  "accountId": zod.number().min(1).optional()
})

export const createBankChargeResponseContributorSplitsItemAmountMultipleOf = 1;




export const CreateBankChargeResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(createBankChargeResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Move money from the joint bank account into a savings goal
 */
export const transferBankToSavingsBodyAmountMultipleOf = 1;


export const transferBankToSavingsBodyNarrationMax = 200;




export const TransferBankToSavingsBody = zod.object({
  "amount": zod.number().min(1).multipleOf(transferBankToSavingsBodyAmountMultipleOf),
  "goalId": zod.number().min(1),
  "narration": zod.string().min(1).max(transferBankToSavingsBodyNarrationMax),
  "date": zod.coerce.date(),
  "madeById": zod.string().nullish(),
  "accountId": zod.number().min(1).optional()
})

export const transferBankToSavingsResponseContributorSplitsItemAmountMultipleOf = 1;




export const TransferBankToSavingsResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(transferBankToSavingsResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Move money from a savings goal into the joint bank account
 */
export const transferSavingsToBankBodyAmountMultipleOf = 1;


export const transferSavingsToBankBodyNarrationMax = 200;




export const TransferSavingsToBankBody = zod.object({
  "amount": zod.number().min(1).multipleOf(transferSavingsToBankBodyAmountMultipleOf),
  "goalId": zod.number().min(1),
  "narration": zod.string().min(1).max(transferSavingsToBankBodyNarrationMax),
  "date": zod.coerce.date(),
  "madeById": zod.string().nullish(),
  "accountId": zod.number().min(1).optional()
})

export const transferSavingsToBankResponseContributorSplitsItemAmountMultipleOf = 1;




export const TransferSavingsToBankResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(transferSavingsToBankResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Move money between two bank accounts in the active workspace
 */


export const transferBankToBankBodyAmountMultipleOf = 1;

export const transferBankToBankBodyNarrationMax = 200;



export const TransferBankToBankBody = zod.object({
  "sourceAccountId": zod.number().min(1),
  "destinationAccountId": zod.number().min(1),
  "amount": zod.number().min(1).multipleOf(transferBankToBankBodyAmountMultipleOf),
  "narration": zod.string().min(1).max(transferBankToBankBodyNarrationMax),
  "date": zod.coerce.date()
})

export const transferBankToBankResponseOutgoingContributorSplitsItemAmountMultipleOf = 1;


export const transferBankToBankResponseIncomingContributorSplitsItemAmountMultipleOf = 1;




export const TransferBankToBankResponse = zod.object({
  "transferId": zod.string(),
  "outgoing": zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(transferBankToBankResponseOutgoingContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
}),
  "incoming": zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(transferBankToBankResponseIncomingContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})
})


/**
 * @summary Edit a bank account transaction without changing its type
 */
export const UpdateJointAccountTransactionParams = zod.object({
  "id": zod.coerce.number()
})

export const updateJointAccountTransactionBodyAmountMultipleOf = 1;

export const updateJointAccountTransactionBodyContributorSplitsItemAmountMultipleOf = 1;



export const updateJointAccountTransactionBodyNarrationMax = 200;




export const UpdateJointAccountTransactionBody = zod.object({
  "amount": zod.number().min(1).multipleOf(updateJointAccountTransactionBodyAmountMultipleOf),
  "description": zod.string().optional().describe('Optional supporting detail; withdrawals fall back to their category'),
  "date": zod.coerce.date(),
  "madeById": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Preserved for deposits unless explicitly changed'),
  "expenseCategory": zod.string().optional().describe('Required for withdrawals; deposits ignore this field'),
  "bankCharge": zod.boolean().optional().describe('True only while editing an existing bank-charge transaction'),
  "sourceKind": zod.enum(['income_source', 'other']).optional(),
  "destinationKind": zod.enum(['category', 'other']).optional(),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(updateJointAccountTransactionBodyContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional().describe('Replacement contributor portions for a deposit. Send an empty array to remove existing splits.'),
  "transferDirection": zod.enum(['to_savings', 'from_savings']).optional().describe('Required when editing a linked savings transfer'),
  "goalId": zod.number().min(1).optional().describe('Savings goal receiving or supplying an edited transfer'),
  "narration": zod.string().min(1).max(updateJointAccountTransactionBodyNarrationMax).optional().describe('Required when editing a linked savings transfer'),
  "accountId": zod.number().min(1).optional()
})

export const updateJointAccountTransactionResponseContributorSplitsItemAmountMultipleOf = 1;




export const UpdateJointAccountTransactionResponse = zod.object({
  "id": zod.number(),
  "accountId": zod.number().nullish(),
  "type": zod.string().describe('deposit or disbursement'),
  "amount": zod.number(),
  "description": zod.string(),
  "madeById": zod.string().nullish(),
  "madeByName": zod.string().nullish(),
  "incomeSourceId": zod.number().nullish().describe('Income source attached to a single-depositor deposit'),
  "expenseCategory": zod.string().nullish().describe('Expense category this disbursement covers (optional)'),
  "bankCharge": zod.boolean().describe('True when this disbursement is a bank fee excluded from household spending reports'),
  "savingsGoalId": zod.number().nullish().describe('Linked savings goal for a bank transfer'),
  "savingsGoalName": zod.string().nullish(),
  "transferDirection": zod.string().nullish().describe('to_savings or from_savings for linked transfers'),
  "bankTransferId": zod.string().nullish().describe('Shared identifier for the two sides of an internal bank-to-bank transfer'),
  "bankTransferAccountId": zod.number().nullish().describe('Counterparty bank account for an internal transfer'),
  "bankTransferAccountName": zod.string().nullish(),
  "expenseId": zod.number().nullish().describe('Expense that owns this linked Joint-bank funding disbursement.'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().describe('Household member who supplied this deposit portion.'),
  "amount": zod.number().min(1).multipleOf(updateJointAccountTransactionResponseContributorSplitsItemAmountMultipleOf),
  "incomeSourceId": zod.number().min(1).optional()
})).optional(),
  "date": zod.coerce.date(),
  "createdAt": zod.string()
})


/**
 * @summary Delete a bank account transaction
 */
export const DeleteJointAccountTransactionParams = zod.object({
  "id": zod.coerce.number()
})

export const DeleteJointAccountTransactionResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary List bank accounts in the active workspace
 */
export const GetJointAccountsResponseItem = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "accountNumber": zod.string().nullable(),
  "openingBalance": zod.number(),
  "createdAt": zod.coerce.date()
})
export const GetJointAccountsResponse = zod.array(GetJointAccountsResponseItem)


/**
 * @summary Create a workspace bank account
 */
export const createJointAccountBodyNameMax = 80;

export const createJointAccountBodyAccountNumberMax = 40;

export const createJointAccountBodyOpeningBalanceMin = 0;
export const createJointAccountBodyOpeningBalanceMultipleOf = 1;



export const CreateJointAccountBody = zod.object({
  "name": zod.string().min(1).max(createJointAccountBodyNameMax),
  "accountNumber": zod.string().min(1).max(createJointAccountBodyAccountNumberMax).optional(),
  "openingBalance": zod.number().min(createJointAccountBodyOpeningBalanceMin).multipleOf(createJointAccountBodyOpeningBalanceMultipleOf).optional()
})

export const CreateJointAccountResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "accountNumber": zod.string().nullable(),
  "openingBalance": zod.number(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Rename a workspace bank account or update its opening balance
 */
export const UpdateJointAccountParams = zod.object({
  "id": zod.coerce.number()
})

export const updateJointAccountBodyNameMax = 80;

export const updateJointAccountBodyAccountNumberMax = 40;

export const updateJointAccountBodyOpeningBalanceMin = 0;
export const updateJointAccountBodyOpeningBalanceMultipleOf = 1;



export const UpdateJointAccountBody = zod.object({
  "name": zod.string().min(1).max(updateJointAccountBodyNameMax).optional(),
  "accountNumber": zod.string().min(1).max(updateJointAccountBodyAccountNumberMax).nullish(),
  "openingBalance": zod.number().min(updateJointAccountBodyOpeningBalanceMin).multipleOf(updateJointAccountBodyOpeningBalanceMultipleOf).optional()
})

export const UpdateJointAccountResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "accountNumber": zod.string().nullable(),
  "openingBalance": zod.number(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Delete a bank account with no transaction history
 */
export const DeleteJointAccountParams = zod.object({
  "id": zod.coerce.number()
})

export const DeleteJointAccountResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary Distribute a payment waterfall-style across multiple savings goals
 */
export const cascadeContributeBodyAmountMultipleOf = 1;

export const cascadeContributeBodyContributorSplitsItemAmountMultipleOf = 1;



export const CascadeContributeBody = zod.object({
  "amount": zod.number().min(1).multipleOf(cascadeContributeBodyAmountMultipleOf).describe('Total payment amount to distribute (whole KES only; positive integer)'),
  "goalIds": zod.array(zod.number()).optional().describe('Optional ordered list of goal IDs; defaults to all active goals by creation date'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().nullable().describe('Household member ID, or null for Joint bank. Must be a valid member ID when non-null.\n'),
  "amount": zod.number().min(1).multipleOf(cascadeContributeBodyContributorSplitsItemAmountMultipleOf).describe('Amount attributed to this contributor (whole KES only; positive integer)')
}).describe('Attribution of a portion of a cascade contribution to one member or the Joint bank')).optional().describe('Optional attribution splits. When provided the sum of all split amounts must equal the total amount. Each goal allocation is recorded as one contribution row per split proportionally. Omit (or omit the field entirely) to record the whole contribution as Joint bank.\n')
})

export const CascadeContributeResponse = zod.object({
  "totalAmount": zod.number(),
  "allocations": zod.array(zod.object({
  "goalId": zod.number(),
  "goalName": zod.string(),
  "allocated": zod.number(),
  "newTotal": zod.number(),
  "completed": zod.boolean()
})),
  "leftover": zod.number()
})


/**
 * @summary List contribution history for a savings goal
 */
export const GetSavingsGoalContributionsParams = zod.object({
  "id": zod.coerce.number()
})

export const GetSavingsGoalContributionsResponseItem = zod.object({
  "id": zod.number(),
  "goalId": zod.number(),
  "amount": zod.number().describe('Amount contributed in KES'),
  "note": zod.string().nullish().describe('Optional note — \"Manual adjustment\" for balance corrections'),
  "createdByUserId": zod.string().nullable().describe('Household member ID, or null for Joint bank'),
  "contributorName": zod.string().describe('Display name of the contributor. \"Joint bank\" when createdByUserId is null.\n'),
  "createdAt": zod.string()
})
export const GetSavingsGoalContributionsResponse = zod.array(GetSavingsGoalContributionsResponseItem)


/**
 * @summary Delete a manually recorded savings contribution and reverse its effect on the goal balance
 */
export const DeleteSavingsGoalContributionParams = zod.object({
  "id": zod.coerce.number(),
  "contributionId": zod.coerce.number()
})

export const DeleteSavingsGoalContributionResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary Atomically add an amount to a savings goal's current balance
 */
export const ContributeToSavingsGoalParams = zod.object({
  "id": zod.coerce.number()
})

export const contributeToSavingsGoalBodyAmountMultipleOf = 1;

export const contributeToSavingsGoalBodyContributorSplitsItemAmountMultipleOf = 1;



export const ContributeToSavingsGoalBody = zod.object({
  "amount": zod.number().min(1).multipleOf(contributeToSavingsGoalBodyAmountMultipleOf).describe('Amount to add to the goal (whole KES only; positive integer)'),
  "userId": zod.string().nullish().describe('ID of the household member making this contribution. Omit or pass null to attribute to the Joint bank (shared). Must be a valid household member ID when non-null. Cannot be combined with contributorSplits.\n'),
  "contributorSplits": zod.array(zod.object({
  "userId": zod.string().nullable().describe('Household member ID, or null for Joint bank. Must be a valid member ID when non-null.\n'),
  "amount": zod.number().min(1).multipleOf(contributeToSavingsGoalBodyContributorSplitsItemAmountMultipleOf).describe('Amount attributed to this contributor (whole KES only; positive integer)')
}).describe('Attribution of a portion of a cascade contribution to one member or the Joint bank')).optional().describe('Optional attribution splits. When provided the sum of all split amounts must equal amount exactly, and userId must be omitted. Each split is recorded as a separate contribution row (proportionally reduced when the goal cap limits the applied amount). Omit to record the whole contribution against userId (or Joint bank when userId is also omitted).\n')
})

export const ContributeToSavingsGoalResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "targetAmount": zod.number().describe('Target amount in KES'),
  "currentAmount": zod.number().describe('Current saved amount in KES'),
  "deadline": zod.coerce.date().nullish().describe('Optional deadline date'),
  "createdByUserId": zod.string(),
  "isCompleted": zod.boolean(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Update a savings goal (name, target, deadline, currentAmount, isCompleted)
 */
export const UpdateSavingsGoalParams = zod.object({
  "id": zod.coerce.number()
})

export const UpdateSavingsGoalBody = zod.object({
  "name": zod.string().optional(),
  "targetAmount": zod.number().optional(),
  "currentAmount": zod.number().optional(),
  "deadline": zod.coerce.date().nullish(),
  "isCompleted": zod.boolean().optional(),
  "reason": zod.string().optional().describe('Required when currentAmount correction reduces the balance by more than 50%')
})

export const UpdateSavingsGoalResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "targetAmount": zod.number().describe('Target amount in KES'),
  "currentAmount": zod.number().describe('Current saved amount in KES'),
  "deadline": zod.coerce.date().nullish().describe('Optional deadline date'),
  "createdByUserId": zod.string(),
  "isCompleted": zod.boolean(),
  "createdAt": zod.coerce.date()
})


/**
 * @summary Delete a savings goal
 */
export const DeleteSavingsGoalParams = zod.object({
  "id": zod.coerce.number()
})

export const DeleteSavingsGoalResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary List income source presets per household member
 */
export const GetIncomeSourcesQueryParams = zod.object({
  "userId": zod.coerce.string().optional().describe('Optional household member ID to filter by')
})

export const GetIncomeSourcesResponseItem = zod.object({
  "id": zod.number(),
  "userId": zod.string(),
  "name": zod.string(),
  "isMain": zod.boolean(),
  "expectedMonthlyAmount": zod.number(),
  "createdAt": zod.coerce.date()
})
export const GetIncomeSourcesResponse = zod.array(GetIncomeSourcesResponseItem)


/**
 * @summary List all members with access to this app
 */
export const GetMembersResponseItem = zod.object({
  "userId": zod.string(),
  "userName": zod.string().nullish(),
  "role": zod.enum(['owner', 'admin', 'member']),
  "addedAt": zod.coerce.date()
})
export const GetMembersResponse = zod.array(GetMembersResponseItem)


/**
 * @summary Invite a new member or admin by Replit user ID
 */
export const addMemberBodyRoleDefault = `member`;

export const AddMemberBody = zod.object({
  "userId": zod.string(),
  "role": zod.enum(['admin', 'member']).default(addMemberBodyRoleDefault)
})

export const AddMemberResponse = zod.object({
  "userId": zod.string(),
  "userName": zod.string().nullish(),
  "role": zod.enum(['owner', 'admin', 'member']),
  "addedAt": zod.coerce.date()
})


/**
 * @summary Leave the active group as the signed-in non-owner member
 */
export const LeaveGroupResponse = zod.object({
  "success": zod.boolean()
})


/**
 * @summary List the signed-in person's private and shared budget workspaces
 */
export const getWorkspacesResponseEmojiMax = 16;

export const getWorkspacesResponseSloganMax = 120;



export const GetWorkspacesResponseItem = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "emoji": zod.string().max(getWorkspacesResponseEmojiMax).nullable(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']),
  "photoUrl": zod.string().nullish(),
  "slogan": zod.string().max(getWorkspacesResponseSloganMax).nullish(),
  "isPrivate": zod.boolean(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']),
  "role": zod.enum(['owner', 'admin', 'member'])
})
export const GetWorkspacesResponse = zod.array(GetWorkspacesResponseItem)


/**
 * @summary Select an available workspace for the current session
 */
export const SelectWorkspaceBody = zod.object({
  "groupId": zod.number()
})

export const selectWorkspaceResponseEmojiMax = 16;

export const selectWorkspaceResponseSloganMax = 120;



export const SelectWorkspaceResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "emoji": zod.string().max(selectWorkspaceResponseEmojiMax).nullable(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']),
  "photoUrl": zod.string().nullish(),
  "slogan": zod.string().max(selectWorkspaceResponseSloganMax).nullish(),
  "isPrivate": zod.boolean(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']),
  "role": zod.enum(['owner', 'admin', 'member'])
})


/**
 * @summary Create a private shared group and become its owner
 */
export const createSharedGroupBodyNameMin = 2;
export const createSharedGroupBodyNameMax = 60;

export const createSharedGroupBodyEmojiMax = 16;

export const createSharedGroupBodyKindDefault = `family`;
export const createSharedGroupBodyDefaultMonthlyTargetMin = 0;



export const CreateSharedGroupBody = zod.object({
  "name": zod.string().min(createSharedGroupBodyNameMin).max(createSharedGroupBodyNameMax),
  "emoji": zod.string().max(createSharedGroupBodyEmojiMax).nullish(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']).optional(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']).default(createSharedGroupBodyKindDefault),
  "defaultMonthlyTarget": zod.number().min(createSharedGroupBodyDefaultMonthlyTargetMin).nullish().describe('What each member is expected to contribute per month, in KES. Members who join inherit it as their own target. Null means the group does not work to a fixed amount.')
})

export const createSharedGroupResponseEmojiMax = 16;

export const createSharedGroupResponseSloganMax = 120;



export const CreateSharedGroupResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "emoji": zod.string().max(createSharedGroupResponseEmojiMax).nullable(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']),
  "photoUrl": zod.string().nullish(),
  "slogan": zod.string().max(createSharedGroupResponseSloganMax).nullish(),
  "isPrivate": zod.boolean(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']),
  "role": zod.enum(['owner', 'admin', 'member'])
})


/**
 * @summary List group invitations
 */
export const GetGroupInvitationsResponseItem = zod.object({
  "id": zod.number(),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "createdAt": zod.coerce.date(),
  "expiresAt": zod.coerce.date(),
  "acceptedAt": zod.coerce.date().nullish(),
  "cancelledAt": zod.coerce.date().nullish(),
  "status": zod.enum(['pending', 'accepted', 'cancelled', 'expired'])
})
export const GetGroupInvitationsResponse = zod.array(GetGroupInvitationsResponseItem)


/**
 * @summary Email a group invitation
 */
export const createGroupInvitationBodyRoleDefault = `member`;
export const createGroupInvitationBodyContactNameMax = 80;

export const createGroupInvitationBodySaveContactDefault = false;

export const CreateGroupInvitationBody = zod.object({
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']).default(createGroupInvitationBodyRoleDefault),
  "contactName": zod.string().min(1).max(createGroupInvitationBodyContactNameMax).optional(),
  "saveContact": zod.boolean().default(createGroupInvitationBodySaveContactDefault)
})

export const CreateGroupInvitationResponse = zod.object({
  "id": zod.number(),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "createdAt": zod.coerce.date(),
  "expiresAt": zod.coerce.date(),
  "acceptedAt": zod.coerce.date().nullish(),
  "cancelledAt": zod.coerce.date().nullish(),
  "status": zod.enum(['pending', 'accepted', 'cancelled', 'expired'])
})


/**
 * @summary Email several group invitations
 */
export const createGroupInvitationsBatchBodyEmailsMax = 50;

export const createGroupInvitationsBatchBodyRoleDefault = `member`;

export const CreateGroupInvitationsBatchBody = zod.object({
  "emails": zod.array(zod.string()).min(1).max(createGroupInvitationsBatchBodyEmailsMax),
  "role": zod.enum(['admin', 'member']).default(createGroupInvitationsBatchBodyRoleDefault)
})

export const CreateGroupInvitationsBatchResponse = zod.object({
  "sent": zod.array(zod.object({
  "id": zod.number(),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "createdAt": zod.coerce.date(),
  "expiresAt": zod.coerce.date(),
  "acceptedAt": zod.coerce.date().nullish(),
  "cancelledAt": zod.coerce.date().nullish(),
  "status": zod.enum(['pending', 'accepted', 'cancelled', 'expired'])
})),
  "failed": zod.array(zod.object({
  "email": zod.string(),
  "error": zod.string()
}))
})


/**
 * @summary List private join links for the active shared group
 */
export const GetGroupInviteLinksResponseItem = zod.object({
  "id": zod.number(),
  "expiresAt": zod.coerce.date(),
  "revokedAt": zod.coerce.date().nullish(),
  "createdAt": zod.coerce.date(),
  "status": zod.enum(['active', 'revoked', 'expired'])
})
export const GetGroupInviteLinksResponse = zod.array(GetGroupInviteLinksResponseItem)


/**
 * @summary Create an expiring private join link for the active shared group
 */
export const CreateGroupInviteLinkResponse = zod.object({
  "id": zod.number(),
  "expiresAt": zod.coerce.date(),
  "revokedAt": zod.coerce.date().nullish(),
  "createdAt": zod.coerce.date(),
  "status": zod.enum(['active', 'revoked', 'expired'])
}).and(zod.object({
  "token": zod.string()
}))


/**
 * @summary Revoke a private group join link
 */
export const RevokeGroupInviteLinkParams = zod.object({
  "id": zod.coerce.number()
})

export const RevokeGroupInviteLinkResponse = zod.object({
  "id": zod.number(),
  "expiresAt": zod.coerce.date(),
  "revokedAt": zod.coerce.date().nullish(),
  "createdAt": zod.coerce.date(),
  "status": zod.enum(['active', 'revoked', 'expired'])
})


/**
 * @summary Preview a private group join link
 */
export const GetGroupInviteLinkPreviewParams = zod.object({
  "token": zod.coerce.string()
})

export const GetGroupInviteLinkPreviewResponse = zod.object({
  "groupName": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "expiresAt": zod.coerce.date()
})


/**
 * @summary Join a private group using a valid private link
 */
export const AcceptGroupInviteLinkParams = zod.object({
  "token": zod.coerce.string()
})

export const AcceptGroupInviteLinkResponse = zod.object({
  "groupName": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "expiresAt": zod.coerce.date()
})


/**
 * @summary Cancel a pending group invitation
 */
export const CancelGroupInvitationParams = zod.object({
  "id": zod.coerce.number()
})

export const CancelGroupInvitationResponse = zod.object({
  "id": zod.number(),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "createdAt": zod.coerce.date(),
  "expiresAt": zod.coerce.date(),
  "acceptedAt": zod.coerce.date().nullish(),
  "cancelledAt": zod.coerce.date().nullish(),
  "status": zod.enum(['pending', 'accepted', 'cancelled', 'expired'])
})


/**
 * @summary Send a fresh link for a pending invitation
 */
export const ResendGroupInvitationParams = zod.object({
  "id": zod.coerce.number()
})

export const ResendGroupInvitationResponse = zod.object({
  "id": zod.number(),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "createdAt": zod.coerce.date(),
  "expiresAt": zod.coerce.date(),
  "acceptedAt": zod.coerce.date().nullish(),
  "cancelledAt": zod.coerce.date().nullish(),
  "status": zod.enum(['pending', 'accepted', 'cancelled', 'expired'])
})


/**
 * @summary Preview a valid invitation before signing in
 */
export const GetGroupInvitationPreviewParams = zod.object({
  "token": zod.coerce.string()
})

export const GetGroupInvitationPreviewResponse = zod.object({
  "groupName": zod.string(),
  "role": zod.enum(['admin', 'member']),
  "expiresAt": zod.coerce.date()
})


/**
 * @summary Accept an invitation with the matching signed-in email
 */
export const AcceptGroupInvitationParams = zod.object({
  "token": zod.coerce.string()
})

export const AcceptGroupInvitationResponse = zod.unknown()


/**
 * @summary List saved one-tap invitation contacts
 */
export const getGroupInvitationContactsResponseOneNameMax = 80;

export const getGroupInvitationContactsResponseOneRoleDefault = `member`;

export const GetGroupInvitationContactsResponseItem = zod.object({
  "name": zod.string().min(1).max(getGroupInvitationContactsResponseOneNameMax),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']).default(getGroupInvitationContactsResponseOneRoleDefault)
}).and(zod.object({
  "id": zod.number()
}))
export const GetGroupInvitationContactsResponse = zod.array(GetGroupInvitationContactsResponseItem)


/**
 * @summary Save or update a one-tap invitation contact
 */
export const saveGroupInvitationContactBodyNameMax = 80;

export const saveGroupInvitationContactBodyRoleDefault = `member`;

export const SaveGroupInvitationContactBody = zod.object({
  "name": zod.string().min(1).max(saveGroupInvitationContactBodyNameMax),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']).default(saveGroupInvitationContactBodyRoleDefault)
})

export const saveGroupInvitationContactResponseOneNameMax = 80;

export const saveGroupInvitationContactResponseOneRoleDefault = `member`;

export const SaveGroupInvitationContactResponse = zod.object({
  "name": zod.string().min(1).max(saveGroupInvitationContactResponseOneNameMax),
  "email": zod.string(),
  "role": zod.enum(['admin', 'member']).default(saveGroupInvitationContactResponseOneRoleDefault)
}).and(zod.object({
  "id": zod.number()
}))


/**
 * @summary Delete a saved invitation contact
 */
export const DeleteGroupInvitationContactParams = zod.object({
  "id": zod.coerce.number()
})

export const DeleteGroupInvitationContactResponse = zod.unknown()


/**
 * @summary Get the active group's details
 */
export const getGroupResponseEmojiMax = 16;

export const getGroupResponseSloganMax = 120;



export const GetGroupResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "emoji": zod.string().max(getGroupResponseEmojiMax).nullable(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']),
  "photoUrl": zod.string().nullish(),
  "slogan": zod.string().max(getGroupResponseSloganMax).nullish(),
  "isPrivate": zod.boolean(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']),
  "role": zod.enum(['owner', 'admin', 'member']),
  "canRecordSharedTransactions": zod.boolean().describe('Whether this workspace may record expenses and contributions right now')
})


/**
 * @summary Rename the active group
 */
export const updateGroupBodyNameMin = 2;
export const updateGroupBodyNameMax = 60;

export const updateGroupBodyEmojiMax = 16;

export const updateGroupBodyPhotoPathRegExp = new RegExp('^/objects/photos/[a-f0-9-]+$');
export const updateGroupBodySloganMax = 120;

export const updateGroupBodyDefaultMonthlyTargetMin = 0;



export const UpdateGroupBody = zod.object({
  "name": zod.string().min(updateGroupBodyNameMin).max(updateGroupBodyNameMax),
  "emoji": zod.string().max(updateGroupBodyEmojiMax).nullish(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']).optional(),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']).optional(),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']).optional(),
  "photoPath": zod.string().regex(updateGroupBodyPhotoPathRegExp).nullish(),
  "slogan": zod.string().max(updateGroupBodySloganMax).nullish(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']).optional(),
  "defaultMonthlyTarget": zod.number().min(updateGroupBodyDefaultMonthlyTargetMin).nullish().describe('What each member is expected to contribute per month, in KES. Changing it does not alter targets already set on existing members; it applies to whoever joins next.')
})

export const updateGroupResponseEmojiMax = 16;

export const updateGroupResponseSloganMax = 120;



export const UpdateGroupResponse = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "emoji": zod.string().max(updateGroupResponseEmojiMax).nullable(),
  "nameStyle": zod.enum(['plain', 'italic', 'bold', 'serif']),
  "icon": zod.enum(['users', 'home', 'heart', 'briefcase', 'award', 'star']),
  "accentColor": zod.enum(['#011C4E', '#003383', '#087F8C', '#08B7B0', '#209E45', '#C98C00', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669']),
  "photoUrl": zod.string().nullish(),
  "slogan": zod.string().max(updateGroupResponseSloganMax).nullish(),
  "isPrivate": zod.boolean(),
  "kind": zod.enum(['personal', 'family', 'chama', 'club', 'team', 'other']),
  "role": zod.enum(['owner', 'admin', 'member']),
  "canRecordSharedTransactions": zod.boolean().describe('Whether this workspace may record expenses and contributions right now')
})


/**
 * @summary Promote or demote a member
 */
export const UpdateMemberRoleParams = zod.object({
  "userId": zod.coerce.string()
})

export const UpdateMemberRoleBody = zod.object({
  "role": zod.enum(['admin', 'member'])
})

export const UpdateMemberRoleResponse = zod.object({
  "userId": zod.string(),
  "userName": zod.string().nullish(),
  "role": zod.enum(['owner', 'admin', 'member']),
  "addedAt": zod.coerce.date()
})


/**
 * @summary Remove a member
 */
export const RemoveMemberParams = zod.object({
  "userId": zod.coerce.string()
})

export const RemoveMemberResponse = zod.object({
  "success": zod.boolean()
})


