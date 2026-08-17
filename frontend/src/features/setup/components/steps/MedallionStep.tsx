/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// MedallionStep
import { CheckCircle2, Loader2, Rocket, ArrowRight, Database, Layers } from 'lucide-react';
import type { MedallionLayer } from '../../types';

interface MedallionStepProps {
  layers: MedallionLayer[];
  onUpdateLayer: (key: 'bronze' | 'silver' | 'gold', name: string) => void;
  /** Bronze/Silver only — switches between Lakehouse and Warehouse. */
  onUpdateLayerType: (key: 'bronze' | 'silver', itemType: 'LH' | 'WH') => void;
  onValidateLayer: (key: 'bronze' | 'silver' | 'gold') => void;
  onCreateInFabric?: () => void;
  loading?: boolean;
  error?: string | null;
}

const layerMeta = {
  bronze: { color: '#7C4A03', bg: '#FDF0D5', border: '#CD7F32', dot: '#CD7F32', label: 'Raw ingestion from source systems' },
  silver: { color: '#475569', bg: '#f1f5f9', border: '#e2e8f0', dot: '#94a3b8', label: 'Enriched and validated business logic' },
  gold: { color: '#854d0e', bg: '#fef9c3', border: '#fde047', dot: '#d4a017', label: 'Report-ready aggregated gold standard' },
};

const itemTypeMeta = {
  LH: { label: 'Lakehouse', short: 'LH' },
  WH: { label: 'Warehouse', short: 'WH' },
};

export const MedallionStep = ({ layers, onUpdateLayer, onUpdateLayerType, onValidateLayer, onCreateInFabric, loading, error }: MedallionStepProps) => {
  const allNamed = layers.every((l) => l.name.trim());
  const allValidated = layers.every((l) => l.validated);

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Medallion Architecture</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Name and validate each layer of your data lakehouse architecture.
        </p>
      </div>

      {/* Architecture visual — database icons flow */}
      <div className="flex items-center justify-center gap-3 mb-5 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        {(['bronze', 'silver', 'gold'] as const).map((key, i) => {
          const meta = layerMeta[key];
          const layer = layers.find((l) => l.key === key)!;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[11px] font-bold capitalize" style={{ color: meta.color }}>{key}</p>
                <p className="text-[9px] leading-tight text-center" style={{ color: meta.color, opacity: 0.7 }}>
                  {key === 'bronze' ? 'Raw Ingestion' : key === 'silver' ? 'Cleansed & enriched' : 'Report-ready'}
                </p>
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shadow-sm"
                  style={{ background: meta.bg, border: `1.5px solid ${meta.border}` }}
                >
                  {layer.itemType === 'WH' ? (
                    <Layers size={24} style={{ color: meta.dot }} />
                  ) : (
                    <Database size={24} style={{ color: meta.dot }} />
                  )}
                </div>
                <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: meta.color, opacity: 0.6 }}>
                  {itemTypeMeta[layer.itemType].short}
                </p>
              </div>
              {i < 2 && (
                <div className="flex flex-col items-center mb-6">
                  <ArrowRight size={18} strokeWidth={2.5} className="text-slate-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Single card with all layers */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-5">
        <div
          className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2"
          style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
        >
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
            <Rocket size={13} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold text-slate-700">Lakehouse / Warehouse Layers</span>
          {onCreateInFabric && (
            <button
              onClick={onCreateInFabric}
              disabled={loading || !allNamed || allValidated}
              className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
              style={
                allValidated
                  ? { background: '#d1fae5', color: '#065f46' }
                  : loading
                  ? { background: '#d1fae5', color: '#065f46' }
                  : { background: 'linear-gradient(135deg, #1D9E75, #0d6e52)', color: '#fff' }
              }
            >
              {allValidated ? (
                <><CheckCircle2 size={12} /> Created</>
              ) : loading ? (
                <><Loader2 size={12} className="animate-spin" /> Creating...</>
              ) : (
                <>Create All</>
              )}
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {layers.map((layer) => {
            const meta = layerMeta[layer.key];
            const canChooseType = layer.key !== 'gold';
            return (
              <div key={layer.key} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                    {layer.key}
                  </span>
                  <span className="text-[11px] text-slate-400">— {meta.label}</span>
                  {layer.validated && <CheckCircle2 size={13} className="text-emerald-500 ml-auto" />}
                </div>

                {canChooseType && (
                  <div className="flex items-center gap-1.5 mb-2">
                    {(['LH', 'WH'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onUpdateLayerType(layer.key as 'bronze' | 'silver', type)}
                        disabled={layer.validated}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                          layer.itemType === type
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-slate-300 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
                        }`}
                      >
                        {itemTypeMeta[type].label}
                      </button>
                    ))}
                  </div>
                )}
                {!canChooseType && (
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-700">
                      Warehouse (fixed for Gold)
                    </span>
                  </div>
                )}

                <input
                  type="text"
                  value={layer.name}
                  onChange={(e) => {
                    onUpdateLayer(layer.key, e.target.value);
                  }}
                  placeholder={`Enter ${layer.key} layer name (e.g., ${layer.itemType.toLowerCase()}_sales_${layer.key})`}
                  readOnly={layer.validated}
                  className={`w-full h-9 px-3 text-[13px] rounded-lg border outline-none text-slate-800 placeholder:text-slate-400 ${
                    layer.validated
                      ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-600'
                      : 'border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 bg-slate-50'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3.5 rounded-xl border border-red-200 bg-red-50 text-[12px] text-red-700">
          {error}
        </div>
      )}
    </div>
  );
};