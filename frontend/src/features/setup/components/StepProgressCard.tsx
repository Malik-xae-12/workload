/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * StepProgressCard — Enhanced Green Theme
 * Drop-in replacement for the original component.
 * Uses Tailwind utility classes + inline style for brand colors only.
 */

import {
  Check,
  KeyRound,
  Database,
  Layers,
  FileText,
  Settings,
  ClipboardCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Brand tokens ──────────────────────────────────────────────────────────────
const G = {
  50: '#E8F8F1',
  100: '#C3EDD9',
  200: '#8EDCBA',
  400: '#1D9E75',
  500: '#159065',
  600: '#0F6E56',
  700: '#0A5241',
  800: '#06382C',
  ring: 'rgba(29,158,117,0.18)',
} as const;

// ─── Steps definition ──────────────────────────────────────────────────────────
interface Step { title: string; desc: string; icon: LucideIcon }

const STEPS: Step[] = [
  { title: 'Workspace', desc: 'Create & configure', icon: KeyRound },
  { title: 'Medallion', desc: 'Layer architecture', icon: Layers },
  { title: 'Metadata', desc: 'Warehouse & logs', icon: FileText },
  { title: 'Source', desc: 'Data connections', icon: Database },
  { title: 'Config', desc: 'Deploy & run', icon: Settings },
  { title: 'Overview', desc: 'Summary & review', icon: ClipboardCheck },
];

// ─── Props ─────────────────────────────────────────────────────────────────────
export interface StepProgressCardProps {
  /** 0-based index of the current active step. Pass STEPS.length for "complete". */
  currentStep: number;
  /** Called with the step index when a completed step circle is clicked. */
  onStepClick?: (step: number) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export const StepProgressCard = ({ currentStep, onStepClick }: StepProgressCardProps) => {
  const n = STEPS.length;
  const label = currentStep >= n ? 'Complete' : `Step ${currentStep + 1} of ${n}`;
  // The bar/footer used to show this as a literal "Completion %" — but it
  // was really just tracking which step you're on, not how much of the
  // actual work is done (the steps aren't equal-effort, so "Step 2 of 6"
  // showing "33% complete" overstated progress on early steps and
  // understated it on later ones). Replacing the number with a message
  // tied to the step itself, which is what the bar position actually
  // reflects.
  const stageMessage =
    currentStep >= n
      ? 'All steps done'
      : STEPS[currentStep]?.title
      ? `Currently on: ${STEPS[currentStep].title}`
      : '';

  return (
    <div
      className="w-[252px] shrink-0 flex flex-col rounded-2xl overflow-hidden bg-white"
      style={{
        border: `1px solid ${G[100]}`,
        boxShadow: `0 0 0 4px ${G[50]}, 0 2px 12px rgba(0,0,0,0.06)`,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${G[100]}`, background: G[50] }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: G[600] }}
        >
          Setup progress
        </span>
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: G[400], color: '#fff', letterSpacing: '0.02em' }}
        >
          {label}
        </span>
      </div>

      {/* ── Step list ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 flex-1">
        {STEPS.map((step, i) => {
          const isLast = i === n - 1;
          const done = i < currentStep || (isLast && i === currentStep);
          const active = i === currentStep && !isLast;
          const Icon = step.icon;
          const canClick = done && !!onStepClick;

          return (
            <div key={step.title} className="flex gap-3">

              {/* Rail */}
              <div className="flex flex-col items-center w-6 shrink-0">

                {/* Circle */}
                <button
                  onClick={() => canClick && onStepClick!(i)}
                  disabled={!canClick}
                  tabIndex={canClick ? 0 : -1}
                  className="shrink-0 focus:outline-none focus-visible:ring-2 rounded-full"
                  style={{ cursor: canClick ? 'pointer' : 'default' }}
                  aria-label={`${step.title} — ${done ? 'completed' : active ? 'in progress' : 'pending'}`}
                >
                  {done ? (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-110"
                      style={{ background: `linear-gradient(135deg, ${G[400]}, ${G[600]})` }}
                    >
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </div>
                  ) : active ? (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center bg-white"
                      style={{
                        border: `2px solid ${G[400]}`,
                        boxShadow: `0 0 0 3px ${G.ring}`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ background: G[400] }}
                      />
                    </div>
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        background: G[50],
                        border: `1px solid ${G[100]}`,
                      }}
                    >
                      <Icon size={11} color={G[600]} />
                    </div>
                  )}
                </button>

                {/* Connector */}
                {!isLast && (
                  <div
                    className="w-[2px] flex-1 min-h-[14px] rounded-full my-1 transition-all duration-500"
                    style={{
                      background: done
                        ? `linear-gradient(to bottom, ${G[400]}, ${G[200]})`
                        : G[100],
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 min-w-0 pt-[3px] ${isLast ? 'pb-0' : 'pb-[18px]'}`}>
                <p
                  className="text-[12px] font-semibold leading-tight truncate"
                  style={{
                    color: active ? '#1a2e25' : done ? '#1a2e25' : '#b0bec5',
                  }}
                >
                  {step.title}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        className="px-4 pt-3 pb-4"
        style={{
          borderTop: `1px solid ${G[100]}`,
          background: `linear-gradient(to bottom, ${G[50]}, #f0faf5)`,
        }}
      >
        {/* Stage row — a relatable message, not a completion percentage
            (see stageMessage's comment above for why) */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <span
            className="text-[9px] font-bold uppercase tracking-widest shrink-0"
            style={{ color: G[400] }}
          >
            Progress
          </span>
          <span
            className="text-[11px] font-bold text-right truncate"
            style={{ color: G[600] }}
            title={stageMessage}
          >
            {stageMessage}
          </span>
        </div>

        {/* Progress bar — reflects step position along the journey, not a
            literal percentage of work completed */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: G[100] }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round((Math.min(currentStep + 1, n) / n) * 100)}%`,
              background: `linear-gradient(90deg, ${G[400]}, ${G[500]})`,
            }}
          />
        </div>
      </div>
    </div>
  );
};