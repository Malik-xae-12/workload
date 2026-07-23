import { useEffect, useState } from "react";
import type { Job } from "../../shared/types";

interface Props {
  job: Job;
}

export function ProgressPanel({ job }: Props) {
  const hasTotal = job.total > 0;
  const pct = hasTotal ? Math.min(100, Math.round((job.progress / job.total) * 100)) : 0;

  // Smooth, slightly-eased number counting instead of jumping straight to
  // the new value — makes rapid backend progress ticks feel continuous
  // rather than jittery.
  const [displayPct, setDisplayPct] = useState(pct);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDisplayPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const steps = [
    { key: "queued", label: "Queued" },
    { key: "running", label: "Running" },
    { key: "done", label: "Complete" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === job.status);

  const isRunning = job.status === "running";

  return (
    <div className="progress-panel-v2">
      <div className="pp-steps">
        {steps.map((s, i) => (
          <div key={s.key} className="pp-step-wrap">
            <div
              className={`pp-step ${i < stepIndex ? "done" : i === stepIndex ? "active" : "pending"}`}
            >
              <span className="pp-dot">{i < stepIndex ? "✓" : i + 1}</span>
              <span className="pp-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`pp-connector ${i < stepIndex ? "filled" : ""}`} />
            )}
          </div>
        ))}
      </div>

      {(isRunning || job.status === "queued") && (
        <div className="pp-bar-wrap">
          {hasTotal ? (
            <div className="pp-bar" style={{ width: `${displayPct}%` }} />
          ) : (
            // No total known yet (e.g. still loading source/template data) —
            // an indeterminate shimmer beats an empty bar or a frozen 0%.
            <div className="pp-bar-indeterminate" />
          )}
        </div>
      )}

      <div className="pp-status-row">
        <span className={`pp-status-msg ${isRunning ? "live" : ""}`}>{job.message}</span>
        {isRunning && hasTotal && (
          <span className="pp-pct">
            {job.progress}/{job.total} <em>({displayPct}%)</em>
          </span>
        )}
      </div>

      {job.status === "error" && (
        <div className="pp-error-box">
          <strong>Error:</strong> {job.message}
        </div>
      )}
    </div>
  );
}