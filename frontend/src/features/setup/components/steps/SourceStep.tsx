/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Database, Plus, Save, Loader2, CheckCircle2, Server } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SourceConnection } from '../../types';
import { listGateways, type GatewayInfo } from '../../../../layouts/services/fabricApi';

interface SourceStepProps {
  connections: SourceConnection[];
  onAddConnection: (connection: Omit<SourceConnection, 'id' | 'status' | 'fabricConnectionId'> & { is_on_prem?: boolean; gateway_name?: string; auth_type?: string; tenant_id?: string; client_id?: string; client_secret?: string }) => void;
  loading?: boolean;
  error?: string | null;
  projectId: string | null;
}

type AuthType = 'Basic' | 'ServicePrincipal' | 'OAuth';

export const SourceStep = ({ connections, onAddConnection, loading, error, projectId }: SourceStepProps) => {
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

  const isPostgres = formData.databaseType === 'PostgreSQL';

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
    if (!isPostgres) {
      setFormData((prev) => ({ ...prev, authType: 'Basic' as AuthType, tenantId: '', clientId: '', clientSecret: '' }));
    }
  }, [formData.databaseType]);

  const handleSubmit = () => {
    const isOracle = formData.databaseType === 'Oracle';
    const required = formData.name && formData.server;
    const dbRequired = !isOracle ? formData.databaseName : true;

    // Validate based on auth type
    let authValid = false;
    if (isPostgres && formData.authType === 'ServicePrincipal') {
      authValid = !!formData.tenantId && !!formData.clientId && !!formData.clientSecret;
    } else if (isPostgres && formData.authType === 'OAuth') {
      authValid = !!formData.tenantId && !!formData.clientId;
    } else {
      authValid = !!formData.username && !!formData.password;
    }

    if (required && dbRequired && authValid) {
      const hasGateway = !!formData.gatewayName;
      onAddConnection({
        name: formData.name,
        databaseType: formData.databaseType,
        server: formData.server,
        databaseName: isOracle ? '' : formData.databaseName,
        username: formData.username,
        password: formData.password,
        is_on_prem: hasGateway,
        gateway_name: hasGateway ? formData.gatewayName : undefined,
        auth_type: isPostgres ? formData.authType : 'Basic',
        tenant_id: formData.tenantId || undefined,
        client_id: formData.clientId || undefined,
        client_secret: formData.clientSecret || undefined,
      });
      setFormData({ name: '', databaseType: 'Azure SQL', server: '', databaseName: '', username: '', password: '', gatewayName: '', authType: 'Basic', tenantId: '', clientId: '', clientSecret: '' });
      setShowForm(false);
    }
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

      {/* Existing connections */}
      {connections.length > 0 && (
        <div className="mb-5 space-y-2.5">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:border-emerald-200 transition-colors shadow-sm shadow-slate-50"
            >
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
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle2 size={11} />
                {conn.fabricConnectionId ? 'Fabric Connected' : 'Active'}
              </span>
            </div>
          ))}
        </div>
      )}

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
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Sales DB"
                className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Database Type <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.databaseType}
                onChange={(e) => setFormData({ ...formData, databaseType: e.target.value })}
                className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 bg-slate-50"
              >
                <option>Azure SQL</option>
                <option>PostgreSQL</option>
                <option>MySQL</option>
                <option>Oracle</option>
                <option>SQL Server</option>
              </select>
            </div>

            {/* Authentication type for PostgreSQL */}
            {isPostgres && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Authentication <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as AuthType })}
                  className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 bg-slate-50"
                >
                  <option value="Basic">Basic</option>
                  <option value="ServicePrincipal">Service Principal</option>
                  <option value="OAuth">OAuth</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Server / Host <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={formData.server}
                onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                placeholder="server.database.windows.net"
                className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
              />
            </div>

            {/* Hide Database Name for Oracle */}
            {formData.databaseType !== 'Oracle' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Database Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.databaseName}
                  onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                  placeholder="sales_db"
                  className="w-full h-9 px-3.5 text-[13px] rounded-lg border border-slate-300 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 text-slate-800 placeholder:text-slate-400 bg-slate-50"
                />
              </div>
            )}

            {/* Basic auth fields */}
            {(!isPostgres || formData.authType === 'Basic') && (
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
            {isPostgres && formData.authType === 'ServicePrincipal' && (
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

            {/* Gateway selector — shown for all types */}
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

            <div className="col-span-2 flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-white rounded-xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1D9E75, #0d6e52)' }}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Creating in Fabric...</>
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
