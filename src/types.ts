export type ActiveTab = 'control' | 'dashboard' | 'crops' | 'mission-planner' | 'history';

export type CropCategory = 'all' | 'cereals' | 'pulses' | 'oilseeds' | 'millets' | 'superfoods';

export interface CropProfile {
  id: number;
  name: string;
  botanicalName: string;
  category: 'cereals' | 'pulses' | 'oilseeds' | 'millets' | 'superfoods';
  sowingDepth: string; // e.g. "3.5 - 5 cm"
  seedSpacing: string; // e.g. "15 - 20 cm"
  rowSpacing: string; // e.g. "22 - 30 cm"
  seedRate: string; // e.g. "40 - 45 kg/ac"
  optimalSoilTemp: string; // e.g. "18 - 25 °C"
  moistureReq: string; // e.g. "Moderate (55-65%)"
  germinationDays: string; // e.g. "4 - 7 days"
  seedColor: string;
  badge: string; // e.g. "Standard Cereal Profile"
  description: string;
}

export interface EquipmentState {
  isRunning: boolean;
  activeCropId: number;
  speedKmh: number;
  targetSpeedKmh: number;
  targetDepthCm: number;
  actualDepthCm: number;
  targetSpacingCm: number;
  actualSpacingCm: number;
  hopperLevelPercent: number;
  batteryPercent: number;
  hydraulicPressureBar: number;
  gpsAccuracyCm: number;
  steeringAngleDeg: number;
  totalAreaCoveredAcres: number;
  sessionDurationSeconds: number;
  activeDirection: 'forward' | 'backward' | 'left' | 'right' | 'idle' | 'stopped';
  isEmergencyStopped: boolean;
  rtkStatus: 'FIXED' | 'FLOAT' | 'SEARCHING';
}

export interface HistoryEntry {
  id: string;
  cropName: string;
  cropId: number;
  operationType: string;
  date: string;
  timestamp: string;
  duration: string;
  durationMinutes: number;
  areaAcres: number;
  seedUsedKg: number;
  status: 'Completed' | 'Interrupted' | 'In Progress';
  avgSpeedKmh: number;
  avgDepthCm: number;
  tractorName: string;
  fieldId: string;
  notes?: string;
}

export interface HourlyCoverage {
  hourLabel: string;
  acres: number;
  ratePerHr: number;
  percentage: number;
}

// Mission Planner & ArduPilot MAVLink Types
export type VehicleMode = 'MANUAL' | 'AUTO' | 'GUIDED' | 'STEERING' | 'HOLD' | 'RTL' | 'ACRO' | 'LEARNING' | 'FOLLOW';

export type MAVLinkConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MissionPlannerTab = 'flight-data' | 'flight-plan' | 'parameters' | 'mavlink-console' | 'connection';

export interface MAVLinkMessage {
  id: string;
  timestamp: string;
  msgId: number;
  name: string;
  sysId: number;
  compId: number;
  seq: number;
  payload: Record<string, any>;
  rawHex?: string;
}

export interface ArduPilotParam {
  name: string;
  value: number;
  defaultValue: number;
  min?: number;
  max?: number;
  unit?: string;
  category: 'Steering & PID' | 'Speed & Nav' | 'Seeder & Actuator' | 'GNSS & RTK' | 'Battery & Safety' | 'Chassis & Motors';
  description: string;
  isModified?: boolean;
}

export interface MissionPlannerConfig {
  apiUrl: string; // e.g. "http://127.0.0.1:56781" or "http://192.168.1.100:56781"
  mavlinkPort: number;
  protocol: 'REST' | 'MAVLink-TCP' | 'MAVLink-UDP' | 'WebSerial' | 'WebSocket';
  baudRate: number; // e.g. 115200, 57600
  pollIntervalMs: number;
  autoSyncTelemetry: boolean;
  voiceAnnouncements: boolean;
}

export interface VehicleTelemetry {
  isConnected: boolean;
  armed: boolean;
  mode: VehicleMode;
  lat: number;
  lng: number;
  altitudeMeters: number;
  headingDeg: number;
  pitchDeg?: number;
  rollDeg?: number;
  groundspeedKmh: number;
  airspeedKmh?: number;
  verticalSpeedMs?: number;
  throttlePercent: number;
  batteryVoltage: number;
  batteryCurrentAmps?: number;
  batteryWatts?: number;
  batteryRemainingPercent: number;
  gpsFixType: 'NO_GPS' | '2D_FIX' | '3D_FIX' | 'DGPS' | 'RTK_FLOAT' | 'RTK_FIXED';
  satellitesCount: number;
  hdop: number;
  rtkAccuracyCm: number;
  seederActive: boolean;
  seederRpm: number;
  currentWaypointIndex: number;
  totalWaypointsCount: number;
  lastHeartbeatTime: string;
  sysId: number;
  firmwareVersion: string;
  packetsReceived?: number;
  packetLossPercent?: number;
  linkQualityPercent?: number;
  rssiDbm?: number;
}

export interface Waypoint {
  index: number;
  command: 'WAYPOINT' | 'DO_SET_SERVO' | 'DO_SET_RELAY' | 'SPLINE_WAYPOINT' | 'RETURN_TO_LAUNCH' | 'DO_CHANGE_SPEED' | 'DELAY';
  lat: number;
  lng: number;
  alt: number;
  param1: number; // e.g., delay / servo num
  param2: number; // e.g., acceptance radius / PWM value
  param3: number;
  param4: number;
  seederActive: boolean;
  speedKmh: number;
  targetDepthCm: number;
  targetSpacingCm: number;
  label?: string;
}

export interface FieldMission {
  id: string;
  name: string;
  cropName: string;
  fieldId: string;
  swathWidthMeters: number;
  waypoints: Waypoint[];
  totalDistanceMeters: number;
  totalAreaAcres: number;
  estimatedDurationMinutes: number;
  createdAt: string;
}
