/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Database,
  Layers,
  Zap,
  Lock,
  CheckCircle2,
  Search,
  ArrowRight,
} from 'lucide-react';

export const HowItWorks = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [layerNames, setLayerNames] = useState({
    bronze: 'lh_sales_bronze',
    silver: 'lh_sales_silver',
    gold: 'wh_sales_gold',
  });
  const [confirmedLayers, setConfirmedLayers] = useState<Record<string, boolean>>({
    bronze: true,
    silver: true,
    gold: true,
  });

  const steps = [
    { id: 1, title: 'Credentials', icon: <ShieldCheck size={18} /> },
    { id: 2, title: 'Workspace', icon: <LayoutDashboard size={18} /> },
    { id: 3, title: 'Source', icon: <Database size={18} /> },
    { id: 4, title: 'Medallion', icon: <Layers size={18} /> },
    { id: 5, title: 'Deployment', icon: <Zap size={18} /> },
  ];

  const renderStepContent = () => {
    switch (activeStep) {
      case 0: // Credentials
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  Fabric Authentication
                </h3>
                <p className="text-slate-400 text-sm">
                  Securely connect your service principal with Entra ID
                </p>
              </div>
              <div className="flex -space-x-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-slate-400"
                  >
                    <ShieldCheck size={16} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="md:col-span-2 p-8 bg-forest-500 rounded-[2.5rem] text-white relative overflow-hidden group">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center border border-white/5 shadow-2xl">
                    <Lock size={36} className="text-white" />
                  </div>
                  <div className="text-center md:text-left space-y-2">
                    <h4 className="text-2xl font-bold tracking-tight">Authorization Context</h4>
                    <p className="text-white/60 text-sm max-w-sm">
                      Ensure your Service Principal has 'Workspace Member' or 'Admin' permissions in
                      target Fabric capacity.
                    </p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
              </div>

              {['Client ID', 'Tenant ID', 'Client Secret'].map((label, idx) => (
                <div key={label} className={`space-y-2 ${idx === 2 ? 'md:col-span-2' : ''}`}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {label}
                  </label>
                  <div className="h-16 bg-white border border-slate-100 rounded-2xl px-6 flex items-center shadow-sm relative group focus-within:ring-4 focus-within:ring-forest-500/5 focus-within:border-forest-500 transition-all">
                    <input
                      type={label.includes('Secret') ? 'password' : 'text'}
                      placeholder={`Enter your ${label}...`}
                      className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-200"
                    />
                    {label.includes('Secret') ? (
                      <ShieldCheck size={20} className="text-forest-200" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 1: // Workspace
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-1">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Target Workspace</h3>
              <p className="text-slate-400 text-sm">
                Designate the Fabric workspace for automated provisioning
              </p>
            </div>

            <div className="grid gap-8">
              {['Workspace ID', 'User Object ID (Optional)'].map((f) => (
                <div key={f} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {f}
                  </label>
                  <div className="h-16 bg-slate-50 border border-slate-100 rounded-2xl px-6 flex items-center group focus-within:bg-white focus-within:border-forest-500 transition-all">
                    <input
                      placeholder={`Enter ${f}...`}
                      className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300"
                    />
                    <LayoutDashboard
                      size={20}
                      className="text-slate-200 group-focus-within:text-forest-500 transition-colors"
                    />
                  </div>
                </div>
              ))}

              <div className="bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-xl shadow-slate-100/50 flex flex-col md:flex-row items-center gap-8 justify-between">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em]">
                    Compliance Checks
                  </h4>
                  <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                    {[
                      { l: 'API Reachable', s: true },
                      { l: 'SLA Compliant', s: true },
                      { l: 'Capacity Verified', s: true },
                      { l: 'Quota Safe', s: true },
                    ].map((c) => (
                      <div
                        key={c.l}
                        className="flex items-center gap-3 text-xs font-bold text-slate-600"
                      >
                        <div className="w-5 h-5 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center">
                          <CheckCircle2 size={12} />
                        </div>
                        {c.l}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full md:w-48 h-24 bg-slate-900 rounded-3xl p-6 flex flex-col justify-between text-white overflow-hidden relative">
                  <p className="text-[10px] font-black opacity-40 uppercase">Latency</p>
                  <p className="text-2xl font-black">124ms</p>
                  <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-forest-500/20 rounded-full blur-xl" />
                </div>
              </div>
            </div>
          </div>
        );
      case 2: // Source
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  Source Ingestion
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  Connect your primary data sources for lineage analysis
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-forest-50 text-forest-500 rounded-full">
                <div className="w-1.5 h-1.5 bg-forest-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">Live Sync</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              {[
                { label: 'DATABASE TYPE', val: 'Azure SQL', icon: <Database size={16} /> },
                { label: 'IP ADDRESS / SERVER', val: 'prod-sql.db.local', icon: <Search size={16} /> },
                { label: 'SCHEMA SELECTION', val: 'sales_wh', icon: <Layers size={16} /> },
                { label: 'REPLICATION MODE', val: 'Incremental', icon: <Zap size={16} /> },
              ].map((f) => (
                <div key={f.label} className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {f.label}
                  </label>
                  <div className="h-16 bg-white border border-slate-100 rounded-2xl px-6 flex items-center shadow-sm hover:border-forest-500 transition-all group">
                    <div className="mr-4 text-slate-300 group-hover:text-forest-500 transition-colors">
                      {f.icon}
                    </div>
                    <input
                      defaultValue={f.val}
                      className="w-full bg-transparent outline-none text-sm font-bold text-slate-700"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] flex items-center justify-between group shadow-xl shadow-emerald-500/5">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center border border-emerald-200 shadow-sm transition-transform group-hover:rotate-12">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-emerald-900">Infrastructure Reachable</h4>
                  <p className="text-emerald-600/70 text-xs">
                    All 14 source datasets identified and ready.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-emerald-900">100%</p>
                <p className="text-[10px] font-bold text-emerald-400 uppercase">Coverage</p>
              </div>
            </div>
          </div>
        );
      case 3: // Medallion
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  Medallion Architecture
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  Configure and validate your data lakehouse zones
                </p>
              </div>
              <div className="flex gap-2">
                {['Standard', 'Enterprise', 'Custom'].map((type) => (
                  <button
                    key={type}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      type === 'Standard'
                        ? 'bg-slate-900 text-white shadow-lg'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {[
                {
                  key: 'bronze',
                  label: 'Source Landing',
                  color: 'amber',
                  desc: 'Raw data ingestion from source systems',
                },
                {
                  key: 'silver',
                  label: 'Cleansed Data',
                  color: 'slate',
                  desc: 'Enriched and validated business logic',
                },
                {
                  key: 'gold',
                  label: 'Curated Layer',
                  color: 'emerald',
                  desc: 'Report-ready aggregated gold standard',
                },
              ].map((l) => (
                <div
                  key={l.key}
                  className={`group relative p-8 rounded-[2rem] border transition-all duration-300 flex items-center gap-8 ${
                    confirmedLayers[l.key]
                      ? 'bg-white border-forest-100 shadow-xl shadow-forest-500/5'
                      : 'bg-slate-50 border-slate-100 grayscale opacity-75'
                  }`}
                >
                  {/* Dynamic Icon with Color */}
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg transition-transform group-hover:scale-110 ${
                      l.key === 'bronze'
                        ? 'bg-amber-500'
                        : l.key === 'silver'
                        ? 'bg-slate-500'
                        : 'bg-forest-500'
                    }`}
                  >
                    <Layers size={28} />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${
                          l.key === 'bronze'
                            ? 'bg-amber-50 text-amber-600'
                            : l.key === 'silver'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-forest-50 text-forest-600'
                        }`}
                      >
                        {l.key} Zone
                      </span>
                      <h4 className="text-lg font-bold text-slate-900">{l.label}</h4>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 relative">
                        <input
                          value={layerNames[l.key as keyof typeof layerNames]}
                          onChange={(e) => {
                            setLayerNames({ ...layerNames, [l.key]: e.target.value });
                            setConfirmedLayers({ ...confirmedLayers, [l.key]: false });
                          }}
                          className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-xl px-4 text-sm font-bold text-slate-700 outline-none focus:border-forest-500 focus:bg-white transition-all"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setConfirmedLayers({
                            ...confirmedLayers,
                            [l.key]: !confirmedLayers[l.key],
                          })
                        }
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                          confirmedLayers[l.key]
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                            : 'bg-white border border-slate-200 text-slate-300 hover:text-forest-500 hover:border-forest-200'
                        }`}
                      >
                        <CheckCircle2 size={24} />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium px-1">{l.desc}</p>
                  </div>

                  {/* Status Badge */}
                  <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        confirmedLayers[l.key]
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <div
                        className={`w-1 h-1 rounded-full ${
                          confirmedLayers[l.key] ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                        }`}
                      />
                      {confirmedLayers[l.key] ? 'Validated' : 'Pending'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-forest-900 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="relative z-10 flex items-center gap-6">
                <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center border border-white/10">
                  <Zap size={32} className="text-forest-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold">Auto-Validation Active</h4>
                  <p className="text-white/40 text-sm">
                    Validating workspace capacity and naming conventions...
                  </p>
                </div>
              </div>
              <div className="flex gap-4 relative z-10">
                <div className="bg-forest-800 px-5 py-3 rounded-2xl border border-white/5 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-forest-400 uppercase tracking-widest">
                    Naming
                  </span>
                  <span className="text-lg font-black">ISO-9001</span>
                </div>
                <div className="bg-forest-800 px-5 py-3 rounded-2xl border border-white/5 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-forest-400 uppercase tracking-widest">
                    Collation
                  </span>
                  <span className="text-lg font-black">UTF-8</span>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-forest-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
            </div>
          </div>
        );
      case 4: // Deployment
        return (
          <div className="animate-in zoom-in-95 duration-700 space-y-12">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 mb-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Build Ready</span>
              </div>
              <h3 className="text-5xl font-black text-slate-900 tracking-tighter">
                Architecture Provisioned
              </h3>
              <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
                Your fabric workspace is configured with the medallion architecture standard. Review
                your metadata before final publishing.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden group">
                <div className="relative z-10 flex justify-between items-start mb-12">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-forest-400 uppercase tracking-[0.3em]">
                      PROVISIONING LOG
                    </p>
                    <h4 className="text-xl font-bold">Metadata Sync</h4>
                  </div>
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/5">
                    <Search size={18} className="text-slate-400" />
                  </div>
                </div>
                <div className="space-y-3 relative z-10">
                  {[
                    { l: 'Service Principal', s: 'Success', c: 'forest', t: '0.2s' },
                    { l: 'Workspace Access', s: 'Verified', c: 'forest', t: '0.4s' },
                    { l: 'SQL Authentication', s: 'Standard', c: 'slate', t: '0.1s' },
                  ].map((log) => (
                    <div
                      key={log.l}
                      className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full bg-${log.c}-500`} />
                        <span className="text-sm font-medium text-slate-300">{log.l}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase text-slate-500">
                          {log.s}
                        </span>
                        <span className="text-[10px] font-bold text-slate-600">{log.t}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute top-0 right-0 w-80 h-80 bg-forest-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-xl shadow-slate-100/50">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-6">
                    SUMMARY
                  </p>
                  <div className="space-y-6">
                    {[
                      { k: 'BRONZE', v: layerNames.bronze },
                      { k: 'SILVER', v: layerNames.silver },
                      { k: 'GOLD', v: layerNames.gold },
                      { k: 'ENV', v: 'Production' },
                    ].map((item) => (
                      <div key={item.k} className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400">{item.k}</span>
                        <span className="text-sm font-bold text-slate-900 border-b border-slate-50 pb-2">
                          {item.v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-forest-50 border border-forest-100 rounded-3xl p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-forest-200 shadow-sm">
                    <CheckCircle2 size={24} className="text-forest-500" />
                  </div>
                  <p className="text-[10px] font-bold text-forest-700 uppercase">
                    Architecture Validated
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-6 pt-4">
              <button className="px-16 py-6 bg-forest-500 text-white rounded-full font-black text-lg shadow-2xl shadow-forest-500/30 hover:scale-105 active:scale-95 transition-all">
                Launch Fabric Workspace
              </button>
              <button className="px-12 py-6 bg-white border border-slate-200 text-slate-600 rounded-full font-bold hover:bg-slate-50 transition-all">
                Export Metadata
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className="py-32 bg-slate-50" id="how-it-works">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center mb-20">
          <div className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-forest-500 bg-forest-100 mb-6">
            Setup Wizard
          </div>
          <h2 className="text-5xl font-bold text-slate-900 mb-6">Accelerate Your Workspace</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Standardize architecture with zero friction. From credentials to live deployment in
            minutes.
          </p>
        </div>

        <div className="bg-white rounded-[3.5rem] shadow-[0_64px_128px_-12px_rgba(0,0,0,0.1)] overflow-hidden border border-slate-100 flex flex-col min-h-[850px]">
          {/* Horizontal Stepper Header */}
          <div className="bg-slate-50/50 border-b border-slate-100 p-12 lg:px-24">
            <div className="max-w-4xl mx-auto flex items-center justify-between relative">
              {/* Connecting Lines Context */}
              <div className="absolute top-6 left-0 w-full h-1 bg-slate-100 -z-0 rounded-full" />
              <div
                className="absolute top-6 left-0 h-1 bg-forest-500 -z-0 rounded-full transition-all duration-700 ease-in-out"
                style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
              />

              {steps.map((s, i) => (
                <div key={i} className="relative z-10 flex flex-col items-center gap-4 group">
                  <button
                    onClick={() => setActiveStep(i)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      activeStep === i
                        ? 'bg-forest-500 text-white shadow-xl shadow-forest-500/20 scale-110'
                        : activeStep > i
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white border-2 border-slate-100 text-slate-300 hover:border-slate-200'
                    }`}
                  >
                    {activeStep > i ? (
                      <CheckCircle2 size={24} />
                    ) : (
                      <span className="text-sm font-black">{i + 1}</span>
                    )}
                  </button>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                      activeStep === i
                        ? 'text-forest-500'
                        : activeStep > i
                        ? 'text-emerald-500'
                        : 'text-slate-300'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Setup Main Area */}
          <div className="flex-1 p-16 lg:p-24 flex flex-col">
            <div className="mb-16 flex justify-between items-center max-w-4xl mx-auto w-full">
              <div>
                <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.4em] mb-2">
                  Currently Configuration
                </p>
                <h3 className="text-3xl font-bold text-slate-900">{steps[activeStep].title} Setup</h3>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase">Live Sync Active</span>
              </div>
            </div>

            <div className="flex-1 max-w-4xl mx-auto w-full">{renderStepContent()}</div>

            <div className="mt-20 pt-10 border-t border-slate-100 flex justify-between items-center max-w-4xl mx-auto w-full">
              <button
                onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                className={`text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest flex items-center gap-2 ${
                  activeStep === 0 ? 'invisible' : ''
                }`}
              >
                <ArrowRight size={16} className="rotate-180" /> Back
              </button>
              <button
                onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
                className="flex items-center gap-4 bg-slate-900 text-white px-10 py-5 rounded-full font-black hover:bg-forest-500 transition-all shadow-2xl shadow-slate-900/10 group h-16"
              >
                {activeStep === steps.length - 1 ? 'Start Ingestion' : 'Validate & Continue'}
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
