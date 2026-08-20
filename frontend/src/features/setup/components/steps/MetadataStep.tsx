/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Play, Loader2, CheckCircle2, Database, Warehouse, AlertCircle } from 'lucide-react';
import type { MetadataSetup, SourceConnection } from '../../types';

interface MetadataStepProps {
  metadataSetup: MetadataSetup;
  connections: SourceConnection[];
  selectedConnection: string | null;
  onWarehouseNameChange: (name: string) => void;
  onCreateMetadata: () => void;
  onCreateLog: () => void;
  onSelectConnection: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const SubStep = ({ num, title, done }: { num: number; title: string; done?: boolean }) => (
  <div className="flex items-center gap-2.5 mb-4">
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
      style={
        done
          ? { background: '#1D9E75', color: '#fff' }
          : { background: '#f1f5f9', color: '#64748b', border: '1.5px solid #e2e8f0' }
      }
    >
      {done ? <CheckCircle2 size={12} /> : num}
    </div>
    <h3 className="text-[13px] font-semibold text-slate-700">{title}</h3>
    {done && <CheckCircle2 size={14} className="text-emerald-500" />}
  </div>
);

export const MetadataStep = ({
  metadataSetup,
  connections,
  selectedConnection,
  onWarehouseNameChange,
  onCreateMetadata,
  onSelectConnection,
  loading,
  error,
}: MetadataStepProps) => {
  const { warehouseName, metadataCreated, logCreated } = metadataSetup;

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Metadata Setup</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Create the metadata warehouse, log objects, then select a connection for configuration.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50">
          <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-700">{error}</p>
        </div>
      )}

      {/* Sub-step 1 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm">
        <SubStep num={1} title="Create Metadata Warehouse" done={metadataCreated} />
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Warehouse Name
            </label>
            <input
              type="text"
              value={warehouseName}
              onChange={(e) => onWarehouseNameChange(e.target.value)}
              disabled={metadataCreated}
              placeholder="WH_MetaData"
              className="w-full max-w-xs h-10 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Stores metadata, log tables, and stored procedures.
            </p>
          </div>
          <button
            onClick={onCreateMetadata}
            disabled={loading || metadataCreated || !warehouseName.trim()}
            className="flex items-center gap-2 px-4 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-60"
            style={
              metadataCreated
                ? { background: '#d1fae5', color: '#065f46' }
                : { background: '#0d3828', color: '#fff' }
            }
          >
            {metadataCreated ? (
              <><CheckCircle2 size={13} /> Warehouse Created</>
            ) : loading ? (
              <><Loader2 size={13} className="animate-spin" /> Creating...</>
            ) : (
              <><Warehouse size={13} /> Create Warehouse</>
            )}
          </button>
        </div>
      </div>

      {/* Sub-step 2: Create Log Objects — deliberately NOT a visible
          card/form anymore. SetupPage already creates this fully
          automatically right after the warehouse finishes (see its
          metadataAutoLogRef effect) — there's no schema name to choose
          and nothing for a person to decide here, so surfacing it as its
          own "Create Log Objects" step with a button just asked for an
          unnecessary click on something that was going to happen
          regardless. What WAS missing: while that background creation
          runs, the screen showed nothing at all between "Warehouse
          Created" and the page auto-advancing — long enough to look
          broken/stuck to someone who doesn't know what's happening
          behind the scenes. This replaces that silence with a plain,
          reassuring "finishing setup" indicator instead. */}
      {metadataCreated && !logCreated && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm flex items-center gap-3">
          <Loader2 size={16} className="text-emerald-600 animate-spin shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-slate-700">Finishing setup…</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Setting up log tracking for your data pipeline. This only takes a moment.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};