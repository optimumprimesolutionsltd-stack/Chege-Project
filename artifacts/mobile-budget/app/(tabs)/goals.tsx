             style={{
                                        flex: 1, height: 44, borderRadius: 10, borderWidth: 1,
                                        borderColor: colors.border, backgroundColor: colors.muted,
                                        paddingHorizontal: 12, fontSize: 16, color: colors.foreground,
                                        fontFamily: 'Inter_400Regular',
                                      }}
                                      keyboardType="numeric"
                                      placeholder="0"
                                      placeholderTextColor={colors.mutedForeground}
                                      value={contribPayerAmounts[pid] || ''}
                                      onChangeText={val => setContribPayerAmounts(prev => ({ ...prev, [pid]: val }))}
                                      testID={`goals-contrib-split-${pid}`}
                                    />
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
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Cascade / Distribute Modal ─────────────────────────────────────── */}
      <Modal
        visible={cascadeVisible}
        animationType="slide"
        transparent
        onRequestClose={closeCascade}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeCascade} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Distribute Payment</Text>
                    {!cascadeResult ? (
                      <TouchableOpacity
                        onPress={handleCascade}
                        disabled={submittingCascade}
                        style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingCascade ? 0.7 : 1 }]}
                      >
                        {submittingCascade ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.modalSaveBtnText}>Distribute</Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={closeCascade}
                        style={[styles.modalSaveBtn, { backgroundColor: '#1a3320' }]}
                      >
                        <Text style={[styles.modalSaveBtnText, { color: '#4ade80' }]}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.modalBody}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {cascadeResult ? (
                      /* Results view */
                      <>
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>DISTRIBUTION RESULT</Text>
                        {cascadeResult.map((alloc) => {
                          const goal = active.find((g) => g.id === alloc.goalId);
                          if (!alloc.allocated) return null;
                          return (
                            <View
                              key={alloc.goalId}
                              style={[styles.cascadeResultRow, { backgroundColor: alloc.completed ? '#1a3320' : colors.card, borderColor: alloc.completed ? '#4ade80' : colors.border }]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.cascadeGoalName, { color: colors.foreground }]} numberOfLines={1}>
                                  {alloc.goalName ?? goal?.name ?? `Goal ${alloc.goalId}`}
                                </Text>
                                {alloc.completed && (
                                  <Text style={{ color: '#4ade80', fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 }}>
                                    ✓ Completed!
                                  </Text>
                                )}
                              </View>
                              <Text style={{ color: alloc.completed ? '#4ade80' : colors.primary, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                                +KES {formatKES(alloc.allocated)}
                              </Text>
                            </View>
                          );
                        })}
                      </>
                    ) : (
                      /* Input view */
                      <>
                        <Text style={[{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 16, lineHeight: 18 }]}>
                          Enter a total amount, then arrange the goal priority. Funds fill the top goal first, then overflow to the next.
                        </Text>

                        {/* Amount */}
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TOTAL AMOUNT (KES)</Text>
                        <View style={[styles.amountRow, { marginBottom: 20 }]}>
                          <Text style={[styles.currencyLabel, { color: colors.mutedForeground }]}>KES</Text>
                          <TextInput
                            style={[styles.amountInput, { color: colors.foreground }]}
                            placeholder="0"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="numeric"
                            value={cascadeAmount}
                            onChangeText={setCascadeAmount}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                          />
                        </View>

                        {cascadePreview.allocations.length > 0 && (
                          <View style={[styles.cascadePreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>PAYMENT PREVIEW</Text>
                            {cascadePreview.allocations.map((allocation) => (
                              <View key={allocation.goalId} style={styles.cascadePreviewRow}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.cascadeGoalName, { color: colors.foreground }]} numberOfLines={1}>
                                    {allocation.goalName}
                                  </Text>
                                  <Text style={{ color: allocation.completed ? '#4ade80' : colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                                    {allocation.completed
                                      ? `Goal completed · KES ${formatKES(allocation.newTotal)} saved`
                                      : `KES ${formatKES(allocation.newTotal)} saved after payment`}
                                  </Text>
                                </View>
                                <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                                  +KES {formatKES(allocation.allocated)}
                                </Text>
                              </View>
                            ))}
                            {cascadePreview.leftover > 0 && (
                              <Text style={{ color: '#f59e0b', fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 8 }}>
                                KES {formatKES(cascadePreview.leftover)} remains after all selected goals are funded.
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Who is paying (cascade payer) */}
                        {members.length > 0 && (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                              WHO IS PAYING?{' '}
                              <Text style={{ fontWeight: '400', fontSize: 11 }}>(tap multiple to split)</Text>
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                              {/* Joint bank chip — default */}
                              <Pressable
                                testID="goals-cascade-joint-chip"
                                onPress={() => { setCascadePayerIds([]); setCascadePayerAmounts({}); }}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 6,
                                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                                  backgroundColor: validCascadePayerIds.length === 0 ? '#1a3320' : colors.muted,
                                  borderColor: validCascadePayerIds.length === 0 ? '#4ade80' : colors.border,
                                }}
                              >
                                <Feather
                                  name="home"
                                  size={13}
                                  color={validCascadePayerIds.length === 0 ? '#4ade80' : colors.mutedForeground}
                                />
                                <Text
                                  style={{
                                    fontSize: 14, fontFamily: 'Inter_600SemiBold',
                                    color: validCascadePayerIds.length === 0 ? '#4ade80' : colors.foreground,
                                  }}
                                >
                                  Joint bank
                                </Text>
                              </Pressable>
                              {members.map((m) => {
                                const sel = cascadePayerIds.includes(m.userId);
                                const name = m.userName?.split(' ')[0] ?? 'Member';
                                return (
                                  <Pressable
                                    key={m.userId}
                                    testID={`goals-cascade-member-${m.userId}`}
                                    onPress={() =>
                                      setCascadePayerIds(prev =>
                                        prev.includes(m.userId)
                                          ? prev.filter(id => id !== m.userId)
                                          : [...prev, m.userId]
                                      )
                                    }
                                    style={{
                                      flexDirection: 'row', alignItems: 'center', gap: 6,
                                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                                      backgroundColor: sel ? colors.primary + '22' : colors.muted,
                                      borderColor: sel ? colors.primary : colors.border,
                                    }}
                                  >
                                    <Feather name="user" size={13} color={sel ? colors.primary : colors.mutedForeground} />
                                    <Text style={{ fontSize: 14, color: sel ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{name}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            {/* Per-payer split amounts (multi named payers) */}
                            {validCascadePayerIds.length > 1 && (() => {
                              const total = parseFloat(cascadeAmount.replace(/,/g, '')) || 0;
                              const splitTotal = validCascadePayerIds.reduce(
                                (s, id) => s + (parseFloat(cascadePayerAmounts[id] || '0') || 0), 0
                              );
                              const diff = total - splitTotal;
                              return (
                                <View style={{ marginBottom: 12, gap: 8 }}>
                                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                                    How much is each person paying?
                                    {total > 0 ? ` (total: KES ${total.toLocaleString()})` : ''}
                                  </Text>
                                  {validCascadePayerIds.map((pid) => {
                                    const member = members.find(m => m.userId === pid);
                                    const name = member?.userName?.split(' ')[0] ?? 'Member';
                                    return (
                                      <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                                          placeholder="0"
                                          placeholderTextColor={colors.mutedForeground}
                                          value={cascadePayerAmounts[pid] || ''}
                                          onChangeText={val => setCascadePayerAmounts(prev => ({ ...prev, [pid]: val }))}
                                          testID={`goals-cascade-split-${pid}`}
                                        />
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

                        {/* Goal priority order */}
                        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>GOAL PRIORITY ORDER</Text>
                        {cascadeOrder.map((id, idx) => {
                          const goal = active.find((g) => g.id === id);
                          if (!goal) return null;
                          const remaining = goal.targetAmount - goal.currentAmount;
                          return (
                            <View
                              key={id}
                              style={[styles.cascadeGoalRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                            >
                              <View style={{ width: 24, alignItems: 'center' }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{idx + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.cascadeGoalName, { color: colors.foreground }]} numberOfLines={1}>{goal.name}</Text>
                                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                                  Needs KES {formatKES(remaining > 0 ? remaining : 0)} more
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'column', gap: 4 }}>
                                <TouchableOpacity
                                  onPress={() => moveCascadeGoal(idx, 'up')}
                                  disabled={idx === 0}
                                  style={{ opacity: idx === 0 ? 0.2 : 1 }}
                                  hitSlop={8}
                                >
                                  <Feather name="chevron-up" size={18} color={colors.mutedForeground} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => moveCascadeGoal(idx, 'down')}
                                  disabled={idx === cascadeOrder.length - 1}
                                  style={{ opacity: idx === cascadeOrder.length - 1 ? 0.2 : 1 }}
                                  hitSlop={8}
                                >
                                  <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── History Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        transparent
        onRequestClose={closeHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.historySheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={closeHistory} style={styles.modalHeaderBtn}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {historyGoal?.name}
                </Text>
                <Text style={[styles.historySubtitle, { color: colors.mutedForeground }]}>Contribution history</Text>
              </View>
              <TouchableOpacity
                onPress={() => refetchHistory()}
                style={[styles.modalHeaderBtn, { opacity: historyLoading ? 0.4 : 1 }]}
                disabled={historyLoading}
              >
                <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Date range filter bar */}
            {!historyLoading && (contributions as SavingsGoalContribution[]).length > 0 && (
              <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
                {/* Quick-filter chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                  style={styles.chipsScroll}
                >
                  {QUICK_CHIPS.map((chip) => {
                    const isActive = activeChip === chip.key;
                    return (
                      <Pressable
                        key={chip.key}
                        onPress={() => handleChipPress(chip.key)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isActive ? colors.primary as string : colors.muted,
                            borderColor: isActive ? colors.primary as string : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isActive ? '#fff' : colors.mutedForeground },
                          ]}
                        >
                          {chip.label}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* Month picker chip */}
                  <Pressable
                    onPress={() => setHistoryMonthPickerVisible(true)}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: 'row', gap: 4 },
                    ]}
                  >
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Month…</Text>
                  </Pressable>
                </ScrollView>

                {/* FROM / TO pickers */}
                <View style={styles.filterPickers}>
                  <View style={styles.filterField}>
                    <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>FROM</Text>
                    <DeadlinePicker
                      value={filterStart}
                      onChange={(d) => { setFilterStart(d); setActiveChip(null); }}
                      colors={colors}
                    />
                  </View>
                  <View style={styles.filterDivider} />
                  <View style={styles.filterField}>
                    <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>TO</Text>
                    <DeadlinePicker
                      value={filterEnd}
                      onChange={(d) => { setFilterEnd(d); setActiveChip(null); }}
                      colors={colors}
                    />
                  </View>
                  {(filterStart || filterEnd) && (
                    <TouchableOpacity
                      onPress={() => { setFilterStart(null); setFilterEnd(null); setActiveChip(null); }}
                      style={styles.filterClearBtn}
                      hitSlop={8}
                    >
                      <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Contributor chips — only when multiple contributors exist */}
                {showContributorFilter && (
                  <View style={styles.contributorRow}>
                    <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>
                      CONTRIBUTOR
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                    >
                      {uniqueContributors.map((name) => {
                        const isActive = filterContributor === name;
                        return (
                          <Pressable
                            key={name}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setFilterContributor(isActive ? null : name);
                            }}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: isActive ? '#1a3320' : colors.muted,
                                borderColor: isActive ? '#4ade80' : colors.border,
                              },
                            ]}
                          >
                            <Feather
                              name="user"
                              size={12}
                              color={isActive ? '#4ade80' : colors.mutedForeground}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.chipText,
                                { color: isActive ? '#4ade80' : colors.mutedForeground },
                              ]}
                            >
                              {name}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {filterContributor && (
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setFilterContributor(null);
                          }}
                          style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
                          hitSlop={4}
                        >
                          <Feather name="x" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />
                          <Text style={[styles.chipText, { color: colors.mutedForeground }]}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Filter summary bar */}
            {filterActive && !historyLoading && (contributions as SavingsGoalContribution[]).length > 0 && (
              <View style={[styles.filterSummaryBar, { backgroundColor: '#0f2217', borderBottomColor: colors.border }]}>
                <Feather name="bar-chart-2" size={13} color="#4ade80" style={{ marginRight: 6 }} />
                <Text style={[styles.filterSummaryText, { color: '#86efac' }]}>
                  {filteredContributions.length}{' '}
                  {filteredContributions.length === 1 ? 'contribution' : 'contributions'}
                  {filterContributor ? ` by ${filterContributor}` : ''}
                  {'  ·  '}
                  <Text style={{ color: filterNetTotal >= 0 ? '#4ade80' : '#f87171' }}>
                    {filterNetTotal >= 0
                      ? `KES ${formatKES(filterNetTotal)}`
                      : `\u2212 KES ${formatKES(Math.abs(filterNetTotal))}`} total
                  </Text>
                </Text>
              </View>
            )}

            {/* Per-contributor summary strip — shown when multiple contributors exist */}
            {showContributorFilter && !historyLoading && (contributions as SavingsGoalContribution[]).length > 0 && (
              <View style={[styles.contributorSummaryBar, { borderBottomColor: colors.border }]}>
                {contributorTotals.map((ct, idx) => {
                  const isActive = filterContributor === ct.name;
                  return (
                    <React.Fragment key={ct.name}>
                      {idx > 0 && (
                        <View style={[styles.contributorSummaryDivider, { backgroundColor: colors.border }]} />
                      )}
                      <TouchableOpacity
                        style={styles.contributorSummaryItem}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setFilterContributor(isActive ? null : ct.name);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.contributorSummaryName,
                            { color: isActive ? '#4ade80' : colors.mutedForeground },
                          ]}
                        >
                          {ct.name}
                        </Text>
                        <Text
                          style={[
                            styles.contributorSummaryAmount,
                            { color: isActive ? '#4ade80' : colors.foreground },
                          ]}
                        >
                          KES {formatKES(ct.total)}
                        </Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            {/* Body */}
            {(() => {
              const filtered = filteredContributions;

              if (historyLoading) {
                return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />;
              }
              if ((contributions as SavingsGoalContribution[]).length === 0) {
                return (
                  <View style={styles.historyEmpty}>
                    <Feather name="clock" size={36} color={colors.mutedForeground} />
                    <Text style={[styles.historyEmptyTitle, { color: colors.foreground }]}>No contributions yet</Text>
                    <Text style={[styles.historyEmptyText, { color: colors.mutedForeground }]}>
                      Tap "Contribute" on the goal card to start saving
                    </Text>
                  </View>
                );
              }
              if (filtered.length === 0) {
                return (
                  <View style={styles.historyEmpty}>
                    <Feather name="filter" size={36} color={colors.mutedForeground} />
                    <Text style={[styles.historyEmptyTitle, { color: colors.foreground }]}>No contributions found</Text>
                    <Text style={[styles.historyEmptyText, { color: colors.mutedForeground }]}>
                      {filterContributor
                        ? `No contributions from ${filterContributor} in this range`
                        : 'No contributions fall in the selected date range'}
                    </Text>
                  </View>
                );
              }
              return (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.historyList}
                >
                  {filtered.map((c, idx) => {
                    const isCorrection = isCorrectionRow(c);
                    const isCustomReason = isCorrection && c.note !== MANUAL_ADJUSTMENT_NOTE;
                    const isNegative = c.amount < 0;
                    const absAmount = Math.abs(c.amount);
                    const amountLabel = isNegative
                      ? `\u2212 KES ${formatKES(absAmount)}`
                      : `+ KES ${formatKES(absAmount)}`;
                    return (
                      <View
                        key={c.id}
                        style={[
                          styles.historyRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: idx < filtered.length - 1 ? 1 : 0,
                            opacity: isCorrection ? 0.8 : 1,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.historyDot,
                            {
                              backgroundColor: isCorrection ? colors.muted : '#1a3320',
                            },
                          ]}
                        >
                          <Feather
                            name={isCorrection ? 'sliders' : 'arrow-up-circle'}
                            size={16}
                            color={isCorrection ? colors.mutedForeground : '#4ade80'}
                          />
                        </View>
                        <View style={styles.historyRowInfo}>
                          <View style={styles.historyRowTop}>
                            <Text
                              style={[
                                styles.historyAmount,
                                {
                                  color: isCorrection
                                    ? isNegative
                                      ? colors.destructive ?? '#ef4444'
                                      : colors.mutedForeground
                                    : colors.foreground,
                                },
                              ]}
                            >
                              {amountLabel}
                            </Text>
                            {isCorrection ? (
                              <View style={styles.historyAdjustmentBadge}>
                                <Text style={[styles.historyAdjustmentBadgeText, { color: colors.mutedForeground }]}>
                                  Adjustment
                                </Text>
                              </View>
                            ) : (
                              <Text style={[styles.historyContributor, { color: '#4ade80' }]}>
                                {c.contributorName}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                            {isCorrection ? 'Balance correction' : formatDate(c.createdAt)}
                          </Text>
                          {isCorrection && (
                            <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                              {formatDate(c.createdAt)}
                            </Text>
                          )}
                          {isCustomReason && (
                            <Text
                              style={[styles.historyDate, { color: colors.mutedForeground, fontStyle: 'italic', marginTop: 2 }]}
                              numberOfLines={2}
                            >
                              {c.note}
                            </Text>
                          )}
                          {canManageShared && (
                            <Pressable
                              onPress={() => confirmDeleteHistoryContribution(c)}
                              disabled={deleteHistoryContribution.isPending}
                              style={styles.historyRemoveBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove savings ${isCorrection ? 'balance correction' : 'contribution'}`}
                            >
                              <Feather name="trash-2" size={13} color="#ef4444" />
                              <Text style={styles.historyRemoveText}>
                                {deleteHistoryContribution.isPending ? 'Removing…' : 'Remove'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── History Month-Jump Picker ──────────────────────────────────────── */}
      <Modal
        visible={historyMonthPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryMonthPickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setHistoryMonthPickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.pickerSheet, { backgroundColor: colors.dropdownBackground }]}>
                <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
                <Text style={[styles.pickerTitle, { color: colors.dropdownForeground }]}>Jump to month</Text>
                <FlatList
                  data={historyMonthOptions}
                  keyExtractor={(item: { month: number; year: number; label: string }) => `${item.year}-${item.month}`}
                  showsVerticalScrollIndicator={false}
                  style={styles.pickerList}
                  renderItem={({ item }: { item: { month: number; year: number; label: string } }) => {
                    const isActive =
                      filterStart &&
                      filterStart.getMonth() + 1 === item.month &&
                      filterStart.getFullYear() === item.year &&
                      !activeChip;
                    return (
                      <Pressable
                        onPress={() => jumpHistoryToMonth(item.month, item.year)}
                        style={[styles.pickerItem, isActive && { backgroundColor: colors.accent }]}
                      >
                        <Text style={[styles.pickerItemText, { color: isActive ? colors.accentForeground : colors.dropdownForeground }, isActive && { fontFamily: 'Inter_700Bold' }]}>
                          {item.label}
                        </Text>
                        {isActive && <Feather name="check" size={16} color={colors.accentForeground} />}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Edit Goal Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={editGoalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeEditGoal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeEditGoal} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Goal</Text>
                    <TouchableOpacity
                      onPress={handleUpdateGoal}
                      disabled={submittingEdit}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingEdit ? 0.4 : 1 }]}
                    >
                      {submittingEdit ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalBody}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Goal name */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GOAL NAME</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. Emergency Fund"
                      placeholderTextColor={colors.mutedForeground}
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      returnKeyType="next"
                    />

                    {/* Target amount */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TARGET AMOUNT (KES)</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. 50000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={editTarget}
                      onChangeText={setEditTarget}
                      returnKeyType="next"
                    />

                    {/* Current balance correction */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CURRENT BALANCE (KES)</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="Leave unchanged or enter correction"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      value={editCurrentAmount}
                      onChangeText={(v) => { setEditCurrentAmount(v); setEditCorrectionReason(''); }}
                      returnKeyType="next"
                    />

                    {/* Big-drop warning + required reason */}
                    {editIsBigDrop && (
                      <View style={{
                        backgroundColor: '#fef3c7',
                        borderColor: '#d97706',
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 8,
                        gap: 8,
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>
                          ⚠ This will remove KES {editDropAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from this goal
                        </Text>
                        <Text style={{ fontSize: 12, color: '#b45309' }}>
                          That's more than 50% of the current balance. Please explain why so this correction can be traced.
                        </Text>
                        <Text style={[styles.fieldLabel, { color: '#92400e', marginTop: 4 }]}>REASON (required)</Text>
                        <TextInput
                          style={[styles.textInput, {
                            backgroundColor: '#fffbeb',
                            borderColor: '#d97706',
                            color: '#1c1917',
                            borderRadius: 8,
                            marginBottom: 0,
                          }]}
                          placeholder="e.g. Withdrew funds to cover medical bill"
                          placeholderTextColor="#a16207"
                          value={editCorrectionReason}
                          onChangeText={setEditCorrectionReason}
                          returnKeyType="done"
                          multiline
                        />
                      </View>
                    )}

                    {/* Deadline */}
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEADLINE (optional)</Text>
                    <DeadlinePicker
                      value={editDeadlineDate}
                      onChange={setEditDeadlineDate}
                      colors={colors}
                    />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Rename Completed Goal Modal ────────────────────────────────────── */}
      <Modal
        visible={renameVisible}
        animationType="slide"
        transparent
        onRequestClose={closeRenameGoal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalAvoid}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: botPad + 16 }]}>
                  {/* Handle */}
                  <View style={[styles.handle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={closeRenameGoal} style={styles.modalHeaderBtn}>
                      <Feather name="x" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rename Goal</Text>
                    <TouchableOpacity
                      onPress={handleRenameGoal}
                      disabled={submittingRename}
                      style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: submittingRename ? 0.7 : 1 }]}
                    >
                      {submittingRename ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalBody}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>GOAL NAME</Text>
                    <TextInput
                      style={[styles.textInput, {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        color: colors.foreground,
                        borderRadius: colors.radius,
                      }]}
                      placeholder="e.g. Emergency Fund"
                      placeholderTextColor={colors.mutedForeground}
                      value={renameName}
                      onChangeText={setRenameName}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleRenameGoal}
                    />
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  newGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4ade80',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newGoalBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    color: '#0a1a10',
  },
  headerStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatLabel: {
    fontSize: 11,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerStatValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#f7faf6',
    fontFamily: 'Inter_700Bold',
  },
  headerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  list: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  kebabBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  kebabBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardPct: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: { height: '100%', borderRadius: 4 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardAmounts: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  cardAmountSaved: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  cardAmountTarget: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    flexShrink: 0,
  },
  contributeBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#4ade80',
  },
  cascadeGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  cascadeGoalName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
  },
  cascadeResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  cascadePreview: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  cascadePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
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
  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalAvoid: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalHeaderBtn: { padding: 4 },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 68,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    fontFamily: 'Inter_400Regular',
  },
  // Contribute modal
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  goalPillText: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    color: '#4ade80',
    flex: 1,
  },
  goalPillSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#7aaa8a',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  currencyLabel: {
    fontSize: 22,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 6,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '800' as const,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    letterSpacing: -1,
  },
  // History modal
  historySheet: {
    maxHeight: '85%',
  },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center', paddingVertical: 12 },
  pickerList: { flexGrow: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginHorizontal: 12, marginVertical: 1 },
  pickerItemText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  filterBar: {
    flexDirection: 'column',
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  chipsScroll: {
    flexShrink: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  filterPickers: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterField: {
    flex: 1,
    gap: 4,
  },
  filterLabel: {
    fontSize: 9,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginLeft: 2,
  },
  filterDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'transparent',
  },
  filterClearBtn: {
    padding: 4,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  contributorRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  filterSummaryText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  historySubtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 40,
    gap: 10,
  },
  historyEmptyTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 4,
  },
  historyEmptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  historyList: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  historyDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  historyRowInfo: {
    flex: 1,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  historyContributor: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  historyDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  historyRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 5,
    marginTop: 3,
  },
  historyRemoveText: {
    color: '#ef4444',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  historyAdjustmentBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  historyAdjustmentBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  // Contributor summary strip
  contributorSummaryBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  contributorSummaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
  },
  contributorSummaryDivider: {
    width: 1,
    marginVertical: 4,
  },
  contributorSummaryName: {
    fontSize: 10,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  contributorSummaryAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
});
