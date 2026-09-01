ar }) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey({ month, year }) });
            queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
          } catch {
            Alert.alert('Error', 'Could not delete expense.');
          }
        },
      },
    ]);
  };

  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const [contributionForm, setContributionForm] = useState<ContributionEditForm>({
    amount: '', note: '', month, year, forUserId: '',
  });
  const [savingContribution, setSavingContribution] = useState(false);

  const canEditContribution = (contribution: Contribution) => {
    if (!user) return false;
    if (!isSharedWorkspace) return contribution.userId === user.id;
    if (isContributionManager) return true;
    return contribution.userId === user.id
      && new Date(contribution.createdAt).toDateString() === new Date().toDateString();
  };

  const canRemoveContribution = (contribution: Contribution) => {
    if (!user) return false;
    return isSharedWorkspace
      ? isContributionManager
      : contribution.userId === user.id;
  };

  const openContributionEdit = (contribution: Contribution) => {
    setContributionForm({
      amount: String(contribution.amount),
      note: contribution.note ?? '',
      month: contribution.month,
      year: contribution.year,
      forUserId: contribution.userId,
    });
    setEditingContribution(contribution);
  };

  const invalidateContributionCaches = () => {
    queryClient.invalidateQueries({ queryKey: getGetContributionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardIncomeStreamsQueryKey() });
  };

  const saveContribution = async () => {
    if (!editingContribution) return;
    const amount = Number(contributionForm.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      Alert.alert('Whole amount required', 'Enter a whole KES contribution amount greater than zero.');
      return;
    }
    if (!Number.isInteger(contributionForm.month)
      || contributionForm.month < 1
      || contributionForm.month > 12
      || !Number.isInteger(contributionForm.year)
      || contributionForm.year < 2000
      || contributionForm.year > 2200
      || !contributionForm.forUserId) {
      Alert.alert('Missing fields', 'Choose a valid month, year, and member.');
      return;
    }
    setSavingContribution(true);
    try {
      await updateContribution.mutateAsync({
        id: editingContribution.id,
        data: {
          amount,
          month: contributionForm.month,
          year: contributionForm.year,
          note: contributionForm.note.trim() || undefined,
          ...(isContributionManager ? { forUserId: contributionForm.forUserId } : {}),
        },
      });
      invalidateContributionCaches();
      setEditingContribution(null);
    } catch {
      Alert.alert('Error', 'Could not save this contribution.');
    } finally {
      setSavingContribution(false);
    }
  };

  const removeContribution = (contribution: Contribution) => {
    Alert.alert('Remove contribution', `Remove KES ${formatKES(contribution.amount)} from ${contribution.userName} in "${workspaceBudgetName(group)}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteContribution.mutateAsync({ id: contribution.id });
            invalidateContributionCaches();
          } catch {
            Alert.alert('Error', 'Could not remove this contribution.');
          }
        },
      },
    ]);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <WorkspaceIdentityRow group={group} tone="light" />
        {/* Title row */}
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {activeTab === 'expenses' ? 'Expenses' : activeTab === 'contributions' ? 'Contributions' : 'Activity'}
          </Text>
          {activeTab === 'expenses' && expenses.length > 0 && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {expenses.length} entries · KES {formatKES(totalSpent)}
            </Text>
          )}
          {activeTab === 'activity' && activityFeed.length > 0 && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Recent {activityFeed.length} items
            </Text>
          )}
          {activeTab === 'contributions' && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {MONTHS_SHORT[month - 1]} {year} group report
            </Text>
          )}
        </View>

        {/* Segment switcher + month nav */}
        <View style={styles.headerControls}>
          {/* Tab toggle */}
          <View style={[styles.segmentBar, { backgroundColor: colors.muted }]}>
            <Pressable
              onPress={() => setActiveTab('expenses')}
              style={[styles.segmentBtn, activeTab === 'expenses' && { backgroundColor: colors.card, borderRadius: 8 }]}
            >
              <Feather name="list" size={13} color={activeTab === 'expenses' ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: activeTab === 'expenses' ? colors.foreground : colors.mutedForeground }]}>Expenses</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('activity')}
              style={[styles.segmentBtn, activeTab === 'activity' && { backgroundColor: colors.card, borderRadius: 8 }]}
            >
              <Feather name="activity" size={13} color={activeTab === 'activity' ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: activeTab === 'activity' ? colors.foreground : colors.mutedForeground }]}>Activity</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('contributions')}
              style={[styles.segmentBtn, activeTab === 'contributions' && { backgroundColor: colors.card, borderRadius: 8 }]}
            >
              <Feather name="trending-up" size={13} color={activeTab === 'contributions' ? colors.foreground : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: activeTab === 'contributions' ? colors.foreground : colors.mutedForeground }]}>Contributions</Text>
            </Pressable>
          </View>

          {/* Month nav — expenses and contributions use the same monthly context */}
          {(activeTab === 'expenses' || activeTab === 'contributions') && (
            <View style={styles.monthNav}>
              <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={8}>
                <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => setPickerVisible(true)} hitSlop={6} style={styles.monthLabelBtn}>
                <Text style={[styles.monthLabel, { color: colors.foreground }]}>{MONTHS_SHORT[month - 1]} {year}</Text>
                <Feather name="chevron-down" size={12} color={colors.mutedForeground} style={{ marginLeft: 3 }} />
              </Pressable>
              <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={8} disabled={isCurrentMonth}>
                <Feather name="chevron-right" size={20} color={isCurrentMonth ? colors.border : colors.mutedForeground} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Month Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
                <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
                <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Jump to month</Text>
                <FlatList
                  data={monthOptions}
                  keyExtractor={(item) => `${item.year}-${item.month}`}
                  showsVerticalScrollIndicator={false}
                  style={styles.pickerList}
                  renderItem={({ item }) => {
                    const selected = item.month === month && item.year === year;
                    return (
                      <Pressable
                        onPress={() => jumpToMonth(item.month, item.year)}
                        style={[styles.pickerItem, selected && { backgroundColor: colors.accent }]}
                      >
                        <Text style={[styles.pickerItemText, { color: selected ? colors.accentForeground : colors.foreground }, selected && { fontFamily: 'Inter_700Bold' }]}>
                          {item.label}
                        </Text>
                        {selected && <Feather name="check" size={16} color={colors.accentForeground} />}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Recurring banner — expenses tab only */}
      {activeTab === 'expenses' && showRecurringBanner && (
        <Pressable
          onPress={handleApplyRecurring}
          disabled={applyingRecurring}
          style={[styles.recurringBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="refresh-cw" size={15} color={colors.primary} />
          <Text style={[styles.recurringBannerText, { color: colors.foreground }]}>
            {recurringFromPrev.length} repeating expense{recurringFromPrev.length !== 1 ? 's' : ''} from last month — tap to add them
          </Text>
          <Text style={[styles.recurringBannerAction, { color: colors.primary }]}>
            {applyingRecurring ? 'Adding…' : 'Add now'}
          </Text>
        </Pressable>
      )}

      {activeTab === 'expenses' ? (
        isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : (
          <PageFlatList
            data={expenseRows}
            keyExtractor={(row) =>
              row._kind === 'exp-header'
                ? `ehdr-${row.date}`
                : `echild-${row.groupDate}-${row.item.id}`
            }
            renderItem={({ item: row }) => {
              if (row._kind === 'exp-header') {
                return (
                  <View
                    style={[styles.groupHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.groupHeaderLeft}>
                      <Text style={[styles.groupDate, { color: colors.foreground }]}>{row.dateLabel}</Text>
                      <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
                        {row.count} expense{row.count !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.groupHeaderRight}>
                      <Text style={[styles.groupExpenseTotal, { color: colors.foreground }]}>
                        −{row.total.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <View style={styles.groupChild}>
                  <View style={[styles.groupChildLine, { backgroundColor: colors.border }]} />
                  <View style={styles.groupChildCard}>
                    <ExpenseRow
                      expense={row.item}
                      colors={colors}
                      onEdit={canEditExpenseRecord(row.item) ? () => openEdit(row.item) : undefined}
                      onDelete={canRemoveExpenseRecord(row.item) ? () => handleDelete(row.item) : undefined}
                    />
                  </View>
                </View>
              );
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="inbox" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No expenses yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {MONTHS_SHORT[month - 1]} {year} is empty. Record your first expense to start seeing your spending here.
                </Text>
                <Pressable
                  testID="history-create-first-expense"
                  accessibilityRole="button"
                  accessibilityLabel="Log your first expense"
                  onPress={() => router.push('/add-expense')}
                  style={[styles.emptyAction, { backgroundColor: colors.primary }]}
                >
                  <Feather name="plus" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Log first expense</Text>
                </Pressable>
              </View>
            }
          />
        )
      ) : activeTab === 'contributions' ? (
        summaryLoading || contributionsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : summaryError || contributionsQuery.isError ? (
          <View style={styles.empty}><Feather name="alert-circle" size={36} color={colors.destructive} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn’t load contributions</Text><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Check your group access, then pull down to try again.</Text></View>
        ) : (
          <PageFlatList
            data={contributions}
            keyExtractor={(item) => `contribution-${item.id}`}
            ListHeaderComponent={
              <View style={styles.contributionListHeader}>
                <View style={[styles.contributionIntro, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '33' }]}>
                  <Feather name="info" size={16} color={colors.primary} />
                  <Text style={[styles.contributionIntroText, { color: colors.mutedForeground }]}>Personal expense portions, bank deposits, and savings contributions are counted once. Joint bank funding stays with the group.</Text>
                </View>
                <View style={[styles.householdTotal, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.householdTotalLabel, { color: colors.mutedForeground }]}>Group contribution total</Text>
                  <Text style={[styles.householdTotalAmount, { color: colors.foreground }]}>KES {formatKES(contributionMembers.reduce((sum, member) => sum + member.contributed, 0))}</Text>
                </View>
                {contributionMembers.map((member) => (
                  <View key={member.userId} style={[styles.contributionMember, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.contributionMemberTop}>
                      <View><Text style={[styles.contributionMemberName, { color: colors.foreground }]}>{member.name}</Text><Text style={[styles.contributionMemberTarget, { color: colors.mutedForeground }]}>{member.target == null ? 'No monthly target' : `Target KES ${formatKES(member.target)}`}</Text></View>
                      <Text style={[styles.contributionMemberAmount, { color: colors.primary }]}>KES {formatKES(member.contributed)}</Text>
                    </View>
                    <View style={styles.contributionStats}><Text style={[styles.contributionStat, { color: colors.mutedForeground }]}>Spent <Text style={{ color: colors.foreground }}>KES {formatKES(member.spent)}</Text></Text><Text style={[styles.contributionStat, { color: colors.mutedForeground }]}>Net <Text style={{ color: member.net >= 0 ? colors.primary : colors.destructive }}>KES {formatKES(member.net)}</Text></Text></View>
                  </View>
                ))}
                {sharedHouseholdRows.length > 0 && (
                  <View style={[styles.sharedFunding, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Text style={[styles.sharedFundingTitle, { color: colors.foreground }]}>Shared budget funding</Text>
                    <Text style={[styles.sharedFundingText, { color: colors.mutedForeground }]}>Joint bank portions are Shared budget funds and are not included in member contribution totals.</Text>
                    {sharedHouseholdRows.map((item) => <View key={item.id} style={styles.sharedFundingRow}><Text style={[styles.sharedFundingText, { color: colors.foreground }]} numberOfLines={1}>{item.description}</Text><Text style={[styles.sharedFundingAmount, { color: colors.foreground }]}>KES {formatKES(item.amount)}</Text></View>)}
                  </View>
                )}
                {isSharedMember && (
                  <View style={[styles.contributionPermissionNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="lock" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.contributionPermissionText, { color: colors.mutedForeground }]}>Members can edit only their own contributions created today. Only owners and admins can remove records.</Text>
                  </View>
                )}
                <Text style={[styles.contributionRowsTitle, { color: colors.foreground }]}>Standalone contributions</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ContributionRow
                contribution={item}
                colors={colors}
                onEdit={canEditContribution(item) ? () => openContributionEdit(item) : undefined}
                onRemove={canRemoveContribution(item) ? () => removeContribution(item) : undefined}
              />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
            ListEmptyComponent={<View style={styles.empty}><Feather name="trending-up" size={36} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No standalone contributions</Text><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Member totals are still shown above when available.</Text></View>}
          />
        )
      ) : (
        activityLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
        ) : activityError ? (
          <View style={styles.empty}><Feather name="alert-circle" size={36} color={colors.destructive} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn’t load activity</Text><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Pull down to try again.</Text></View>
        ) : (
          <PageFlatList
            data={activityRows}
            keyExtractor={(row) =>
              row._kind === 'header' ? `hdr-${row.date}` : `child-${row.groupDate}-${row.item.id}`
            }
            renderItem={({ item: row }) => {
              if (row._kind === 'header') {
                const expanded = expandedGroups.has(row.date);
                return (
                  <Pressable
                    onPress={() => toggleGroup(row.date)}
                    style={[styles.groupHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    {/* Left: date + count */}
                    <View style={styles.groupHeaderLeft}>
                      <Text style={[styles.groupDate, { color: colors.foreground }]}>{row.dateLabel}</Text>
                      <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
                        {row.count} item{row.count !== 1 ? 's' : ''}
                      </Text>
                    </View>

                    {/* Right: totals + chevron */}
                    <View style={styles.groupHeaderRight}>
                      {row.totalExpenses > 0 && (
                        <Text style={[styles.groupExpenseTotal, { color: colors.foreground }]}>
                          −{row.totalExpenses.toLocaleString()}
                        </Text>
                      )}
                      {row.totalDeposits > 0 && (
                        <Text style={styles.groupDepositTotal}>
                          +{row.totalDeposits.toLocaleString()}
                        </Text>
                      )}
                      <Feather
                        name={expanded ? 'chevron-down' : 'chevron-right'}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </View>
                  </Pressable>
                );
              }
              // Child row — indented ActivityCard
              return (
                <View style={styles.groupChild}>
                  <View style={[styles.groupChildLine, { backgroundColor: colors.border }]} />
                  <View style={styles.groupChildCard}>
                    <ActivityCard item={row.item} colors={colors} />
                  </View>
                </View>
              );
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="activity" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No activity yet</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Expenses and contributions will appear here</Text>
                <Pressable
                  testID="history-create-first-activity"
                  accessibilityRole="button"
                  accessibilityLabel="Log your first expense"
                  onPress={() => router.push('/add-expense')}
                  style={[styles.emptyAction, { backgroundColor: colors.primary }]}
                >
                  <Feather name="plus" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>Log first expense</Text>
                </Pressable>
              </View>
            }
          />
        )
      )}

      {/* Edit Modal */}
      <Modal visible={!!editingExpense} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              {/* Handle bar */}
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Expense</Text>
                <Pressable onPress={closeEdit} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                {/* Amount */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (KES)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.amount}
                  onChangeText={v => setEditForm(f => ({ ...f, amount: v }))}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Description */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.description}
                  onChangeText={v => setEditForm(f => ({ ...f, description: v }))}
                  placeholder="e.g. School fees"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Category */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {categories.map(c => {
                    const sel = editForm.category === c.name;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setEditForm(f => ({ ...f, category: c.name }))}
                        style={[styles.chip, { backgroundColor: sel ? colors.secondary : colors.muted, borderColor: sel ? colors.secondary : colors.border }]}
                      >
                        <Feather name={getCategoryIcon(c.name)} size={12} color={sel ? '#fff' : colors.mutedForeground} />
                        <Text style={[styles.chipText, { color: sel ? '#fff' : colors.foreground }]}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Paid by */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Paid by <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <View style={styles.memberRow}>
                  <Pressable
                    onPress={() => {
                      setEditPaidFromBank(true);
                      setEditForm(f => ({ ...f, paidById: null }));
                      setEditSelectedSources([]);
                      setEditSplitAmounts({});
                      setEditOtherLabel('');
                    }}
                    style={[styles.memberPill, {
                      backgroundColor: editPaidFromBank ? 'rgba(56,189,248,0.15)' : colors.muted,
                      borderColor: editPaidFromBank ? '#38bdf8' : colors.border,
                    }]}
                  >
                    <Feather name="credit-card" size={12} color={editPaidFromBank ? '#38bdf8' : colors.mutedForeground} />
                    <Text style={[styles.memberPillText, { color: editPaidFromBank ? '#38bdf8' : colors.foreground }]}>
                      Joint bank
                    </Text>
                  </Pressable>
                  {members.map(m => {
                    const sel = editForm.paidById === m.userId;
                    const name = m.userName?.split(' ')[0] ?? 'Member';
                    return (
                      <Pressable
                        key={m.userId}
                        onPress={() => {
                          setEditForm(f => ({ ...f, paidById: m.userId }));
                          if (editSelectedSources.length === 1 && editSelectedSources[0] === JOINT_BANK_SOURCE) {
                            setEditPaidFromBank(false);
                            setEditSelectedSources([]);
                            setEditSplitAmounts({});
                          }
                        }}
                        style={[styles.memberPill, { backgroundColor: sel ? '#4ade80' : colors.muted, borderColor: sel ? '#4ade80' : colors.border }]}
                      >
                        <Feather name="user" size={12} color={sel ? '#0a1a10' : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: sel ? '#0a1a10' : colors.foreground }]}>{name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!editForm.paidById && !editPaidFromBank && (
                  <Text style={[styles.memberPillText, { color: colors.mutedForeground, marginTop: 4 }]}>
                    Tap to choose who paid
                  </Text>
                )}

                {/* Funded From — optional when editing */}
                <View style={[styles.editFundingCard, { backgroundColor: colors.muted, borderColor: colors.primary + '40' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Feather name="layers" size={13} color={colors.primary} />
                    <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>FUNDED FROM</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>(optional)</Text>
                  </View>

                  {/* Joint bank can fund a portion alongside personal sources. */}
                  <Pressable
                    onPress={() => {
                      setEditPaidFromBank((current) => {
                        const next = !current;
                        setEditSelectedSources((selected) => next
                          ? (selected.includes(JOINT_BANK_SOURCE) ? selected : [JOINT_BANK_SOURCE, ...selected])
                          : selected.filter((name) => name !== JOINT_BANK_SOURCE));
                        return next;
                      });
                    }}
                    style={[styles.sourceChip, {
                      backgroundColor: editPaidFromBank ? 'rgba(56,189,248,0.15)' : colors.background,
                      borderColor: editPaidFromBank ? '#38bdf8' : colors.border,
                      alignSelf: 'flex-start', marginBottom: 8,
                    }]}
                  >
                    <Feather name="credit-card" size={12} color={editPaidFromBank ? '#38bdf8' : colors.mutedForeground} />
                    <Text style={[styles.sourceChipText, { color: editPaidFromBank ? '#38bdf8' : colors.foreground }]}>Joint bank</Text>
                    {editPaidFromBank && <Feather name="check" size={10} color="#38bdf8" />}
                  </Pressable>

                  {/* Personal income sources from DB */}
                  {editSourcesLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                  ) : (
                    <>
                      {editSources.length === 0 && (
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                          No income sources — add them from Budget, or choose Other.
                        </Text>
                      )}
                      <View style={styles.sourceChipsGrid}>
                      {editSources.map((src, idx) => {
                        const color = PALETTE[idx % PALETTE.length];
                        const selected = editSelectedSources.includes(src.name);
                        return (
                          <Pressable
                            key={src.id}
                            onPress={() => setEditSelectedSources(prev =>
                              prev.includes(src.name) ? prev.filter(k => k !== src.name) : [...prev, src.name]
                            )}
                            style={[styles.sourceChip, {
                              backgroundColor: selected ? color + '22' : colors.background,
                              borderColor: selected ? color : colors.border,
                            }]}
                          >
                            <Feather name="briefcase" size={12} color={selected ? color : colors.mutedForeground} />
                            <Text style={[styles.sourceChipText, { color: selected ? color : colors.foreground }]}>
                              {src.name}
                            </Text>
                            {selected && <Feather name="check" size={10} color={color} />}
                          </Pressable>
                        );
                      })}
                      {/* Other — free-text for unlisted sources */}
                      {(() => {
                        const selected = editSelectedSources.includes('Other');
                        return (
                          <Pressable
                            onPress={() => setEditSelectedSources(prev =>
                              prev.includes('Other') ? prev.filter(k => k !== 'Other') : [...prev, 'Other']
                            )}
                            style={[styles.sourceChip, {
                              backgroundColor: selected ? '#6b728022' : colors.background,
                              borderColor: selected ? '#6b7280' : colors.border,
                            }]}
                          >
                            <Feather name="more-horizontal" size={12} color={selected ? '#6b7280' : colors.mutedForeground} />
                            <Text style={[styles.sourceChipText, { color: selected ? '#6b7280' : colors.foreground }]}>Other</Text>
                            {selected && <Feather name="check" size={10} color="#6b7280" />}
                          </Pressable>
                        );
                      })()}
                      </View>
                    </>
                  )}
                  {editSelectedSources.includes('Other') && (
                    <TextInput
                      style={[styles.input, { marginTop: 8, backgroundColor: colors.background, paddingVertical: 8 }]}
                      placeholder="Describe the source (e.g. Consultancy, Parents)"
                      placeholderTextColor={colors.mutedForeground}
                      value={editOtherLabel}
                      onChangeText={setEditOtherLabel}
                    />
                  )}

                  {editSelectedSources.length > 1 && (
                    <View style={{ marginTop: 10, gap: 6 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                        How much from each source?
                      </Text>
                      {editSelectedSources.map((name, idx) => {
                        const color = PALETTE[idx % PALETTE.length];
                        return (
                          <View key={name} style={[styles.splitAmountRow, { backgroundColor: colors.background, borderColor: color + '44' }]}>
                            <Feather
                              name={name === JOINT_BANK_SOURCE ? 'credit-card' : name === 'Other' ? 'more-horizontal' : 'briefcase'}
                              size={13}
                              color={color}
                            />
                            <Text style={[styles.splitAmountLabel, { color: colors.foreground }]} numberOfLines={1}>
                              {name === JOINT_BANK_SOURCE ? 'Joint bank' : name === 'Other' ? (editOtherLabel || 'Other') : name}
                            </Text>
                            <View style={styles.splitAmountInputBox}>
                              <Text style={[styles.splitCurrency, { color: colors.mutedForeground }]}>KES</Text>
                              <TextInput
                                style={[styles.splitAmountInput, { color }]}
                                placeholder="0"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="numeric"
                                value={editSplitAmounts[name] || ''}
                                onChangeText={v => setEditSplitAmounts(prev => ({ ...prev, [name]: v }))}
                              />
                            </View>
                          </View>
                        );
                      })}
                      {(() => {
                        const total = editSelectedSources.reduce((s, k) => s + (parseFloat(editSplitAmounts[k] || '0') || 0), 0);
                        const expAmt = parseFloat(editForm.amount) || 0;
                        const ok = expAmt > 0 && Math.abs(total - expAmt) < 1;
                        return (
                          <Text style={{ fontSize: 12, fontFamily: ok ? 'Inter_600SemiBold' : 'Inter_400Regular', color: ok ? '#4ade80' : '#f87171' }}>
                            {ok ? `✓ Sources add up to KES ${total.toLocaleString()}` : `Total: KES ${total.toLocaleString()} · need KES ${expAmt.toLocaleString()}`}
                          </Text>
                        );
                      })()}
                    </View>
                  )}
                </View>

                {/* Notes */}
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={editForm.notes}
                  onChangeText={v => setEditForm(f => ({ ...f, notes: v }))}
                  placeholder="Any extra details"
                  placeholderTextColor={colors.mutedForeground}
                />

                {/* Date */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>
                    Date <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                    No future dates
                  </Text>
                </View>
                <Pressable
                  onPress={() => setEditShowDatePicker(true)}
                  style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                >
                  <Feather name="calendar" size={15} color={colors.primary} />
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                    {editForm.date
                      ? new Date(editForm.date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Select date'}
                  </Text>
                  {editForm.date === todayIso()
                    ? <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary, backgroundColor: colors.primary + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' }}>Today</Text>
                    : editForm.date
                    ? <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' }}>Backdated</Text>
                    : null}
                </Pressable>
                {editShowDatePicker && (
                  <DateTimePicker
                    value={editForm.date ? new Date(editForm.date + 'T00:00:00') : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                    maximumDate={new Date()}
                    onChange={(_e: DateTimePickerEvent, sel?: Date) => {
                      setEditShowDatePicker(Platform.OS === 'ios');
                      if (sel) {
                        const y = sel.getFullYear();
                        const mo = String(sel.getMonth() + 1).padStart(2, '0');
                        const d = String(sel.getDate()).padStart(2, '0');
                        setEditForm(f => ({ ...f, date: `${y}-${mo}-${d}` }));
                      }
                    }}
                  />
                )}

                {/* Save */}
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!editingContribution} animationType="slide" transparent onRequestClose={() => setEditingContribution(null)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Contribution</Text>
                <Pressable onPress={() => setEditingContribution(null)} hitSlop={8}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (KES)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={contributionForm.amount}
                  onChangeText={(amount) => setContributionForm((form) => ({ ...form, amount }))}
                  keyboardType="numeric"
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                  value={contributionForm.note}
                  onChangeText={(note) => setContributionForm((form) => ({ ...form, note }))}
                  placeholder="What is this contribution for?"
                  placeholderTextColor={colors.mutedForeground}
                />
                <View style={styles.contributionDateRow}>
                  <View style={styles.contributionDateField}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Month</Text>
                    <TextInput
                      style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                      value={String(contributionForm.month)}
                      keyboardType="number-pad"
                      onChangeText={(value) => setContributionForm((form) => ({ ...form, month: Number(value) || 0 }))}
                    />
                  </View>
                  <View style={styles.contributionDateField}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Year</Text>
                    <TextInput
                      style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted }]}
                      value={String(contributionForm.year)}
                      keyboardType="number-pad"
                      onChangeText={(value) => setContributionForm((form) => ({ ...form, year: Number(value) || 0 }))}
                    />
                  </View>
                </View>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Member attribution</Text>
                <View style={styles.memberRow}>
                  {members.map((member) => {
                    const selected = contributionForm.forUserId === member.userId;
                    return (
                      <Pressable
                        key={member.userId}
                        disabled={!isContributionManager}
                        onPress={() => setContributionForm((form) => ({ ...form, forUserId: member.userId }))}
                        style={[styles.memberPill, {
                          backgroundColor: selected ? colors.primary + '22' : colors.muted,
                          borderColor: selected ? colors.primary : colors.border,
                          opacity: isContributionManager || selected ? 1 : 0.55,
                        }]}
                      >
                        <Feather name="user" size={12} color={selected ? colors.primary : colors.mutedForeground} />
                        <Text style={[styles.memberPillText, { color: selected ? colors.primary : colors.foreground }]}>
                          {member.userName ?? 'Member'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!isContributionManager && (
                  <Text style={[styles.contributionPermissionText, { color: colors.mutedForeground }]}>Only owners and admins can change member attribution.</Text>
                )}
                <Pressable onPress={saveContribution} disabled={savingContribution} style={[styles.saveBtn, savingContribution && { opacity: 0.6 }]}>
                  {savingContribution ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function ExpenseRow({
  expense, colors, onEdit, onDelete,
}: {
  expense: Expense;
  colors: any;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const icon = getCategoryIcon(expense.category);
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon} size={16} color={colors.accentForeground} />
      </View>
      <View style={styles.rowInfo}>
        <Text selectable={false} style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>{expense.description}</Text>
        <Text selectable={false} style={[styles.rowMeta, { color: colors.mutedForeground }]}>
          {expense.paidByName ?? 'Joint bank'} · {expense.category} · {formatDate(expense.date)}
        </Text>
        {expense.notes ? <Text selectable={false} style={[styles.rowNotes, { color: colors.mutedForeground }]}>{expense.notes}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <Text selectable={false} style={[styles.rowAmount, { color: colors.foreground }]}>
          −{expense.amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
        </Text>
        <View style={styles.rowActions}>
          {onEdit ? <Pressable onPress={onEdit} hitSlop={6} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel={`Edit ${expense.description}`}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Edit</Text>
          </Pressable> : null}
          {onDelete ? <Pressable onPress={onDelete} hitSlop={6} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel={`Remove ${expense.description}`}>
            <Feather name="trash-2" size={14} color="#ef4444" />
            <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Remove</Text>
          </Pressable> : null}
        </View>
      </View>
    </View>
  );
}

function ContributionRow({
  contribution, colors, onEdit, onRemove,
}: {
  contribution: Contribution;
  colors: any;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={[styles.standaloneContributionRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18' }]}>
        <Feather name="trending-up" size={16} color={colors.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>{contribution.userName}</Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
          {MONTHS_SHORT[contribution.month - 1]} {contribution.year} · Added {formatDate(contribution.createdAt)}
        </Text>
        {contribution.note ? <Text style={[styles.rowNotes, { color: colors.mutedForeground }]}>{contribution.note}</Text> : null}
      </View>
      <View style={styles.contributionRowRight}>
        <Text style={[styles.rowAmount, { color: colors.primary }]}>+{formatKES(contribution.amount)}</Text>
        {(onEdit || onRemove) && (
          <View style={styles.contributionActions}>
            {onEdit && (
              <Pressable onPress={onEdit} style={[styles.contributionActionButton, { borderColor: colors.border }]} accessibilityLabel="Edit contribution">
                <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                <Text style={[styles.contributionActionText, { color: colors.foreground }]}>Edit</Text>
              </Pressable>
            )}
            {onRemove && (
              <Pressable onPress={onRemove} style={[styles.contributionActionButton, { borderColor: colors.destructive }]} accessibilityLabel="Remove contribution">
                <Feather name="trash-2" size={13} color={colors.destructive} />
                <Text style={[styles.contributionActionText, { color: colors.destructive }]}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  headerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  segmentBar: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  segmentText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: { padding: 4 },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  monthLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', minWidth: 56, textAlign: 'center' },

  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  pickerTitle: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center', paddingVertical: 12 },
  pickerList: { flexGrow: 0 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginHorizontal: 12, marginVertical: 1 },
  pickerItemText: { fontSize: 16, fontFamily: 'Inter_500Medium' },

  recurringBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  recurringBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  recurringBannerAction: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  list: { paddingHorizontal: 14, paddingTop: 14 },
  contributionListHeader: { gap: 10, paddingBottom: 8 },
  contributionIntro: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  contributionIntroText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  householdTotal: { borderWidth: 1, borderRadius: 14, padding: 14 },
  householdTotalLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  householdTotalAmount: { marginTop: 4, fontSize: 23, fontFamily: 'Inter_700Bold' },
  contributionMember: { borderWidth: 1, borderRadius: 14, padding: 13 },
  contributionMemberTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  contributionMemberName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  contributionMemberTarget: { marginTop: 2, fontSize: 11, fontFamily: 'Inter_400Regular' },
  contributionMemberAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  contributionStats: { flexDirection: 'row', gap: 16, marginTop: 10 },
  contributionStat: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  contributionRowsTitle: { marginTop: 6, fontSize: 14, fontFamily: 'Inter_700Bold' },
  contributionRow: { marginBottom: 10 },
  contributionPermissionNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 10 },
  contributionPermissionText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  standaloneContributionRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 10, gap: 10 },
  contributionRowRight: { alignItems: 'flex-end', gap: 8 },
  contributionActions: { flexDirection: 'row', gap: 6 },
  contributionActionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  contributionActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  contributionDateRow: { flexDirection: 'row', gap: 10 },
  contributionDateField: { flex: 1 },
  sharedFunding: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 5 },
  sharedFundingTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  sharedFundingText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  sharedFundingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 5 },
  sharedFundingAmount: { fontSize: 12, fontFamily: 'Inter_700Bold' },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 10, gap: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowInfo: { flex: 1 },
  rowDesc: { fontSize: 14, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  rowNotes: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1, fontStyle: 'italic' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 14, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 },
  actionBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 24 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginTop: 6 },
  emptyActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKAV: { justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  handleBar: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  modalBody: { paddingHorizontal: 20, paddingBottom: 40 },

  label: { fontSize: 12, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },

  chipScroll: { marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  memberRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  memberPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  memberPillText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },

  saveBtn: { marginTop: 24, backgroundColor: '#4ade80', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', color: '#0a1a10' },

  // Grouped activity
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 4,
  },
  groupHeaderLeft: { gap: 2 },
  groupDate: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  groupCount: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  groupHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupExpenseTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  groupDepositTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#22c55e' },
  groupChild: { flexDirection: 'row', marginBottom: 0 },
  groupChildLine: { width: 2, marginLeft: 20, marginRight: 10, borderRadius: 1 },
  groupChildCard: { flex: 1 },

  // Funding card + source chips (edit modal)
  editFundingCard: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 4 },
  sourceChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderRadius: 8 },
  sourceChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  splitAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  splitAmountLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  splitAmountInputBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  splitCurrency: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  splitAmountInput: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 80, textAlign: 'right' as const },
});
