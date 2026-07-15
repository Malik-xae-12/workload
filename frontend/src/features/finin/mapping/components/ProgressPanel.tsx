import type { Job } from "../../shared/types";

interface Props {
  job: Job;
}

export function ProgressPanel({ job }: Props) {
  const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

  const steps = [
    { key: "queued", label: "Queued" },
    { key: "running", label: "Running" },
    { key: "done", label: "Complete" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === job.status);

  return (
    <div className="progress-panel">
      <div className="progress-steps">
        {steps.map((s, i) => (
          <div
            key={s.key}
            className={`step ${i < stepIndex ? "done" : i === stepIndex ? "active" : "pending"}`}
          >
            <div className="step-dot">{i < stepIndex ? "✓" : i + 1}</div>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {job.status === "running" && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}

      <p className="progress-msg">
        {job.status === "running" && job.total > 0
          ? `${job.progress} / ${job.total} columns processed (${pct}%)`
          : job.message}
      </p>

      {job.status === "error" && (
        <div className="error-box">
          <strong>Error:</strong> {job.message}
        </div>
      )}
    </div>
  );
}
