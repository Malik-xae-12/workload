/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Link } from 'react-router-dom';

export const CTASection = () => {
  return (
    <section className="py-12 px-6">
      <div className="max-w-7xl mx-auto bg-forest-500 rounded-[3rem] p-16 lg:p-32 text-center text-white relative overflow-hidden bg-grid-white">
        <h2 className="text-4xl lg:text-7xl font-bold mb-8 relative z-10">
          Start Automating <br /> Fabric Today
        </h2>
        <p className="text-white/60 max-w-2xl mx-auto mb-16 text-lg relative z-10">
          Fabric Accelerator enables you to eliminate manual configuration and standardize your
          medallion architecture at scale.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
          <Link
            to="/setup"
            className="bg-white text-forest-500 px-10 py-5 rounded-full font-bold text-lg hover:shadow-2xl transition-all"
          >
            Get Started
          </Link>
          <button className="border border-white/20 text-white px-10 py-5 rounded-full font-bold text-lg hover:bg-white/10 transition-all">
            View Demo
          </button>
        </div>
      </div>
    </section>
  );
};
