import { useGetDashboardActivity } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKes, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, Activity as ActivityIcon } from "lucide-react";
import { ACTIVITY_TYPE } from "@/lib/activityTypes";

export default function Activity() {
  const { data: activity, isLoading } = useGetDashboardActivity();

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Activity Feed</h1>
        <p className="text-muted-foreground mt-1">A complete history of all family financial movements.</p>
      </div>

      <Card className="border-none shadow-md overflow-hidden min-h-[50vh]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-20 flex justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : !activity || activity.length === 0 ? (
            <div className="p-20 text-center text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <ActivityIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {activity.map((item) => (
                <div key={item.id} className="p-4 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-5 hover:bg-muted/10 transition-colors">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    item.type === ACTIVITY_TYPE.EXPENSE ? 'bg-accent/50 text-accent-foreground border border-accent/20' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}>
                    {item.type === ACTIVITY_TYPE.EXPENSE ? <ArrowDownRight className="w-5 h-5 sm:w-6 sm:h-6" /> : <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground text-sm sm:text-base leading-tight truncate">{item.description}</p>
                      <span className={`font-display font-bold text-base sm:text-lg whitespace-nowrap shrink-0 ${
                        item.type === ACTIVITY_TYPE.EXPENSE ? 'text-foreground' : 'text-primary'
                      }`}>
                        {item.type === ACTIVITY_TYPE.EXPENSE ? '-' : '+'}{formatKes(item.amount)}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      <span className="font-medium text-foreground/70">{item.userName}</span>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <span>{formatDate(item.date)}</span>
                      {item.category && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border hidden sm:inline-block"></span>
                          <span className="px-1.5 py-0.5 bg-secondary/10 text-secondary-foreground rounded text-xs border border-secondary/20">
                            {item.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}