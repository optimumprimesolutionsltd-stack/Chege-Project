import { useEffect, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, CheckCircle2, UploadCloud, X } from "lucide-react";
import {
  getSaveProgressBar,
  lookForServerSave,
  saveProgressText,
  setSaveProgressBar,
  subscribeSaveProgressBar,
} from "@/lib/server-save";

/**
 * A bar at the top of every page while an M-Pesa import saves on the server,
 * and once it is done - as the phone shows. A save carries on after the tab is
 * closed (lib/server-save), so opening Jamvi again, or coming back to its tab,
 * asks whether one is still going and picks it up where it has got to. The
 * import page shows its own progress, so the bar stays off there.
 */
export function ImportSavingBar() {
  const progress = useSyncExternalStore(subscribeSaveProgressBar, getSaveProgressBar, getSaveProgressBar);
  const [location] = useLocation();

  useEffect(() => {
    const look = () => {
      if (getSaveProgressBar()?.stage === "saving") return;
      void lookForServerSave(setSaveProgressBar);
    };
    look();
    const onVisible = () => {
      if (document.visibilityState === "visible") look();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!progress || location === "/mpesa-import") return null;
  const done = progress.stage === "done";
  const failed = done && progress.failed > 0;
  const Icon = done ? (failed ? AlertCircle : CheckCircle2) : UploadCloud;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="import-saving-bar"
      className={`mb-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow ${failed ? "bg-red-900" : "bg-[#0B1F2A]"}`}
    >
      <Icon className="h-4 w-4 shrink-0 text-[#E9B949]" />
      {done ? (
        <Link href="/bank" className="flex-1 hover:underline">{saveProgressText(progress)}</Link>
      ) : (
        <span className="flex-1">{saveProgressText(progress)}</span>
      )}
      {done ? (
        <button type="button" onClick={() => setSaveProgressBar(null)} aria-label="Dismiss" data-testid="import-saving-bar-dismiss">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
