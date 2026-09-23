import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio,
  Wifi,
  Navigation,
  Play,
  Square,
  Upload,
  Download,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Compass,
  RefreshCw,
  Tractor,
  Layers,
  MapPin,
  Sparkles,
  Zap,
  Activity,
  ShieldCheck,
  Power,
  Trash2,
  Plus,
  ArrowUpDown,
  FileSpreadsheet,
  Globe,
  Eye,
  Cpu,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Terminal,
  Cable,
  Gauge,
  LocateFixed,
  Loader2,
} from 'lucide-react';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import {
  CropProfile,
  EquipmentState,
  VehicleTelemetry,
  Waypoint,
  VehicleMode,
  MissionPlannerConfig,
  MissionPlannerTab,
} from '../types';
import {
  INITIAL_VEHICLE_TELEMETRY,
  SAMPLE_WAYPOINTS,
  exportToQGCWPL,
  generateFieldGrid,
} from '../data/missionPlannerData';
import { generateGridInBoundary } from '../utils/pathPlanning';
import { MissionPlannerService } from '../services/missionPlannerApi';
import { MissionPlannerMap } from './MissionPlannerMap';
import { FlightDataHUD } from './mission-planner/FlightDataHUD';
import { ParametersEditor } from './mission-planner/ParametersEditor';
import { MavlinkConsole } from './mission-planner/MavlinkConsole';
import { ConnectionManager } from './mission-planner/ConnectionManager';
import { playBeepSound, playClickSound, playEmergencyStopSound } from '../utils/audio';
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticWarning,
  hapticSuccess,
} from '../utils/haptics';

interface MissionPlannerViewProps {
  selectedCrop: CropProfile;
  equipmentState: EquipmentState;
  onUpdateEquipment: (updater: (prev: EquipmentState) => EquipmentState) => void;
  onNavigateToControl: () => void;
  globalTelemetry: VehicleTelemetry;
  setGlobalTelemetry: React.Dispatch<React.SetStateAction<VehicleTelemetry>>;
  isConnected: boolean;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  telemetryHistory: [number, number][];
}

export const MissionPlannerView: React.FC<MissionPlannerViewProps> = ({
  selectedCrop,
  equipmentState,
  onUpdateEquipment,
  onNavigateToControl,
  globalTelemetry,
  setGlobalTelemetry,
  isConnected,
  setIsConnected,
  telemetryHistory,
}) => {
  // Active Mission Planner Tab
  const [activeTab, setActiveTab] = useState<MissionPlannerTab>('flight-plan');

  // Connection Config
  const [config, setConfig] = useState<MissionPlannerConfig>({
    apiUrl: 'http://127.0.0.1:56781',
    mavlinkPort: 56781,
    protocol: 'REST',
    baudRate: 115200,
    pollIntervalMs: 1000,
    autoSyncTelemetry: true,
    voiceAnnouncements: true,
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [syncWithAppTelemetry, setSyncWithAppTelemetry] = useState(true);
  const wpTableContainerRef = useRef<HTMLDivElement>(null);

  // Live Telemetry from App.tsx
  const telemetry = globalTelemetry;
  const setTelemetry = setGlobalTelemetry;
  const [activeWaypoints, setActiveWaypoints] = useState<Waypoint[]>([]);
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([]);
  const [activeWpIndex, setActiveWpIndex] = useState(0);
  const [mapDisplayType, setMapDisplayType] = useState<'satellite_map' | 'hud_grid'>('satellite_map');

  // Auto-scroll waypoints table to bottom when new points are added
  useEffect(() => {
    if (wpTableContainerRef.current) {
      wpTableContainerRef.current.scrollTop = wpTableContainerRef.current.scrollHeight;
    }
  }, [activeWaypoints.length]);

  // Check waypoints completion based on live telemetry
  useEffect(() => {
    if (activeWaypoints.length > 0 && telemetry.lat !== 0) {
      setActiveWaypoints((prev) => {
        let changed = false;
        const updated = prev.map((wp) => {
          if (!wp.isCompleted) {
            // Haversine distance
            const R = 6371e3; // meters
            const lat1 = (telemetry.lat * Math.PI) / 180;
            const lat2 = (wp.lat * Math.PI) / 180;
            const dLat = ((wp.lat - telemetry.lat) * Math.PI) / 180;
            const dLng = ((wp.lng - telemetry.lng) * Math.PI) / 180;

            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            if (distance < 3.0) {
              changed = true;
              return { ...wp, isCompleted: true };
            }
          }
          return wp;
        });
        return changed ? updated : prev;
      });
    }
  }, [telemetry.lat, telemetry.lng]);

  // Grid Generator Controls
  const [swathWidthMeters, setSwathWidthMeters] = useState(2.4);
  const [fieldRowsCount, setFieldRowsCount] = useState(6);
  const [fieldLengthMeters, setFieldLengthMeters] = useState(180);
  const [showArmModal, setShowArmModal] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [showEsp32Guide, setShowEsp32Guide] = useState(false);

  const { location: userGeoLocation, loading: isLocatingGeo, fetchLocation: fetchDeviceGps } = useCurrentLocation();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Show temporary toast notification
  const showToast = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => {
      setNotificationMsg((current) => (current === msg ? null : current));
    }, 4000);
  };

  // Mission Calculations
  const missionStats = useMemo(() => {
    if (activeWaypoints.length < 2) {
      return { totalDistMeters: 0, areaAcres: 0, estMinutes: 0, seedNeededKg: 0 };
    }

    let dist = 0;
    for (let i = 1; i < activeWaypoints.length; i++) {
      const p1 = activeWaypoints[i - 1];
      const p2 = activeWaypoints[i];
      const dLat = (p2.lat - p1.lat) * 111139;
      const dLng = (p2.lng - p1.lng) * 111139 * Math.cos((p1.lat * Math.PI) / 180);
      dist += Math.sqrt(dLat * dLat + dLng * dLng);
    }

    const areaSqMeters = dist * swathWidthMeters;
    const areaAcres = areaSqMeters / 4046.86;
    const estHours = (dist / 1000) / 7.5;
    const estMinutes = Math.max(1, Math.round(estHours * 60));
    const seedNeededKg = Math.round(areaAcres * 38);

    return {
      totalDistMeters: Math.round(dist),
      areaAcres: Number(areaAcres.toFixed(2)),
      estMinutes,
      seedNeededKg,
    };
  }, [activeWaypoints, swathWidthMeters]);

  // Sync telemetry rover location with physical device GPS location
  // We no longer generate an initial fake grid on load to keep the map clean for the user's live location.
  useEffect(() => {
    if (userGeoLocation) {
      setTelemetry((prev) => ({
        ...prev,
        lat: userGeoLocation.lat,
        lng: userGeoLocation.lng,
      }));
    }
  }, [userGeoLocation]);

  // Polling logic has been moved to App.tsx to ensure telemetry is always updated 
  // globally across the app, even when Mission Planner is not in view.

  // Handlers
  const handleConnect = async () => {
    playClickSound();
    setIsConnecting(true);
    const result = await MissionPlannerService.connect(config.apiUrl);
    setIsConnecting(false);
    setIsConnected(result.success);
    if (result.success && result.telemetry) {
      setTelemetry(result.telemetry);
      playBeepSound();
      hapticSuccess();
      showToast('Connected to Mission Planner REST Gateway & ArduRover MAVLink.');
    } else {
      hapticWarning();
      showToast(result.message || 'Could not establish connection to gateway.');
    }
  };

  const handleSetMode = async (mode: VehicleMode) => {
    playClickSound();
    hapticMedium();
    const res = await MissionPlannerService.setMode(mode);
    if (res.success) {
      setTelemetry((prev) => ({ ...prev, mode: res.mode }));
      showToast(`Vehicle mode switched to ${res.mode}`);
    }
  };

  const handleArmDisarm = async (arm: boolean) => {
    playBeepSound();
    hapticHeavy();
    const res = await MissionPlannerService.setArmed(arm);
    if (res.success) {
      setTelemetry((prev) => ({ ...prev, armed: res.armed }));
      showToast(res.message);
      setShowArmModal(false);
    }
  };

  const handleTriggerRTL = async () => {
    playEmergencyStopSound();
    hapticWarning();
    const res = await MissionPlannerService.triggerRTL();
    if (res.success) {
      setTelemetry((prev) => ({ ...prev, mode: 'RTL' }));
      showToast('Return-To-Launch (RTL) mode engaged.');
    }
  };

  const handleOverrideServo = (active: boolean) => {
    setTelemetry((prev) => ({
      ...prev,
      seederActive: active,
      seederRpm: active ? 120 : 0,
    }));
  };

  const handleAiOptimizeGrid = () => {
    playClickSound();
    hapticSuccess();
    
    const rowSpacingCm = parseFloat(selectedCrop.rowSpacing) || 40;
    
    // 1. Calculate Swath Width:
    // Target a standard AgriRover implement width of ~2.4 meters, find nearest multiple of row spacing.
    const targetWidthCm = 240; 
    const numDrills = Math.max(2, Math.round(targetWidthCm / rowSpacingCm));
    const optimalSwathWidth = (numDrills * rowSpacingCm) / 100;
    
    // 2. Calculate Row Length & Count:
    // Assuming a standard 1 acre (4046 sq meters) test plot.
    const plotArea = 4046;
    const optimalLength = Math.round(Math.sqrt(plotArea * 1.5) / 10) * 10; // approx 80m
    const totalWidthNeeded = plotArea / optimalLength;
    // Round to nearest even number of rows for optimal routing (return to start)
    let optimalRows = Math.max(2, Math.round(totalWidthNeeded / optimalSwathWidth));
    if (optimalRows % 2 !== 0) optimalRows += 1;

    setSwathWidthMeters(Number(optimalSwathWidth.toFixed(1)));
    setFieldRowsCount(optimalRows);
    setFieldLengthMeters(optimalLength);
    
    showToast(`AI tuned for ${selectedCrop.name}: ${optimalSwathWidth.toFixed(1)}m swath, ${optimalRows} rows, ${optimalLength}m length (1 Acre).`);
  };

  const handleGenerateGrid = () => {
    playClickSound();
    hapticSuccess();
    const targetDepth = parseFloat(selectedCrop.sowingDepth.split('-')[0]) || 4.0;
    const targetSpacing = parseFloat(selectedCrop.seedSpacing.split('-')[0]) || 18.0;

    let newGrid: Waypoint[] = [];

    if (boundaryPoints.length >= 3) {
      newGrid = generateGridInBoundary(boundaryPoints, swathWidthMeters, targetDepth, targetSpacing);
      if (newGrid.length > 0) {
        showToast(`Generated ${newGrid.length} waypoints fitted inside your custom boundary.`);
      } else {
        showToast('Could not generate path inside the boundary. Try a larger boundary or smaller swath.');
      }
    } else {
      newGrid = generateFieldGrid(
        selectedCrop.name,
        swathWidthMeters,
        telemetry.lat,
        telemetry.lng,
        fieldLengthMeters,
        fieldRowsCount,
        targetDepth,
        targetSpacing
      );
      showToast(`Generated ${newGrid.length} waypoints at rover location (${fieldRowsCount} rows, ${swathWidthMeters}m width).`);
    }

    setActiveWaypoints(newGrid);
  };

  const handleGenerateGridAtUserGps = async () => {
    playClickSound();
    hapticLight();
    try {
      showToast('Acquiring physical device GPS coordinates...');
      const loc = await fetchDeviceGps();
      const targetDepth = parseFloat(selectedCrop.sowingDepth.split('-')[0]) || 4.0;
      const targetSpacing = parseFloat(selectedCrop.seedSpacing.split('-')[0]) || 18.0;

      let newGrid: Waypoint[] = [];

      if (boundaryPoints.length >= 3) {
        // prioritize boundary
        newGrid = generateGridInBoundary(boundaryPoints, swathWidthMeters, targetDepth, targetSpacing);
        if (newGrid.length > 0) {
          showToast(`📍 Generated ${newGrid.length} waypoints fitted inside your custom boundary!`);
        } else {
          showToast('Could not generate path inside the boundary. Try a larger boundary or smaller swath.');
        }
      } else {
        newGrid = generateFieldGrid(
          selectedCrop.name,
          swathWidthMeters,
          loc.lat,
          loc.lng,
          fieldLengthMeters,
          fieldRowsCount,
          targetDepth,
          targetSpacing
        );
        showToast(`📍 Generated ${newGrid.length} waypoints centered at your live GPS location (${loc.lat.toFixed(6)}°, ${loc.lng.toFixed(6)}°)!`);
      }

      // Also update telemetry coordinates to user's location
      setTelemetry((prev) => ({
        ...prev,
        lat: loc.lat,
        lng: loc.lng,
      }));

      setActiveWaypoints(newGrid);
      playBeepSound(750, 0.15);
      hapticSuccess();
    } catch (e: any) {
      showToast(e?.message || 'Could not acquire GPS position. Please check location permissions.');
    }
  };

  const handleUploadWaypoints = async () => {
    playClickSound();
    hapticMedium();
    const res = await MissionPlannerService.uploadWaypoints(activeWaypoints);
    if (res.success) {
      playBeepSound();
      showToast(`Successfully uploaded ${res.count} waypoints to ArduRover.`);
    } else {
      showToast('Failed to upload waypoints to autopilot.');
    }
  };

  const handleExportWaypointsFile = () => {
    playClickSound();
    const wplText = exportToQGCWPL(activeWaypoints);
    const blob = new Blob([wplText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agricontrol_${selectedCrop.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.waypoints`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported QGC WPL 110 .waypoints file for Mission Planner.');
  };

  const handleImportWaypointsFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const loadedWps: Waypoint[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('QGC')) {
          const parts = trimmed.split(/[\s,\t]+/);
          if (parts.length >= 10) {
            const idx = parseInt(parts[0], 10);
            const cmdCode = parseInt(parts[3], 10);
            const p1 = parseFloat(parts[4]) || 0;
            const p2 = parseFloat(parts[5]) || 0;
            const p3 = parseFloat(parts[6]) || 0;
            const p4 = parseFloat(parts[7]) || 0;
            const lat = parseFloat(parts[8]) || telemetry.lat;
            const lng = parseFloat(parts[9]) || telemetry.lng;
            const alt = parseFloat(parts[10]) || 0;

            let cmdName: Waypoint['command'] = 'WAYPOINT';
            if (cmdCode === 183) cmdName = 'DO_SET_SERVO';
            if (cmdCode === 181) cmdName = 'DO_SET_RELAY';
            if (cmdCode === 20) cmdName = 'RETURN_TO_LAUNCH';

            loadedWps.push({
              index: idx,
              command: cmdName,
              lat,
              lng,
              alt,
              param1: p1,
              param2: p2,
              param3: p3,
              param4: p4,
              seederActive: cmdName === 'DO_SET_SERVO' && p2 > 1200,
              speedKmh: 8.5,
              targetDepthCm: 4.0,
              targetSpacingCm: 18.0,
            });
          }
        }
      });

      if (loadedWps.length > 0) {
        setActiveWaypoints(loadedWps);
        playBeepSound();
        showToast(`Imported ${loadedWps.length} waypoints from file.`);
      }
    };
    reader.readAsText(file);
  };

  const handleAddWaypoint = () => {
    playClickSound();
    const lastWp = activeWaypoints[activeWaypoints.length - 1] || {
      lat: telemetry.lat,
      lng: telemetry.lng,
    };
    const newWp: Waypoint = {
      index: activeWaypoints.length,
      command: 'WAYPOINT',
      lat: lastWp.lat + 0.0003,
      lng: lastWp.lng,
      alt: 0,
      param1: 0,
      param2: 1.0,
      param3: 0,
      param4: 0,
      seederActive: true,
      speedKmh: 8.5,
      targetDepthCm: 4.0,
      targetSpacingCm: 18.0,
    };
    setActiveWaypoints([...activeWaypoints, newWp]);
  };

  const handleDeleteWaypoint = (index: number) => {
    playClickSound();
    const updated = activeWaypoints
      .filter((_, i) => i !== index)
      .map((wp, i) => ({ ...wp, index: i }));
    setActiveWaypoints(updated);
  };

  const handleUpdateWpCommand = (index: number, cmd: Waypoint['command']) => {
    const updated = [...activeWaypoints];
    updated[index].command = cmd;
    if (cmd === 'DO_SET_SERVO') {
      updated[index].param1 = 9;
      updated[index].param2 = 1800;
      updated[index].seederActive = true;
    } else if (cmd === 'RETURN_TO_LAUNCH') {
      updated[index].seederActive = false;
    }
    setActiveWaypoints(updated);
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn pb-6">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="bg-[#012d1d] text-white p-3 rounded-xl border-2 border-[#4ade80] flex items-center justify-between shadow-lg text-xs font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#4ade80] shrink-0" />
            <span>{notificationMsg}</span>
          </div>
          <button onClick={() => setNotificationMsg(null)} className="text-white/70 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Ground Control Station Top Banner */}
      <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-2.5">
        {/* Title & ARM Button Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#012d1d] flex items-center justify-center text-white border-2 border-black shadow-sm shrink-0">
              <Radio className="w-4 h-4 text-[#4ade80]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14px] font-black text-[#012d1d] uppercase tracking-tight font-['Public_Sans'] leading-tight truncate">
                  Mission Planner
                </h2>
                <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                  MAVLink
                </span>
              </div>
              <p className="text-[10px] text-gray-500 font-medium truncate">
                Autonomous Sowing & Guidance
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (telemetry.armed) {
                handleArmDisarm(false);
              } else {
                setShowArmModal(true);
              }
            }}
            className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border-2 transition-all shadow-sm shrink-0 ${
              telemetry.armed
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-900 shadow-red-900/30'
                : 'bg-[#2D6A4F] hover:bg-[#1b4332] text-white border-black'
            }`}
          >
            <Power className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">{telemetry.armed ? 'DISARM' : 'ARM ROVER'}</span>
          </button>
        </div>

        {/* GPS Telemetry Bar */}
        <div className="flex items-center justify-between bg-[#f7f9ff] px-2.5 py-1.5 rounded-xl border border-gray-300 text-[10.5px]">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse shrink-0" />
            <span className="font-mono font-bold text-gray-800 truncate">{telemetry.gpsFixType}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-gray-600 text-[10px] shrink-0">
            <span>{telemetry.satellitesCount} Sats</span>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-emerald-700">HDOP {telemetry.hdop}</span>
          </div>
        </div>

        {/* Mission Planner Navigation Sub-Tabs (Horizontally scrollable clean chips) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-gray-200 no-scrollbar">
          {[
            { id: 'flight-plan', label: 'Flight Plan', icon: MapPin },
            { id: 'flight-data', label: 'PFD HUD', icon: Gauge },
            { id: 'parameters', label: 'Parameters', icon: Sliders },
            { id: 'mavlink-console', label: 'Console', icon: Terminal },
            { id: 'connection', label: 'Hardware Hub', icon: Wifi },
          ].map((tab) => {
            const isCurrent = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  playClickSound();
                  hapticLight();
                  setActiveTab(tab.id as MissionPlannerTab);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all border whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'bg-[#012d1d] text-white border-black shadow-xs'
                    : 'bg-[#f7f9ff] text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: FLIGHT PLAN & SURVEY GRID */}
      {activeTab === 'flight-plan' && (
        <div className="flex flex-col gap-4">
          {/* Top Mission Planner Map Card */}
          <div className="bg-white border-2 border-gray-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#2D6A4F] shrink-0" />
                  <h3 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] leading-tight">
                    Sowing Grid ({selectedCrop.name})
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                  {activeWaypoints.length} WPs
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => {
                    playClickSound();
                    setMapDisplayType(mapDisplayType === 'satellite_map' ? 'hud_grid' : 'satellite_map');
                  }}
                  className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 border border-gray-300 cursor-pointer text-center"
                >
                  <Eye className="w-3 h-3 shrink-0" />
                  <span className="truncate">{mapDisplayType === 'satellite_map' ? 'Grid' : 'Satellite'}</span>
                </button>

                <button
                  onClick={handleGenerateGridAtUserGps}
                  disabled={isLocatingGeo}
                  className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer shadow-xs text-center"
                  title="Generate sowing mission centered at your real device GPS coordinates"
                >
                  {isLocatingGeo ? (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  ) : (
                    <LocateFixed className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate">{isLocatingGeo ? 'Locating...' : 'GPS Grid'}</span>
                </button>

                <button
                  onClick={handleGenerateGrid}
                  className="px-2 py-1.5 bg-[#2D6A4F] hover:bg-[#1b4332] text-white rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer shadow-xs text-center"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">Auto-Gen</span>
                </button>
              </div>
            </div>

            {/* Interactive Leaflet Satellite GIS Map */}
            <div className="w-full">
              <MissionPlannerMap
                waypoints={activeWaypoints}
                onWaypointsChange={setActiveWaypoints}
                selectedCrop={selectedCrop}
                telemetry={telemetry}
                onUpdateTelemetry={setTelemetry}
                swathWidthMeters={swathWidthMeters}
                activeWpIndex={activeWpIndex}
                mapType={mapDisplayType}
                boundaryPoints={boundaryPoints}
                setBoundaryPoints={setBoundaryPoints}
                onGenerateBoundaryGrid={handleGenerateGrid}
                telemetryHistory={telemetryHistory}
              />
            </div>

            {/* Mission Statistics Metrics Strip */}
            <div className="grid grid-cols-2 gap-2 bg-[#f7f9ff] p-3 rounded-xl border border-gray-300 text-xs">
              <div className="flex flex-col">
                <span className="text-gray-500 text-[9.5px] uppercase font-bold">Total Distance</span>
                <span className="font-black text-xs text-[#012d1d] font-mono">{missionStats.totalDistMeters} meters</span>
              </div>
              <div className="flex flex-col border-l border-gray-200 pl-2.5">
                <span className="text-gray-500 text-[9.5px] uppercase font-bold">Coverage Area</span>
                <span className="font-black text-xs text-[#2D6A4F] font-mono">{missionStats.areaAcres} Acres</span>
              </div>
              <div className="flex flex-col border-t border-gray-200 pt-2">
                <span className="text-gray-500 text-[9.5px] uppercase font-bold">Est. Duration</span>
                <span className="font-black text-xs text-gray-800 font-mono">~{missionStats.estMinutes} mins</span>
              </div>
              <div className="flex flex-col border-t border-l border-gray-200 pt-2 pl-2.5">
                <span className="text-gray-500 text-[9.5px] uppercase font-bold">Seed Requirement</span>
                <span className="font-black text-xs text-amber-700 font-mono">~{missionStats.seedNeededKg} kg</span>
              </div>
            </div>
          </div>

          {/* Sowing Grid Generation Config & Mission Export Cards (Vertical Mobile Stack) */}
          <div className="flex flex-col gap-4">
            {/* Grid Parameters Tuning */}
            <div className="bg-white border-2 border-gray-300 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <h4 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#2D6A4F]" />
                  <span>Field Grid Parameters</span>
                </h4>
                <button
                  onClick={handleAiOptimizeGrid}
                  className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 rounded flex items-center gap-1 text-[10px] font-bold uppercase transition-colors cursor-pointer"
                  title="Auto-calculate optimal parameters for 1-Acre field based on selected crop's row spacing."
                >
                  <Sparkles className="w-3 h-3" />
                  <span>AI Optimize</span>
                </button>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <div className="flex items-center justify-between font-bold text-gray-700 mb-1">
                    <span>Swath / Implement Width</span>
                    <span className="text-[#2D6A4F] font-mono font-black text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {swathWidthMeters.toFixed(1)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.2"
                    value={swathWidthMeters}
                    onChange={(e) => setSwathWidthMeters(parseFloat(e.target.value))}
                    className="w-full accent-[#2D6A4F] cursor-pointer h-2 bg-gray-200 rounded-lg"
                  />
                  <div className="text-[10px] text-gray-500 mt-1">Tractor drill span (6-row × 40cm = 2.4m)</div>
                </div>

                <div>
                  <div className="flex items-center justify-between font-bold text-gray-700 mb-1">
                    <span>Number of Swath Rows</span>
                    <span className="text-[#2D6A4F] font-mono font-black text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {fieldRowsCount} rows
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="20"
                    step="2"
                    value={fieldRowsCount}
                    onChange={(e) => setFieldRowsCount(parseInt(e.target.value))}
                    className="w-full accent-[#2D6A4F] cursor-pointer h-2 bg-gray-200 rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between font-bold text-gray-700 mb-1">
                    <span>Row Length (Field Depth)</span>
                    <span className="text-[#2D6A4F] font-mono font-black text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {fieldLengthMeters} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="10"
                    value={fieldLengthMeters}
                    onChange={(e) => setFieldLengthMeters(parseInt(e.target.value))}
                    className="w-full accent-[#2D6A4F] cursor-pointer h-2 bg-gray-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleGenerateGridAtUserGps}
                  disabled={isLocatingGeo}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-xs uppercase cursor-pointer flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  {isLocatingGeo ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LocateFixed className="w-4 h-4 text-blue-200" />
                  )}
                  <span>{isLocatingGeo ? 'Acquiring GPS...' : 'Center Grid At My GPS'}</span>
                </button>

                <button
                  onClick={handleGenerateGrid}
                  className="w-full py-2.5 bg-[#012d1d] hover:bg-[#1b4332] active:bg-black text-white rounded-xl font-bold text-xs uppercase cursor-pointer flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-[#4ade80]" />
                  <span>Re-Calculate Sowing Grid</span>
                </button>
              </div>
            </div>

            {/* Waypoints Actions & File Upload/Download */}
            <div className="bg-white border-2 border-gray-300 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5">
              <div>
                <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-1.5">
                  <h4 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#2D6A4F]" />
                    <span>Mission Sync & Export</span>
                  </h4>
                  <span className="text-[10px] text-gray-500 font-bold uppercase">QGC WPL 110</span>
                </div>
                <p className="text-xs text-gray-600 leading-normal">
                  Standard waypoints compatible with Mission Planner, QGroundControl, and ArduRover autopilots.
                </p>
              </div>

              {/* Action Buttons: 2 Top + 1 Prominent Full Width Bottom */}
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".waypoints,.txt"
                    className="hidden"
                    onChange={handleImportWaypointsFile}
                  />
                  <button
                    onClick={() => {
                      playClickSound();
                      fileInputRef.current?.click();
                    }}
                    className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="truncate">Import .waypoints</span>
                  </button>

                  <button
                    onClick={handleExportWaypointsFile}
                    className="py-2.5 px-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="truncate">Export .waypoints</span>
                  </button>
                </div>

                <button
                  onClick={handleUploadWaypoints}
                  className="w-full py-3 px-3 bg-[#2D6A4F] hover:bg-[#1b4332] active:bg-[#012d1d] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                >
                  <Radio className="w-4 h-4 text-[#4ade80] shrink-0" />
                  <span>Upload to ArduRover</span>
                </button>
              </div>

              <div className="bg-[#f7f9ff] p-2.5 rounded-xl border border-gray-300 flex items-center justify-between text-xs text-gray-600">
                <span>Active Waypoints: <strong>{activeWaypoints.length} pts</strong></span>
                <button
                  onClick={handleAddWaypoint}
                  className="text-xs font-bold text-[#2D6A4F] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Manual WP</span>
                </button>
              </div>
            </div>
          </div>

          {/* Editable Waypoints Table */}
          <div className="bg-white border-2 border-gray-300 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-[#012d1d] uppercase font-['Public_Sans'] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#2D6A4F]" />
                <span>Mission Waypoints List</span>
              </h4>
              <span className="text-[10px] font-mono text-gray-500 font-bold">Auto-increment</span>
            </div>

            <div 
              ref={wpTableContainerRef}
              className="max-h-85 overflow-x-auto overflow-y-auto border border-gray-200 rounded-xl scroll-smooth"
            >
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#f1f4f9] border-b-2 border-gray-300 text-gray-700 font-black uppercase sticky top-0">
                  <tr>
                    <th className="p-2.5 w-10">#</th>
                    <th className="p-2.5 w-36">Command</th>
                    <th className="p-2.5">Latitude</th>
                    <th className="p-2.5">Longitude</th>
                    <th className="p-2.5 w-24">Seeder</th>
                    <th className="p-2.5 w-20">Speed</th>
                    <th className="p-2.5 w-12 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono">
                  {activeWaypoints.map((wp, idx) => (
                    <tr
                      key={wp.index}
                      className={`transition-colors cursor-pointer ${
                        wp.isCompleted
                          ? 'bg-emerald-50 opacity-75'
                          : 'hover:bg-[#f7f9ff]'
                      } ${activeWpIndex === idx && !wp.isCompleted ? 'bg-blue-50 border-l-2 border-blue-500 font-bold' : ''}`}
                      onClick={() => setActiveWpIndex(idx)}
                    >
                      <td className="p-2.5 font-bold text-gray-600">
                        {wp.isCompleted ? <span className="text-emerald-600">✓</span> : wp.index}
                      </td>
                      <td className="p-2.5">
                        <select
                          value={wp.command}
                          onChange={(e) => handleUpdateWpCommand(idx, e.target.value as any)}
                          className="w-full p-1 bg-white border border-gray-300 rounded text-[11px] font-bold text-gray-800"
                        >
                          <option value="WAYPOINT">WAYPOINT</option>
                          <option value="DO_SET_SERVO">DO_SET_SERVO</option>
                          <option value="DO_SET_RELAY">DO_SET_RELAY</option>
                          <option value="SPLINE_WAYPOINT">SPLINE</option>
                          <option value="RETURN_TO_LAUNCH">RTL</option>
                        </select>
                      </td>
                      <td className="p-2.5 text-gray-800 text-[11px]">{wp.lat.toFixed(6)}</td>
                      <td className="p-2.5 text-gray-800 text-[11px]">{wp.lng.toFixed(6)}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-sans font-bold ${
                            wp.seederActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {wp.seederActive ? 'ON' : 'OFF'}
                        </span>
                      </td>
                      <td className="p-2.5 text-gray-700 text-[11px]">{wp.speedKmh} km/h</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleDeleteWaypoint(idx)}
                          className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                          title="Delete Waypoint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FLIGHT DATA (PFD HUD) */}
      {activeTab === 'flight-data' && (
        <FlightDataHUD
          telemetry={telemetry}
          selectedCrop={selectedCrop}
          onSetMode={handleSetMode}
          onToggleArm={handleArmDisarm}
          onTriggerRTL={handleTriggerRTL}
          onOverrideServo={handleOverrideServo}
        />
      )}

      {/* TAB 3: PARAMETERS TREE */}
      {activeTab === 'parameters' && (
        <ParametersEditor onShowToast={showToast} />
      )}

      {/* TAB 4: MAVLINK CONSOLE */}
      {activeTab === 'mavlink-console' && (
        <MavlinkConsole telemetry={telemetry} onShowToast={showToast} />
      )}

      {/* TAB 5: CONNECTION & ESP32 HUB */}
      {activeTab === 'connection' && (
        <ConnectionManager
          config={config}
          telemetry={telemetry}
          onUpdateConfig={(cfg) => setConfig((prev) => ({ ...prev, ...cfg }))}
          onConnect={handleConnect}
          onShowToast={showToast}
        />
      )}

      {/* Safety Arm Confirmation Modal */}
      {showArmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border-4 border-red-600 p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-8 h-8 shrink-0 animate-bounce" />
              <h3 className="font-black text-lg uppercase font-['Public_Sans']">
                Pre-Arm Safety Warning
              </h3>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Arming will energize the high-torque tractor traction motors and precision seed drill actuators. Ensure the field perimeter is clear of bystanders and animals.
            </p>

            <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs font-mono text-red-800 flex flex-col gap-1">
              <div>GPS FIX: <strong>{telemetry.gpsFixType}</strong> ({telemetry.satellitesCount} Sats)</div>
              <div>HDOP: <strong>{telemetry.hdop}</strong> (RTK Precision ±{telemetry.rtkAccuracyCm} cm)</div>
              <div>Mode: <strong>{telemetry.mode}</strong></div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowArmModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={() => handleArmDisarm(true)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer shadow-md"
              >
                Confirm & ARM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
