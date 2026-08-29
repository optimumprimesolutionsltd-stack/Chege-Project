  aria-label={`Allocation amount ${index + 1}`} className="h-10 w-28" />
                 {form.categoryAllocations.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => form.setCategoryAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove allocation ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>}
               </div>
             ))}
             {(() => {
               const allocated = form.categoryAllocations.reduce((total, allocation) => total + (Number(allocation.amount) || 0), 0);
               const difference = (Number(form.amount) || 0) - allocated;
               return <p className={`text-xs ${difference === 0 && allocated > 0 ? "text-primary" : "text-muted-foreground"}`} data-testid={`category-allocation-total-${mode}`}>
                 Allocated: {formatKes(allocated)} · {difference === 0 && allocated > 0 ? "Exactly allocated" : difference > 0 ? `${formatKes(difference)} remaining` : `${formatKes(Math.abs(difference))} excess`}
               </p>;
              })()}
            </div>
            )}
         </div>

          {!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && (
           <div className="space-y-2 md:col-span-2">
             <label className="text-sm font-semibold text-foreground">Description</label>
             <Input value={form.description}
               onChange={e => form.setDescription(e.target.value)}
               placeholder="e.g. Nathan's Term 2 school fees"
               required className="h-12 bg-card" />
           </div>
         )}

          {!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other") && (
           <div className="space-y-2 md:col-span-2">
             <label className="text-sm font-semibold text-foreground">
               Notes <span className="font-normal text-muted-foreground">(optional)</span>
             </label>
             <Input
               placeholder="Any extra details..."
               value={form.notes ?? ""}
               onChange={e => form.setNotes(e.target.value)}
               className="h-12 bg-card"
             />
           </div>
         )}

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Date</label>
          <Input
            type="date"
            value={form.date}
            onChange={e => form.setDate(e.target.value)}
            required
            disabled={!canManageExpenses}
            min={canManageExpenses ? undefined : today}
            max={canManageExpenses ? undefined : today}
            aria-describedby={!canManageExpenses ? "member-expense-date-help" : undefined}
            className="h-12 bg-card"
          />
          {!canManageExpenses && (
            <p id="member-expense-date-help" className="text-xs text-muted-foreground">
              Members can record and correct expenses for today only. Ask an admin to backdate.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            {isPersonalBudget ? "Funding source" : "Paid by"} <span className="text-destructive">*</span>
            {mode === "add" && canManageExpenses && !isPersonalBudget && (
              <span className="font-normal text-muted-foreground text-xs ml-1">(select multiple to split)</span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {/* A workspace bank account is unattributed to an individual payer. */}
            {canManageExpenses && (
            <button type="button"
              onClick={() => {
                const nextPaidFromBank = !form.paidFromBank;
                form.setPaidFromBank(nextPaidFromBank);
                form.setIncomeSourceId(null);
                form.setOtherIncomeSourceLabel(null);
                  setAllowMixedFunding(false);
                 if (nextPaidFromBank && mode === "add") {
                  form.setPaidById("");
                  form.setPayerIds([]);
                  form.setPayerIncomeSourceIds({});
                   form.setPayerAmounts({ __joint_bank__: form.amount });
                 } else if (nextPaidFromBank && mode === "edit" && form.payerIds.length === 0) {
                   form.setPaidById("");
                }
              }}
              className={`col-span-2 h-12 rounded-xl border text-base font-semibold transition-colors ${form.paidFromBank ? "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-700" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
            >
              🏦 Bank account
            </button>
            )}
            {!isPersonalBudget && (canManageExpenses ? (members ?? []) : (members ?? []).filter((member) => member.userId === user?.id)).map((m) => {
              const name = m.userName?.split(" ")[0] ?? "Member";
              const isMultiEnabled = mode === "add";
              const selected = isMultiEnabled ? form.payerIds.includes(m.userId) : form.paidById === m.userId;
              return (
                <button
                  key={m.userId} type="button"
                  disabled={getExpenseFundingControlState({
                    paidFromBank: form.paidFromBank,
                    hasPersonalFunding: form.payerIds.length > 0,
                    allowMixedFunding,
                  }).personalPayersDisabled}
                  onClick={() => {
                    form.setIncomeSourceId(null);
                    form.setOtherIncomeSourceLabel(null);
                    if (isMultiEnabled) {
                      if (!selected) {
                        form.setPayerAmounts((previous) => addFundingSourceWithRemainder({
                          total: Number(form.amount),
                          selectedSourceIds: form.payerIds,
                          newSourceId: m.userId,
                          amounts: previous,
                        }));
                      }
                      const next = form.payerIds.includes(m.userId)
                        ? form.payerIds.filter(id => id !== m.userId)
                        : [...form.payerIds, m.userId];
                      form.setPayerIds(next);
                      if (!next.includes(m.userId)) {
                        form.setPayerIncomeSourceIds(prev => {
                          const copy = { ...prev };
                          delete copy[m.userId];
                          return copy;
                        });
                      }
                      // Keep single paidById in sync for income sources
                      form.setPaidById(next.length === 1 ? next[0] : "");
                       if (form.paidFromBank) {
                         setAllowMixedFunding(next.length > 0);
                         if (next.length === 1) {
                           const bankAmount = Number(form.payerAmounts.__joint_bank__);
                           const remainder = getFundingRemainder(Number(form.amount), bankAmount);
                           form.setPayerAmounts((previous) => ({
                             ...previous,
                             [next[0]]: remainder > 0 ? String(remainder) : previous[next[0]] ?? "",
                           }));
                         }
                       }
                    } else {
                      form.setPaidById(m.userId);
                     if (!form.paidFromBank) form.setPaidFromBank(false);
                    }
                  }}
                  className={`h-12 rounded-xl border text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input text-foreground hover:bg-muted/40"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          {(form.paidFromBank || (mode === "edit" && editHasBankFunding)) && (
            <div className="mt-3 space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Bank account <span className="text-destructive">*</span>
              </label>
              <select
                data-testid={`select-expense-bank-account-${mode}`}
                value={form.accountId?.toString() ?? ""}
                onChange={(event) => form.setAccountId(event.target.value ? Number(event.target.value) : null)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="" disabled>{bankAccounts.length ? "Choose the account used..." : "No bank accounts available"}</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {bankAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">Create a bank account here to continue without leaving this expense.</p>
              )}
              {canManageExpenses && (isAddingBankAccount ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    autoFocus
                    value={newBankAccountName}
                    onChange={(event) => setNewBankAccountName(event.target.value)}
                    placeholder="e.g. M-Pesa wallet or KCB account"
                    className="h-10 bg-card"
                  />
                  <Input value={newBankAccountNumber} onChange={(event) => setNewBankAccountNumber(event.target.value)} placeholder="Account number (optional)" className="h-10 bg-card" />
                  <Input type="number" min="0" step="1" value={newBankOpeningBalance} onChange={(event) => setNewBankOpeningBalance(event.target.value)} placeholder="Opening balance (KES)" className="h-10 bg-card" />
                  <Button type="button" size="sm" className="h-10" onClick={() => void handleAddBankAccount(form)} disabled={createBankAccount.isPending}>
                    {createBankAccount.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add account
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => { setIsAddingBankAccount(false); setNewBankAccountName(""); setNewBankAccountNumber(""); setNewBankOpeningBalance(""); }}>Cancel</Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-10 border-dashed" onClick={() => setIsAddingBankAccount(true)}>
                  + New bank account
                </Button>
              ))}
              {mode === "add" && form.paidFromBank && form.payerIds.length === 0 && (
                <label className="block space-y-1.5 text-sm font-semibold text-foreground">
                  Type the amount from this account to confirm
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.payerAmounts.__joint_bank__ ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      form.setPayerAmounts((previous) => {
                        const next: Record<string, string> = { ...previous, __joint_bank__: value };
                        if (mode === "add" && form.payerIds.length === 1) {
                          const remainder = getFundingRemainder(Number(form.amount), Number(value));
                          next[form.payerIds[0]] = remainder > 0 ? String(remainder) : "";
                        }
                        return next;
                      });
                    }}
                    placeholder="KES 0"
                    className="h-10 bg-card"
                    required
                  />
                  <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                    Enter this manually to confirm how much should reduce the selected account.
                  </span>
                </label>
              )}
              {(() => {
                const bankAmount = Number(form.payerAmounts.__joint_bank__ || 0);
                const originalExpense = mode === "edit"
                  ? expenses?.find((expense) => expense.id === editingId)
                  : undefined;
                const originalBankAmount = originalExpense?.incomeSplits?.find((split) => split.fromBank)?.amount
                  ?? (originalExpense?.paidFromBank ? originalExpense.amount : 0);
                const projected = activeExpenseBankAccount && bankAmount > 0
                  ? activeExpenseBankAccount.balance + originalBankAmount - bankAmount
                  : null;
                return projected !== null && projected < 0 ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid={`expense-negative-bank-warning-${mode}`}>
                    <span className="flex items-center gap-1.5 font-semibold"><Flag className="h-3.5 w-3.5 fill-current" /> This will take the account below zero.</span>{" "}
                    Projected closing balance: {formatKes(projected)}. Jamvi will still save the expense.
                  </div>
                ) : null;
              })()}
              <p className="text-xs leading-relaxed text-muted-foreground">
                This uses money already recorded in the selected account as an opening balance or deposit.
              </p>
             </div>
           )}
          {getExpenseFundingControlState({
            paidFromBank: form.paidFromBank,
            hasPersonalFunding: form.payerIds.length > 0,
            allowMixedFunding,
          }).showBankOnlyExplanation && (
            <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <p>This expense reduces the selected bank-account balance. Direct payer and income-source fields are not needed.</p>
              {mode === "edit" && !allowMixedFunding && canManageExpenses && (
                <button
                  type="button"
                  className="mt-2 font-semibold underline underline-offset-2"
                  onClick={() => {
                    setAllowMixedFunding(true);
                    if (isPersonalBudget && user?.id) {
                      form.setPayerIds([user.id]);
                      form.setPaidById(user.id);
                    }
                  }}
                >
                  Add a direct-payment portion
                </button>
              )}
              {allowMixedFunding && (
                <p className="mt-2">
                  {isPersonalBudget ? "Choose your income source below." : "Choose one or more people above."} Only the bank portion reduces the selected account.
                </p>
              )}
            </div>
          )}
          {mode === "add" && form.payerIds.length === 0 && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">
              {isPersonalBudget ? "Choose an income source below." : canManageExpenses ? "Choose who paid, or select a bank account." : "Choose yourself to record this expense."}
            </p>
          )}
          {mode === "edit" && !form.paidById && !form.paidFromBank && (
            <p className="text-xs text-muted-foreground">Choose who paid before saving.</p>
          )}

           {/* Per-source split rows. A workspace bank account can be combined with direct funding. */}
           {mode === "add" && form.payerIds.length + (form.paidFromBank ? 1 : 0) > 1 && (() => {
            const total = Number(form.amount) || 0;
             const splitTotal = form.payerIds.reduce((s, id) => s + Number(form.payerAmounts[id] || 0), 0)
               + (form.paidFromBank ? Number(form.payerAmounts.__joint_bank__ || 0) : 0);
            const diff = total - splitTotal;
            return (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Type the primary amount{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ""}. Jamvi fills the remaining amount into the other selected source:
                </p>
                 {form.paidFromBank && (
                   <div className="flex items-center gap-3">
                     <span className="text-sm font-semibold w-20 shrink-0">
                       {bankAccounts.find((account) => account.id === form.accountId)?.name ?? "Bank account"}
                     </span>
                     <input type="number" placeholder="0" min="0" step="1"
                       value={form.payerAmounts.__joint_bank__ ?? ""}
                       onChange={e => {
                         const value = e.target.value;
                         form.setPayerAmounts((previous) => {
                           const next: Record<string, string> = { ...previous, __joint_bank__: value };
                           if (form.payerIds.length === 1) {
                             const remainder = getFundingRemainder(Number(form.amount), Number(value));
                             next[form.payerIds[0]] = remainder > 0 ? String(remainder) : "";
                           }
                           return next;
                         });
                       }}
                        required
                       className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                   </div>
                 )}
                 {form.payerIds.map(pid => {
                  const member = (members ?? []).find(m => m.userId === pid);
                  const name = member?.userName?.split(" ")[0] ?? "Member";
                   const sources = addPayerSources[pid] ?? [];
                  return (
                     <div key={pid} className="space-y-2 rounded-lg border border-border/60 p-2.5">
                       <div className="flex items-center gap-3">
                         <span className="text-sm font-semibold w-20 shrink-0">{name}</span>
                         <input
                           type="number"
                           placeholder="KES 0"
                           min="0"
                           step="1"
                           value={form.payerAmounts[pid] ?? ""}
                           onChange={e => {
                             const value = e.target.value;
                             form.setPayerAmounts((previous) => {
                               const next = { ...previous, [pid]: value };
                               if (form.paidFromBank && form.payerIds.length === 1) {
                                 const remainder = getFundingRemainder(Number(form.amount), Number(value));
                                 next.__joint_bank__ = remainder > 0 ? String(remainder) : "";
                               }
                               return next;
                             });
                           }}
                            required
                           className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                         />
                       </div>
                       <select
                         value={form.payerIncomeSourceIds[pid]?.toString() ?? ""}
                         onChange={(event) => form.setPayerIncomeSourceIds(prev => ({
                           ...prev,
                           [pid]: event.target.value ? Number(event.target.value) : null,
                         }))}
                         className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                         aria-label={`Income source for ${name}`}
                       >
                         <option value="" disabled>Select {name}'s income source...</option>
                         {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                       </select>
                       {sources.length === 0 && (
                         <p className="text-xs text-amber-600 dark:text-amber-400">
                           {name} needs a saved income source before this portion can be recorded.
                         </p>
                       )}
                    </div>
                  );
                })}
                {Math.abs(diff) >= 1 && (
                  <p className={`text-xs font-medium ${diff > 0 ? "text-amber-500" : "text-destructive"}`}>
                    {diff > 0 ? `KES ${diff.toLocaleString()} still unassigned` : `Over by KES ${Math.abs(diff).toLocaleString()}`}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

          {/* Financed by — only shown inside the paid-directly path */}
         {getExpenseFundingControlState({
           paidFromBank: form.paidFromBank,
           hasPersonalFunding: mode === "add" ? form.payerIds.length === 1 : !!form.paidById,
           allowMixedFunding,
         }).showPersonalIncomeSources && (
           <div className="md:col-span-2 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
             <div>
               <p className="text-sm font-semibold text-foreground">Paid directly</p>
               <p className="mt-1 text-xs text-muted-foreground">This expense does not reduce a bank-account balance.</p>
             </div>
             <label className="text-sm font-semibold text-foreground">
               Financed by <span className="text-destructive">*</span>
             </label>
            <select
              disabled={mode === "edit" && editHasMultipleFundingSplits}
              className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
               value={mode === "add" && isPersonalBudget ? "" : (form.otherIncomeSourceLabel !== null ? "legacy" : (form.incomeSourceId?.toString() ?? ""))}
              onChange={e => {
                const value = e.target.value;
                 const sourceId = value ? Number(value) : null;
                 form.setIncomeSourceId(sourceId);
                form.setOtherIncomeSourceLabel(null);
                 if (mode === "add" && isPersonalBudget && sourceId && !addDirectSourceIds.includes(sourceId)) {
                   const key = String(sourceId);
                   setAddDirectSourceAmounts((previous) => addFundingSourceWithRemainder({
                     total: Number(form.amount),
                     selectedSourceIds: addDirectSourceIds.map(String),
                     newSourceId: key,
                     amounts: previous,
                   }));
                   setAddDirectSourceIds((previous) => [...previous, sourceId]);
                 }
                if (mode === "add" && form.payerIds[0]) {
                  form.setPayerIncomeSourceIds(prev => ({
                    ...prev,
                    [form.payerIds[0]]: value ? Number(value) : null,
                  }));
                }
              }}
              required
            >
               <option value="" disabled>{mode === "add" && isPersonalBudget && addDirectSourceIds.length > 0 ? "Add another income source..." : "Select an income source..."}</option>
              {mode === "edit" && form.otherIncomeSourceLabel !== null && (
                <option value="legacy" disabled>
                  Historical source: {form.otherIncomeSourceLabel || "choose a saved source"}
                </option>
              )}
               {(mode === "add" ? addFormSources : editFormSources)?.map(src => (
                 <option key={src.id} value={src.id} disabled={mode === "add" && isPersonalBudget && addDirectSourceIds.includes(src.id)}>
                   {src.name}{mode === "add" && isPersonalBudget && addDirectSourceIds.includes(src.id) ? " — added" : ""}
                 </option>
              ))}
            </select>
              {mode === "add" && isPersonalBudget && form.payerIds.length === 1 && !form.paidFromBank && addDirectSourceIds.length > 0 && (
                <div className="space-y-2" data-testid="expense-direct-funding-portions">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Enter each portion. Add another income source as many times as needed until the expense is fully funded.
                  </p>
                  {addDirectSourceIds.map((sourceId) => {
                    const source = addFormSources?.find((item) => item.id === sourceId);
                    return (
                      <div key={sourceId} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{source?.name ?? "Income source"}</span>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={addDirectSourceAmounts[String(sourceId)] ?? ""}
                          onChange={(event) => setAddDirectSourceAmounts((previous) => ({
                            ...previous,
                            [String(sourceId)]: event.target.value,
                          }))}
                          placeholder="KES 0"
                          className="h-10 w-36 bg-card"
                          required
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAddDirectSourceIds((previous) => previous.filter((id) => id !== sourceId));
                            setAddDirectSourceAmounts((previous) => {
                              const next = { ...previous };
                              delete next[String(sourceId)];
                              return next;
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                  {(() => {
                    const total = Number(form.amount) || 0;
                    const assigned = addDirectSourceIds.reduce(
                      (sum, sourceId) => sum + (Number(addDirectSourceAmounts[String(sourceId)]) || 0),
                      0,
                    );
                    const difference = total - assigned;
                    return total > 0 ? (
                      <div
                        role="status"
                        data-testid="expense-funding-remainder"
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          difference > 0
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            : difference < 0
                              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        }`}
                      >
                        {difference > 0
                          ? `${formatKes(difference)} remaining — choose another income source to continue.`
                          : difference < 0
                            ? `Overfunded by ${formatKes(Math.abs(difference))}.`
                            : "Fully funded."}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              {mode === "add" && !isPersonalBudget && form.payerIds.length === 1 && !form.paidFromBank && form.incomeSourceId && (
               <label className="block space-y-1.5 text-sm font-semibold text-foreground">
                  Type the amount from this source to confirm
                 <Input
                   type="number"
                   min="1"
                   step="1"
                   value={form.payerAmounts[form.payerIds[0]] ?? ""}
                   onChange={(event) => form.setPayerAmounts((previous) => ({ ...previous, [form.payerIds[0]]: event.target.value }))}
                   placeholder="KES 0"
                   className="h-10 bg-card"
                    required
                 />
                  <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                   Type the amount from this source to confirm. If it is less, keep adding funding sources until the expense is fully funded.
                  </span>
               </label>
             )}
            {mode === "edit" && editHasMultipleFundingSplits && (
              <p className="text-xs text-muted-foreground">
                This expense has multiple funding portions. They’ll be preserved while you edit the expense details here.
              </p>
            )}
            {mode === "edit" && form.otherIncomeSourceLabel !== null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This historical label is not a saved income source. Choose a saved source before saving.
              </p>
            )}
            {mode === "add" && (
              <div className="flex flex-wrap gap-2">
                {addNewSource ? (
                  <div className="flex items-center gap-1">
                    <Input autoFocus placeholder="Source name" value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
                      className="h-9 text-sm w-36 bg-card" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddNewSource(form.payerIds[0] ?? form.paidById); } }} />
                    <Button type="button" size="sm" className="h-9" onClick={() => handleAddNewSource(form.payerIds[0] ?? form.paidById)}>Add</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => { setAddNewSource(false); setNewSourceName(""); }}>✕</Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddNewSource(true)}
                    className="px-3 h-9 rounded-lg text-sm border border-dashed border-input text-muted-foreground hover:bg-muted/50 transition-colors">
                    + New source
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {canManageExpenses && (
        <div className="md:col-span-2 flex items-center gap-3 bg-card rounded-xl p-4 border border-border/50">
          <input type="checkbox" id={`isRecurring-${title}`} checked={form.isRecurring} onChange={e => {
            if (!e.target.checked) {
              form.setIsRecurring(false);
              form.setRecurringMonthlyBudget("");
              return;
            }
            if (window.confirm("Make this a recurring expense? Jamvi will take you to Budget to ask for the average monthly amount.")) {
              openRecurringBudgetSetup(form, mode);
              if (form.category.trim().toLocaleLowerCase() === "other") setSaveOtherAsCategory(true);
            }
          }}
            className="w-5 h-5 accent-primary rounded" />
          <div>
            <label htmlFor={`isRecurring-${title}`} className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" /> Recurring expense
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">Mark to get a reminder to apply it next month (rent, fees, salaries…)</p>
          </div>
        </div>
        )}
        {canManageExpenses && form.isRecurring && (
          <label className="md:col-span-2 block space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-foreground">
            Monthly budget (KES) <span className="text-destructive">*</span>
            <Input type="number" min="1" step="1" value={form.recurringMonthlyBudget} onChange={(event) => form.setRecurringMonthlyBudget(event.target.value)} placeholder="e.g. 15000" required className="h-12 bg-card" data-testid="recurring-monthly-budget" />
            <span className="block text-xs font-normal text-muted-foreground">This becomes the recurring monthly budget for the selected category.</span>
          </label>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="h-12 w-full px-6 sm:w-auto">Cancel</Button>
        <Button type="submit" disabled={isPending} className="h-12 w-full px-8 sm:w-auto">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5 pb-8 sm:space-y-8 sm:pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track where the money is going.</p>
        </div>
        <div className="flex w-full items-center justify-between gap-1 rounded-xl border border-input bg-card p-1 text-foreground shadow-sm sm:w-auto sm:justify-start">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-10 w-10 rounded-lg text-foreground/70 hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-1.5 px-1">
            <Calendar className="w-4 h-4 shrink-0 text-primary" />
            <select
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="cursor-pointer border-none bg-transparent font-display text-sm font-semibold text-foreground outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m = d.getMonth() + 1;
                const y = d.getFullYear();
                return (
                  <option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2, '0')}`}>
                    {formatMonthYear(m, y)}
                  </option>
                );
              })}
            </select>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-10 w-10 rounded-lg text-foreground/70 hover:bg-muted hover:text-foreground"
            disabled={month === now.getMonth() + 1 && year === now.getFullYear()}>
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Budget Status */}
      {summary && (
        <Card className="border-none shadow-md overflow-hidden">
          <CardContent className="p-4 space-y-3 sm:p-5 sm:space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget Status — {formatMonthYear(month, year)}</p>

            {/* Expenses vs Budget */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <TrendingDown className="w-4 h-4 text-destructive" /> Expenses
                </span>
                <span className="text-sm font-mono">
                  <span className={summary.totalSpent > summary.totalBudget ? "text-destructive font-bold" : "text-foreground"}>
                    {formatKes(summary.totalSpent)}
                  </span>
                  <span className="text-muted-foreground"> / {formatKes(summary.totalBudget)}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${summary.totalSpent > summary.totalBudget ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (summary.totalSpent / summary.totalBudget) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {summary.totalSpent > summary.totalBudget
                  ? `Over budget by ${formatKes(summary.totalSpent - summary.totalBudget)}`
                  : `${formatKes(summary.remaining)} remaining`}
              </p>
            </div>

            {/* Income vs Target */}
            <div className="space-y-2 pt-1 border-t border-border/40">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingUp className="w-4 h-4 text-success" /> Income
              </span>
              {((summary as any).memberContributions ?? [] as Array<{name: string; contributed: number; target: number | null}>).map(({ name, contributed, target }: {name: string; contributed: number; target: number | null}) => (
                <div key={name} className="space-y-1">
                  <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:justify-between sm:gap-2">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="font-mono">
                      <span className={target != null && contributed >= target ? "font-bold text-success" : "text-foreground"}>{formatKes(contributed)}</span>
                      {target != null && <span className="text-muted-foreground"> / {formatKes(target)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${target != null && contributed >= target ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${Math.min(100, target && target > 0 ? (contributed / target) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Individual ledgers */}
            {members && members.length > 0 && expenses && (
              <div className="space-y-3 pt-1 border-t border-border/40">
                <span className="text-sm font-semibold text-foreground">Individual Ledgers</span>
                {((summary as any).memberContributions ?? [] as Array<{userId: string; name: string; contributed: number; target: number | null}>).map(({ userId, name, contributed, target }: {userId: string; name: string; contributed: number; target: number | null}) => {
                  const myExpenses = expenses.filter(e => e.paidById === userId);
                  const spent = myExpenses.reduce((s, e) => s + e.amount, 0);
                  const net = contributed - spent;
                  const overSpent = spent > contributed;
                  return (
                    <button
                      key={userId}
                      type="button"
                      onClick={() => updateLedgerFilter({ payerId: userId })}
                      className="w-full rounded-xl border border-border/50 bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                      data-testid={`expense-ledger-summary-member-${userId}`}
                    >
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Income</p>
                          <p className={`font-mono text-sm font-bold ${target != null && contributed >= target ? "text-success" : "text-warning"}`}>
                            {formatKes(contributed)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {target == null ? "No target" : `of ${formatKes(target)}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
                          <p className="text-sm font-bold font-mono text-foreground">{formatKes(spent)}</p>
                          <p className="text-xs text-muted-foreground">{myExpenses.length} items</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Net</p>
                          <p className={`font-mono text-sm font-bold ${overSpent ? "text-destructive" : "text-success"}`}>
                            {overSpent ? "-" : "+"}{formatKes(Math.abs(net))}
                          </p>
                          <p className="text-xs text-muted-foreground">{overSpent ? "deficit" : "surplus"}</p>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overSpent ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, contributed > 0 ? (spent / contributed) * 100 : 0)}%` }}
                        />
                      </div>
                      <p className="text-right text-xs font-semibold text-primary">Open this ledger →</p>
                    </button>
                  );
                })}
                {/* Joint / unattributed expenses */}
                {(() => {
                  const jointExpenses = expenses.filter(e => !e.paidByName);
                  if (jointExpenses.length === 0) return null;
                  const jointTotal = jointExpenses.reduce((s, e) => s + e.amount, 0);
                  return (
                    <button
                      type="button"
                      onClick={() => updateLedgerFilter({ payerId: "__joint__" })}
                      className="w-full rounded-xl border border-border/50 bg-muted/20 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="expense-ledger-summary-joint"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Joint / Unattributed</p>
                        <p className="text-sm font-bold font-mono text-foreground">{formatKes(jointTotal)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{jointExpenses.length} item{jointExpenses.length !== 1 ? "s" : ""} recorded without a payer</p>
                      <p className="mt-2 text-right text-xs font-semibold text-primary">Open this ledger →</p>
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Category budget vs actual */}
            {breakdown && breakdown.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <span className="text-sm font-semibold text-foreground">By Category</span>
                <div className="space-y-2">
                  {breakdown.map((cat) => {
                    const over = cat.remaining < 0;
                    const pct = Math.min(100, cat.percentUsed);
                    return (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => updateLedgerFilter({ category: cat.category })}
                        className="w-full space-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`expense-ledger-summary-category-${cat.category}`}
                      >
                      <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <span className={`font-medium ${over ? "text-destructive" : "text-foreground"}`}>{cat.category}</span>
                          <span className="font-mono text-muted-foreground">
                            <span className={over ? "text-destructive font-bold" : "text-foreground"}>{formatKes(cat.spentAmount)}</span>
                            {" / "}{formatKes(cat.budgetAmount)}
                            <span className={`ml-1.5 ${over ? "text-destructive" : "text-muted-foreground"}`}>
                              ({over ? `+${cat.percentUsed - 100}%` : `${cat.percentUsed}%`})
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${over ? "bg-destructive" : pct >= 80 ? "bg-amber-400" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-right text-[11px] font-semibold text-primary">Open ledger →</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category hint when form is open */}
            {(isAdding || editingId !== null) && addForm.category && breakdown && (() => {
              const cat = breakdown.find(b => b.category === addForm.category);
              if (!cat) return null;
              const over = cat.remaining < 0;
              return (
                <div className={`rounded-xl px-4 py-3 text-sm border ${over ? "bg-destructive/10 border-destructive/20" : "bg-primary/10 border-primary/20"}`}>
                  <span className="font-semibold">{cat.category}:</span>{" "}
                  {over
                    ? <span className="text-destructive">over budget by {formatKes(Math.abs(cat.remaining))}</span>
                    : <span>{formatKes(cat.remaining)} remaining of {formatKes(cat.budgetAmount)}</span>}
                  {" "}({cat.percentUsed}% used)
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Priority Tier Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">Priority Tiers</h2>
            <p className="text-sm text-muted-foreground mt-0.5">How spending stacks up against priority — essentials first.</p>
          </div>
          {EXPENSE_TIERS.map(({ tier, label, bar, badge, categories }) => {
            const tierCats = breakdown.filter(b => categories.some(c => b.category.toLowerCase() === c.toLowerCase()));
            const budget = tierCats.reduce((s, c) => s + c.budgetAmount, 0);
            const spent = tierCats.reduce((s, c) => s + c.spentAmount, 0);
            const remaining = budget - spent;
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const over = remaining < 0;
            return (
              <Card key={tier} className="border-none shadow-sm overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>T{tier}</span>
                      <span className="font-semibold text-foreground text-sm">{label}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-mono font-bold ${over ? "text-destructive" : "text-foreground"}`}>
                        {formatKes(spent)}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono"> / {formatKes(budget)}</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span className="min-w-0 break-words">{Math.round(pct)}% used · {categories.join(", ")}</span>
                    <span className={over ? "text-destructive font-semibold" : ""}>
                      {over ? `Over by ${formatKes(Math.abs(remaining))}` : `${formatKes(remaining)} left`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {sharedTransactionsLocked && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          Invite one more member before recording shared expenses. You can still manage categories, invitations, and bank activity.
        </div>
      )}
      {/* Recurring banner */}
      {showRecurringBanner && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Repeat className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm font-medium text-foreground">
              {recurringFromPrev.length} recurring expense{recurringFromPrev.length > 1 ? "s" : ""} from last month not yet added this month.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleApplyRecurring} disabled={applyRecurring.isPending || sharedTransactionsLocked} className="shrink-0">
            {applyRecurring.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Apply
          </Button>
        </div>
      )}

      {/* Add expense form */}
      {isAdding ? (
        <Card className="border-none shadow-md bg-accent/20">
          <CardContent className="p-4 sm:p-6">
            {expenseFormFields(addForm, createExpense.isPending || sharedTransactionsLocked, handleCreate, resetAdd, "Record New Expense", "Save Expense", "add")}
          </CardContent>
        </Card>
      ) : (
        <Button disabled={sharedTransactionsLocked} onClick={() => { setIsAdding(true); setEditingId(null); }} className="h-12 px-6 rounded-xl shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> Record Expense
        </Button>
      )}

      {/* Expense list */}
      {(ledgerFilter.payerId || ledgerFilter.category) && (
        <div id="expense-ledger" className="scroll-mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Filtered expense ledger</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{ledgerFilterLabel}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 text-primary sm:mt-0"
            onClick={() => updateLedgerFilter({})}
          >
            Show all expenses
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
      ) : !visibleExpenses || visibleExpenses.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {ledgerFilter.payerId || ledgerFilter.category
              ? "No expenses match this ledger"
              : `No expenses for ${formatMonthYear(month, year)}`}
          </p>
          <p className="text-sm mt-1">
            {ledgerFilter.payerId || ledgerFilter.category
              ? "Show all expenses or choose another summary."
              : 'Click "Record Expense" to add the first one.'}
          </p>
        </div>
      ) : (
        <Card id={ledgerFilter.payerId || ledgerFilter.category ? undefined : "expense-ledger"} className="scroll-mt-6 border-none shadow-md overflow-hidden">
          <div className="divide-y divide-border/50">
            {visibleExpenses.map((expense) => (
              <div key={expense.id}>
                <div className="p-4 hover:bg-muted/20 transition-colors sm:flex sm:items-start sm:justify-between sm:gap-4 sm:p-5">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">{expense.category.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{expense.description}</p>
                          {expense.isRecurring && (
                            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                              <Repeat className="w-3 h-3" /> Recurring
                            </span>
                          )}
                        </div>
                        {expense.notes && (
                          <p className="text-sm text-muted-foreground mt-0.5 italic">"{expense.notes}"</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                           <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium">{expense.category}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{expense.paidByName ?? `🏦 ${bankAccounts.find((account) => account.id === expense.accountId)?.name ?? "Bank account"}`}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{formatDate(expense.date)}</span>
                        </p>
                         {expense.categoryAllocations && expense.categoryAllocations.length > 1 && (
                           <p className="mt-1 text-xs text-muted-foreground" data-testid={`expense-category-breakdown-${expense.id}`}>
                             Categories: {expense.categoryAllocations.map((allocation) => `${allocation.category}: ${formatKes(allocation.amount)}`).join(" · ")}
                           </p>
                         )}
                        {expense.incomeSplits && expense.incomeSplits.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Funded by {expense.incomeSplits.map((split) =>
                              `${split.fromBank ? (bankAccounts.find((account) => account.id === split.accountId)?.name ?? "Bank account") : split.label}: ${formatKes(split.amount)}`
                            ).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3 sm:mt-0 sm:justify-end sm:border-t-0 sm:pt-0">
                      <p className="font-display font-bold text-lg text-foreground">{formatKes(expense.amount)}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {canEditExpense(expense as Expense) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() => startEdit(expense as Expense)}
                          aria-label={`Edit ${expense.description}`}
                        >
                          <Pencil className="mr-1.5 w-4 h-4" /> Edit
                        </Button>
                        )}
                        {canManageExpenses && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 px-3"
                          onClick={() => setDeleteTarget(expense as Expense)}
                          aria-label={`Remove ${expense.description}`}
                        >
                          <Trash2 className="mr-1.5 w-4 h-4" /> Remove
                        </Button>
                        )}
                      </div>
                    </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
            <span className="text-sm text-muted-foreground">{visibleExpenses.length} expense{visibleExpenses.length !== 1 ? "s" : ""}</span>
            <span className="font-display font-bold text-primary">{formatKes(visibleExpenses.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
        </Card>
      )}
      <Dialog open={editingId !== null} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Edit Expense</DialogTitle>
          {editingId !== null && (() => {
            const expense = expenses?.find((item) => item.id === editingId);
            if (!expense) return null;
            return expenseFormFields(
              editForm,
              updateExpense.isPending,
              (e) => handleUpdate(e, expense.id),
              cancelEdit,
              "Edit Expense",
              "Save Changes",
              "edit",
            );
          })()}
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.description}" and its effect on balances, reports, and activity will be removed. This cannot be undone.`
                : "This expense will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep expense</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteExpense.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void handleDelete(deleteTarget.id);
              }}
            >
              {deleteExpense.isPending ? "Removing…" : "Remove expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
