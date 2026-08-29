 what this Other expense was for"
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              accessibilityLabel="Other expense notes"
              testID="other-expense-notes"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            {!isEditMode && canManageCategories && (
              <View style={[styles.otherCategoryPrompt, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={styles.otherCategoryPromptCopy}>
                  <Text style={[styles.otherCategoryPromptTitle, { color: colors.foreground }]}>
                    Save as a category if this repeats?
                  </Text>
                  <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                    Your brief description will be used as the category name.
                  </Text>
                </View>
                <Switch
                  value={saveOtherAsCategory}
                  onValueChange={setSaveOtherAsCategory}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#ffffff"
                  accessibilityLabel="Save brief description as an expense category"
                />
              </View>
            )}
          </View>
        )}
        {categoryAllocations.length > 0 && !(hasOtherCategorySelected && categoryAllocations.length === 1) && (
          <View
            testID="category-allocation-card"
            style={[styles.allocationCard, { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <View style={styles.allocationHeader}>
              <View>
                <Text style={[styles.allocationTitle, { color: colors.foreground }]}>CATEGORY ALLOCATION</Text>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>Choose category tabs above to add another row.</Text>
              </View>
              <Text style={[styles.allocationTotal, { color: colors.foreground }]}>
                KES {categoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0).toLocaleString()}
              </Text>
            </View>
            {categoryAllocations.map((allocation) => (
              <View key={allocation.category} style={styles.allocationRow}>
                <Text style={[styles.allocationCategory, { color: colors.foreground }]} numberOfLines={1}>{allocation.category}</Text>
                <TextInput
                  style={[styles.allocationInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, borderRadius: colors.radius }]}
                  value={allocation.amount}
                  onChangeText={(value) => updateAllocationAmount(allocation.category, value)}
                  keyboardType="numeric"
                  placeholder="KES"
                  placeholderTextColor={colors.mutedForeground}
                  testID={`category-allocation-${allocation.category}`}
                />
                <Pressable
                  onPress={() => removeAllocation(allocation.category)}
                  accessibilityLabel={`Remove ${allocation.category} allocation`}
                  testID={`remove-category-allocation-${allocation.category}`}
                  style={styles.allocationRemove}
                >
                  <Feather name="x" size={18} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
            {(() => {
              const total = categoryAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount.replace(/,/g, '')) || 0), 0);
              const expenseTotal = Number(amount.replace(/,/g, '')) || 0;
              const difference = expenseTotal - total;
              return (
                <Text style={[styles.allocationStatus, { color: difference === 0 && expenseTotal > 0 ? colors.primary : difference < 0 ? colors.destructive : colors.mutedForeground }]}>
                  {difference === 0 && expenseTotal > 0
                    ? 'Allocated exactly.'
                    : difference > 0
                      ? `KES ${difference.toLocaleString()} remaining to allocate`
                      : `KES ${Math.abs(difference).toLocaleString()} over allocated`}
                </Text>
              );
            })()}
          </View>
        )}
        {isCreatingCategory && !hasOtherCategorySelected ? (
          <View
            testID="create-category-form"
            style={[styles.categoryCreateCard, { backgroundColor: colors.muted, borderColor: colors.primary + '45' }]}
          >
            <View>
              <Text style={[styles.categoryCreateTitle, { color: colors.foreground }]}>Name this expense category</Text>
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>Emergencies and one-off spending can stay unbudgeted. You can also add the category to the monthly budget.</Text>
            </View>
            <TextInput
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Emergency repair"
              placeholderTextColor={colors.mutedForeground}
              maxLength={60}
              editable={!createCategory.isPending}
              style={[styles.categoryCreateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {canManageCategories ? (
              <View style={[styles.categoryRecurringRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.categoryCreateTitle, { color: colors.foreground, fontSize: 13 }]}>Add this category to the budget?</Text>
                  <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>
                    {newCategoryAddToBudget ? 'Set its budget details below' : 'No — record it as unbudgeted spending'}
                  </Text>
                </View>
                <Switch
                  value={newCategoryAddToBudget}
                  onValueChange={setNewCategoryAddToBudget}
                  disabled={createCategory.isPending}
                  accessibilityLabel="Add category to budget"
                />
              </View>
            ) : (
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>This will not change the Shared budget. An owner or admin can add it later.</Text>
            )}
            {newCategoryAddToBudget && canManageCategories ? (
              <>
              <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>Priority: 1 is must-pay; 5 is flexible.</Text>
              <View style={styles.categoryPriorityRow}>
              {[1, 2, 3, 4, 5].map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => setNewCategoryPriority(String(priority))}
                  disabled={createCategory.isPending}
                  accessibilityRole="radio"
                  accessibilityLabel={`Priority ${priority}`}
                  accessibilityState={{ checked: newCategoryPriority === String(priority), disabled: createCategory.isPending }}
                  style={[
                    styles.categoryPriorityChip,
                    {
                      borderColor: newCategoryPriority === String(priority) ? colors.primary : colors.border,
                      backgroundColor: newCategoryPriority === String(priority) ? colors.primary + '18' : colors.background,
                    },
                  ]}
                >
                  <Text style={{ color: newCategoryPriority === String(priority) ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{priority}</Text>
                </Pressable>
              ))}
              </View>
              <View style={[styles.categoryRecurringRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.categoryCreateTitle, { color: colors.foreground, fontSize: 13 }]}>Recurring category</Text>
                <Text style={[styles.categoryCreateHint, { color: colors.mutedForeground }]}>
                  {newCategoryRecurring ? 'Available every month' : 'Only available this month'}
                </Text>
              </View>
              <Switch
                value={newCategoryRecurring}
                onValueChange={setNewCategoryRecurring}
                disabled={createCategory.isPending}
                accessibilityLabel="Recurring category"
                accessibilityHint="When on, this category is available every month"
              />
              </View>
              <TextInput
                value={newCategoryBudget}
                onChangeText={setNewCategoryBudget}
                placeholder="Monthly KES"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                editable={!createCategory.isPending}
                style={[styles.categoryCreateBudgetInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
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

        {/* Running balance for selected category */}
        {category ? (() => {
          const cat = breakdown?.find(b => b.category === category);
          if (!cat) return null;
          const over = cat.spentAmount >= cat.budgetAmount;
          return (
            <View style={[styles.balancePill, { backgroundColor: over ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', borderColor: over ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)' }]}>
              <Feather name="bar-chart-2" size={12} color={over ? '#ef4444' : '#4ade80'} />
              <Text style={[styles.balancePillText, { color: over ? '#ef4444' : '#4ade80' }]}>
                Spent this month: KES {cat.spentAmount.toLocaleString()} / {cat.budgetAmount.toLocaleString()}
                {over ? '  ·  Over budget!' : `  ·  KES ${(cat.budgetAmount - cat.spentAmount).toLocaleString()} left`}
              </Text>
            </View>
          );
        })() : null}
         {/* Description */}
          {!categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === 'other') && (
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
         )}

         {/* Notes */}
          {!categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === 'other') && (
           <>
             <Text style={[styles.label, { color: colors.mutedForeground }]}>NOTES (optional)</Text>
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
               placeholder="Any extra details…"
               placeholderTextColor={colors.mutedForeground}
               value={notes}
               onChangeText={setNotes}
               accessibilityLabel="Notes"
               multiline
               numberOfLines={3}
               textAlignVertical="top"
             />
           </>
         )}

        {/* Who paid */}
        {members.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              PAID BY <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <View style={styles.paidByRow}>
              {/* Joint-bank spending is restricted to group managers. */}
              {canManageShared && <Pressable
                onPress={() => {
                  if (isEditMode) setFundingDirty(true);
                  if (paidFromBank) {
                    setPaidFromBank(false);
                    setAllowMixedFunding(false);
                  } else {
                    setPaidFromBank(true);
                    setAllowMixedFunding(false);
                    setPayerIds([]);
                    setSelectedSources([]);
                    setSplitAmounts({});
                    setPayerIncomeSourceIds({});
                    setPayerAmounts({ __joint_bank__: amount.replace(/,/g, '') });
                  }
                }}
                style={[styles.paidByPill, {
                  backgroundColor: paidFromBank ? 'rgba(56,189,248,0.15)' : colors.muted,
                  borderColor: paidFromBank ? '#38bdf8' : colors.border,
                  borderRadius: colors.radius,
                }]}
              >
                <Feather name="credit-card" size={14} color={paidFromBank ? '#38bdf8' : colors.mutedForeground} />
                <Text style={[styles.paidByText, { color: paidFromBank ? '#38bdf8' : colors.foreground }]}>
                  Joint bank
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
                          setPayerAmounts((previous) => addFundingSourceWithRemainder({
                            total: parseFloat(amount.replace(/,/g, '')),
                            selectedSourceIds: prev,
                            newSourceId: m.userId,
                            amounts: previous,
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
                         if (paidFromBank) {
                           setAllowMixedFunding(next.length > 0);
                           if (next.length === 1) {
                             const bankAmount = parseFloat(payerAmounts.__joint_bank__ || '0') || 0;
                             const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), bankAmount);
                             setPayerAmounts((previous) => ({
                               ...previous,
                               [next[0]]: remainder > 0 ? String(remainder) : previous[next[0]] ?? '',
                             }));
                           }
                         }
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
                {bankAccounts.length === 0 && <Text style={[styles.hintText, { color: '#ef4444' }]}>Add a bank account from the Bank tab before using bank funds.</Text>}
                {canManageShared && (isAddingBankAccount ? (
                  <View style={styles.inlineAccountRow}>
                    <TextInput
                      autoFocus
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="e.g. M-Pesa wallet or KCB account"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountName}
                      onChangeText={setNewBankAccountName}
                      editable={!createBankAccount.isPending}
                      onSubmitEditing={() => void handleCreateBankAccount()}
                    />
                    <TextInput
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Account number (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankAccountNumber}
                      onChangeText={setNewBankAccountNumber}
                    />
                    <TextInput
                      style={[styles.newSourceInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      placeholder="Opening balance"
                      keyboardType="number-pad"
                      placeholderTextColor={colors.mutedForeground}
                      value={newBankOpeningBalance}
                      onChangeText={setNewBankOpeningBalance}
                    />
                    <Pressable
                      onPress={() => void handleCreateBankAccount()}
                      disabled={createBankAccount.isPending}
                      style={[styles.addSourceButton, { backgroundColor: colors.primary, opacity: createBankAccount.isPending ? 0.6 : 1 }]}
                    >
                      {createBankAccount.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addSourceButtonText}>Add</Text>}
                    </Pressable>
                    <Pressable onPress={() => { setIsAddingBankAccount(false); setNewBankAccountName(''); setNewBankAccountNumber(''); setNewBankOpeningBalance(''); }}>
                      <Text style={[styles.cancelSourceText, { color: colors.mutedForeground }]}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setIsAddingBankAccount(true)} style={styles.addSourceLink}>
                    <Feather name="plus-circle" size={14} color={colors.primary} />
                    <Text style={[styles.addSourceLinkText, { color: colors.primary }]}>New bank account</Text>
                  </Pressable>
                ))}
                {payerIds.length === 0 && (
                  <View style={styles.singleFundingAmount}>
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM</Text>
                    <TextInput
                      style={[styles.newSourceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      placeholder="KES 0"
                      placeholderTextColor={colors.mutedForeground}
                      value={payerAmounts.__joint_bank__ || ''}
                      onChangeText={(value) => setPayerAmounts((previous) => ({ ...previous, __joint_bank__: value }))}
                    />
                    <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Enter this manually to confirm how much should reduce the selected account.
                    </Text>
                  </View>
                )}
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
                    {isEditMode && !allowMixedFunding && canManageShared ? (
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
                    Type the primary amount{total > 0 ? ` (expense total: KES ${total.toLocaleString()})` : ''}. Jamvi fills the remaining amount into the other selected source.
                  </Text>
                  {paidFromBank && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold', width: 76 }}>Joint bank</Text>
                      <TextInput
                        style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, paddingHorizontal: 12, fontSize: 16, color: colors.foreground, fontFamily: 'Inter_400Regular' }}
                        keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground}
                        value={payerAmounts.__joint_bank__ || ''}
                        onChangeText={val => {
                          if (isEditMode) setFundingDirty(true);
                          setPayerAmounts((previous) => {
                            const next: Record<string, string> = { ...previous, __joint_bank__: val };
                            if (payerIds.length === 1) {
                              const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), parseFloat(val || '0'));
                              next[payerIds[0]] = remainder > 0 ? String(remainder) : '';
                            }
                            return next;
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
                                if (paidFromBank && payerIds.length === 1) {
                                  const remainder = getFundingRemainder(parseFloat(amount.replace(/,/g, '')), parseFloat(val || '0'));
                                  next.__joint_bank__ = remainder > 0 ? String(remainder) : '';
                                }
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
                  return (
                    <Pressable key={src.id} onPress={() => {
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
                        setSplitAmounts((amounts) => addFundingSourceWithRemainder({
                          total: parseFloat(amount.replace(/,/g, '')),
                          selectedSourceIds: previous,
                          newSourceId: key,
                          amounts,
                        }));
                        return [...previous, key];
                      });
                    }}
                      style={[styles.sourceChip, { backgroundColor: selected ? color + '22' : colors.background, borderColor: selected ? color : colors.border, borderRadius: colors.radius }]}>
                      <Feather name="briefcase" size={13} color={selected ? color : colors.mutedForeground} />
                      <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>{src.name}</Text>
                      {selected && <Feather name="check" size={11} color={color} />}
                    </Pressable>
                  );
                })}
              </View>
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
            {!paidFromBank && selectedSources.length > 0 && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0 }]}>
                    Type each amount. Jamvi fills the current remainder when you add another source.
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
                {(() => {
                  const total = parseFloat(amount.replace(/,/g, '')) || 0;
                  const assigned = selectedSources.reduce(
                    (sum, key) => sum + (parseFloat(splitAmounts[key] || '0') || 0),
                    0,
                  );
                  const difference = total - assigned;
                  if (total <= 0 || difference === 0) {
                    return total > 0 ? (
                      <Text style={{ fontSize: 13, color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                        Fully funded
                      </Text>
                    ) : null;
                  }
                  return (
                    <Text
                      accessibilityRole="alert"
                      testID="expense-funding-remainder"
                      style={{ fontSize: 13, color: difference > 0 ? '#f59e0b' : '#f87171', fontFamily: 'Inter_600SemiBold' }}
                    >
                      {difference > 0
                        ? `KES ${difference.toLocaleString()} remaining — choose another source to continue`
                        : `Overfunded by KES ${Math.abs(difference).toLocaleString()}`}
                    </Text>
                  );
                })()}
              </View>
            )}
          </View>
        )}

        {/* Date — required, no future dates */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>
            DATE <Text style={{ color: '#ef4444' }}>*</Text>
          </Text>
          <Text style={[styles.hintText, { color: colors.mutedForeground, marginTop: 0, fontSize: 11 }]}>
            Backdate allowed · no future dates
          </Text>
        </View>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[
            styles.dateRow,
            { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Feather name="calendar" size={16} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.dateText, { color: colors.foreground, flex: 1 }]}>
            {formatDateDisplay(date)}
          </Text>
          {date === todayIso()
            ? <Text style={[styles.dateBadge, { backgroundColor: colors.primary + '22', color: colors.primary }]}>Today</Text>
            : <Text style={[styles.dateBadge, { backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }]}>Backdated</Text>
          }
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={new Date(date + 'T00:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            maximumDate={new Date()}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (selected) {
                const y = selected.getFullYear();
                const m = String(selected.getMonth() + 1).padStart(2, '0');
                const d = String(selected.getDate()).padStart(2, '0');
                setDate(`${y}-${m}-${d}`);
              }
            }}
          />
        )}

        {/* Recurring expenses affect shared planning and are manager-only. */}
        {canManageShared && <View
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
                      if (category.trim().toLocaleLowerCase() === 'other' && !description.trim()) {
                        Alert.alert('Describe this expense first', 'Jamvi will use the description as the recurring budget category name.');
                        return;
                      }
                      setIsRecurring(true);
                      if (category.trim().toLocaleLowerCase() === 'other') setSaveOtherAsCategory(true);
                      await AsyncStorage.removeItem(RECURRING_BUDGET_HANDOFF_KEY);
                      router.push({
                        pathname: '/(tabs)/budget',
                        params: {
                          recurringSetup: '1',
                          category: category.trim().toLocaleLowerCase() === 'other' ? description.trim() : category.trim(),
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
        {canManageShared && isRecurring && (
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
  amountSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 4,
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
  categoryScroll: { marginHorizontal: -20 },
  categoryScrollContent: { paddingHorizontal: 20, gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
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
  allocationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocationCategory: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  allocationInput: {
    width: 92,
    height: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  allocationRemove: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  allocationStatus: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
