def patch(p, pairs):
    s = open(p, encoding='utf8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    t = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in t, (p, a[:70])
        t = t.replace(a, b, 1)
    open(p, 'w', encoding='utf8', newline='').write(t.replace('\n', nl))


# ------------------------------------------------------------------ phone
patch('mobile-budget/app/mpesa-import.tsx', [
    ("  problemWith,\n", "  problemWith,\n  reviewCounts,\n  reviewStatus,\n  type ReviewView,\n"),
    ("  const [choices, setChoices] = useState<Record<number, Choice>>({});\n",
     "  const [choices, setChoices] = useState<Record<number, Choice>>({});\n  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.\n  const [view, setView] = useState<ReviewView>('all');\n"),
    ("""  const showProblem = () => {
    if (firstProblemIndex === null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, (lineTops.current[firstProblemIndex] ?? 0) - 12), animated: true });
  };""", """  const showProblem = () => {
    if (firstProblemIndex === null) return;
    // The entry may be hidden by a filter: show everything first, then go to it.
    setView('all');
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (lineTops.current[firstProblemIndex] ?? 0) - 12), animated: true }), 80);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);"""),
    ("""            {recordable.map((item) => {
              const choice = choices[item.index];
              const out = item.direction === 'out';
              return (""", """            {review && review.all > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="mpesa-review">
                <Text style={[styles.hint, { color: colors.foreground, marginTop: 0 }]} testID="mpesa-review-counts">
                  {review.changed} changed by you · {review.suggested} still Jamvi's suggestion{review.needs > 0 ? ` · ${review.needs} need${review.needs === 1 ? 's' : ''} you` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {([
                    ['all', 'All'],
                    ['needs', 'Needs you'],
                    ['changed', 'Changed by you'],
                    ['suggested', 'Suggested'],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => {
                    const on = view === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setView(key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`mpesa-review-${key}`}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on ? `${colors.primary}22` : colors.muted,
                        }}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                          {label} ({review[key]})
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {recordable.filter((item) => view === 'all' || reviewStatus(item, choices[item.index]) === view).map((item) => {
              const choice = choices[item.index];
              const out = item.direction === 'out';
              const status = reviewStatus(item, choice);
              return ("""),
    ("""                  <View style={styles.lineTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable
                        onPress={canNickname(item)""", """                  {status ? (
                    <Text
                      style={[styles.hint, { marginTop: 0, fontFamily: 'Inter_600SemiBold', color: status === 'needs' ? colors.destructive : status === 'changed' ? colors.primary : colors.mutedForeground }]}
                      testID={`mpesa-line-status-${item.index}`}
                    >
                      {status === 'needs' ? 'Needs you' : status === 'changed' ? 'You changed this' : 'Suggested by Jamvi'}
                    </Text>
                  ) : null}
                  <View style={styles.lineTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable
                        onPress={canNickname(item)"""),
])

# ------------------------------------------------------------------ web
patch('family-budget/src/pages/mpesa-import.tsx', [
    ("  problemWith,\n", "  problemWith,\n  reviewCounts,\n  reviewStatus,\n  type ReviewView,\n"),
    ("  const [choices, setChoices] = useState<Record<number, Choice>>({});\n",
     "  const [choices, setChoices] = useState<Record<number, Choice>>({});\n  // Which of the entries to show: all, or only those still to look at, changed by you, or needing you.\n  const [view, setView] = useState<ReviewView>(\"all\");\n"),
    ("""  const showProblem = () => {
    if (firstProblemIndex === null) return;
    document.querySelector(`[data-testid="mpesa-line-${firstProblemIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };""", """  const showProblem = () => {
    if (firstProblemIndex === null) return;
    // The entry may be hidden by a filter: show everything first, then go to it.
    setView("all");
    window.setTimeout(() => document.querySelector(`[data-testid="mpesa-line-${firstProblemIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const review = useMemo(() => (lines ? reviewCounts(lines, choices) : null), [lines, choices]);"""),
    ("""          {recordable.map((item) => {
            const choice = choices[item.index];
            const out = item.direction === "out";
            return (""", """          {review && review.all > 0 ? (
            <Card data-testid="mpesa-review">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm text-foreground" data-testid="mpesa-review-counts">
                  {review.changed} changed by you · {review.suggested} still Jamvi's suggestion{review.needs > 0 ? ` · ${review.needs} need${review.needs === 1 ? "s" : ""} you` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "All"],
                    ["needs", "Needs you"],
                    ["changed", "Changed by you"],
                    ["suggested", "Suggested"],
                  ] as Array<[ReviewView, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setView(key)}
                      aria-pressed={view === key}
                      data-testid={`mpesa-review-${key}`}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${view === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-foreground"}`}
                    >
                      {label} ({review[key]})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {recordable.filter((item) => view === "all" || reviewStatus(item, choices[item.index]) === view).map((item) => {
            const choice = choices[item.index];
            const out = item.direction === "out";
            const status = reviewStatus(item, choice);
            return ("""),
    ("""                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!choice?.include}""", """                <CardContent className="space-y-3 p-4">
                  {status ? (
                    <p
                      className={`text-xs font-semibold ${status === "needs" ? "text-destructive" : status === "changed" ? "text-primary" : "text-muted-foreground"}`}
                      data-testid={`mpesa-line-status-${item.index}`}
                    >
                      {status === "needs" ? "Needs you" : status === "changed" ? "You changed this" : "Suggested by Jamvi"}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!choice?.include}"""),
])
print('ok')
