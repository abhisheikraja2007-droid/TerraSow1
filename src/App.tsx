import React, { useState, useEffect } from 'react';
import { ActiveTab, CropProfile, EquipmentState, HistoryEntry, VehicleTelemetry } from './types';
import { MissionPlannerService } from './services/missionPlannerApi';
import { CROPS_DATA } from './data/cropsData';
import { INITIAL_HISTORY } from './data/historyData';
import { IPhone13Frame } from './components/IPhone13Frame';
import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { EquipmentControlView } from './components/EquipmentControlView';
import { DashboardView } from './components/DashboardView';
import { CropsView } from './components/CropsView';
import { MissionPlannerView } from './components/MissionPlannerView';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { MenuDrawer } from './components/MenuDrawer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallBanner } from './components/PWAInstallBanner';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('control');
  const [selectedCrop, setSelectedCrop] = useState<CropProfile>(CROPS_DATA[1]); // Default to Wheat (Crop #2)
  const [historyList, setHistoryList] = useState<HistoryEntry[]>(INITIAL_HISTORY);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Hardware Config
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tractorModel, setTractorModel] = useState('Tractor Alpha (4-Row Precision Drill)');
  const [rtkBaseIp, setRtkBaseIp] = useState('192.168.1.120:2101/RTK_BASE');

  // Master Equipment Telemetry State
  const [equipmentState, setEquipmentState] = useState<EquipmentState>({
    isRunning: false,
    activeCropId: 2,
    speedKmh: 0,
    targetSpeedKmh: 8.5,
    targetDepthCm: 4.0,
    actualDepthCm: 4.0,
    targetSpacingCm: 18.0,
    actualSpacingCm: 18.0,
    hopperLevelPercent: 82,
    batteryPercent: 82,
    hydraulicPressureBar: 185,
    gpsAccuracyCm: 1.2,
    steeringAngleDeg: 0,
    totalAreaCoveredAcres: 0,
    sessionDurationSeconds: 0,
    activeDirection: 'idle',
    isEmergencyStopped: false,
    rtkStatus: 'FIXED',
  });

  // Global MAVLink Telemetry State
  const [isConnected, setIsConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<VehicleTelemetry>({
    lat: 30.900965,
    lng: 75.857275,
    alt: 245.5,
    headingDeg: 90,
    groundspeedKmh: 0,
    armed: false,
    mode: 'HOLD',
    satellitesCount: 0,
    gpsFixType: 'NO_FIX',
    rtkAccuracyCm: 99.9,
    batteryVoltage: 0,
    batteryRemainingPct: 0,
  });

  const [telemetryHistory, setTelemetryHistory] = useState<[number, number][]>([]);

  // Haversine distance formula (in meters)
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Poll live telemetry from API globally
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected) {
      interval = setInterval(async () => {
        const data = await MissionPlannerService.getTelemetry();
        if (data) {
          setTelemetry(data);
          
          // Update equipment state for UI components
          setEquipmentState((prev) => ({
            ...prev,
            isRunning: data.armed && data.mode === 'AUTO',
            speedKmh: data.groundspeedKmh,
            gpsAccuracyCm: data.rtkAccuracyCm,
            steeringAngleDeg: data.headingDeg % 30,
            rtkStatus: data.gpsFixType === 'RTK_FIXED' ? 'FIXED' : 'FLOAT',
            batteryPercent: data.batteryRemainingPct,
          }));

          // Track physical movement for Area Covered & Breadcrumbs
          setTelemetryHistory((prev) => {
            if (data.groundspeedKmh > 0.1) {
              const lastPoint = prev[prev.length - 1];
              if (!lastPoint) {
                return [[data.lat, data.lng]];
              }
              const dist = getDistanceMeters(lastPoint[0], lastPoint[1], data.lat, data.lng);
              if (dist >= 1.0) {
                // Moved at least 1 meter, append point
                const newHistory = [...prev, [data.lat, data.lng] as [number, number]];
                
                // Calculate new total area covered (acres) based on distance * swath width
                const swathWidthMeters = 2.4; // 2.4m default implement width
                const areaAddedSqM = dist * swathWidthMeters;
                const areaAddedAcres = areaAddedSqM / 4046.86;
                
                setEquipmentState((ePrev) => ({
                  ...ePrev,
                  totalAreaCoveredAcres: Number((ePrev.totalAreaCoveredAcres + areaAddedAcres).toFixed(3))
                }));

                return newHistory;
              }
            }
            return prev;
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  // Real-time equipment simulation loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (equipmentState.isRunning && !equipmentState.isEmergencyStopped) {
      interval = setInterval(() => {
        setEquipmentState((prev) => {
          const newDuration = prev.sessionDurationSeconds + 1;
          const newHopper = Math.max(5, prev.hopperLevelPercent - 0.02);
          const newBattery = Math.max(10, prev.batteryPercent - 0.005);

          return {
            ...prev,
            // Area covered must come from wheel encoder, so keep it still here
            sessionDurationSeconds: newDuration,
            hopperLevelPercent: Number(newHopper.toFixed(2)),
            batteryPercent: Number(newBattery.toFixed(2)),
          };
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [equipmentState.isRunning, equipmentState.isEmergencyStopped]);

  const handleLogOperation = (entry: {
    cropName: string;
    cropId: number;
    durationMinutes: number;
    areaAcres: number;
    status: 'Completed' | 'Interrupted';
  }) => {
    const newRecord: HistoryEntry = {
      id: `hist-${Date.now().toString().slice(-4)}`,
      cropName: entry.cropName,
      cropId: entry.cropId,
      operationType: 'Sowing Operation',
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timestamp: new Date().toISOString(),
      duration: `${Math.floor(entry.durationMinutes / 60)}h ${entry.durationMinutes % 60}m`,
      durationMinutes: entry.durationMinutes,
      areaAcres: entry.areaAcres || 0.5,
      seedUsedKg: Math.round((entry.areaAcres || 0.5) * 42),
      status: entry.status,
      avgSpeedKmh: equipmentState.targetSpeedKmh,
      avgDepthCm: equipmentState.targetDepthCm,
      tractorName: tractorModel,
      fieldId: 'Field North-B4',
      notes: 'Automated field log recorded from AgriControl Pro session.',
    };

    setHistoryList((prev) => [newRecord, ...prev]);
  };

  return (
    <IPhone13Frame>
      <div className="flex-1 w-full h-full flex flex-col justify-between relative bg-[#f7f9ff] text-[#181c20] font-['Atkinson_Hyperlegible'] min-h-full selection:bg-[#1b4332] selection:text-white overflow-hidden">
        {/* Top App Bar Header */}
        <TopAppBar
          onOpenMenu={() => setIsMenuOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          equipmentState={equipmentState}
        />

        {/* Floating PWA Install Bar for Mobile Viewers */}
        <PWAInstallBanner />

        {/* Main Scrollable View Area */}
        <main className="flex-1 w-full px-2.5 py-3 overflow-y-auto overflow-x-hidden overscroll-contain">
          {activeTab === 'control' && (
            <EquipmentControlView
              equipmentState={equipmentState}
              onUpdateEquipment={setEquipmentState}
              onSelectCrop={setSelectedCrop}
              selectedCrop={selectedCrop}
              onLogOperation={handleLogOperation}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              equipmentState={equipmentState}
              selectedCrop={selectedCrop}
              onUpdateEquipment={setEquipmentState}
              onNavigateToControl={() => setActiveTab('control')}
              onNavigateToCrops={() => setActiveTab('crops')}
            />
          )}

          {activeTab === 'crops' && (
            <CropsView
              selectedCrop={selectedCrop}
              onSelectCrop={setSelectedCrop}
              onUpdateEquipment={setEquipmentState}
              onNavigateToControl={() => setActiveTab('control')}
            />
          )}

          {activeTab === 'mission-planner' && (
            <MissionPlannerView
              selectedCrop={selectedCrop}
              equipmentState={equipmentState}
              onUpdateEquipment={setEquipmentState}
              onNavigateToControl={() => setActiveTab('control')}
              globalTelemetry={telemetry}
              setGlobalTelemetry={setTelemetry}
              isConnected={isConnected}
              setIsConnected={setIsConnected}
              telemetryHistory={telemetryHistory}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              historyList={historyList}
            />
          )}
        </main>

        {/* Mobile Bottom Navigation Bar with live running state indicator */}
        <BottomNavBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          equipmentState={equipmentState}
        />

        {/* Field Offline Cache State Banner */}
        <OfflineIndicator />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          units={units}
          onToggleUnits={setUnits}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          tractorModel={tractorModel}
          onSelectTractorModel={setTractorModel}
          rtkBaseIp={rtkBaseIp}
          onSetRtkBaseIp={setRtkBaseIp}
        />

        {/* Slide-out Menu Drawer */}
        <MenuDrawer
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onNavigate={setActiveTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          selectedCrop={selectedCrop}
          equipmentState={equipmentState}
        />
      </div>
    </IPhone13Frame>
  );
}
