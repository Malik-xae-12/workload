/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Wrench,
  BookOpen,
  FolderKanban,
  GitMerge,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import fabricLogo from '../../../shared/styles/fabric_28_color.png';

interface SidebarStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeNav?: string;
  onNavChange?: (nav: string) => void;
}

const navItems: { key: string; label: string; icon: LucideIcon }[] = [
  // { key: 'documentation', label: 'Documentation', icon: BookOpen },
  { key: 'fabric-accelerator', label: 'Fabric Accelerator', icon: FolderKanban },
  { key: 'finin-accelerator', label: 'Finin Accelerator', icon: FolderKanban },
  // { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'ai-mapping', label: 'AI Mapping', icon: GitMerge },
];

export const SidebarStepper = ({
  currentStep,
  onStepClick,
  isCollapsed,
  onToggleCollapse,
  activeNav = 'setup',
  onNavChange,
}: SidebarStepperProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (token) {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/jwt/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      navigate('/login');
    }
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full flex flex-col transition-all duration-300 z-20 ${
        isCollapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{ background: 'linear-gradient(180deg, #0a2e22 0%, #0d3828 50%, #0a2e22 100%)' }}
    >
      {/* Logo Header */}
      <div
        className={`flex items-center border-b shrink-0 ${
          isCollapsed ? 'justify-center px-0 py-4' : 'px-5 py-4 justify-between'
        }`}
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
              <img src={fabricLogo} alt="Fabric" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-white text-[13px] font-bold leading-none tracking-tight">
                Fabric Accel.
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                UBTI Inc.
              </p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={fabricLogo} alt="Fabric" className="w-7 h-7 object-contain" />
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <div
        className="shrink-0 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {!isCollapsed && (
          <p
            className="px-5 pb-1.5 text-[9px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Navigation
          </p>
        )}
        {navItems.map(({ key, label, icon: Icon }) => {
          const isActive = activeNav === key;
          const isFinin = key === 'finin-accelerator' || key === 'ai-mapping';
          const activeBg = isFinin ? 'rgba(20,184,166,0.18)' : 'rgba(29,158,117,0.15)';
          const activeColor = isFinin ? '#5eead4' : '#5dd4a8';
          const activeBar = isFinin ? '#14b8a6' : '#1D9E75';
          return (
            <button
              key={key}
              onClick={() => onNavChange?.(key)}
              title={isCollapsed ? label : undefined}
              className={`w-full flex items-center gap-3 transition-all relative ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'px-5 py-2'
              }`}
              style={{
                background: isActive ? activeBg : 'transparent',
                color: isActive ? activeColor : 'rgba(255,255,255,0.45)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
                }
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                  style={{ background: activeBar }}
                />
              )}
              <Icon size={16} />
              {!isCollapsed && (
                <span className="text-[13px] font-medium">{label}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Collapse toggle when collapsed */}
      {isCollapsed && (
        <button
          onClick={onToggleCollapse}
          className="w-full flex justify-center py-2 transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Placeholder content for non-setup nav */}
      {activeNav !== 'setup' && (
        <div className="flex-1 flex items-center justify-center">
          {!isCollapsed && (
            <p className="text-[12px] text-center px-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {activeNav.charAt(0).toUpperCase() + activeNav.slice(1)} section
            </p>
          )}
        </div>
      )}

      {/* Logout */}
      <div
        className="mt-auto shrink-0 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={handleLogout}
          title={isCollapsed ? 'Logout' : undefined}
          className={`w-full flex items-center gap-3 py-3 transition-colors ${
            isCollapsed ? 'justify-center px-0' : 'px-5'
          }`}
          style={{ color: 'rgba(255,255,255,0.45)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
            (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)';
          }}
        >
          <LogOut size={16} />
          {!isCollapsed && <span className="text-[13px] font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
};