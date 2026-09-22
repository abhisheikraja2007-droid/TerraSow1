import { FieldMission, Waypoint, VehicleTelemetry, MissionPlannerConfig } from '../types';

export const DEFAULT_MISSION_PLANNER_CONFIG: MissionPlannerConfig = {
  apiUrl: 'http://127.0.0.1:56781',
  mavlinkPort: 56781,
  protocol: 'REST',
  baudRate: 115200,
  pollIntervalMs: 1000,
  autoSyncTelemetry: true,
  voiceAnnouncements: true,
};

// Initial base telemetry
export const INITIAL_VEHICLE_TELEMETRY: VehicleTelemetry = {
  isConnected: true,
  armed: false,
  mode: 'MANUAL',
  lat: 31.5204, // Farm Field coordinates (Punjab agro belt)
  lng: 75.9064,
  altitudeMeters: 228.4,
  headingDeg: 42,
  groundspeedKmh: 0.0,
  throttlePercent: 0,
  batteryVoltage: 48.6,
  batteryRemainingPercent: 88,
  gpsFixType: 'RTK_FIXED',
  satellitesCount: 29,
  hdop: 0.65,
  rtkAccuracyCm: 1.1,
  seederActive: false,
  seederRpm: 0,
  currentWaypointIndex: 1,
  totalWaypointsCount: 14,
  lastHeartbeatTime: new Date().toLocaleTimeString(),
  sysId: 1,
  firmwareVersion: 'ArduRover V4.4.0 (AgriTractor Edition)',
};

// Initial Sample Waypoints for 6-Row Precision Sowing Plan
export const SAMPLE_WAYPOINTS: Waypoint[] = [];

export const INITIAL_MISSION: FieldMission = {
  id: 'mission-punjab-01',
  name: 'Field North-B4 Autonomous Wheat Sowing',
  cropName: 'Wheat (Triticum aestivum)',
  fieldId: 'Field North-B4',
  swathWidthMeters: 2.4,
  waypoints: SAMPLE_WAYPOINTS,
  totalDistanceMeters: 1420,
  totalAreaAcres: 3.8,
  estimatedDurationMinutes: 28,
  createdAt: '2026-09-20 09:30:00',
};

// Helper to convert waypoints to Mission Planner .waypoints format (QGC WPL 110)
export function exportToQGCWPL(waypoints: Waypoint[]): string {
  let fileContent = 'QGC WPL 110\n';
  waypoints.forEach((wp, idx) => {
    let mavCmd = 16; // MAV_CMD_NAV_WAYPOINT
    if (wp.command === 'DO_SET_SERVO') mavCmd = 183;
    if (wp.command === 'DO_SET_RELAY') mavCmd = 181;
    if (wp.command === 'RETURN_TO_LAUNCH') mavCmd = 20;

    // Format: <INDEX> <CURRENT_WP> <COORD_FRAME> <COMMAND> <PARAM1> <PARAM2> <PARAM3> <PARAM4> <PARAM5/LAT> <PARAM6/LON> <PARAM7/ALT> <AUTOCONTINUE>
    const isCurrent = idx === 0 ? 1 : 0;
    const coordFrame = 3; // MAV_FRAME_GLOBAL_RELATIVE_ALT
    const autoContinue = 1;
    fileContent += `${idx}\t${isCurrent}\t${coordFrame}\t${mavCmd}\t${wp.param1.toFixed(6)}\t${wp.param2.toFixed(6)}\t${wp.param3.toFixed(6)}\t${wp.param4.toFixed(6)}\t${wp.lat.toFixed(7)}\t${wp.lng.toFixed(7)}\t${wp.alt.toFixed(6)}\t${autoContinue}\n`;
  });
  return fileContent;
}

// Generate an automated field survey grid for any crop
export function generateFieldGrid(
  cropName: string,
  swathWidthMeters: number,
  baseLat: number = 31.5204,
  baseLng: number = 75.9064,
  lengthMeters: number = 180,
  rowsCount: number = 6,
  targetDepthCm: number = 4.0,
  targetSpacingCm: number = 18.0
): Waypoint[] {
  const result: Waypoint[] = [];
  const latStepPerMeter = 0.000009;
  const lngStepPerMeter = 0.0000105;

  let wpIdx = 0;
  // Home WP
  result.push({
    index: wpIdx++,
    command: 'WAYPOINT',
    lat: baseLat,
    lng: baseLng,
    alt: 0,
    param1: 0,
    param2: 1.0,
    param3: 0,
    param4: 0,
    seederActive: false,
    speedKmh: 4.0,
    targetDepthCm: targetDepthCm,
    targetSpacingCm: targetSpacingCm,
  });

  for (let row = 0; row < rowsCount; row++) {
    const rowOffsetLng = baseLng + (row * swathWidthMeters * lngStepPerMeter);
    const isEven = row % 2 === 0;
    const startLat = isEven ? baseLat : baseLat + (lengthMeters * latStepPerMeter);
    const endLat = isEven ? baseLat + (lengthMeters * latStepPerMeter) : baseLat;

    // Seeder ON at start of row
    result.push({
      index: wpIdx++,
      command: 'DO_SET_SERVO',
      lat: startLat,
      lng: rowOffsetLng,
      alt: 0,
      param1: 9,
      param2: 1800,
      param3: 0,
      param4: 0,
      seederActive: true,
      speedKmh: 8.5,
      targetDepthCm: targetDepthCm,
      targetSpacingCm: targetSpacingCm,
    });

    // Row End Waypoint
    result.push({
      index: wpIdx++,
      command: 'WAYPOINT',
      lat: endLat,
      lng: rowOffsetLng,
      alt: 0,
      param1: 0,
      param2: 1.0,
      param3: 0,
      param4: 0,
      seederActive: true,
      speedKmh: 8.5,
      targetDepthCm: targetDepthCm,
      targetSpacingCm: targetSpacingCm,
    });

    // Seeder OFF for headland turn
    result.push({
      index: wpIdx++,
      command: 'DO_SET_SERVO',
      lat: endLat,
      lng: rowOffsetLng,
      alt: 0,
      param1: 9,
      param2: 1000,
      param3: 0,
      param4: 0,
      seederActive: false,
      speedKmh: 3.5,
      targetDepthCm: 0,
      targetSpacingCm: targetSpacingCm,
    });
  }

  // RTL
  result.push({
    index: wpIdx++,
    command: 'RETURN_TO_LAUNCH',
    lat: baseLat,
    lng: baseLng,
    alt: 0,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    seederActive: false,
    speedKmh: 5.0,
    targetDepthCm: 0,
    targetSpacingCm: targetSpacingCm,
  });

  return result;
}
