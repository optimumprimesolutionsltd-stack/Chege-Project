import { useGetDashboardSummary, useGetDashboardActivity, useGetDashboardCategoryBreakdown, useGetDashboardTrends } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatKes, formatDate } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ArrowUpRight, ArrowDownRight, Wallet, Activity as ActivityIcon, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({ month, year });
  const { data: activity, isLoading: isActivityLoading } = useGetDashboardActivity();
  const { data: breakdown, isLoading: isBreakdownLoading } = useGetDashboardCategoryBreakdown({ month, year });
  const { data: trends, isLoading: isTrendsLoading } = useGetDashboardTrends({ months: 6 });

  if (isSummaryLoading || isActivityLoading || isBreakdownLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-48 bg-muted rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-muted rounded-2xl"></div>
          <div className="h-64 bg-muted rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!summary || !activity || !breakdown) return null;

  const percentSpent = (summary.totalSpent / summary.totalBudget) * 100;
  const isOverBudget = percentSpent > 100;
  const overBudgetCategories = breakdown.filter(b => b.percentUsed > 100);

  // Pie chart data
  const chartData = breakdown
    .filter(b => b.spentAmount > 0)
    .sort((a, b) => b.spentAmount - a.spentAmount)
    .slice(0, 5)
    .map(b => ({ name: b.category, value: b.spentAmount, color: b.color || "hsl(var(--primary))" }));

  if (breakdown.filter(b => b.spentAmount > 0).length > 5) {
    const othersTotal = breakdown
      .filter(b => b.spentAmount > 0)
      .sort((a, b) => b.spentAmount - a.spentAmount)
      .slice(5)
      .reduce((sum, b) => sum + b.spentAmount, 0);
    chartData.push({ name: "Others", value: othersTotal, color: "hsl(var(--muted-foreground))" });
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Family Overview</h1>
          <p className="text-muted-foreground mt-1">Here is where we stand for {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now)}.</p>
        </div>
        <Link href="/expenses">
          <Button className="rounded-xl h-12 px-6 shadow-md hover:-translate-y-0.5 transition-transform">
            <Plus className="w-5 h-5 mr-2" />
            Add Expense
          </Button>
        </Link>
      </div>

      {/* Over-budget alert banner */}
      {overBudgetCategories.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-destructive font-bold text-sm">!</span>
          </div>
          <div>
            <p className="font-semibold text-destructive">Over budget in {overBudgetCategories.length} {overBudgetCategories.length === 1 ? 'category' : 'categories'}</p>
            <p className="text-sm text-destructive/80 mt-0.5">
              {overBudgetCategories.map(c => `${c.category} (+${formatKes(Math.abs(c.remaining))})`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Hero Card */}
      <Card className="bg-primary text-primary-foreground border-none shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <CardContent className="p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative z-10">
            <div className="space-y-2">
              <p className="text-primary-foreground/80 font-medium">Total Budget</p>
              <p className="text-4xl font-display font-bold">{formatKes(summary.totalBudget)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-primary-foreground/80 font-medium">Total Spent</p>
              <p className="text-4xl font-display font-bold">{formatKes(summary.totalSpent)}</p>
            </div>
            <div className="space-y-2 md:text-right">
              <p className="text-primary-foreground/80 font-medium">Remaining</p>
              <p className={`text-4xl font-display font-bold ${isOverBudget ? 'text-destructive-foreground bg-destructive inline-block px-3 rounded-lg' : ''}`}>
                {formatKes(summary.remaining)}
              </p>
            </div>
          </div>
          <div className="mt-8">
            <div className="flex justify-between text-sm mb-2 text-primary-foreground/80 font-medium">
              <span>{Math.round(percentSpent)}% spent</span>
              <span>{isOverBudget ? 'Over Budget' : 'On Track'}</span>
            </div>
            <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${isOverBudget ? 'bg-destructive' : 'bg-secondary'}`}
                style={{ width: `${Math.min(percentSpent, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contributions */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-secondary" />
              <CardTitle className="text-xl">Contributions</CardTitle>
            </div>
            <CardDescription>Target vs Contributed for this month</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="font-semibold text-foreground text-lg">Chege</p>
                  <p className="text-sm text-muted-foreground">Target: {formatKes(summary.chegeTarget)}</p>
                </div>
                <p className="font-display font-bold text-xl text-primary">{formatKes(summary.chegeContributed)}</p>
              </div>
              <div className="h-2.5 w-full bg-secondary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((summary.chegeContributed / summary.chegeTarget) * 100 || 0, 100)}%` }} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="font-semibold text-foreground text-lg">Lydiah</p>
                  <p className="text-sm text-muted-foreground">Target: {formatKes(summary.lydiahTarget)}</p>
                </div>
                <p className="font-display font-bold text-xl text-primary">{formatKes(summary.lydiahContributed)}</p>
              </div>
              <div className="h-2.5 w-full bg-secondary/20 rounded-full overflow-hidden">
                <div className="h-full bg-secondary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((summary.lydiahContributed / summary.lydiahTarget) * 100 || 0, 100)}%` }} />
              </div>
            </div>
            <Link href="/contributions" className="text-sm font-medium text-primary hover:underline block pt-2">
              View contribution history →
            </Link>
          </CardContent>
        </Card>

        {/* Category Breakdown Chart */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-secondary" />
              <CardTitle className="text-xl">Top Spending</CardTitle>
            </div>
            <CardDescription>Where the money is going</CardDescription>
          </CardHeader>
          <CardContent className="p-6 h-[300px] flex items-center justify-center">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatKes(value)}
                    contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground">No expenses recorded this month yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6-Month Spending Trend */}
      <Card className="border-none shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-secondary" />
            <CardTitle className="text-xl">6-Month Trend</CardTitle>
          </div>
          <CardDescription>Monthly total spending vs the KES 317,094 budget</CardDescription>
        </CardHeader>
        <CardContent className="p-6 h-[280px]">
          {isTrendsLoading ? (
            <div className="h-full bg-muted/30 rounded-xl animate-pulse" />
          ) : trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(value: number) => [formatKes(value), "Spent"]}
                  contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                {/* Budget reference line */}
                <Bar dataKey="totalSpent" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">No trend data yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-none shadow-md overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-secondary" />
              <CardTitle className="text-xl">Recent Activity</CardTitle>
            </div>
            <CardDescription>Latest expenses and deposits</CardDescription>
          </div>
          <Link href="/activity" className="text-sm font-medium text-primary hover:underline hidden sm:block">View all</Link>
        </CardHeader>
        <CardContent className="p-0">
          {activity.length > 0 ? (
            <div className="divide-y divide-border/50">
              {activity.slice(0, 5).map((item) => (
                <div key={item.id} className="p-4 sm:p-6 flex items-center justify-between hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.type === 'expense' ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary'}`}>
                      {item.type === 'expense' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground line-clamp-1">{item.description}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{item.userName}</span>
                        <span className="w-1 h-1 rounded-full bg-border"></span>
                        <span>{formatDate(item.date)}</span>
                        {item.category && (
                          <><span className="w-1 h-1 rounded-full bg-border hidden sm:block"></span>
                          <span className="hidden sm:block px-2 py-0.5 bg-muted rounded text-xs">{item.category}</span></>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className={`font-display font-bold text-lg whitespace-nowrap ${item.type === 'expense' ? 'text-foreground' : 'text-primary'}`}>
                    {item.type === 'expense' ? '-' : '+'}{formatKes(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground"><p>No recent activity found.</p></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
