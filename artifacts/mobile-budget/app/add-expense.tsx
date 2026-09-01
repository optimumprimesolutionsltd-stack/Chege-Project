und, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              </>
            ) : null}
            <View style={styles.categoryCreateActions}>
              <Pressable
                onPress={() => void handleCreateCategory()}
                disabled={createCategory.isPending}
                style={[styles.categoryCreateSave, { backgroundColor: colors.primary, opacity: createCategory.isPending ? 0.55 : 1 }]}
              >
                {createCategory.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.categoryCreateSaveText}>{newCategoryAddToBudget && canManageCategories ? 'Add to budget' : 'Use without budget'}</Text>}
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsCreatingCategory(false);
                  setNewCategoryName('');
                  setNewCategoryBudget('');
                  setNewCategoryRecurring(true);
                  setNewCategoryPriority('3');
                  setNewCategoryAddToBudget(false);
                  setCategory('');
                }}
                disabled={createCategory.isPending}
                style={styles.categoryCreateCancel}
              >
                <Text style={[styles.categoryCreateCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {isAdvanced && <Pressable
          onPress={() => chooseCategory('Other')}
          accessibilityRole="button"
          accessibilityLabel={hasOneOffAllocation ? "Remove one-off spending category" : "Add one-off spending category"}
          accessibilityState={{ selected: hasOneOffAllocation }}
          testID="one-off-spending-category"
          style={[
            styles.oneOffCategoryOption,
            {
              backgroundColor: hasOneOffAllocation ? colors.primary + '18' : colors.muted,
              borderColor: hasOneOffAllocation ? colors.primary : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="help-circle" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.oneOffCategoryTitle, { color: colors.foreground }]}>
              {hasOneOffAllocation ? 'Remove One-off spending' : 'One-off spending'}
            </Text>
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Use this as the last category when part of the expense does not fit any listed category.
            </Text>
          </View>
        </Pressable>}
        {isAdvanced && categoryAllocations.some((allocation) => allocation.category.trim()) && (
          <Text
            accessibilityLiveRegion="polite"
            testID="category-allocation-status-mobile-end"
             style={[styles.allocationStatus, { color: (() => {
               const total = displayedCategoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
               const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
               const difference = expenseTotal - total;
               return difference === 0 && expenseTotal > 0
                 ? colors.primary
                 : difference < 0
                   ? colors.destructive
                   : colors.mutedForeground;
             })() }]}
          >
            {(() => {
              const total = displayedCategoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
              const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
              const difference = expenseTotal - total;
              return difference === 0 && expenseTotal > 0
                ? 'Allocated exactly.'
                : difference > 0
                  ? `KES ${difference.toLocaleString()} remaining to allocate`
                  : `KES ${Math.abs(difference).toLocaleString()} over allocated`;
            })()}
          </Text>
        )}
        {/* Running balance for selected category */}
        {isAdvanced && category ? (() => {
          const preview = categoryBalancePreviews.find(
            (item) => item.category.toLocaleLowerCase() === category.toLocaleLowerCase(),
          );
          if (!preview) return null;
          return (
            <View style={[styles.balancePill, {
              backgroundColor: preview.isOverBudget ? colors.destructive + '18' : colors.primary + '18',
              borderColor: preview.isOverBudget ? colors.destructive + '55' : colors.primary + '55',
            }]}>
              <Feather name="bar-chart-2" size={12} color={preview.isOverBudget ? colors.destructive : colors.primary} />
              <Text style={[styles.balancePillText, { color: preview.isOverBudget ? colors.destructive : colors.primary }]}>
                Spent before this expense: KES {preview.spentBeforeExpense.toLocaleString()}
                {preview.isOverBudget
                  ? `  ·  KES ${preview.overBy.toLocaleString()} over budget after this expense`
                  : `  ·  KES ${preview.remaining.toLocaleString()} left after this expense`}
              </Text>
            </View>
          );
        })() : null}
         {/* Description */}
           <>
             <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
             <TextInput
               style={[
                 styles.textInput,
                 {
                   backgroundColor: colors.muted,
                   borderColor: colors.border,
                   color: colors.foreground,
                   borderRadius: colors.radius,
                 },
               ]}
               placeholder="What was this for?"
               placeholderTextColor={colors.mutedForeground}
               value={description}
               onChangeText={setDescription}
               returnKeyType="next"
             />
           </>

          {/* Notes */}
            {isAdvanced && <>
             <Text style={[styles.label, { color: colors.mutedForeground }]}>{hasOneOffAllocation ? 'NOTES (required for one-off spending)' : 'NOTES (optional)'}</Text>
             <TextInput
               style={[
                 styles.textInput,
                 styles.notesInput,
                 {
                   backgroundColor: colors.muted,
                   borderColor: colors.border,
                   color: colors.foreground,
                   borderRadius: colors.radius,
                 },
               ]}
               placeholder={hasOneOffAllocation ? 'Explain what this one-off expense was for' : 'Any extra details…'}
               placeholderTextColor={colors.mutedForeground}
               value={notes}
               onChangeText={setNotes}
               accessibilityLabel="Notes"
               multiline
               numberOfLines={3}
               textAlignVertical="top"
             />
            </>}

          {!isAdvanced && (
            <View testID="normal-expense-summary" style={[styles.normalSummary, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '45', borderRadius: colors.radius }]}>
              <Feather name="check-circle" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.normalSummaryTitle, { color: colors.foreground }]}>Saved as today’s expense</Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 2 }]}>
                  {category.trim() ? `Today · all of this expense goes to ${category.trim()}` : 'Today · choose a category to allocate the full expense'}
                  {normalIncomeSource ? ` · paid from ${normalIncomeSource.name}` : ''}
                </Text>
                {!sourcesLoading && !normalIncomeSource && (
                  <>
                    <Text style={[styles.normalBlockerText, { color: colors.destructive }]}>A saved income source is required before this expense can be saved.</Text>
                    <Pressable onPress={() => setIsAdvanced(true)} testID="normal-income-source-blocker">
                      <Text style={[styles.normalAdvancedLink, { color: colors.primary }]}>Switch to Advanced to add an income source</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          )}

        {/* Who paid */}
        {isAdvanced && (canManageShared || selectablePayers.length > 0) && (
          <>
             <View style={[styles.stageLabel, { backgroundColor: '#f59e0b1A', borderColor: '#f59e0b80', borderRadius: colors.radius }]}>
               <Text style={[styles.stageLabelText, { color: '#f59e0b' }]}>
                 FUNDING OPTIONS <Text style={{ color: '#ef4444' }}>*</Text>
               </Text>
             </View>
              {(categoryBalancePreviews.length > 0 || hasBudgetedCategorySelection) && (
               <View
                 style={[styles.categoryBalancePreview, {
                   backgroundColor: colors.primary + '0A',
                   borderColor: colors.primary + '45',
                   borderRadius: colors.radius,
                 }]}
                 accessibilityLiveRegion="polite"
                 testID="expense-category-balance-preview-mobile"
               >
                 <Text style={[styles.categoryBalancePreviewTitle, { color: colors.primary }]}>
                   CATEGORY BALANCES AFTER THIS EXPENSE
                 </Text>
                  {categoryBalancePreviews.length > 0 ? (
                    <>
                      {categoryBalancePreviews.map((preview) => (
                        <View key={preview.category} style={styles.categoryBalancePreviewRow}>
                          <Text style={[styles.categoryBalancePreviewCategory, { color: colors.foreground }]}>
                            {preview.category}
                          </Text>
                          <Text style={[styles.categoryBalancePreviewAmount, {
                            color: preview.isOverBudget ? colors.destructive : colors.primary,
                          }]}>
                            {preview.isOverBudget
                              ? `KES ${preview.overBy.toLocaleString()} over budget`
                              : `KES ${preview.remaining.toLocaleString()} left of KES ${preview.budgetAmount.toLocaleString()}`}
                          </Text>
                        </View>
                      ))}
                      <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                        These running balances use each category amount entered above.
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                      Enter the amount covered by each category above to see its running balance here.
                    </Text>
                  )}
               </View>
             )}
            <View style={styles.paidByRow}>
              {/* Joint-bank spending is restricted to group managers. */}
              {canManageShared && <Pressable
                onPress={() => {
                  if (isEditMode) setFundingDirty(true);
                  if (paidFromBank) {
                    setPaidFromBank(false);
                    setAllowMixedFunding(false);
                  } else {
                    const directTotal = selectedSources.length > 0
                      ? selectedSources.reduce((sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0), 0)
                      : payerIds.reduce((sum, payerId) => sum + (parseFloat(payerAmounts[payerId] || '0') || 0), 0);
                    const hasDirectSelection = selectedSources.length > 0 || directTotal > 0;
                    setPaidFromBank(true);
                    setAllowMixedFunding(hasDirectSelection);
                    if (hasDirectSelection) {
                      setPayerAmounts((previous) => ({
                        ...previous,
                        __joint_bank__: '',
                      }));
                    } else {
                      setPayerIds([]);
                      setSelectedSources([]);
                      setSplitAmounts({});
                      setPayerIncomeSourceIds({});
                      setPayerAmounts({ __joint_bank__: '' });
                    }
                  }
                }}
                style={[styles.paidByPill, {
                  backgroundColor: paidFromBank ? 'rgba(56,189,248,0.15)' : colors.muted,
                  borderColor: paidFromBank ? '#38bdf8' : colors.border,
                  borderRadius: colors.radius,
                }]}
                accessibilityRole="button"
                accessibilityLabel="Use a bank account to fund this expense"
                testID="expense-bank-funding-option"
              >
                <Feather name="credit-card" size={14} color={paidFromBank ? '#38bdf8' : colors.mutedForeground} />
                <Text style={[styles.paidByText, { color: paidFromBank ? '#38bdf8' : colors.foreground }]}>
                  Bank account
                </Text>
              </Pressable>}
              {selectablePayers.map((m) => {
                const selected = payerIds.includes(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    disabled={getExpenseFundingControlState({
                      paidFromBank,
                      hasPersonalFunding: payerIds.length > 0,
                      allowMixedFunding,
                    }).personalPayersDisabled}
                    onPress={() => {
                      if (!canManageShared) return;
                      if (isEditMode) setFundingDirty(true);
                      setPayerIds(prev => {
                        if (!prev.includes(m.userId)) {
                           setPayerAmounts((previous) => ({
                             ...previous,
                             [m.userId]: '',
                           }));
                        }
                        const next = prev.includes(m.userId)
                          ? prev.filter(id => id !== m.userId)
                          : [...prev, m.userId];
                        if (!next.includes(m.userId)) {
                          setPayerIncomeSourceIds(sourceIds => {
                            const copy = { ...sourceIds };
                            delete copy[m.userId];
                            return copy;
                          });
                        }
                         if (paidFromBank) setAllowMixedFunding(next.length > 0);
                        return next;
                      });
                    }}
                    style={[
                      styles.paidByPill,
                      {
                        backgroundColor: selected ? colors.primary : colors.muted,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius,
                        opacity: paidFromBank && payerIds.length === 0 && !allowMixedFunding ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name="user"
                      size={14}
                      color={selected ? '#fff' : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.paidByText,
                        { color: selected ? '#fff' : colors.foreground },
                      ]}
                    >
                      {m.userName?.split(' ')[0] ?? 'Member'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {paidFromBank && (
              <View style={{ marginTop: 10, gap: 7 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>BANK ACCOUNT <Text style={{ color: '#ef4444' }}>*</Text></Text>
                <View style={styles.paidByRow}>
                  {bankAccounts.map((account) => {
                    const selected = selectedBankAccountId === account.id;
                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => { setSelectedBankAccountId(account.id); if (isEditMode) setFundingDirty(true); }}
                        style={[styles.paidByPill, { backgroundColor: selected ? 'rgba(56,189,248,0.15)' : colors.muted, borderColor: selected ? '#38bdf8' : colors.border, borderRadius: colors.radius }]}
                        testID={`expense-bank-account-${account.id}`}
                      >
                        <Feather name="credit-card" size={14} color={selected ? '#38bdf8' : colors.mutedForeground} />
                        <Text style={[styles.paidByText, { color: selected ? '#38bdf8' : colors.foreground }]}>{account.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {payerIds.length === 0 && selectedBankAccountId && (
                  <View style={styles.singleFundingAmount}>
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM</Text>
                    <TextInput
                      style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      placeholder="KES 0"
                      placeholderTextColor={colors.mutedForeground}
                      value={payerAmounts.__joint_bank__ || ''}
                      onChangeText={(value) => setPayerAmounts((previous) => ({ ...previous, __joint_bank__: value }))}
                      testID="expense-bank-amount"
                    />
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Enter this manually to confirm how much should reduce the selected account.
                    </Text>
                  </View>
                )}
                 {bankAccounts.length === 0 && (
                   <Text style={[styles.hintText, { color: colors.foreground }]}>
                     No bank account yet. Create one below and Jamvi will select it for this expense automatically.
                   </Text>
                 )}
                {canManageShared && (isAddingBankAccount ? (
                  <View style={styles.inlineAccountRow}>
                    <TextInput
                      autoFocus
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="e.g. M-Pesa wallet or KCB account"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountName}
                      onChangeText={setNewBankAccountName}
                      editable={!createBankAccount.isPending}
                       returnKeyType="next"
                       testID="new-bank-account-name-mobile"
                    />
                    <TextInput
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Account number (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountNumber}
                      onChangeText={setNewBankAccountNumber}
                       returnKeyType="next"
                       testID="new-bank-account-number-mobile"
                    />
                    <TextInput
                       style={[styles.newSourceInput, styles.inlineAccountInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                       placeholder="Opening balance (KES)"
                      keyboardType="number-pad"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankOpeningBalance}
                      onChangeText={setNewBankOpeningBalance}
                       testID="new-bank-opening-balance-mobile"
                    />
                     <View style={styles.inlineAccountActions}>
                       <Pressable
                         accessibilityRole="button"
                         accessibilityLabel="Add bank account"
                         onPress={() => void handleCreateBankAccount()}
                         disabled={createBankAccount.isPending}
                         style={[styles.addSourceButton, styles.inlineAccountSubmit, { backgroundColor: colors.primary, opacity: createBankAccount.isPending ? 0.6 : 1 }]}
                         testID="add-bank-account-mobile"
                       >
                         {createBankAccount.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Add bank account</Text>}
                       </Pressable>
                       <Pressable
                         accessibilityRole="button"
                         onPress={() => { setIsAddingBankAccount(false); setNewBankAccountName(''); setNewBankAccountNumber(''); setNewBankOpeningBalance(''); }}
                         style={styles.inlineAccountCancel}
                       >
                         <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                       </Pressable>
                     </View>
                  </View>
                ) : (
                   <Pressable onPress={() => setIsAddingBankAccount(true)} style={styles.addSourceLink} testID="create-bank-account-inline-mobile">
                    <Feather name="plus-circle" size={14} color={colors.primary} />
                     <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>
                       {bankAccounts.length === 0 ? 'Create bank account' : 'New bank account'}
                     </Text>
                  </Pressable>
                ))}
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  This uses money already recorded in the selected account as an opening balance or deposit.
                </Text>
                {projectedExpenseBankBalance !== null && projectedExpenseBankBalance < 0 && (
                  <View style={styles.negativeBankWarning} accessibilityRole="alert" testID="expense-negative-bank-warning">
                    <View style={styles.negativeBankWarningHeader}>
                      <Feather name="flag" size={15} color="#ef4444" />
                      <Text style={styles.negativeBankWarningTitle}>This will take the account below zero.</Text>
                    </View>
                    <Text style={styles.negativeBankWarningText}>
                      Projected closing balance: KES {projectedExpenseBankBalance.toLocaleString()}. Jamvi will still save the expense.
                    </Text>
                  </View>
                )}
                {getExpenseFundingControlState({
                  paidFromBank,
                  hasPersonalFunding: payerIds.length > 0,
                  allowMixedFunding,
                }).showBankOnlyExplanation && (
                  <View>
                    <Text style={[styles.hintText, { color: '#38bdf8' }]}>
                      This expense reduces the selected bank-account balance. Direct payer and income-source fields are not needed.
                    </Text>
                    {!allowMixedFunding && canManageShared ? (
                      <Pressable onPress={() => setAllowMixedFunding(true)} style={{ marginTop: 6 }}>
                        <Text style={{ color: '#38bdf8', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
                          Add another funding source
                        </Text>
                      </Pressable>
                    ) : allowMixedFunding ? (
                      <Text style={[styles.hintText, { color: '#38bdf8', marginTop: 6 }]}>
                        Choose one or more people above. Only the bank portion reduces the selected account.
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}
              {!canManageShared && (
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  This expense is recorded in your name.
                </Text>
              )}
              {canManageShared && payerIds.length === 0 && !paidFromBank && (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Tap to select · select multiple to split the cost
              </Text>
            )}

            {/* Per-source split rows — Joint bank can be mixed with people. */}
            {payerIds.length + (paidFromBank ? 1 : 0) > 1 && (() => {
              const total = parseFloat(amount.replace(/,/g, '')) || 0;
              const splitTotal = payerIds.reduce((s, id) => s + (parseFloat(payerAmounts[id] || '0') || 0), 0)
                + (paidFromBank ? parseFloat(payerAmounts.__joint_bank__ || '0') || 0 : 0);
              const diff = total - splitTotal;
              return (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                    Enter the amount from each selected source manually{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ''}.
                  </Text>
                  {paidFromBank && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', width: 76 }}>Bank account</Text>
                      <TextInput
                        style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 12, fontSize: 16, color: colors.foreground, fontFamily: 'Inter_400Regular' }}
                        keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                        value={payerAmounts.__joint_bank__ || ''}
                        onChangeText={val => {
                          if (isEditMode) setFundingDirty(true);
                          setPayerAmounts((previous) => {
                            return { ...previous, __joint_bank__: val };
                          });
                        }}
                      />
                    </View>
                  )}
                  {payerIds.map((pid) => {
                    const member = members.find(m => m.userId === pid);
                    const name = member?.userName?.split(' ')[0] ?? 'Member';
                    const sources = payerIncomeSources[pid] ?? [];
                    return (
                      <View key={pid} style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: 76 }}>
                            <Feather name="user" size={13} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{name}</Text>
                          </View>
                          <TextInput
                            style={{
                              flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
                              borderColor: colors.border, backgroundColor: colors.muted,
                              paddingHorizontal: 12, fontSize: 16, color: colors.foreground,
                              fontFamily: 'Inter_400Regular',
                            }}
                            keyboardType="numeric"
                            placeholder="KES 0"
                            placeholderTextColor={colors.mutedForeground}
                            value={payerAmounts[pid] || ''}
                            onChangeText={val => {
                              if (isEditMode) setFundingDirty(true);
                              setPayerAmounts((previous) => {
                                const next = { ...previous, [pid]: val };
                                return next;
                              });
                            }}
                          />
                        </View>
                        {payerSourcesLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                        ) : sources.length === 0 ? (
                          <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                            {name} needs an income source in Budget before this portion can be saved.
                          </Text>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {sources.map((source) => {
                              const selected = payerIncomeSourceIds[pid] === source.id;
                              return (
                                <Pressable
                                  key={source.id}
                                  onPress={() => {
                                    if (isEditMode) setFundingDirty(true);
                                    setPayerIncomeSourceIds(prev => ({
                                      ...prev,
                                      [pid]: selected ? null : source.id,
                                    }));
                                  }}
                                  style={[styles.sourceChip, {
                                    backgroundColor: selected ? colors.primary + '20' : colors.background,
                                    borderColor: selected ? colors.primary : colors.border,
                                    borderRadius: colors.radius,
                                  }]}
                                >
                                  <Feather name="briefcase" size={12} color={selected ? colors.primary : colors.mutedForeground} />
                                  <Text style={[styles.sourceChipText, { color: selected ? colors.primary : colors.foreground }]}>
                                    {source.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        )}
                         <View style={styles.addSourceRow}>
                           {newSourcePayerId === pid ? (
                             <>
                               <TextInput
                                 autoFocus
                                 style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                                 placeholder="e.g. Freelance work"
                                 placeholderTextColor={colors.mutedForeground}
                                 value={newSourceName}
                                 onChangeText={setNewSourceName}
                                 editable={!isCreatingSource}
                                 onSubmitEditing={() => void handleCreateIncomeSource(pid)}
                                 returnKeyType="done"
                               />
                               <Pressable
                                 onPress={() => void handleCreateIncomeSource(pid)}
                                 disabled={isCreatingSource}
                                 style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: isCreatingSource ? 0.6 : 1 }]}
                               >
                                 {isCreatingSource ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Save</Text>}
                               </Pressable>
                               <Pressable onPress={() => { setNewSourcePayerId(null); setNewSourceName(''); }} disabled={isCreatingSource}>
                                 <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                               </Pressable>
                             </>
                           ) : (
                             <Pressable onPress={() => { setNewSourcePayerId(pid); setNewSourceName(''); }} style={styles.addSourceLink}>
                               <Feather name="plus-circle" size={13} color={colors.primary} />
                               <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>Add source for {name}</Text>
                             </Pressable>
                           )}
                         </View>
                      </View>
                    );
                  })}
                  {Math.abs(diff) >= 1 && (
                    <Text style={{ fontSize: 12, color: diff > 0 ? '#f59e0b' : '#f87171', fontFamily: 'Inter_400Regular' }}>
                      {diff > 0
                        ? `KES ${diff.toLocaleString()} still unassigned`
                        : `Over by KES ${Math.abs(diff).toLocaleString()}`}
                    </Text>
                  )}
                </View>
              );
            })()}
          </>
        )}

         {/* Financed by is only shown inside the paid-directly path. */}
        {getExpenseFundingControlState({
          paidFromBank,
          hasPersonalFunding: payerIds.length === 1,
          allowMixedFunding,
        }).showPersonalIncomeSources && (
           <View style={[styles.fundingCard, { backgroundColor: colors.muted, borderColor: colors.primary + '50' }]}>
             <Text style={[styles.fundingCardTitle, { color: colors.foreground }]}>PAID DIRECTLY</Text>
            <View style={styles.fundingCardHeader}>
              <Feather name="layers" size={14} color={colors.primary} />
               <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>FINANCED BY</Text>
              <Text style={styles.fundingRequired}>* Required</Text>
            </View>
            {sourcesLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
            ) : incomeSources.length === 0 ? (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>No income sources set up — add them from Budget</Text>
            ) : (
              <View style={styles.sourceChipsGrid}>
                {incomeSources.map((src, idx) => {
                  const color = PALETTE[idx % PALETTE.length];
                  const key = incomeSourceKey(src.id);
                  const selected = selectedSources.includes(key);
                  const sourceDisabled = !selected && fundingFulfilled;
                  return (
                    <Pressable key={src.id} disabled={sourceDisabled} accessibilityState={{ selected, disabled: sourceDisabled }} testID={`income-source-chip-${src.id}`} onPress={() => {
                       if (sourceDisabled) return;
                      if (isEditMode) setFundingDirty(true);
                      setSelectedSources((previous) => {
                        if (previous.includes(key)) {
                          setSplitAmounts((amounts) => {
                            const next = { ...amounts };
                            delete next[key];
                            return next;
                          });
                          return previous.filter((item) => item !== key);
                        }
                        const selection = addIncomeSourceToSelection({
                          selectedSourceIds: previous,
                          amounts: splitAmounts,
                          existingSourceId: previous.length === 0 ? payerIncomeSourceIds[paidById] : null,
                          existingAmount: previous.length === 0 ? payerAmounts[paidById] : undefined,
                          newSourceId: key,
                        });
                        setSplitAmounts(selection.amounts);
                        return selection.selectedSourceIds;
                      });
                    }}
                      style={[styles.sourceChip, { backgroundColor: selected ? color + '22' : colors.background, borderColor: selected ? color : colors.border, borderRadius: colors.radius, opacity: sourceDisabled ? 0.42 : 1 }]}>
                      <Feather name="briefcase" size={13} color={selected ? color : colors.mutedForeground} />
                      <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>{src.name}</Text>
                      {selected && <Feather name="check" size={11} color={color} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {fundingFulfilled && (
              <Text style={[styles.hintText, { color: colors.primary, marginTop: 8 }]} accessibilityLiveRegion="polite">
                Fully funded. Other income sources are unavailable until you lower an existing portion.
              </Text>
            )}
            <View style={styles.addSourceRow}>
              {newSourcePayerId === paidById ? (
                <>
                  <TextInput
                    autoFocus
                    style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. Freelance work"
                    placeholderTextColor={colors.mutedForeground}
                    value={newSourceName}
                    onChangeText={setNewSourceName}
                    editable={!isCreatingSource}
                    onSubmitEditing={() => void handleCreateIncomeSource(paidById)}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={() => void handleCreateIncomeSource(paidById)}
                    disabled={isCreatingSource}
                    style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: isCreatingSource ? 0.6 : 1 }]}
                  >
                    {isCreatingSource ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Save</Text>}
                  </Pressable>
                  <Pressable onPress={() => { setNewSourcePayerId(null); setNewSourceName(''); }} disabled={isCreatingSource}>
                    <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => { setNewSourcePayerId(paidById); setNewSourceName(''); }} style={styles.addSourceLink}>
                  <Feather name="plus-circle" size={14} color={colors.primary} />
                  <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>Add another source</Text>
                </Pressable>
              )}
            </View>
            {(!paidFromBank || allowMixedFunding) && selectedSources.length > 0 && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                    Enter each amount manually. This prevents a mistaken automatic allocation.
                </Text>
                {selectedSources.map((key, index) => {
                  const sourceId = incomeSourceIdFromKey(key);
                  const sourceName = sourceId
                    ? incomeSources.find((source) => source.id === sourceId)?.name
                    : key.split(':').slice(2).join(':');
                  return (
                  <View key={key} style={[styles.splitAmountRow, { backgroundColor: colors.background, borderColor: PALETTE[index % PALETTE.length] + '44', borderRadius: colors.radius }]}>
                    <Text style={[styles.splitAmountLabel, { color: colors.foreground }]}>{sourceName || 'Personal funds'}</Text>
                    <TextInput style={[styles.splitAmountInput, { color: colors.foreground }]} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                      value={splitAmounts[key] || ''} onChangeText={value => {
                        if (isEditMode) setFundingDirty(true);
                        setSplitAmounts((previous) => {
                          return { ...previous, [key]: value };
                        });
                      }} />
                  </View>
                )})}
              </View>
            )}
          </View>
        )}

        {isAdvanced && (() => {
          const total = parseFloat(amount.replace(/,/g, '')) || 0;
          if (total <= 0) return null;
          const bankAmount = paidFromBank ? (parseFloat(payerAmounts.__joint_bank__ || '0') || 0) : 0;
          const directAmount = selectedSources.length > 0
            ? selectedSources.reduce((sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0), 0)
            : payerIds.reduce((sum, payerId) => sum + (parseFloat(payerAmounts[payerId] || '0') || 0), 0);
          const funded = bankAmount + directAmount;
          const difference = total - funded;
          const needsDirectFunding = !paidFromBank || allowMixedFunding;
          const hasDirectSource = selectedSources.length > 0 || Boolean(payerIncomeSourceIds[paidById]);
          const message = paidFromBank && !selectedBankAccountId
            ? 'Choose the bank account used for this expense'
            : needsDirectFunding && payerIds.length === 0
              ? 'Choose who paid the direct portion'
              : needsDirectFunding && !hasDirectSource
                ? 'Choose an income source for every direct portion'
                : funded <= 0
                  ? 'Enter the amount from each funding source'
                  : difference > 0
                    ? `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · KES ${difference.toLocaleString()} remaining`
                    : difference < 0
                      ? `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · KES ${Math.abs(difference).toLocaleString()} over`
                      : `Funded KES ${funded.toLocaleString()} of KES ${total.toLocaleString()} · Fully funded`;
          const isReady = difference === 0 && funded > 0 && (!paidFromBank || Boolean(selectedBankAccountId)) && (!needsDirectFunding || (payerIds.length > 0 && hasDirectSource));
          const isOver = difference < 0;
          const statusColor = isReady ? '#15803d' : isOver ? '#b91c1c' : '#b45309';
          const statusBorder = isReady ? '#86efac' : isOver ? '#fca5a5' : '#fcd34d';
          const statusBackground = isReady ? '#f0fdf4' : isOver ? '#fef2f2' : '#fffbeb';
          return (
            <View
              accessibilityLiveRegion="polite"
              testID="expense-funding-summary"
              style={{
                borderWidth: 1,
                borderColor: statusBorder,
                backgroundColor: statusBackground,
                borderRadius: colors.radius,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: statusColor, fontFamily: 'Inter_600SemiBold' }}>
                {message}
              </Text>
            </View>
          );
        })()}

        {/* Recurring expenses affect shared planning and are manager-only. */}
        {isAdvanced && canManageShared && <View
          style={[
            styles.toggleRow,
            { borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <View style={styles.toggleInfo}>
            <Feather name="refresh-cw" size={16} color={colors.primary} />
            <View>
              <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Recurring</Text>
              <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                Copy to next month automatically
              </Text>
            </View>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={(next) => {
              if (!next) {
                setIsRecurring(false);
                setRecurringMonthlyBudget('');
                return;
              }
              Alert.alert(
                'Make this recurring?',
                'Jamvi will remind you to apply it next month. You will also need to confirm its monthly category budget.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes, make recurring',
                    onPress: async () => {
                      if (!category.trim()) {
                        Alert.alert('Choose a category first', 'A recurring expense needs a category before Jamvi can set its average monthly budget.');
                        return;
                      }
                      setIsRecurring(true);
                      await AsyncStorage.removeItem(RECURRING_BUDGET_HANDOFF_KEY);
                      router.push({
                        pathname: '/(tabs)/budget',
                        params: {
                          recurringSetup: '1',
                          category: category.trim(),
                          expenseAmount: amount,
                        },
                      });
                    },
                  },
                ],
              );
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>}
        {isAdvanced && canManageShared && isRecurring && (
          <View style={[styles.recurringBudgetCard, { backgroundColor: colors.muted, borderColor: colors.primary + '45', borderRadius: colors.radius }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              MONTHLY BUDGET (KES) <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={recurringMonthlyBudget}
              onChangeText={setRecurringMonthlyBudget}
              placeholder="e.g. 15000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              accessibilityLabel="Recurring monthly budget"
              testID="recurring-monthly-budget"
            />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>This becomes the recurring monthly budget for the selected category.</Text>
          </View>
        )}
        {isEditMode && canRemoveExpense ? (
          <Pressable
            onPress={handleRemove}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${editingExpense?.description ?? 'expense'}`}
            style={[styles.removeButton, { borderColor: colors.destructive, opacity: isPending ? 0.55 : 1 }]}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.removeButtonText, { color: colors.destructive }]}>Remove expense</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stateContainer: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  stateTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  stateText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  stateButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  removeButton: {
    minHeight: 48,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  recurringBudgetCard: { borderWidth: 1, padding: 12, gap: 6, marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cancelBtn: { padding: 4 },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 6 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeButton: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  normalSummary: { marginTop: 14, padding: 12, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  normalSummaryTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  normalBlockerText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  normalAdvancedLink: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 7, textDecorationLine: 'underline' },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  currencyLabel: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 6,
  },
  amountInput: {
    fontSize: 52,
    fontWeight: '800' as const,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    letterSpacing: -2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  stageLabel: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stageLabelText: {
    fontSize: 11,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.9,
  },
  categoryScroll: { marginHorizontal: -20 },
  categoryScrollContent: { paddingHorizontal: 20, paddingVertical: 10, gap: 16 },
  oneOffCategoryOption: {
    marginTop: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  oneOffCategoryTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
     minHeight: 72,
    minWidth: 112,
     paddingHorizontal: 20,
     paddingVertical: 20,
     borderWidth: 1.5,
  },
  categoryChipText: {
     fontSize: 15,
     fontWeight: '600' as const,
     fontFamily: 'Inter_600SemiBold',
  },
  categoryStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  categoryStatusText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  categoryCreateCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  categoryCreateTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryCreateHint: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  categoryCreateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryCreateInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  categoryCreateBudgetInput: {
    width: 110,
    height: 42,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  categoryPriorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPriorityChip: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRecurringRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  categoryCreateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryCreateSave: {
    minHeight: 38,
    borderRadius: 9,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCreateSaveText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryCreateCancel: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  categoryCreateCancelText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  allocationCard: {
    marginTop: 10,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  allocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  allocationTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  allocationTotal: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  allocationRow: { borderWidth: 1, padding: 10, gap: 7 },
  allocationCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocationCategory: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  allocationAmountLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  allocationInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  allocationRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  allocationStatus: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8, paddingHorizontal: 4 },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
  },
  notesInput: {
    height: 80,
    paddingTop: 13,
  },
  paidByRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  paidByPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  paidByText: {
    fontSize: 14,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateBadge: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 10,
  },

  dateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  balancePillText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  categoryBalancePreview: {
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  categoryBalancePreviewTitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  categoryBalancePreviewRow: {
    gap: 2,
  },
  categoryBalancePreviewCategory: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryBalancePreviewAmount: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  negativeBankWarning: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    gap: 4,
  },
  negativeBankWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negativeBankWarningTitle: {
    color: '#ef4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  negativeBankWarningText: {
    color: '#d6b36a',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
  },
  otherCategoryPrompt: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  otherCategoryPromptCopy: {
    flex: 1,
    gap: 2,
  },
  otherCategoryPromptTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  inlineAccountRow: {
    gap: 8,
  },
  inlineAccountInput: {
    flex: 0,
    minWidth: 0,
    width: '100%',
  },
  inlineAccountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  inlineAccountSubmit: {
    flex: 1,
    minHeight: 44,
  },
  inlineAccountCancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  singleFundingAmount: {
    gap: 6,
  },
  // Funding card
  fundingCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  fundingCardTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  fundingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fundingRequired: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#ef4444',
  },
  sourceChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  sourceChipText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  addSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  addSourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  addSourceLinkText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  newSourceInput: {
    minWidth: 150,
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  addSourceButton: {
    minWidth: 58,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  addSourceButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelSourceText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 3,
  },
  // Split amount inputs
  splitAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  splitAmountLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  splitAmountInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  splitCurrency: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  splitAmountInput: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    minWidth: 80,
    textAlign: 'right',
  },
});
