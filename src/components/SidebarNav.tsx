import React from 'react';
import {
  Gamepad2,
  LayoutDashboard,
  Tractor,
  History,
  Radio,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { ActiveTab, CropProfile, EquipmentState } from '../types';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  selectedCrop: CropProfile;
  equipmentState: EquipmentState;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onTabChange,
  selectedCrop,
  equipmentState,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'control', label: 'Equipment Control', icon: Gamepad2 },
    { id: 'dashboard', label: 'Field Dashboard', icon: LayoutDashboard },
    { id: 'crops', label: 'Crop Profiles (35)', icon: Tractor },
    { id: 'mission-planner', label: 'Mission Planner API', icon: Radio },
    { id: 'history', label: 'Sowing History', icon: History },
  ];

  return (
    <aside className="hidden md:flex fixed top-[72px] left-0 w-64 lg:w-72 h-[calc(100vh-72px)] bg-white border-r-[3px] border-[#0A0A0A] flex-col justify-between p-4 z-30 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <div className="px-3 py-2 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
          Navigation
        </div>

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              id={`sidebar-btn-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 transition-all duration-150 text-left cursor-pointer ${
                isActive
                  ? 'bg-[#1b4332] text-white border-[#0A0A0A] shadow-sm font-bold'
                  : 'bg-white text-[#181c20] border-transparent hover:bg-gray-100/80 hover:border-gray-300 font-semibold'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white stroke-[2.5]' : 'text-gray-700'}`} />
              <span className="text-[14px] font-['Public_Sans']">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Equipment Quick Status in Sidebar */}
      <div className="bg-[#f1f4f9] border-2 border-[#0A0A0A] rounded-xl p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#012d1d]">
            <Activity className="w-4 h-4 text-[#2D6A4F]" />
            <span>Tractor Alpha</span>
          </div>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              equipmentState.isRunning
                ? 'bg-[#2D6A4F] text-white'
                : 'bg-gray-300 text-gray-800'
            }`}
          >
            {equipmentState.isRunning ? 'Active' : 'Standby'}
          </span>
        </div>

        <div className="text-xs text-gray-700">
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500 font-medium">Active Crop:</span>
            <span className="font-bold text-[#012d1d]">{selectedCrop.name}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500 font-medium">Speed:</span>
            <span className="font-bold">{equipmentState.speedKmh.toFixed(1)} km/h</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-gray-500 font-medium">Battery:</span>
            <span className="font-bold text-[#2D6A4F]">{equipmentState.batteryPercent}%</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-[#2D6A4F] font-bold pt-1 border-t border-gray-300">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>MAVLink & RTK Ready</span>
        </div>
      </div>
    </aside>
  );
};
