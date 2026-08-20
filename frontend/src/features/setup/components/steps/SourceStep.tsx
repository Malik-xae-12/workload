/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Database, Plus, Save, Loader2, CheckCircle2, XCircle, Server, Check, X, Search, Trash2, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { SourceConnection } from '../../types';
import { listGateways, checkConnectionNameAvailable, type GatewayInfo } from '../../../../layouts/services/fabricApi';
import { SelectDropdown } from '../../../../shared/components/selectdropdown';
import { validateSimpleName } from '../../../../shared/utils/nameValidation';

interface SourceStepProps {
  connections: SourceConnection[];
  onAddConnection: (connection: Omit<SourceConnection, 'id' | 'status' | 'fabricConnectionId'> & { is_on_prem?: boolean; gateway_name?: string; auth_type?: string; tenant_id?: string; client_id?: string; client_secret?: string }) => void;
  onDeleteConnection?: (connection: SourceConnection) => Promise<boolean> | void;
  loading?: boolean;
  error?: string | null;
  projectId: string | null;
}

type AuthType = 'Basic' | 'ServicePrincipal' | 'OAuth';

/** Combobox: a text input (used both to type/filter AND as the actual
 * value — some databases may not come back from listing, e.g. a brand new
 * one, so free typing always stays possible) with a searchable dropdown of
 * known databases underneath. Portaled to document.body and positioned
 * like SelectDropdown, for the same reason: the form card has
 * overflow-hidden, which would otherwise clip an open menu near the
 * bottom of the card. */
function DatabaseNameField({
  value,
  onChange,
  options,
  loading,
  supported,
  placeholder,
  error,
  note,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  loading: boolean;
  supported: boolean;
  placeholder: string;
  error?: string | null;
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleReposition = () => updatePosition();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open]);

  const filtered = options.filter((db) => db.toLowerCase().includes(value.toLowerCase()));

  // Listing isn't supported for this database type (e.g. not Azure SQL /
  // SQL Server yet) — just a plain text field, no dropdown affordance.
  if (!supported) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
        />
        {note && <p className="mt-1 text-[11px] text-amber-600">{note}</p>}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full h-9 pl-8 pr-8 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
        />
        {loading && (
          <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" />
        )}
      </div>
      {note && !loading && (
        <p className="mt-1 text-[11px] text-amber-600">{note}</p>
      )}

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            className="mm-dd-menu mm-dd-menu--portal"
            role="listbox"
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          >
            <div className="mm-dd-list">
              {loading ? (
                <div className="mm-dd-empty">Loading databases…</div>
              ) : error ? (
                <div className="mm-dd-empty mm-dd-empty--error">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="mm-dd-empty">
                  {options.length === 0 ? 'No databases found on this server yet' : 'No matches — you can still type a new name'}
                </div>
              ) : (
                filtered.map((db) => (
                  <div
                    key={db}
                    role="option"
                    aria-selected={db === value}
                    className={`mm-dd-item ${db === value ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(db);
                      setOpen(false);
                    }}
                  >
                    {db}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export const SourceStep = ({ connections, onAddConnection, onDeleteConnection, loading, error, projectId }: SourceStepProps) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    databaseType: 'Azure SQL',
    server: '',
    databaseName: '',
    username: '',
    password: '',
    gatewayName: '',
    authType: 'Basic' as AuthType,
    tenantId: '',
    clientId: '',
    clientSecret: '',
  });
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(false);
  const [gatewaysFetched, setGatewaysFetched] = useState(false);

  // Live "is this connection name free" check — Instagram/GitHub-username
  // style: debounced as the person types, instead of only finding out
  // after filling in the whole form and hitting Save.
  const [nameCheck, setNameCheck] = useState<{ status: 'idle' | 'checking' | 'available' | 'taken'; message?: string }>({ status: 'idle' });
  const connNameValidation = validateSimpleName(formData.name);
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameCheckRequestId = useRef(0);

  // Database listing (Azure SQL / SQL Server only — see supported flag).
  // TEMPORARILY DISABLED — see the comment on the effect below. Defaults
  // to false/unsupported so the plain manual text field renders
  // immediately with no flash of the (currently inert) dropdown UI.
  const [dbOptions, setDbOptions] = useState<string[]>([]);
  const [dbOptionsLoading, setDbOptionsLoading] = useState(false);
  const [dbListingSupported, setDbListingSupported] = useState(false);
  const [dbListError, setDbListError] = useState<string | null>(null);
  const [dbListNote, setDbListNote] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Table selection ("Tables to move to Bronze") now happens in the
  // Config → Metadata step, after this connection's Metadata
  // (ConfigCreation) notebook + pipeline have been created. See
  // ConfigStep.tsx's TableSelectionPanel. tablesConnId is still used
  // below purely to show the connection detail card in the dropdown.
  const [tablesConnId, setTablesConnId] = useState<string>('');

  const isPostgres = formData.databaseType === 'PostgreSQL';
  const isBlob = formData.databaseType === 'Azure Blob';
  const isAzureSql = formData.databaseType === 'Azure SQL';

  // Fetch gateways once when form is shown
  useEffect(() => {
    if (showForm && !gatewaysFetched && projectId) {
      setGatewaysLoading(true);
      listGateways(projectId)
        .then(setGateways)
        .catch(() => setGateways([]))
        .finally(() => {
          setGatewaysLoading(false);
          setGatewaysFetched(true);
        });
    }
  }, [showForm, projectId]);

  // Reset auth fields when database type changes
  useEffect(() => {
    if (!isPostgres && !isBlob) {
      setFormData((prev) => ({ ...prev, authType: 'Basic' as AuthType, tenantId: '', clientId: '', clientSecret: '' }));
    }
  }, [formData.databaseType]);

  // Azure SQL connections never go through an on-prem gateway (there's
  // nothing "on-prem" about them) — clear any previously chosen gateway
  // so a stale selection can't silently be submitted alongside it.
  useEffect(() => {
    if (isAzureSql && formData.gatewayName) {
      setFormData((prev) => ({ ...prev, gatewayName: '' }));
    }
  }, [isAzureSql]);

  // Debounced live connection-name availability check.
  useEffect(() => {
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    const name = formData.name.trim();
    if (!name || !projectId) {
      setNameCheck({ status: 'idle' });
      return;
    }
    setNameCheck({ status: 'checking' });
    const thisRequestId = ++nameCheckRequestId.current;
    nameCheckTimer.current = setTimeout(() => {
      checkConnectionNameAvailable(projectId, name)
        .then((res) => {
          if (thisRequestId !== nameCheckRequestId.current) return; // stale response — a newer keystroke already superseded this
          setNameCheck({ status: res.available ? 'available' : 'taken', message: res.message });
        })
        .catch(() => {
          if (thisRequestId !== nameCheckRequestId.current) return;
          setNameCheck({ status: 'idle' });
        });
    }, 400);
    return () => {
      if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    };
  }, [formData.name, projectId]);

  // Debounced database listing — refetches whenever the server or
  // credentials change, for Azure SQL / SQL Server only.
  //
  // TEMPORARILY DISABLED: even when this correctly detects a login that
  // can't browse the database list (DatabaseAccessRestricted — a scoped/
  // contained Azure SQL login, common in production) and falls back to a
  // plain text field with an explanatory note, it was still confusing
  // enough in practice to look like a hard blocker on adding a source
  // connection. Rather than debug the UX further right now, this whole
  // dynamic-listing feature is switched off — every database type just
  // gets a plain manual text field below, no fetch, no dropdown, nothing
  // that can go wrong. To re-enable: restore the block that used to be
  // here (see git history / the previous version of this file) which set
  // `supported` based on db_type and called `listDatabases(...)`.
  useEffect(() => {
    setDbListingSupported(false);
    setDbOptions([]);
  }, [formData.databaseType]);

  const handleDelete = async (conn: SourceConnection) => {
    if (!onDeleteConnection) return;
    setDeletingId(conn.id);
    try {
      await onDeleteConnection(conn);
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const handleSubmit = () => {
    const isOracle = formData.databaseType === 'Oracle';

    // Collect every missing required field's label, so the toast tells the
    // person exactly what to fill in rather than doing nothing silently.
    const missing: string[] = [];

    if (!formData.name) missing.push('Connection Name');
    if (!formData.databaseType) missing.push('Database Type');
    if (!formData.server) missing.push(isBlob ? 'Account URL' : 'Server / Host');
    if (!isOracle && !formData.databaseName) missing.push(isBlob ? 'Container Name' : 'Database Name');

    if ((isPostgres || isBlob) && formData.authType === 'ServicePrincipal') {
      if (!formData.tenantId) missing.push('Tenant ID');
      if (!formData.clientId) missing.push('Client ID');
      if (!formData.clientSecret) missing.push('Client Secret');
    } else if (isPostgres && formData.authType === 'OAuth') {
      if (!formData.tenantId) missing.push('Tenant ID');
      if (!formData.clientId) missing.push('Client ID');
    } else {
      if (!formData.username) missing.push('Username');
      if (!formData.password) missing.push('Password');
    }

    if (missing.length > 0) {
      toast.error(
        missing.length === 1
          ? `Please fill in ${missing[0]}.`
          : `Please fill in the following fields: ${missing.join(', ')}.`
      );
      return;
    }

    if (!connNameValidation.isValid) {
      toast.error(connNameValidation.warning || 'Connection name can only contain letters and numbers.');
      return;
    }

    if (nameCheck.status === 'taken') {
      toast.error(nameCheck.message || 'That connection name is already in use — please choose another.');
      return;
    }

    const hasGateway = !isAzureSql && !!formData.gatewayName;
    onAddConnection({
      name: connNameValidation.trimmed,
      databaseType: formData.databaseType,
      server: formData.server,
      databaseName: isOracle ? '' : formData.databaseName,
      username: formData.username,
      password: formData.password,
      is_on_prem: hasGateway,
      gateway_name: hasGateway ? formData.gatewayName : undefined,
      auth_type: (isPostgres || isBlob) ? formData.authType : 'Basic',
      tenant_id: formData.tenantId || undefined,
      client_id: formData.clientId || undefined,
      client_secret: formData.clientSecret || undefined,
    });
    setFormData({ name: '', databaseType: 'Azure SQL', server: '', databaseName: '', username: '', password: '', gatewayName: '', authType: 'Basic', tenantId: '', clientId: '', clientSecret: '' });
    setNameCheck({ status: 'idle' });
    setShowForm(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Source Connections</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Configure data source connections for ingestion into the medallion architecture.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {/* Existing connections — dropdown instead of a stacked list, so
          this stays usable with 10+ connections. */}
      {connections.length > 0 && (
        <div className="mb-5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Connections ({connections.length})
          </label>
          <SelectDropdown
            value={connections.find((c) => c.id === tablesConnId)?.name ?? ''}
            options={connections.map((c) => c.name)}
            placeholder="Select a connection to view…"
            onChange={(name) => {
              const c = connections.find((c) => c.name === name);
              setTablesConnId(c ? c.id : '');
            }}
          />

          {(() => {
            const conn = connections.find((c) => c.id === tablesConnId);
            if (!conn) return null;
            return (
              <div className="mt-2.5 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between shadow-sm shadow-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Database size={16} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">{conn.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {conn.databaseType} · {conn.server}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    conn.status === 'creating'
                      ? 'text-blue-700 bg-blue-50 border-blue-100'
                      : conn.status === 'failed'
                      ? 'text-red-700 bg-red-50 border-red-100'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-100'
                  }`}>
                    {conn.status === 'creating' ? (
                      <><Loader2 size={11} className="animate-spin" /> Creating…</>
                    ) : conn.status === 'failed' ? (
                      <><XCircle size={11} /> Failed{conn.statusError ? `: ${conn.statusError}` : ''}</>
                    ) : (
                      <><CheckCircle2 size={11} /> {conn.fabricConnectionId ? 'Fabric Connected' : 'Active'}</>
                    )}
                  </span>
                  {onDeleteConnection && conn.status !== 'creating' && (
                    pendingDeleteId === conn.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">Delete?</span>
                        <button
                          onClick={() => handleDelete(conn)}
                          disabled={deletingId === conn.id}
                          className="p-1 rounded text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                          title="Confirm delete"
                        >
                          {deletingId === conn.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(null)}
                          disabled={deletingId === conn.id}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingDeleteId(conn.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete connection"
                      >
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Note: "Tables to move to Bronze" selection now lives in the
          Metadata step of Config, after the Metadata (ConfigCreation)
          notebook + pipeline have been created for a connection — see
          ConfigStep.tsx's TableSelectionPanel. */}

      {/* Connecting indicator */}
      {loading && !showForm && (
        <div className="mb-5 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm animate-pulse">
          <Loader2 size={18} className="text-emerald-600 animate-spin" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">Connecting...</p>
            <p className="text-[11px] text-emerald-600">Creating connection in Fabric. This may take a moment.</p>
          </div>
        </div>
      )}

      {/* Add connection */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          disabled={loading}
          className="w-full h-[88px] border-2 border-dashed border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/40 transition-all group flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
        >
          <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
            <Plus size={16} className="text-slate-400 group-hover:text-emerald-600" />
          </div>
          <span className="text-[13px] font-semibold text-slate-500 group-hover:text-emerald-700">
            Add Source Connection
          </span>
        </button>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div
            className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5"
            style={{ background: 'linear-gradient(to right, #f8fffe, #f0faf6)' }}
          >
            <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center">
              <Server size={13} className="text-white" />
            </div>
            <span className="text-[12px] font-semibold text-slate-700">New Connection</span>
          </div>

          <div className="p-5 grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Connection Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onBlur={() => setFormData((prev) => ({ ...prev, name: prev.name.trim() }))}
                  placeholder="e.g., ProductionSalesDB"
                  className={`w-full h-9 px-3.5 pr-8 text-[13px] rounded-lg border outline-none focus:ring-2 text-slate-800 placeholder:text-slate-400 bg-slate-50 ${
                    nameCheck.status === 'taken' || connNameValidation.warning
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-50'
                      : nameCheck.status === 'available'
                      ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-50'
                      : 'border-slate-300 focus:border-emerald-400 focus:ring-emerald-50'
                  }`}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {nameCheck.status === 'checking' && <Loader2 size={14} className="text-slate-400 animate-spin" />}
                  {!connNameValidation.warning && nameCheck.status === 'available' && <Check size={15} className="text-emerald-500" strokeWidth={3} />}
                  {(connNameValidation.warning || nameCheck.status === 'taken') && <X size={15} className="text-rose-500" strokeWidth={3} />}
                </div>
              </div>
              {connNameValidation.warning ? (
                <p className="text-[11px] text-rose-500">{connNameValidation.warning}</p>
              ) : nameCheck.status === 'taken' ? (
                <p className="text-[11px] text-rose-500">{nameCheck.message}</p>
              ) : nameCheck.status === 'available' ? (
                <p className="text-[11px] text-emerald-600">Available</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Database Type <span className="text-rose-400">*</span>
              </label>
              <SelectDropdown
                value={formData.databaseType}
                options={['Azure SQL', 'PostgreSQL', 'MySQL', 'Oracle', 'SQL Server', 'Azure Blob']}
                placeholder="Select database type…"
                onChange={(val) => {
                  const updates: any = { databaseType: val };
                  if (val === 'Azure Blob') {
                    updates.authType = 'ServicePrincipal';
                  }
                  setFormData({ ...formData, ...updates });
                }}
              />
            </div>

            {/* Authentication type */}
            {(isPostgres || isBlob) && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Authentication <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as AuthType })}
                  className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 bg-slate-50"
                >
                  {isBlob ? (
                    <option value="ServicePrincipal">Service Principal</option>
                  ) : (
                    <>
                      <option value="Basic">Basic</option>
                      <option value="ServicePrincipal">Service Principal</option>
                      <option value="OAuth">OAuth</option>
                    </>
                  )}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {isBlob ? 'Account URL' : 'Server / Host'} <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={formData.server}
                onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                placeholder={isBlob ? "https://account.blob.core.windows.net/" : "server.database.windows.net"}
                className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
              />
            </div>

            {/* Hide Database Name for Oracle only, use it for Container Name in Blob */}
            {formData.databaseType !== 'Oracle' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {isBlob ? 'Container Name' : 'Database Name'} <span className="text-rose-400">*</span>
                </label>
                {isBlob ? (
                  <input
                    type="text"
                    value={formData.databaseName}
                    onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                    placeholder="raw"
                    className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                  />
                ) : (
                  <DatabaseNameField
                    value={formData.databaseName}
                    onChange={(v) => setFormData({ ...formData, databaseName: v })}
                    options={dbOptions}
                    loading={dbOptionsLoading}
                    supported={dbListingSupported}
                    error={dbListError}
                    note={dbListNote}
                    placeholder={
                      dbListingSupported
                        ? formData.server
                          ? 'Search databases…'
                          : 'Enter server details first'
                        : 'sales_db'
                    }
                  />
                )}
              </div>
            )}

            {/* Basic auth fields */}
            {(!isPostgres && !isBlob || formData.authType === 'Basic') && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Username <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="db_user"
                    className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Password <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                  />
                </div>
              </>
            )}

            {/* Service Principal fields */}
            {((isPostgres || isBlob) && formData.authType === 'ServicePrincipal') && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Tenant ID <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.tenantId}
                        onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Client ID <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.clientId}
                        onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Client Secret <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={formData.clientSecret}
                        onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                        placeholder="••••••••"
                        className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                      />
                    </div>
                  </>
                )}

                {/* OAuth fields */}
                {isPostgres && formData.authType === 'OAuth' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Tenant ID <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.tenantId}
                        onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Client ID <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.clientId}
                        onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                      />
                    </div>
                  </>
                )}

                {/* Gateway selector — completely removed for Azure SQL,
                    which never goes through an on-prem gateway */}
            {!isAzureSql && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Data Gateway
              </label>
              {gatewaysLoading ? (
                <div className="flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-200 bg-slate-50">
                  <Loader2 size={12} className="text-emerald-500 animate-spin" />
                  <span className="text-[11px] text-slate-400">Loading...</span>
                </div>
              ) : (
                <select
                  value={formData.gatewayName}
                  onChange={(e) => setFormData({ ...formData, gatewayName: e.target.value })}
                  className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 bg-slate-50"
                >
                  <option value="">None (Cloud)</option>
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.name || gw.id}>
                      {gw.name || gw.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
            )}

            <div className="col-span-2 flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={loading || nameCheck.status === 'checking'}
                className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-white rounded-xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Creating in Fabric...</>
                ) : nameCheck.status === 'checking' ? (
                  <><Loader2 size={14} className="animate-spin" /> Checking name...</>
                ) : (
                  <><Save size={14} /> Save Connection</>
                )}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 text-[13px] font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};