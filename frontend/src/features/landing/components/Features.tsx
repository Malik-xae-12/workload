/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Zap, Layers, Lock } from 'lucide-react';

export const Features = () => {
  return (
    <section className="py-32 bg-white" id="features">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
        <div className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-forest-500 bg-forest-50 mb-6">
          Features
        </div>
        <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 mb-6">
          Everything You Need to <br /> Control Spend
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto mb-20 leading-relaxed">
          Keep your business infrastructure and all your finance needs safely organized under one
          roof. Manage workspace quickly, easily & efficiently.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-slate-50 rounded-[2.5rem] p-12 text-left relative overflow-hidden h-[400px] border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                <Zap size={20} />
              </div>
              <h4 className="text-lg font-bold">One-Click Workspace</h4>
            </div>
            <div className="text-3xl font-bold mb-10">Zero Manual Config</div>
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-white shadow-2xl rounded-tl-[3rem] p-10 transform translate-x-12 translate-y-12 rotate-[-5deg] border border-slate-50">
              <div className="space-y-6">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl" />
                  <div className="space-y-2">
                    <div className="h-2 w-24 bg-slate-200 rounded" />
                    <div className="h-2 w-16 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="h-px bg-slate-100 w-full" />
                <div className="space-y-3">
                  <div className="h-2 w-full bg-slate-50 rounded" />
                  <div className="h-2 w-4/5 bg-slate-50 rounded" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-[2.5rem] p-12 text-left relative overflow-hidden h-[400px] border border-slate-100">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 bg-forest-100 text-forest-600 rounded-full flex items-center justify-center">
                <Layers size={20} />
              </div>
              <h4 className="text-lg font-bold">Medallion Standard</h4>
            </div>
            <div className="text-3xl font-bold mb-10">Best-Practice Architecture</div>
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-forest-500 shadow-2xl rounded-tl-[3rem] p-10 transform translate-x-12 translate-y-12 rotate-[5deg] text-white">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] uppercase opacity-60 font-bold tracking-widest">
                    Zone Status
                  </div>
                  <Lock size={12} className="opacity-40" />
                </div>
                <div className="space-y-4">
                  <div className="h-8 w-full bg-white/10 rounded-xl flex items-center px-4 text-[10px] font-bold">
                    lh_sales_bronze
                  </div>
                  <div className="h-8 w-full bg-white/10 rounded-xl flex items-center px-4 text-[10px] font-bold">
                    lh_sales_silver
                  </div>
                  <div className="h-8 w-full bg-white/20 rounded-xl flex items-center px-4 text-[10px] font-bold">
                    wh_sales_gold
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
