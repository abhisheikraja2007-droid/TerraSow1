import React from 'react';
import { WifiOff, Radio } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-center gap-2 bg-[#0A0A0A] text-white px-3.5 py-2 rounded-xl border-2 border-[#4ade80] shadow-2xl animate-fadeIn">
      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
      <WifiOff className="w-4 h-4 text-amber-400" />
      <span className="text-xs font-bold font-['Public_Sans']">
        Field Offline Mode Active
      </span>
      <span className="text-[10px] text-gray-300 hidden sm:inline">
        (Cached Local State)
      </span>
    </div>
  );
};
