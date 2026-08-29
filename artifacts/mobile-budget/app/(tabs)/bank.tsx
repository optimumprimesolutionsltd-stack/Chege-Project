              style={[styles.actionBtn, { backgroundColor: '#164e63' }, !canManageAccount && styles.actionBtnDisabled]}
                onPress={() => openModal('transfer')}
                activeOpacity={0.8}
                disabled={!canManageAccount}
                accessibilityHint={!canManageAccount ? 'Only a Shared budget owner or admin can transfer shared money.' : undefined}
                testID="bank-transfer-action"
              >
                <Feather name="repeat" size={16} color="#67e8f9" />
                <Text style={[styles.actionBtnText, { color: '#67e8f9' }]}>Transfer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#164e63' }, (!canManageAccount || accounts.length < 2) && styles.actionBtnDisabled]}
                onPress={() => openModal('bank_transfer')}
                disabled={!canManageAccount || accounts.length < 2}
                testID="bank-to-bank-action"
              >
                <Feather name="shuffle" size={16} color="#67e8f9" />
                <Text style={[styles.actionBtnText, { color: '#67e8f9' }]}>Bank → Bank</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#78350f' }, !canManageAccount && styles.actionBtnDisabled]}
                onPress={() => openModal('bank_charge')}
                activeOpacity={0.8}
                disabled={!canManageAccount}
                accessibilityHint={!canManageAccount ? 'Only a Shared budget owner or admin can record a bank charge.' : undefined}
                testID="bank-charge-action"
              >
                <Feather name="file-minus" size={16} color="#fde68a" />
                <Text style={[styles.actionBtnText, { color: '#fde68a' }]}>Charge</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </LinearGradient>

      <PageFlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          transactions.length > 0 ? (
            <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>TRANSACTIONS</Text>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No transactions yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Money you put in or take out will appear here
              </Text>
              <Pressable
                testID="bank-create-first-deposit"
                accessibilityRole="button"
                accessibilityLabel="Record your first deposit"
                onPress={() => openModal('deposit')}
                style={[styles.emptyAction, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={16} color={colors.primaryForeground} />
                <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Record first deposit</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const dep = item.type === 'deposit';
          const payerLabel = txPayerLabel(item);
          const bankCharge = item.bankCharge === true;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.txRow,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.txIcon, { backgroundColor: dep ? '#1a3320' : '#3a1a1a' }]}>
                <Feather
                  name={dep ? 'arrow-down-left' : 'arrow-up-right'}
                  size={18}
                  color={dep ? '#4ade80' : '#f87171'}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                  {item.bankTransferId
                    ? `${dep ? 'From' : 'To'} ${item.bankTransferAccountName ?? 'bank account'}`
                    : item.savingsGoalId
                    ? `${item.transferDirection === 'to_savings' ? 'Bank → Savings' : 'Savings → Bank'}: ${item.savingsGoalName ?? 'Savings goal'}`
                    : bankCharge ? `Bank charge: ${item.description}`
                    : !dep && item.expenseCategory ? item.expenseCategory : item.description}
                </Text>
                <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                  {item.bankTransferId
                    ? `Internal bank transfer · ${item.description} · `
                    : item.savingsGoalId
                    ? `${item.description} · `
                    : bankCharge
                      ? 'Excluded from household spending and reports · '
                    : dep
                      ? `${payerLabel} · ${item.description} · `
                      : `${payerLabel}${item.expenseCategory && item.description !== item.expenseCategory ? ` · ${item.description}` : ''} · `}
                  {data?.accountName ? `${data.accountName} · ` : ''}
                  {formatDateTime(item.date)}{canManageAccount ? ' · Edit or delete' : canEditTransaction(item) ? ' · Edit today' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <Text style={[styles.txAmount, { color: dep ? '#4ade80' : '#f87171' }]}>
                  {dep ? '+' : '-'}KES {formatKES(item.amount)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {canEditTransaction(item) && <TouchableOpacity
                    onPress={() => openEdit(item)}
                    hitSlop={8}
                    testID={`bank-edit-transaction-${item.id}`}
                  >
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>}
                  {canManageAccount && <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={8}
                    testID={`bank-delete-transaction-${item.id}`}
                  >
                    <Feather name="trash-2" size={16} color="#f87171" />
                  </TouchableOpacity>}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Transaction modal */}
      <Modal
        visible={accountModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !savingAccount && setAccountModalVisible(false)}
      >
        <KeyboardAvoidingView style={[styles.modalOverlay, { justifyContent: 'flex-end' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {editingAccountId ? 'Personalize account' : 'Add bank account'}
            </Text>
            <TextInput
              value={accountNameDraft}
              onChangeText={setAccountNameDraft}
              placeholder="e.g. M-Pesa, Family savings"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              testID="bank-account-name"
            />
            <TextInput
              value={accountNumberDraft}
              onChangeText={setAccountNumberDraft}
              placeholder="Account number (optional)"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { marginTop: 12, color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              testID="bank-account-number"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              {editingAccountId !== null && (
                <TouchableOpacity
                  style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#7f1d1d' }}
                  onPress={() => { setAccountModalVisible(false); removeAccount(editingAccountId); }}
                  testID="bank-remove-account"
                >
                  <Text style={{ color: '#fee2e2', fontFamily: 'Inter_600SemiBold' }}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, opacity: savingAccount ? 0.6 : 1 }]} disabled={savingAccount} onPress={saveAccount} testID="bank-save-account">
                <Text style={styles.submitText}>{savingAccount ? 'Saving…' : 'Save account'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            {/* Sheet handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Type stays fixed when editing so a deposit cannot become a withdrawal. */}
            {editingTransactionId === null ? (
            <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  txType === 'deposit' && styles.toggleActive,
                ]}
                onPress={() => setTxType('deposit')}
                testID="bank-toggle-deposit"
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: txType === 'deposit' ? '#0a1a10' : colors.mutedForeground },
                  ]}
                >
                  Deposit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  txType === 'disbursement' && styles.toggleActiveDisburse,
                ]}
                onPress={() => setTxType('disbursement')}
                testID="bank-toggle-withdraw"
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: txType === 'disbursement' ? '#fff' : colors.mutedForeground },
                  ]}
                >
                  Withdraw
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, txType === 'transfer' && styles.toggleActiveDisburse]}
                onPress={() => setTxType('transfer')}
                testID="bank-toggle-transfer"
              >
                <Text style={[styles.toggleText, { color: txType === 'transfer' ? '#fff' : colors.mutedForeground }]}>Transfer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, txType === 'bank_transfer' && styles.toggleActiveDisburse]}
                onPress={() => setTxType('bank_transfer')}
                testID="bank-toggle-bank-transfer"
              >
                <Text style={[styles.toggleText, { color: txType === 'bank_transfer' ? '#fff' : colors.mutedForeground }]}>Bank</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, txType === 'bank_charge' && styles.toggleActiveDisburse]}
                onPress={() => setTxType('bank_charge')}
                testID="bank-toggle-charge"
              >
                <Text style={[styles.toggleText, { color: txType === 'bank_charge' ? '#fff' : colors.mutedForeground }]}>Charge</Text>
              </TouchableOpacity>
            </View>
            ) : null}

            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              {editingTransactionId !== null
                ? `Edit ${isDeposit ? 'Deposit' : isTransfer ? 'Transfer' : isBankCharge ? 'Bank Charge' : 'Withdrawal'}`
                : isDeposit ? 'Add Money to Account' : isTransfer ? 'Move Bank & Savings Funds' : isBankTransfer ? 'Move Between Bank Accounts' : isBankCharge ? 'Record Bank Charge' : 'Take Money Out'}
            </Text>

            {/* Amount */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (KES)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.muted,
                },
              ]}
              placeholder="e.g. 5000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              returnKeyType="next"
              testID="bank-amount-input"
            />
            {projectedBalance !== null && projectedBalance < 0 && (
              <View
                style={styles.negativeBalanceWarning}
                accessibilityRole="alert"
                testID="bank-negative-balance-warning"
              >
                <View style={styles.negativeBalanceWarningHeader}>
                  <Feather name="flag" size={15} color="#ef4444" />
                  <Text style={styles.negativeBalanceWarningTitle}>This will take the account below zero.</Text>
                </View>
                <Text style={styles.negativeBalanceWarningText}>
                  The projected closing balance is KES {formatKES(projectedBalance)}. Jamvi will still save the record because it tracks what happened.
                </Text>
              </View>
            )}

            {/* Deposits require a description. Withdrawal details come after the required category. */}
            {(isDeposit || isBankCharge) && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  {isBankCharge ? 'Narration *' : 'Description'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.muted,
                    },
                  ]}
                  placeholder={isBankCharge ? 'e.g. Monthly account maintenance fee' : 'e.g. Monthly contribution'}
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  testID="bank-description-input"
                />
              </>
            )}

            {isTransfer && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Transfer direction</Text>
                <View style={styles.memberRow}>
                  <TouchableOpacity
                    style={[styles.memberPill, { backgroundColor: transferDirection === 'to_savings' ? '#0891b2' : colors.muted, borderColor: transferDirection === 'to_savings' ? '#0891b2' : colors.border }]}
                    onPress={() => setTransferDirection('to_savings')}
                  >
                    <Text style={[styles.memberPillText, { color: transferDirection === 'to_savings' ? '#fff' : colors.foreground }]}>Bank → Savings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.memberPill, { backgroundColor: transferDirection === 'from_savings' ? '#0891b2' : colors.muted, borderColor: transferDirection === 'from_savings' ? '#0891b2' : colors.border }]}
                    onPress={() => setTransferDirection('from_savings')}
                  >
                    <Text style={[styles.memberPillText, { color: transferDirection === 'from_savings' ? '#fff' : colors.foreground }]}>Savings → Bank</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Savings goal</Text>
                <TouchableOpacity
                  style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  onPress={() => setShowGoalPicker(!showGoalPicker)}
                  testID="bank-transfer-goal"
                >
                  <Text style={{ flex: 1, color: selectedGoal ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                    {selectedGoal?.name ?? 'Choose a savings goal'}
                  </Text>
                  <Feather name={showGoalPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                {showGoalPicker && (
                  <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                    {savingsGoals.map(goal => (
                      <TouchableOpacity key={goal.id} style={styles.categoryOption} onPress={() => { setWithdrawGoalId(goal.id); setShowGoalPicker(false); }}>
                        <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{goal.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Narration</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  placeholder="e.g. Set aside for school fees"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  testID="bank-transfer-narration"
                />
              </>
            )}
            {isBankTransfer && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>From account</Text>
                <View style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Text style={{ color: colors.foreground }}>{selectedAccount?.name ?? 'Selected account'}</Text>
                </View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>To account</Text>
                <View style={styles.memberRow}>
                  {accounts.filter((candidate) => candidate.id !== selectedAccountId).map((candidate) => (
                    <TouchableOpacity key={candidate.id} style={[styles.memberPill, { backgroundColor: bankTransferDestinationId === candidate.id ? '#0891b2' : colors.muted, borderColor: bankTransferDestinationId === candidate.id ? '#0891b2' : colors.border }]} onPress={() => setBankTransferDestinationId(candidate.id)} testID={`bank-transfer-destination-${candidate.id}`}>
                      <Text style={[styles.memberPillText, { color: bankTransferDestinationId === candidate.id ? '#fff' : colors.foreground }]}>{candidate.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Narration</Text>
                <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]} placeholder="e.g. Move operating funds" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} maxLength={200} testID="bank-to-bank-narration" />
                {selectedAccount && bankTransferDestinationId && Number.isInteger(parsedOutgoingAmount) && parsedOutgoingAmount > 0 && (
                  <Text style={[styles.managerGuidance, { color: colors.mutedForeground }]} testID="bank-transfer-preview">
                    {selectedAccount.name}: KES {formatKES(data?.balance)} → KES {formatKES((data?.balance ?? 0) - parsedOutgoingAmount)}. {accounts.find((candidate) => candidate.id === bankTransferDestinationId)?.name} receives KES {formatKES(parsedOutgoingAmount)}.
                  </Text>
                )}
              </>
            )}

            {/* ── Deposited by (deposits only) ── */}
            {isDeposit && members.length > 0 && (
              <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  {isSharedWorkspace ? 'Who is depositing?' : 'Deposited by'}{' '}
                  {canManageShared && <Text style={{ fontWeight: '400', fontSize: 11 }}>(tap multiple to split)</Text>}
                </Text>
                {!isSharedWorkspace ? (
                  <View style={[styles.personalAccountNotice, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="user" size={15} color={colors.primary} />
                    <Text style={[styles.personalAccountNoticeText, { color: colors.mutedForeground }]}>
                      This deposit is recorded in your name and stays in your Personal budget.
                    </Text>
                  </View>
                ) : <View style={styles.memberRow}>
                  {/* Joint bank chip — selected when no named members chosen */}
                  {canManageShared && <TouchableOpacity
                    testID="bank-deposit-joint-chip"
                    style={[
                      styles.memberPill,
                      {
                        backgroundColor: depositorIds.length === 0 ? '#1a6b3a' : colors.muted,
                        borderColor: depositorIds.length === 0 ? '#4ade80' : colors.border,
                      },
                    ]}
                    onPress={selectJointBank}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name="home"
                      size={13}
                      color={depositorIds.length === 0 ? '#4ade80' : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.memberPillText,
                        { color: depositorIds.length === 0 ? '#4ade80' : colors.foreground },
                      ]}
                    >
                      Joint bank
                    </Text>
                  </TouchableOpacity>}

                  {/* Named member chips */}
                  {selectableDepositors.map((m) => {
                    const selected = depositorIds.includes(m.userId);
                    const name = m.userName?.split(' ')[0] ?? 'Member';
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        testID={`bank-deposit-member-${m.userId}`}
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#4ade80' : colors.muted,
                            borderColor: selected ? '#4ade80' : colors.border,
                          },
                        ]}
                        onPress={() => toggleDepositor(m.userId)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name="user"
                          size={13}
                          color={selected ? '#0a1a10' : colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.memberPillText,
                            { color: selected ? '#0a1a10' : colors.foreground },
                          ]}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>}

                {/* Per-depositor split rows (multi only) */}
                {validDepositorIds.length > 1 && (() => {
                  const total = parseFloat(amount.replace(/,/g, '')) || 0;
                  const splitTotal = validDepositorIds.reduce(
                    (s, id) => s + (parseFloat(depositorAmounts[id] || '0') || 0), 0
                  );
                  const diff = total - splitTotal;
                  return (
                    <View style={{ marginTop: 8, gap: 8 }}>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                        How much is each person depositing?
                        {total > 0 ? ` (total: KES ${total.toLocaleString()})` : ''}
                      </Text>
                      {validDepositorIds.map((did) => {
                        const member = members.find(m => m.userId === did);
                        const name = member?.userName?.split(' ')[0] ?? 'Member';
                        return (
                          <View key={did} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: 76 }}>
                              <Feather name="user" size={13} color={colors.mutedForeground} />
                              <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                                {name}
                              </Text>
                            </View>
                            <TextInput
                              style={{
                                flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
                                borderColor: colors.border, backgroundColor: colors.background,
                                paddingHorizontal: 12, fontSize: 16, color: colors.foreground,
                                fontFamily: 'Inter_400Regular',
                              }}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={colors.mutedForeground}
                              value={depositorAmounts[did] || ''}
                              onChangeText={val =>
                                setDepositorAmounts(prev => ({ ...prev, [did]: val }))
                              }
                              testID={`bank-deposit-split-${did}`}
                            />
                          </View>
                        );
                      })}
                      {Math.abs(diff) >= 1 && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: diff > 0 ? '#f59e0b' : '#f87171',
                            fontFamily: 'Inter_400Regular',
                          }}
                        >
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

            {/* Income source — only when exactly one named depositor is selected */}
            {isDeposit && singleDepositorId && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Where did this money come from?{' '}
                  <Text style={{ fontWeight: '400', fontSize: 11 }}>(optional)</Text>
                </Text>
                <View style={styles.memberRow}>
                  {depositSources.map((src) => {
                    const selected = incomeSourceId === src.id;
                    return (
                      <TouchableOpacity
                        key={src.id}
                        testID={`bank-income-source-${src.id}`}
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#6366f1' : colors.muted,
                            borderColor: selected ? '#6366f1' : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setIncomeSourceId(selected ? null : src.id);
                          setDepositSourceKind(selected ? null : 'income_source');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.memberPillText,
                            { color: selected ? '#fff' : colors.foreground },
                          ]}
                        >
                          {src.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    testID="bank-income-source-other"
                    style={[
                      styles.memberPill,
                      {
                        backgroundColor: depositSourceKind === 'other' ? '#64748b' : colors.muted,
                        borderColor: depositSourceKind === 'other' ? '#64748b' : colors.border,
                      },
                    ]}
                    onPress={() => { setDepositSourceKind(depositSourceKind === 'other' ? null : 'other'); setIncomeSourceId(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.memberPillText, { color: depositSourceKind === 'other' ? '#fff' : colors.foreground }]}>Other</Text>
                  </TouchableOpacity>
                </View>
                {depositSourceKind === 'other' && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                    Use the required description above as the source narration.
                  </Text>
                )}
              </>
            )}

            {/* ── Withdrawal payer (disbursements only) ── */}
            {isWithdrawal && members.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Who is withdrawing?
                </Text>
                <View style={styles.memberRow}>
                  {/* Joint bank chip */}
                  <TouchableOpacity
                    testID="bank-withdraw-joint-chip"
                    style={[
                      styles.memberPill,
                      {
                        backgroundColor: withdrawerId === null ? '#3a1820' : colors.muted,
                        borderColor: withdrawerId === null ? '#f87171' : colors.border,
                      },
                    ]}
                    onPress={() => setWithdrawerId(null)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name="home"
                      size={13}
                      color={withdrawerId === null ? '#f87171' : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.memberPillText,
                        { color: withdrawerId === null ? '#f87171' : colors.foreground },
                      ]}
                    >
                      Joint bank
                    </Text>
                  </TouchableOpacity>

                  {/* Named member chips (one at a time) */}
                  {members.map((m) => {
                    const selected = withdrawerId === m.userId;
                    const name = m.userName?.split(' ')[0] ?? 'Member';
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        testID={`bank-withdraw-member-${m.userId}`}
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#f87171' : colors.muted,
                            borderColor: selected ? '#f87171' : colors.border,
                          },
                        ]}
                        onPress={() => setWithdrawerId(m.userId)}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name="user"
                          size={13}
                          color={selected ? '#fff' : colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.memberPillText,
                            { color: selected ? '#fff' : colors.foreground },
                          ]}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Withdrawal destination ────────────────────────────────────── */}
            {isWithdrawal && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Where is this money going?{' '}
                  <Text style={{ fontWeight: '400', fontSize: 11 }}>* required</Text>
                </Text>
                <View style={styles.memberRow}>
                  {/* Income source chips for the selected withdrawer */}
                  {withdrawSources.map((src) => {
                    const selected = withdrawDest === 'source' && withdrawSourceName === src.name;
                    return (
                      <TouchableOpacity
                        key={src.id}
                        testID={`bank-withdraw-dest-src-${src.id}`}
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#6366f1' : colors.muted,
                            borderColor: selected ? '#6366f1' : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setWithdrawDest('source');
                          setWithdrawSourceName(src.name);
                          setWithdrawGoalId(null);
                          setShowGoalPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="briefcase" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                          {src.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Savings chip */}
                  {(() => {
                    const selected = withdrawDest === 'savings';
                    return (
                      <TouchableOpacity
                        testID="bank-withdraw-dest-savings"
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#0891b2' : colors.muted,
                            borderColor: selected ? '#0891b2' : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setWithdrawDest('savings');
                          setWithdrawSourceName(null);
                          setShowGoalPicker(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="target" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                          Savings
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}

                  {/* Other chip */}
                  {(() => {
                    const selected = withdrawDest === 'other';
                    return (
                      <TouchableOpacity
                        testID="bank-withdraw-dest-other"
                        style={[
                          styles.memberPill,
                          {
                            backgroundColor: selected ? '#64748b' : colors.muted,
                            borderColor: selected ? '#64748b' : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setWithdrawDest('other');
                          setWithdrawSourceName(null);
                          setWithdrawGoalId(null);
                          setShowGoalPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-3" size={12} color={selected ? '#fff' : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: selected ? '#fff' : colors.foreground }]}>
                          Other
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>

                {/* Savings goal dropdown */}
                {withdrawDest === 'savings' && showGoalPicker && savingsGoals.length > 0 && (
                  <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                    {savingsGoals
                      .filter(g => !g.isCompleted)
                      .map(g => {
                        const pct = g.targetAmount > 0
                          ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                          : 0;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            style={[styles.categoryOption, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                            onPress={() => {
                              setWithdrawGoalId(g.id);
                              setShowGoalPicker(false);
                            }}
                          >
                            <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{g.name}</Text>
                            <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                              {pct}% funded
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    {savingsGoals.filter(g => !g.isCompleted).length === 0 && (
                      <TouchableOpacity style={styles.categoryOption}>
                        <Text style={{ color: colors.dropdownMutedForeground, fontFamily: 'Inter_400Regular' }}>No active goals</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Selected goal badge */}
                {withdrawDest === 'savings' && selectedGoal && !showGoalPicker && (
                  <TouchableOpacity
                    onPress={() => setShowGoalPicker(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingVertical: 10, paddingHorizontal: 14,
                      borderRadius: 10, borderWidth: 1,
                      borderColor: '#0891b2', backgroundColor: '#0891b222',
                      marginTop: 6,
                    }}
                  >
                    <Feather name="target" size={14} color="#0891b2" />
                    <Text style={{ flex: 1, color: '#0891b2', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                      {selectedGoal.name}
                    </Text>
                    <Feather name="chevron-down" size={14} color="#0891b2" />
                  </TouchableOpacity>
                )}

                {/* No goal selected yet hint */}
                {withdrawDest === 'savings' && !selectedGoal && !showGoalPicker && savingsGoals.length === 0 && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                    No savings goals set up yet
                  </Text>
                )}
              </>
            )}

            {/* Expense category (disbursements only) */}
            {isWithdrawal && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Category <Text style={{ fontWeight: '400', color: '#f87171' }}>* required</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                  activeOpacity={0.7}
                  testID="bank-category-picker"
                >
                  <Text
                    style={{
                      color: expenseCategory ? colors.foreground : colors.mutedForeground,
                      fontSize: 16,
                      fontFamily: 'Inter_400Regular',
                      flex: 1,
                    }}
                  >
                    {expenseCategory || 'Choose a category'}
                  </Text>
                  <Feather
                    name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
                {showCategoryPicker && (
                  <View style={[styles.categoryDropdown, { borderColor: colors.dropdownBorder, backgroundColor: colors.dropdownBackground }]}>
                    {categories.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.categoryOption}
                        onPress={() => { setExpenseCategory(c.name); setShowCategoryPicker(false); }}
                      >
                        <Text style={{ color: colors.dropdownForeground, fontFamily: 'Inter_400Regular' }}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: 10, gap: 8 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                        CAN'T FIND IT? ADD A CATEGORY
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={newCategoryName}
                          onChangeText={setNewCategoryName}
                          editable={!addingCategory}
                          placeholder="e.g. Transport"
                          placeholderTextColor={colors.mutedForeground}
                          style={{
                            flex: 1, height: 40, borderWidth: 1, borderColor: colors.dropdownBorder,
                            borderRadius: 8, color: colors.foreground, paddingHorizontal: 10,
                            fontFamily: 'Inter_400Regular', backgroundColor: colors.dropdownBackground,
                          }}
                          testID="bank-new-category-input"
                        />
                        <TouchableOpacity
                          disabled={addingCategory}
                          onPress={handleCreateCategory}
                          style={{
                            minWidth: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: colors.primary, opacity: addingCategory ? 0.55 : 1,
                          }}
                          testID="bank-add-category"
                        >
                          {addingCategory ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Add</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* Categories drive withdrawal reports; details remain optional context. */}
            {isWithdrawal && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Details <Text style={{ fontWeight: '400' }}>(optional)</Text>
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                  ]}
                  placeholder="e.g. School books for term two"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  testID="bank-description-input"
                />
              </>
            )}

            {/* Date */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
            <Pressable
              onPress={() => {
                if (canManageShared || editingTransactionId === null) setShowDatePicker(true);
              }}
              style={[styles.input, styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.muted }]}
              testID="bank-date-picker"
            >
              <Feather name="calendar" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: 'Inter_400Regular', flex: 1 }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(date + 'T00:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
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

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                isDeposit ? styles.submitDeposit : styles.submitDisburse,
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
              testID="bank-submit-btn"
            >
              {submitting ? (
                <ActivityIndicator color={isDeposit ? '#0a1a10' : '#fff'} />
              ) : (
                <Text style={[styles.submitText, !isDeposit && { color: '#fff' }]}>
                  {editingTransactionId !== null ? 'Save Changes' : isDeposit ? 'Add Money' : 'Withdraw'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual opening balance modal */}
      <Modal
        visible={openingBalanceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOpeningBalanceEditor}
      >
        <TouchableWithoutFeedback onPress={closeOpeningBalanceEditor}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Set starting balance</Text>
            <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
              Enter the money already in this Shared budget’s bank account before the transactions shown below.
              This does not create a transaction.
            </Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Opening balance (KES)</Text>
            <TextInput
              value={openingBalanceDraft}
              onChangeText={setOpeningBalanceDraft}
              keyboardType="number-pad"
              editable={!savingOpeningBalance}
              style={[
                styles.input,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
              ]}
              placeholder="e.g. 25000"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              testID="bank-opening-balance-input"
            />
            <Text style={[styles.openingBalanceHelp, { color: colors.mutedForeground }]}>
              Current balance = opening balance + deposits − withdrawals.
            </Text>
            <View style={styles.openingBalanceActions}>
              <TouchableOpacity
                style={[styles.cancelOpeningBalanceBtn, { borderColor: colors.border }]}
                onPress={closeOpeningBalanceEditor}
                disabled={savingOpeningBalance}
              >
                <Text style={[styles.cancelOpeningBalanceText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveOpeningBalanceBtn, savingOpeningBalance && { opacity: 0.6 }]}
                onPress={handleOpeningBalanceSubmit}
                disabled={savingOpeningBalance}
                testID="bank-save-opening-balance"
              >
                {savingOpeningBalance ? (
                  <ActivityIndicator color="#0a1a10" />
                ) : (
                  <Text style={styles.saveOpeningBalanceText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  balance: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  negativeBalanceWarning: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    gap: 4,
  },
  negativeBalanceWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negativeBalanceWarningTitle: {
    color: '#ef4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  negativeBalanceWarningText: {
    color: '#d6b36a',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  openingBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  openingBalanceLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
  },
  openingBalanceValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
    marginTop: 2,
  },
  editOpeningBalanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(209,250,229,0.35)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  editOpeningBalanceText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#d1fae5',
    fontFamily: 'Inter_600SemiBold',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingVertical: 12,
  },
  actionBtnDisburse: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#0a1a10',
  },
  actionBtnTextDisburse: {
    color: '#f87171',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  managerGuidance: {
    marginTop: 10,
    color: '#d1fae5',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  list: { paddingHorizontal: 16, paddingTop: 16 },
  listHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1 },
  txDesc: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  txMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 8,
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 6 },
  emptyActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Modal styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleActive: {
    backgroundColor: '#4ade80',
  },
  toggleActiveDisburse: {
    backgroundColor: '#ef4444',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  openingBalanceHelp: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  openingBalanceActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelOpeningBalanceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelOpeningBalanceText: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  saveOpeningBalanceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#4ade80',
  },
  saveOpeningBalanceText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitDeposit: {
    backgroundColor: '#4ade80',
  },
  submitDisburse: {
    backgroundColor: '#ef4444',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  pickerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  memberRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
  },
  personalAccountNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  personalAccountNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
  },
  memberPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberPillText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden' as const,
  },
  categoryOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
});
