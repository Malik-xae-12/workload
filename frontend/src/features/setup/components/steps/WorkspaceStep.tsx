/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Building2, ExternalLink } from 'lucide-react';

interface WorkspaceStepProps {
  workspace: {
    workspaceId: string;
    userObjectId: string;
  };
  onUpdate: (field: string, value: string) => void;
}

export const WorkspaceStep = ({ workspace, onUpdate }: WorkspaceStepProps) => {
  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
          Workspace Configuration
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Specify the Microsoft Fabric workspace where resources will be provisioned.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm shadow-slate-100">
        <div
          className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
          style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
        >
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
            <Building2 size={13} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold text-slate-700">Fabric Workspace</span>
        </div>

        <div className="p-6 space-y-5">
          {/* Workspace ID */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Workspace ID <span className="text-rose-400 normal-case tracking-normal">*</span>
            </label>
            <input
              type="text"
              value={workspace.workspaceId}
              onChange={(e) => onUpdate('workspaceId', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full h-10 px-3.5 text-[13px] rounded-lg border border-slate-200 outline-none transition-all bg-white text-slate-800 placeholder:text-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
            />
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              Find this in Fabric → Workspace Settings → Properties
              <ExternalLink size={10} />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* User Object ID */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              User Object ID
              <span className="normal-case tracking-normal font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                Optional
              </span>
            </label>
            <input
              type="text"
              value={workspace.userObjectId}
              onChange={(e) => onUpdate('userObjectId', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full h-10 px-3.5 text-[13px] rounded-lg border border-slate-200 outline-none transition-all bg-white text-slate-800 placeholder:text-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50"
            />
            <p className="text-[11px] text-slate-400">
              Optional — specify a user object ID for additional workspace permissions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
