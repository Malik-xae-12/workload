/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldCheck, Eye, EyeOff, Info, Lock, Pencil, CheckCircle2, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface CredentialFields {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  capacityId: string;
  userObjectId: string;
}

interface CredentialsStepProps {
  credentials: CredentialFields;
  onUpdateCredentials: (field: keyof CredentialFields, value: string) => void;
  onSave: () => Promise<boolean>;
  readOnly?: boolean;
  onEdit?: () => void;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
}

const FieldInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  hint,
  rightSlot,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
  rightSlot?: React.ReactNode;
  readOnly?: boolean;
}) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
      {label}
      {required && <span className="text-rose-400 normal-case tracking-normal">*</span>}
    </label>
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full h-10 px-3.5 text-[13px] rounded-lg border outline-none transition-all text-slate-800 placeholder:text-slate-400 ${rightSlot ? 'pr-10' : ''} ${readOnly
          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-600'
          : 'bg-slate-50 border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50'
          }`}
      />
      {rightSlot && (
        <div className="absolute right-0 top-0 h-full flex items-center pr-2.5">
          {rightSlot}
        </div>
      )}
    </div>
    {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
  </div>
);

export const CredentialsStep = ({
  credentials,
  onUpdateCredentials,
  onSave,
  readOnly,
  onEdit,
  saving,
  saved,
  error,
}: CredentialsStepProps) => {
  const [showSecret, setShowSecret] = useState(false);

  // Internal edit-mode state so the fields can flip to editable in place
  // even if the parent doesn't (or can't) toggle the `readOnly` prop itself.
  const [isEditing, setIsEditing] = useState(false);

  // Snapshot of credentials taken when entering edit mode, so Cancel can revert.
  const [snapshot, setSnapshot] = useState<CredentialFields | null>(null);

  // If the parent's readOnly prop flips back to true (e.g. after a successful
  // save), make sure we drop out of edit mode too.
  useEffect(() => {
    if (readOnly) {
      setIsEditing(false);
      setSnapshot(null);
    }
  }, [readOnly]);

  const effectiveReadOnly = readOnly && !isEditing;

  const canSave = credentials.clientId && credentials.clientSecret && credentials.tenantId && credentials.capacityId;

  const handleEditClick = () => {
    setSnapshot({ ...credentials });
    setIsEditing(true);
    onEdit?.();
  };

  const handleCancelEdit = () => {
    if (snapshot) {
      (Object.keys(snapshot) as (keyof CredentialFields)[]).forEach((key) => {
        onUpdateCredentials(key, snapshot[key]);
      });
    }
    setIsEditing(false);
    setSnapshot(null);
  };

  const handleSaveClick = async () => {
    const success = await onSave();
    if (success) {
      setIsEditing(false);
      setSnapshot(null);
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">
              Service Principal Credentials
            </h1>
            {effectiveReadOnly && (
              <Lock size={16} className="text-slate-400" />
            )}
            {saved && !isEditing && (
              <CheckCircle2 size={18} className="text-emerald-500" />
            )}
          </div>
          <p className="text-[13px] text-slate-500 mt-1">
            {isEditing
              ? 'Update the fields below, then save your changes.'
              : effectiveReadOnly
                ? 'Credentials saved. These will be used for all Fabric operations.'
                : 'Provide your Azure service principal details and Fabric capacity ID.'}
          </p>
        </div>
        {readOnly && !isEditing && (
          <button
            onClick={handleEditClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white rounded-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
          >
            <Pencil size={13} /> Edit
          </button>
        )}
        {isEditing && (
          <button
            onClick={handleCancelEdit}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-slate-600 rounded-lg border border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <X size={13} /> Cancel
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm shadow-slate-100 relative">
        <div
          className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
          style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
        >
          <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
            <ShieldCheck size={13} className="text-white" />
          </div>
          <span className="text-[12px] font-semibold text-slate-700">Fabric Service Principal</span>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
            <Info size={11} />
            Credentials are validated before saving
          </div>
        </div>
        <div className="p-6 flex flex-col lg:flex-row">
          {/* Left: Authentication Credentials */}
          <div className="flex-1 space-y-5">
            <FieldInput
              label="Client ID"
              required
              value={credentials.clientId}
              onChange={(v) => onUpdateCredentials('clientId', v)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              readOnly={effectiveReadOnly}
              hint="App Registration (Service Principal) Application ID"
            />

            <FieldInput
              label="Tenant ID"
              required
              value={credentials.tenantId}
              onChange={(v) => onUpdateCredentials('tenantId', v)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              readOnly={effectiveReadOnly}
              hint="Azure AD / Entra ID Tenant"
            />

            <FieldInput
              label="Client Secret"
              required
              value={effectiveReadOnly ? '••••••••••••••••' : credentials.clientSecret}
              onChange={(v) => onUpdateCredentials('clientSecret', v)}
              placeholder={isEditing ? 'Enter new value to change secret' : 'Enter client secret value'}
              type={effectiveReadOnly ? 'password' : showSecret ? 'text' : 'password'}
              readOnly={effectiveReadOnly}
              rightSlot={
                !effectiveReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )
              }
            />
          </div>

          {/* Vertical divider */}
          <div className="mx-6 w-px bg-slate-200 self-stretch hidden lg:block" />

          {/* Right: Capacity & User Object ID */}
          <div className="flex-1 space-y-5 mt-5 lg:mt-0">
            <FieldInput
              label="Capacity ID"
              required
              value={credentials.capacityId}
              onChange={(v) => onUpdateCredentials('capacityId', v)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              readOnly={effectiveReadOnly}
              hint="Fabric capacity to assign workspaces to"
            />

            <FieldInput
              label="User Object ID"
              value={credentials.userObjectId}
              onChange={(v) => onUpdateCredentials('userObjectId', v)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              readOnly={effectiveReadOnly}
              hint="Your Entra Object ID — will be added as workspace Admin"
            />
          </div>
        </div>

        {/* Save button & error (visible when creating for the first time OR editing) */}
        {(!readOnly || isEditing) && (
          <div className="px-6 pb-5 flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={!canSave || saving}
              className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: canSave && !saving ? 'linear-gradient(135deg, #1D9E75, #0d6e52)' : '#94a3b8' }}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Validating &amp; Saving…
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Save Credentials'
              )}
            </button>
            {isEditing && !saving && (
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2.5 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-all"
              >
                Cancel
              </button>
            )}
            {error && (
              <span className="text-[12px] text-rose-500">{error}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};