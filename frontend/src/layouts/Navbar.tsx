/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { NAV_LINKS } from '../shared/constants';

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
    >
      <div className="w-full px-6 lg:px-12 transition-all duration-300 bg-emerald-50/95 backdrop-blur-md border-b border-emerald-200 py-2.5 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src="https://ubtiinc.com/wp-content/uploads/2020/11/UBTI-Logo_Secondary-02.png"
              alt="UBTI Logo"
              className="h-8 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="w-[1px] h-6 bg-slate-200" />
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Fabric Accelerator
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center gap-10">
            {NAV_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href || '#'}
                className="text-sm font-medium text-slate-600 hover:text-forest-500 flex items-center gap-1 transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <Link to="/login" className="text-sm font-bold text-slate-900 px-4 py-2 transition-colors">
              Sign In
            </Link>
            <Link
              to="/setup"
              className="text-sm font-bold bg-forest-500 text-white px-6 py-2.5 rounded-full hover:bg-forest-600 transition-all active:scale-95"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="lg:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white border-b border-slate-200 overflow-hidden"
          >
            <div className="px-6 py-6 space-y-4 text-center">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.name}
                  href={link.href || '#'}
                  className="block text-base font-bold text-slate-600 hover:text-forest-500"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-3">
                <Link
                  to="/setup"
                  className="w-full text-center py-3 text-base font-bold bg-forest-500 text-white rounded-full"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
                <Link
                  to="/login"
                  className="w-full text-center py-3 text-base font-bold text-slate-600 bg-slate-100 rounded-full"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
