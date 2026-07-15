/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const Footer = () => {
  return (
    <footer className="bg-white py-12 px-6">
      <div className="max-w-7xl mx-auto border-t border-slate-50 pt-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-12">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-8">
              <img
                src="https://ubtiinc.com/wp-content/uploads/2020/11/UBTI-Logo_Secondary-02.png"
                alt="UBTI"
                className="h-8 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="w-[1px] h-6 bg-slate-200" />
              <span className="text-xl font-bold tracking-tight">Fabric Accelerator</span>
            </div>
            <p className="text-slate-400 text-sm max-w-xs mb-10">
              Automating Microsoft Fabric workspace setup and the medallion architecture journey.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-8">
              Product
            </h5>
            <ul className="space-y-4 text-slate-600 text-sm font-medium">
              <li>
                <a href="#" className="hover:text-forest-500">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Architecture
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  How it works
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-8">
              Architecture
            </h5>
            <ul className="space-y-4 text-slate-600 text-sm font-medium">
              <li>
                <a href="#" className="hover:text-forest-500">
                  Bronze Layer
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Silver Layer
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Gold Layer
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-8">
              About Us
            </h5>
            <ul className="space-y-4 text-slate-600 text-sm font-medium">
              <li>
                <a href="#" className="hover:text-forest-500">
                  Company
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Leadership
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Customers
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-8">
              Resources
            </h5>
            <ul className="space-y-4 text-slate-600 text-sm font-medium">
              <li>
                <a href="#" className="hover:text-forest-500">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-forest-500">
                  Developers
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
