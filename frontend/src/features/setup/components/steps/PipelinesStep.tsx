/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ===== PipelinesStep =====
import { Play, Loader2, CheckCircle2, Workflow, XCircle, RefreshCw } from 'lucide-react';
import type { Pipeline } from '../../types';
import { useEffect } from 'react';

interface PipelinesStepProps {
  pipelines: Pipeline[];
  onRunPipeline: (pipelineId: string) => void;
  onFetchPipelines: () => void;
  loading: boolean;
}

const statusConfig = {
  completed: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', label: 'Completed' },
  running: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', label: 'Running...' },
  failed: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Failed' },
  'not-started': { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: 'Not started' },
};

export const PipelinesStep = ({ pipelines, onRunPipeline, onFetchPipelines, loading }: PipelinesStepProps) => {
  const completedCount = pipelines.filter((p) => p.status === 'completed').length;

  useEffect(() => {
    if (pipelines.length === 0) {
      onFetchPipelines();
    }
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
            Data Ingestion Pipelines
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Run deployed pipelines in your Fabric workspace.
          </p>
        </div>
        <button
          onClick={onFetchPipelines}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {pipelines.length === 0 && !loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Workflow size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No pipelines found in your workspace.</p>
          <p className="text-xs text-slate-400 mt-1">Deploy pipelines in the Configuration step first.</p>
        </div>
      ) : pipelines.length === 0 && loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Loader2 size={24} className="text-emerald-500 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-slate-500">Loading pipelines from workspace...</p>
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 mb-5 shadow-sm">
            <div className="flex-1">
              <p className="text-[11px] text-slate-400 mb-1.5 font-medium">Pipeline execution progress</p>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(completedCount / pipelines.length) * 100}%`,
                    background: 'linear-gradient(to right, #1D9E75, #5dd4a8)',
                  }}
                />
              </div>
            </div>
            <span className="text-[13px] font-bold text-slate-700 shrink-0">
              {completedCount}/{pipelines.length}
            </span>
          </div>

          {/* Pipeline list */}
          <div className="space-y-2.5">
            {pipelines.map((pipeline, i) => {
              const cfg = statusConfig[pipeline.status];
              const prevDone = i === 0 || pipelines[i - 1].status === 'completed';
              const isLocked = !prevDone && pipeline.status === 'not-started';
              return (
                <div
                  key={pipeline.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm transition-all"
                  style={pipeline.status === 'running' ? { borderColor: '#93c5fd' } : pipeline.status === 'failed' ? { borderColor: '#fca5a5' } : {}}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={
                      pipeline.status === 'completed'
                        ? { background: '#d1fae5' }
                        : pipeline.status === 'running'
                        ? { background: '#dbeafe' }
                        : pipeline.status === 'failed'
                        ? { background: '#fee2e2' }
                        : { background: '#f1f5f9' }
                    }
                  >
                    {pipeline.status === 'completed' ? (
                      <CheckCircle2 size={16} style={{ color: '#065f46' }} />
                    ) : pipeline.status === 'running' ? (
                      <Loader2 size={16} style={{ color: '#1e40af' }} className="animate-spin" />
                    ) : pipeline.status === 'failed' ? (
                      <XCircle size={16} style={{ color: '#991b1b' }} />
                    ) : (
                      <Workflow size={16} style={{ color: '#94a3b8' }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{pipeline.name}</p>
                    <span
                      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  <button
                    onClick={() => onRunPipeline(pipeline.id)}
                    disabled={pipeline.status === 'running' || pipeline.status === 'completed' || isLocked}
                    className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-40"
                    style={
                      pipeline.status === 'completed'
                        ? { background: '#f1f5f9', color: '#94a3b8' }
                        : pipeline.status === 'running'
                        ? { background: '#dbeafe', color: '#1e40af' }
                        : pipeline.status === 'failed'
                        ? { background: '#dc2626', color: '#fff' }
                        : isLocked
                        ? { background: '#f1f5f9', color: '#94a3b8' }
                        : { background: '#0d3828', color: '#fff' }
                    }
                  >
                    {pipeline.status === 'running' ? (
                      <><Loader2 size={12} className="animate-spin" /> Running</>
                    ) : pipeline.status === 'completed' ? (
                      'Done'
                    ) : pipeline.status === 'failed' ? (
                      <><Play size={12} /> Retry</>
                    ) : isLocked ? (
                      'Waiting'
                    ) : (
                      <><Play size={12} /> Run</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
