import React, { useState } from 'react';
import {
  Tractor,
  BatteryCharging,
  Sliders,
  AlertOctagon,
  Radio,
  Clock,
  Layers,
  Sparkles,
  MapPin,
  RefreshCw,
  LocateFixed,
} from 'lucide-react';
import { CropProfile, EquipmentState, HourlyCoverage } from '../types';
import { playClickSound, playEmergencyStopSound } from '../utils/audio';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { MissionPlannerService } from '../services/missionPlannerApi';

interface DashboardViewProps {
  equipmentState: EquipmentState;
  selectedCrop: CropProfile;
  onUpdateEquipment: (updater: (prev: EquipmentState) => EquipmentState) => void;
  onNavigateToControl: () => void;
  onNavigateToCrops: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  equipmentState,
  selectedCrop,
  onUpdateEquipment,
  onNavigateToControl,
  onNavigateToCrops,
}) => {
  const [activeHourlyFilter, setActiveHourlyFilter] = useState<'today' | 'week'>('today');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const { location: gpsLocation, fetchLocation: refreshGps, loading: gpsLoading } = useCurrentLocation();

  const hourlyData: HourlyCoverage[] = [
    { hourLabel: '8 AM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '10 AM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '12 PM', acres: 0, ratePerHr: 0, percentage: 0 },
    { hourLabel: '2 PM', acres: 0, ratePerHr: 0, percentage: 0 },
    {
      hourLabel: 'NOW',
      acres: Number(equipmentState.totalAreaCoveredAcres.toFixed(3)),
      ratePerHr: equipmentState.isRunning ? equipmentState.speedKmh * 0.247 : 0,
      percentage: Math.min(100, Math.round((equipmentState.totalAreaCoveredAcres / 50.0) * 100)),
    },
  ];

  const totalAcresToday = hourlyData[hourlyData.length - 1].acres;
  const targetAcresToday = 50.0;
  const progressPercent = Math.min(100, Math.round((totalAcresToday / targetAcresToday) * 100));

  const handleEmergencyStop = () => {
    playEmergencyStopSound();
    void MissionPlannerService.setArmed(false);
    void MissionPlannerService.setMode('HOLD');
    onUpdateEquipment((prev) => ({
      ...prev,
      isRunning: false,
      isEmergencyStopped: true,
      speedKmh: 0,
    }));
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn pb-6 text-slate-100">
      <div className="flex items-center justify-between gap-2 border-b border-cyan-900/40 pb-3">
        <div>
          <h2 className="text-[20px] font-extrabold text-cyan-400 font-['Public_Sans'] leading-tight">
            Telemetry Dashboard
          </h2>
          <p className="text-xs text-slate-400 font-['Atkinson_Hyperlegible']">
            Machine diagnostics & field metrics
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="px-2.5 py-1 bg-[#111827] text-teal-400 font-bold text-[11px] rounded-full border border-teal-500/30 flex items-center gap-1.5 shadow-xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-slate-100">Online</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-[#111827] border border-cyan-900/40 rounded-2xl p-3.5 flex flex-col justify-between shadow-xs hover:border-cyan-500/60 transition-colors relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />

          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1 pl-1.5">
              <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs uppercase tracking-wider truncate">
                <Tractor className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="truncate">Tractor Alpha • 4-Row Drill</span>
              </div>
              <span
                className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  equipmentState.isRunning
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {equipmentState.isRunning ? 'Active' : 'Standby'}
              </span>
            </div>

            <h3 className="text-[16px] font-extrabold text-slate-100 pl-1.5 font-['Public_Sans']">
              {equipmentState.isRunning ? 'Precision Seeding Operation' : 'Ready for Operation'}
            </h3>

            <div className="mt-2.5 pl-1.5 grid grid-cols-2 gap-2 bg-[#0B0F17] border border-cyan-950/80 rounded-xl p-2.5">
              <div className="flex flex-col">
                <span className="text-slate-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Current Crop
                </span>
                <span
                  onClick={onNavigateToCrops}
                  className="text-[13px] font-black text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer truncate"
                >
                  {selectedCrop.name}
                </span>
              </div>

              <div className="flex flex-col border-l border-slate-800 pl-2">
                <span className="text-slate-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Speed
                </span>
                <span className="text-[13px] font-black text-slate-100">
                  {equipmentState.speedKmh.toFixed(1)} km/h
                </span>
              </div>

              <div className="flex flex-col border-t border-slate-800 pt-1.5">
                <span className="text-slate-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Target Depth
                </span>
                <span className="text-[13px] font-black text-yellow-400">
                  {selectedCrop.sowingDepth}
                </span>
              </div>

              <div className="flex flex-col border-t border-l border-slate-800 pt-1.5 pl-2">
                <span className="text-slate-500 text-[9.5px] font-bold uppercase tracking-wider">
                  Seed Spacing
                </span>
                <span className="text-[13px] font-black text-teal-400">
                  {selectedCrop.seedSpacing}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 pl-1.5">
            <button
              onClick={handleEmergencyStop}
              className="h-10.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-red-400 active:scale-[0.98] transition-transform cursor-pointer uppercase tracking-wider font-['Public_Sans']"
            >
              <AlertOctagon className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>STOP</span>
            </button>

            <button
              onClick={() => setShowAdjustModal(true)}
              className="h-10.5 bg-[#1f2937] text-cyan-400 hover:bg-[#374151] font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-cyan-800 active:scale-[0.98] transition-all cursor-pointer font-['Public_Sans']"
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>Adjust</span>
            </button>

            <button
              onClick={onNavigateToControl}
              className="h-10.5 bg-teal-600 text-white hover:bg-teal-500 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-teal-400 active:scale-[0.98] transition-all cursor-pointer font-['Public_Sans']"
            >
              <span>D-Pad</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="bg-[#111827] border border-cyan-900/40 rounded-2xl p-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-teal-950/60 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <div className="grow">
              <div className="flex justify-between items-end mb-1">
                <span className="font-bold text-[11px] text-slate-400 uppercase tracking-wide">
                  Battery (48V)
                </span>
                <span className="text-sm font-black text-cyan-400">
                  {equipmentState.batteryPercent}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full border border-slate-700 overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-500 rounded-full"
                  style={{ width: `${equipmentState.batteryPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-[#111827] border border-cyan-900/40 rounded-2xl p-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-yellow-500/30 flex items-center justify-center text-yellow-400 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="grow">
              <div className="flex justify-between items-end mb-1">
                <span className="font-bold text-[11px] text-slate-400 uppercase tracking-wide">
                  Hopper Bin
                </span>
                <span className="text-sm font-black text-yellow-400">
                  {equipmentState.hopperLevelPercent}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full border border-slate-700 overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-500 rounded-full"
                  style={{ width: `${equipmentState.hopperLevelPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-[#0B0F17] border border-cyan-900/40 rounded-2xl p-2.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-slate-500 uppercase text-[9px]">GPS RTK Base</div>
                <div className="text-cyan-400 text-[10.5px] font-mono truncate">
                  {gpsLocation
                    ? `${gpsLocation.lat.toFixed(3)}°, ${gpsLocation.lng.toFixed(3)}°`
                    : '±1.2 cm Accuracy'}
                </div>
              </div>
            </div>
            <div className="border-l border-slate-800 pl-2 shrink-0">
              <div className="text-slate-500 uppercase text-[9px]">Hydraulics</div>
              <div className="text-teal-400 text-[10.5px]">{equipmentState.hydraulicPressureBar} Bar OK</div>
            </div>
          </div>
        </div>

        <div className="bg-[#111827] border border-cyan-900/40 rounded-2xl p-3.5 shadow-xs">
          <div className="flex justify-between items-center gap-2 mb-2">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-100 font-['Public_Sans']">
                Area Covered Today
              </h3>
              <p className="text-[11px] text-slate-400">
                Target: {targetAcresToday} Ac ({progressPercent}%)
              </p>
            </div>
            <span className="text-lg font-black text-cyan-400">
              {totalAcresToday} <span className="text-xs text-slate-500 font-bold">Ac</span>
            </span>
          </div>

          <div className="h-28 w-full border-b border-l border-slate-700 flex items-end justify-around pb-1 pt-3 px-1 gap-1.5 bg-[#0B0F17] rounded-t-lg">
            {hourlyData.map((item, idx) => {
              const isNow = item.hourLabel === 'NOW';
              return (
                <div key={item.hourLabel} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  <div
                    className={`w-full max-w-7 border rounded-t transition-all duration-300 ${
                      isNow
                        ? 'bg-cyan-500 border-cyan-400'
                        : idx === 2
                        ? 'bg-teal-600 border-teal-500'
                        : 'bg-slate-700 border-slate-600'
                    }`}
                    style={{ height: `${Math.max(14, item.percentage)}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-around text-slate-400 font-bold text-[10.5px] mt-1.5 font-['Public_Sans']">
            {hourlyData.map((item) => (
              <span key={item.hourLabel} className={item.hourLabel === 'NOW' ? 'text-cyan-400 font-black' : ''}>
                {item.hourLabel}
              </span>
            ))}
          </div>
        </div>

        <div className="md:col-span-12 bg-[#111827] border border-cyan-900/40 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-400" />
              <h3 className="text-[18px] sm:text-[22px] font-extrabold text-slate-100 font-['Public_Sans']">
                Field Swath & GPS Telemetry Map (Field North-B4)
              </h3>
            </div>
            <div className="text-xs font-bold text-cyan-400 bg-cyan-950/40 px-3 py-1 rounded-md border border-cyan-800">
              Guidance: A-B Line Auto-Steer active
            </div>
          </div>

          <div className="relative w-full bg-[#0B0F17] border border-cyan-950 rounded-xl overflow-hidden flex flex-col gap-1.5 p-3 shadow-inner">
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="w-full h-7 border-b border-dashed border-slate-800 last:border-b-0 flex items-center relative"
              >
                {row <= 3 && (
                  <div className="h-6 w-full bg-teal-600/80 rounded-lg text-[11px] text-white font-bold flex items-center px-2.5 shadow-xs whitespace-nowrap">
                    <span>Row {row} • Sown ({selectedCrop.name})</span>
                  </div>
                )}
                {row === 4 && (
                  <div className="relative h-6 w-full bg-amber-950/40 rounded-lg overflow-hidden border border-yellow-500/40 flex items-center shadow-xs">
                    <div
                      className="absolute top-0 left-0 bottom-0 bg-yellow-500/60 border-r border-yellow-400 transition-all duration-300"
                      style={{ width: equipmentState.isRunning ? '75%' : '45%' }}
                    />
                    <div className="relative z-10 w-full flex items-center justify-between px-2.5 text-[11px] text-yellow-300 font-black whitespace-nowrap">
                      <span className="leading-none flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
                        Row 4 • In Progress
                      </span>
                      <span className="animate-bounce text-xs leading-none">🚜</span>
                    </div>
                  </div>
                )}
                {row > 4 && (
                  <div className="h-6 w-full bg-slate-900/60 border border-slate-800 rounded-lg text-[11px] text-slate-500 font-semibold flex items-center px-2.5 whitespace-nowrap">
                    <span>Row {row} • Pending Furrow</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111827] border-2 border-cyan-800 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-scaleUp text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-xl font-black text-cyan-400 uppercase font-['Public_Sans']">
                Drill Calibration
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="w-8 h-8 rounded-lg border border-slate-700 flex items-center justify-center font-bold hover:bg-slate-800 cursor-pointer text-slate-300"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-sm font-bold text-slate-300 bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
                Active Crop: <strong className="text-cyan-400">{selectedCrop.name} ({selectedCrop.botanicalName})</strong>
              </div>

              <div className="flex flex-col gap-1.5 p-3 bg-[#0B0F17] border border-cyan-900/60 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-sm text-slate-300 uppercase">
                    Manual Seed Spacing:
                  </span>
                  <span className="font-black text-base text-teal-400">
                    {equipmentState.targetSpacingCm.toFixed(1)} cm
                  </span>
                </div>

                <input
                  type="range"
                  min="2.0"
                  max="60.0"
                  step="0.5"
                  value={equipmentState.targetSpacingCm}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateEquipment((prev) => ({
                      ...prev,
                      targetSpacingCm: val,
                      actualSpacingCm: val,
                    }));
                  }}
                  className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />

                <div className="flex flex-wrap gap-1 mt-1">
                  {[5, 10, 15, 18, 20, 25, 30, 45].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        onUpdateEquipment((prev) => ({
                          ...prev,
                          targetSpacingCm: preset,
                          actualSpacingCm: preset,
                        }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                        Math.abs(equipmentState.targetSpacingCm - preset) < 0.2
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {preset} cm
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  playClickSound();
                  setShowAdjustModal(false);
                }}
                className="flex-1 py-3.5 bg-teal-600 text-white font-extrabold rounded-xl border border-teal-400 hover:bg-teal-500 uppercase tracking-wider cursor-pointer"
              >
                Apply Spacing
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  setShowAdjustModal(false);
                  onNavigateToControl();
                }}
                className="py-3.5 px-4 bg-slate-800 text-cyan-400 font-bold rounded-xl border border-slate-700 hover:bg-slate-700 uppercase tracking-wider cursor-pointer text-xs"
              >
                D-Pad View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
