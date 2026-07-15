/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Layers,
  ShieldCheck,
  LayoutDashboard,
  Database,
  Search,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import fabricLogo from '../../../shared/styles/fabric_28_color.png';

export const Hero = () => {
  return (
    <div className="relative pt-24 lg:pt-32 pb-20 overflow-hidden">
      {/* Background Block (Forest Green) */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-forest-500 -z-10 hidden lg:block" />

      <div className="max-w-7xl mx-auto px-6 lg:px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.05] mb-10">
              Enhance Your <br />
              <span className="text-forest-500 lg:text-slate-900">Fabric Efficiency</span>
            </h1>
            <p className="text-base text-slate-400 mb-10 max-w-sm leading-relaxed">
              Automated workspace setup, credential handling, and medallion architecture deployment.
              Scalable and secure.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link
                to="/setup"
                className="bg-forest-500 text-white px-8 py-4 rounded-full font-bold hover:bg-forest-600 transition-all shadow-lg shadow-forest-500/20 active:scale-95 text-center"
              >
                Get Started
              </Link>
            </div>

            <div className="pt-6 border-t border-slate-50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">
                Trusted by 25k+ engineering teams
              </p>
              <div className="relative overflow-hidden">
                <div className="flex gap-12 items-center opacity-40 grayscale animate-marquee whitespace-nowrap">
                  {[...Array(2)].map((_, loop) => (
                    <div key={loop} className="flex gap-12 items-center shrink-0">
                      <span className="text-lg font-black tracking-tighter">Microsoft</span>
                      <span className="text-lg font-black tracking-tighter">Databricks</span>
                      <span className="text-lg font-black tracking-tighter">Azure</span>
                      <span className="text-lg font-black tracking-tighter">Snowflake</span>
                      <span className="text-lg font-black tracking-tighter">Power BI</span>
                      <span className="text-lg font-black tracking-tighter">Synapse</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Floating Workspace UI Elements */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative flex justify-center"
          >
            {/* The Main App Window Mockup */}
            <div className="bg-white rounded-[2rem] shadow-[0_64px_128px_-12px_rgba(0,0,0,0.1)] w-full max-w-[580px] overflow-hidden border border-slate-100 flex h-[480px]">
              {/* Sidebar */}
              <div className="w-24 bg-slate-50 border-r border-slate-100 flex flex-col items-center py-6 gap-6">
                <div className="w-8 h-8  rounded-lg flex items-center justify-center overflow-hidden">
                  <img src={fabricLogo} alt="Fabric" className="w-6 h-6 object-contain" />
                </div>
                {[ShieldCheck, LayoutDashboard, Database, Layers, Search].map((Icon, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl transition-colors ${
                      i === 2
                        ? 'bg-forest-100 text-forest-600'
                        : 'text-slate-300 hover:text-slate-400'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                ))}
              </div>

              {/* Content Area */}
              <div className="flex-1 p-8 flex flex-col relative">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((dot) => (
                      <div
                        key={dot}
                        className={`h-1 rounded-full transition-all ${
                          dot <= 3
                            ? dot === 3
                              ? 'w-8 bg-forest-500'
                              : 'w-4 bg-forest-200'
                            : 'w-4 bg-slate-100'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[8px] font-black uppercase">Auto-saved</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">Source Connection</h3>
                    <p className="text-[10px] text-slate-400">
                      Connect your source database to begin ingestion.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { l: 'DB TYPE', v: 'Azure SQL' },
                      { l: 'SERVER', v: 'prod-sql.db...' },
                      { l: 'DB NAME', v: 'sales_wh' },
                      { l: 'AUTH', v: 'Service Prin.' },
                    ].map((f) => (
                      <div key={f.l} className="space-y-1">
                        <label className="text-[8px] font-black text-slate-300 tracking-widest">
                          {f.l}
                        </label>
                        <div className="h-10 bg-slate-50/50 border border-slate-100 rounded-xl px-3 flex items-center text-[11px] font-bold text-slate-700">
                          {f.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-700">
                      Connection success — 218ms
                    </span>
                  </div>
                </div>

                {/* Simulated URL Bar Decorations */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100 flex items-center gap-2">
                  <Lock size={10} className="text-emerald-500" />
                  <span className="text-[9px] font-bold text-slate-400">
                    fabricaccelerator.io/setup
                  </span>
                </div>
              </div>
            </div>

            {/* Floating Medallion Card Overlay */}
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="absolute -bottom-6 -right-6 lg:-right-12 bg-white p-6 rounded-[2rem] shadow-2xl border border-slate-50 w-52 z-20"
            >
              <div className="flex justify-between items-center mb-5">
                <p className="text-[8px] font-black text-slate-300 tracking-[0.2em]">MEDALLION</p>
                <Layers size={14} className="text-forest-500" />
              </div>
              <div className="space-y-4">
                {[
                  { n: 'Bronze', c: 'bg-amber-500' },
                  { n: 'Silver', c: 'bg-slate-400' },
                  { n: 'Gold', c: 'bg-forest-500' },
                ].map((l) => (
                  <div
                    key={l.n}
                    className="flex items-center justify-between text-[11px] font-bold"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${l.c}`} />
                      <span className="text-slate-700">{l.n}</span>
                    </div>
                    <span className="text-emerald-500 text-[9px]">Ready</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
