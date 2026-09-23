import React from 'react';
import { Gamepad2, LayoutDashboard, Layers, Radio, FileSpreadsheet } from 'lucide-react';
import { ActiveTab, EquipmentState } from '../types';
import { playClickSound } from '../utils/audio';
import { hapticLight } from '../utils/haptics';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  equipmentState?: EquipmentState;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  equipmentState,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'control', label: 'D-Pad', icon: Gamepad2 },
    { id: 'dashboard', label: 'Telemetry', icon: LayoutDashboard },
    { id: 'mission-planner', label: 'Planner', icon: Radio },
    { id: 'crops', label: '35 Crops', icon: Layers },
    { id: 'history', label: 'Logs', icon: FileSpreadsheet },
  ];

  const handleTabClick = (tabId: ActiveTab) => {
    playClickSound();
    hapticLight();
    onTabChange(tabId);
  };

  return (
    <nav
      id="bottom-nav-bar"
      className="sticky bottom-0 left-0 w-full z-40 bg-white border-t-[3px] border-[#0A0A0A] min-h-16 h-auto pb-[max(env(safe-area-inset-bottom),8px)] pt-1 px-1.5 grid grid-cols-5 gap-1 items-center shadow-[0_-4px_16px_rgba(0,0,0,0.08)] select-none shrink-0"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            id={`nav-btn-${tab.id}`}
            onClick={() => handleTabClick(tab.id)}
            className={`relative flex flex-col items-center justify-center w-full h-13 rounded-xl transition-all duration-150 cursor-pointer active:scale-95 ${
              isActive
                ? 'bg-[#012d1d] text-white shadow-sm font-black'
                : 'text-gray-600 hover:text-black hover:bg-gray-100'
            }`}
          >
            {/* Active Indicator dot */}
            {tab.id === 'control' && equipmentState?.isRunning && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#4ade80] animate-ping" />
            )}

            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'stroke-[2.5] text-[#4ade80]' : 'stroke-2'}`} />
            <span
              className={`text-[9.5px] mt-0.5 font-['Public_Sans'] tracking-tight truncate w-full text-center px-0.5 ${
                isActive ? 'font-black uppercase text-white' : 'font-bold'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
