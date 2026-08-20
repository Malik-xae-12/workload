/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CollapsibleSection — a "hide details" wrapper with a built-in progress
 * bar, used to keep every wizard step approachable for non-technical
 * users: collapsed by default, showing just a title + at-a-glance
 * progress, with the full step-by-step detail only a click away.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, Check, Loader2, AlertCircle, Circle } from 'lucide-react';

const G = {
  50: '#E8F8F1',
  100: '#C3EDD9',
  200: '#8EDCBA',
  400: '#1D9E75',
  500: '#159065',
  600: '#0F6E56',
  700: '#0A5241',
  ring: 'rgba(29,158,117,0.18)',
} as const;

export type SectionStatus = 'pending' | 'creating' | 'uploading' | 'deploying' | 'running' | 'saving' | 'done' | 'failed' | 'waiting';

export interface CollapsibleSectionProps {
  title: string;
  description?: string;
  /** Overall status shown on the collapsed header (badge + icon + bar color). */
  status: SectionStatus;
  /** 0-100. Omit to show an indeterminate/segment-based bar instead of a percentage. */
  progress?: number;
  /** e.g. "3 of 5 steps done" — shown next to the progress bar. */
  progressLabel?: string;
  /** Overrides the status badge text while status is an in-progress kind
   * (creating/uploading/deploying/saving/running) — e.g. "Creating…" —
   * falls back to that status's default label if omitted. */
  activeVerb?: string;
  /** Collapsed by default; controlled if you pass `open`/`onToggle`, otherwise self-managed. */
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Shown in the collapsed header, e.g. "Waiting for you" for manual gates. */
  waitingLabel?: string;
  children: ReactNode;
}

const STATUS_META: Record<SectionStatus, { label: string; color: string; bg: string; icon: ReactNode }> = {
  pending: { label: 'Not started', color: '#94a3b8', bg: '#f1f5f9', icon: <Circle size={12} /> },
  creating: { label: 'Creating…', color: '#2563eb', bg: '#eff6ff', icon: <Loader2 size={12} className="animate-spin" /> },
  uploading: { label: 'Uploading…', color: '#2563eb', bg: '#eff6ff', icon: <Loader2 size={12} className="animate-spin" /> },
  deploying: { label: 'Deploying…', color: '#2563eb', bg: '#eff6ff', icon: <Loader2 size={12} className="animate-spin" /> },
  saving: { label: 'Saving…', color: '#2563eb', bg: '#eff6ff', icon: <Loader2 size={12} className="animate-spin" /> },
  running: { label: 'Running…', color: '#2563eb', bg: '#eff6ff', icon: <Loader2 size={12} className="animate-spin" /> },
  done: { label: 'Done', color: G[600], bg: G[50], icon: <Check size={12} strokeWidth={3} /> },
  failed: { label: 'Needs attention', color: '#dc2626', bg: '#fef2f2', icon: <AlertCircle size={12} /> },
  waiting: { label: 'Waiting for you', color: '#b45309', bg: '#fffbeb', icon: <AlertCircle size={12} /> },
};

export const CollapsibleSection = ({
  title,
  description,
  status,
  progress,
  progressLabel,
  activeVerb,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  waitingLabel,
  children,
}: CollapsibleSectionProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (onToggle) onToggle(v);
    else setUncontrolledOpen(v);
  };
  const meta = STATUS_META[status];
  const barColor = status === 'failed' ? '#dc2626' : status === 'waiting' ? '#f59e0b' : G[400];

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-sm mb-3.5"
      style={{ border: `1px solid ${isOpen ? G[200] : '#e2e8f0'}` }}
    >
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-800">{title}</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: meta.bg, color: meta.color }}
            >
              {status === 'waiting' && waitingLabel ? waitingLabel : activeVerb ? `${activeVerb}…` : meta.label}
            </span>
          </div>
          {description && !isOpen && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{description}</p>
          )}

          {/* Progress bar — always visible on the collapsed header so a
              non-technical user can tell things are moving without
              having to open every section. */}
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: '#eef2f6' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${status === 'done' ? 100 : status === 'pending' ? 0 : Math.max(4, Math.min(100, progress ?? 50))}%`,
                  background: barColor,
                }}
              />
            </div>
            {progressLabel && (
              <span className="text-[10px] font-semibold text-slate-400 shrink-0">{progressLabel}</span>
            )}
          </div>
        </div>

        <ChevronDown
          size={16}
          className="text-slate-400 shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
};