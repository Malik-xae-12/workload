/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Building2, Rocket, ShieldCheck, CheckCircle2, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { fabricTokenRequest } from '../../../auth/config/msalConfig';
import { CredentialsStep } from './CredentialsStep';
import type { CredentialFields } from './CredentialsStep';
import { validateSimpleName } from '../../../../shared/utils/nameValidation';

type ProvisionPhase = 'idle' | 'creating' | 'adding-admin' | 'assigning-capacity' | 'done' | 'error';

interface WorkspaceSetupStepProps {
  workspaceId: string | null;
  workspaceName: string;
  capacityAssigned?: boolean;
  onProvision: (workspaceName: string, userFabricToken?: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  credentialsSaved: boolean;
  credentials: CredentialFields;
  onUpdateCredentials: (field: keyof CredentialFields, value: string) => void;
  onSaveCredentials: () => Promise<boolean>;
}

const phases: { key: ProvisionPhase; label: string; icon: React.ReactNode }[] = [
  { key: 'creating', label: 'Creating Fabric workspace…', icon: <Building2 size={16} /> },
  { key: 'adding-admin', label: 'Adding service principal as Admin…', icon: <ShieldCheck size={16} /> },
  { key: 'assigning-capacity', label: 'Assigning capacity…', icon: <Rocket size={16} /> },
];

export const WorkspaceSetupStep = ({
  workspaceId,
  workspaceName: savedName,
  capacityAssigned,
  onProvision,
  loading,
  error,
  credentialsSaved,
  credentials,
  onUpdateCredentials,
  onSaveCredentials,
}: WorkspaceSetupStepProps) => {
  const { instance: msalInstance, accounts } = useMsal();
  const [name, setName] = useState(savedName || '');
  const nameValidation = validateSimpleName(name);
  const [phase, setPhase] = useState<ProvisionPhase>(workspaceId ? 'done' : 'idle');
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credReadOnly, setCredReadOnly] = useState(credentialsSaved);

  const handleSaveCredentials = async (): Promise<boolean> => {
    setCredSaving(true);
    setCredError(null);
    try {
      const ok = await onSaveCredentials();
      if (ok) {
        setCredReadOnly(true);
      } else {
        setCredError(error || 'Failed to save credentials');
      }
      return ok;
    } catch (e: any) {
      setCredError(e.message || 'Failed to save credentials');
      return false;
    } finally {
      setCredSaving(false);
    }
  };

  const handleProvision = async () => {
    const { trimmed, isValid, warning } = validateSimpleName(name);
    if (!isValid) {
      setProvisionError(warning || 'Please enter a workspace name.');
      setPhase('error');
      return;
    }
    setName(trimmed);
    setProvisionError(null);
    setPhase('creating');

    // Try to get a user-delegated Fabric token for capacity assignment —
    // SILENT ONLY. This step must never open an interactive popup: the
    // only place in this app allowed to do that is the Credentials step's
    // "Sign in with Microsoft" / "Switch account" buttons. An
    // acquireTokenPopup() fallback here used to fire on essentially every
    // click of this button (silent fails for anyone who hasn't been
    // through that specific OAuth consent flow, which is most people —
    // e.g. everyone using Service Principal auth, or signed in via the
    // app's own basic login rather than the Fabric-scoped one), popping
    // open a window that just rendered the whole app again. If silent
    // acquisition fails, this simply continues without a user token —
    // capacity assignment falls back to the project's own credentials,
    // same as the outer catch below already assumed.
    let userFabricToken: string | undefined;
    try {
      const account = accounts[0];
      if (account) {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          ...fabricTokenRequest,
          account,
        });
        userFabricToken = tokenResponse.accessToken;
      }
    } catch {
      // Continue without user token — capacity assignment will be skipped
    }

    // Simulate phase progression while the actual API call runs
    const phaseTimer1 = setTimeout(() => setPhase('adding-admin'), 2500);
    const phaseTimer2 = setTimeout(() => setPhase('assigning-capacity'), 5000);

    try {
      const ok = await onProvision(trimmed, userFabricToken);
      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);
      if (ok) {
        setPhase('done');
      } else {
        setPhase('error');
        setProvisionError(error || 'Provisioning failed');
      }
    } catch (e: any) {
      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);
      setPhase('error');
      setProvisionError(e.message || 'Provisioning failed');
    }
  };

  const isProvisioning = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const displayError = provisionError || error;

  // Already provisioned → show success state
  if (phase === 'done' || workspaceId) {
    return (
      <div className="max-w-5xl space-y-6">
        {/* Credentials (read-only) */}
        <CredentialsStep
          credentials={credentials}
          onUpdateCredentials={onUpdateCredentials}
          onSave={handleSaveCredentials}
          readOnly
          onEdit={() => setCredReadOnly(false)}
          saving={credSaving}
          saved={credentialsSaved}
          error={credError}
        />

        {/* Workspace success card */}
        <div className="max-w-6xl">
          <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-sm">
            <div
              className="px-6 py-4 flex items-center gap-3"
              style={{ background: 'linear-gradient(to right, #ecfdf5, #d1fae5)' }}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-white" />
              </div>
              <div>
                <p className="text-[14px] font-bold text-emerald-800">Workspace Provisioned</p>
                <p className="text-[12px] text-emerald-600">
                  Service principal added as Admin
                </p>
              </div>
            </div>

            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-500 font-medium">Workspace Name</span>
                <span className="text-slate-800 font-semibold">{savedName || name}</span>
              </div>
              
              {capacityAssigned === false && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                  <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-700">
                    Capacity could not be assigned automatically. A capacity admin must assign this workspace to a Fabric capacity manually.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Step 1: Credentials */}
      <CredentialsStep
        credentials={credentials}
        onUpdateCredentials={onUpdateCredentials}
        onSave={handleSaveCredentials}
        readOnly={credReadOnly}
        onEdit={() => setCredReadOnly(false)}
        saving={credSaving}
        saved={credentialsSaved}
        error={credError}
      />

      {/* Step 2: Workspace Provisioning (only after credentials saved) */}
      {credentialsSaved && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm shadow-slate-100">
            {/* Card header */}
            <div
              className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
              style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
            >
              <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
                <Building2 size={13} className="text-white" />
              </div>
              <span className="text-[12px] font-semibold text-slate-700">Fabric Workspace</span>
            </div>

            <div className="p-6 space-y-6">
              {/* Workspace name input */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Workspace Name <span className="text-rose-400 normal-case tracking-normal">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName((v) => v.trim())}
                  placeholder="e.g. FabricProductionWorkspace"
                  disabled={isProvisioning}
                  className={`w-full h-10 px-3.5 text-[13px] rounded-lg border outline-none transition-all placeholder:text-slate-400 ${
                    isProvisioning
                      ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-600'
                      : nameValidation.warning
                      ? 'bg-slate-50 border-rose-300 text-slate-800 focus:border-rose-400 focus:ring-2 focus:ring-rose-50'
                      : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50'
                  }`}
                />
                {nameValidation.warning ? (
                  <p className="text-[11px] text-rose-500 flex items-center gap-1">
                    <AlertCircle size={11} className="shrink-0" /> {nameValidation.warning}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    A new workspace will be created in your Fabric tenant with this name.
                  </p>
                )}
              </div>

              {/* Provisioning progress */}
              {isProvisioning && (
                <div className="space-y-3 py-2">
                  {phases.map((p) => {
                    const isActive = p.key === phase;
                    const phaseOrder = phases.findIndex((x) => x.key === p.key);
                    const currentOrder = phases.findIndex((x) => x.key === phase);
                    const isDone = phaseOrder < currentOrder;

                    return (
                      <div
                        key={p.key}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-500 ${
                          isActive
                            ? 'bg-emerald-50 border border-emerald-200'
                            : isDone
                            ? 'bg-emerald-50/50 border border-emerald-100'
                            : 'bg-slate-50 border border-slate-100'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        ) : isActive ? (
                          <Loader2 size={16} className="text-emerald-600 animate-spin shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                        )}
                        <span
                          className={`text-[13px] font-medium ${
                            isActive ? 'text-emerald-700' : isDone ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {p.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Error */}
              {phase === 'error' && displayError && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-rose-700">Provisioning Failed</p>
                    <p className="text-[12px] text-rose-600 mt-0.5">{displayError}</p>
                  </div>
                </div>
              )}

              {/* Provision button */}
              {!isProvisioning && (
                <button
                  onClick={handleProvision}
                  disabled={!nameValidation.isValid || loading}
                  className="w-full h-11 rounded-lg text-[13px] font-bold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: nameValidation.isValid
                      ? 'linear-gradient(135deg, #1D9E75, #0d6e52)'
                      : '#94a3b8',
                  }}
                >
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Rocket size={15} />
                  )}
                  {phase === 'error' ? 'Retry Provisioning' : 'Create Workspace & Add Admin'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};