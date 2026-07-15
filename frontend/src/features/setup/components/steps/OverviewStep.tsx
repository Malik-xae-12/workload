/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ShieldCheck,
  Layers,
  Database as DatabaseIcon,
  Settings,
  BarChart3,
} from 'lucide-react';
import type { SetupState } from '../../types';

interface OverviewStepProps {
  setupState: SetupState;
}

export const OverviewStep = ({ setupState }: OverviewStepProps) => {
  const { workspace, connections, medallionLayers, configTasks, pipelines } = setupState;

  const CardSection = ({
    icon: Icon,
    title,
    children,
  }: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
        <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
          <Icon size={13} className="text-white" />
        </div>
        <span className="text-[12px] font-semibold text-slate-700">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  const KV = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="text-[11px] font-mono text-slate-700 max-w-[180px] truncate">{value || '—'}</span>
    </div>
  );

  return (
    <div className="max-w-3xl">
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4">
        <CardSection icon={ShieldCheck} title="Workspace">
          <KV label="Workspace ID" value={workspace.workspaceId} />
          <KV label="Workspace Name" value={workspace.workspaceName || ''} />
          <KV label="Capacity Assigned" value={workspace.capacityAssigned ? 'Yes' : 'No'} />
        </CardSection>

        <CardSection icon={DatabaseIcon} title="Source Connections">
          {connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg"
                >
                  <span className="text-[12px] font-medium text-slate-700">{conn.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Active
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">None configured</p>
          )}
        </CardSection>

        <CardSection icon={Layers} title="Medallion Layers">
          <div className="space-y-2">
            {medallionLayers.map((layer) => (
              <div
                key={layer.key}
                className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        layer.key === 'bronze' ? '#f59e0b' : layer.key === 'silver' ? '#94a3b8' : '#1D9E75',
                    }}
                  />
                  <span className="text-[12px] font-medium text-slate-700">{layer.name}</span>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={
                    layer.validated
                      ? { background: '#d1fae5', color: '#065f46' }
                      : { background: '#f1f5f9', color: '#94a3b8' }
                  }
                >
                  {layer.validated ? 'Created' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </CardSection>

        <CardSection icon={Settings} title="Config Tasks">
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[12px] font-medium text-slate-700">Notebook</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={
                  configTasks.some((t) => t.name.toLowerCase().includes('notebook') && t.status === 'completed')
                    ? { background: '#d1fae5', color: '#065f46' }
                    : { background: '#f1f5f9', color: '#94a3b8' }
                }
              >
                {configTasks.some((t) => t.name.toLowerCase().includes('notebook') && t.status === 'completed') ? 'Created' : 'Pending'}
              </span>
            </div>
            <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[12px] font-medium text-slate-700">Pipeline Run</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={
                  configTasks.some((t) => t.name.toLowerCase().includes('pipeline') && t.status === 'completed')
                    ? { background: '#d1fae5', color: '#065f46' }
                    : { background: '#f1f5f9', color: '#94a3b8' }
                }
              >
                {configTasks.some((t) => t.name.toLowerCase().includes('pipeline') && t.status === 'completed') ? 'Run Successful' : 'Pending'}
              </span>
            </div>
          </div>
        </CardSection>
      </div>
    </div>
  );
};
