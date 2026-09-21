import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory vehicle telemetry cache
let vehicleState = {
  isConnected: true,
  armed: false,
  mode: 'MANUAL',
  lat: 31.520400,
  lng: 75.906400,
  altitudeMeters: 228.4,
  headingDeg: 42.0,
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
  lastHeartbeatTime: new Date().toISOString(),
  sysId: 1,
  firmwareVersion: 'ArduRover V4.4.0 (AgriTractor Edition)',
};

let activeWaypoints = [
  {
    index: 0,
    command: 'WAYPOINT',
    lat: 31.520400,
    lng: 75.906400,
    alt: 0,
    param1: 0,
    param2: 1.0,
    param3: 0,
    param4: 0,
    seederActive: false,
    speedKmh: 4.0,
    targetDepthCm: 4.0,
    targetSpacingCm: 18.0,
  },
  {
    index: 1,
    command: 'DO_SET_SERVO',
    lat: 31.520410,
    lng: 75.906410,
    alt: 0,
    param1: 9,
    param2: 1800,
    param3: 0,
    param4: 0,
    seederActive: true,
    speedKmh: 8.5,
    targetDepthCm: 4.0,
    targetSpacingCm: 18.0,
  },
  {
    index: 2,
    command: 'WAYPOINT',
    lat: 31.521800,
    lng: 75.906420,
    alt: 0,
    param1: 0,
    param2: 1.0,
    param3: 0,
    param4: 0,
    seederActive: true,
    speedKmh: 8.5,
    targetDepthCm: 4.0,
    targetSpacingCm: 18.0,
  },
];

// --- Mission Planner REST API Endpoints ---

// 1. Health check & API ping
app.get('/api/mission-planner/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AgriControl Mission Planner Gateway',
    timestamp: new Date().toISOString(),
  });
});

// 2. Test Connection / Ping to Mission Planner or MAVLink IP
app.post('/api/mission-planner/connect', (req, res) => {
  const { apiUrl, port, protocol } = req.body;
  vehicleState.lastHeartbeatTime = new Date().toISOString();
  vehicleState.isConnected = true;

  res.json({
    success: true,
    message: `Connected to Mission Planner at ${apiUrl || 'http://127.0.0.1:56781'} via ${protocol || 'REST'}`,
    telemetry: vehicleState,
  });
});

// 3. Get Live Vehicle Telemetry
app.get('/api/mission-planner/telemetry', (req, res) => {
  // Simulate small sensor variations if vehicle is armed
  if (vehicleState.armed && vehicleState.mode === 'AUTO') {
    vehicleState.groundspeedKmh = 8.5;
    vehicleState.seederActive = true;
    vehicleState.seederRpm = 120;
    vehicleState.throttlePercent = 45;
    vehicleState.batteryRemainingPercent = Math.max(10, vehicleState.batteryRemainingPercent - 0.005);
  } else if (vehicleState.armed) {
    vehicleState.throttlePercent = 10;
  } else {
    vehicleState.groundspeedKmh = 0;
    vehicleState.seederActive = false;
    vehicleState.seederRpm = 0;
    vehicleState.throttlePercent = 0;
  }

  vehicleState.lastHeartbeatTime = new Date().toISOString();
  res.json(vehicleState);
});

// 4. Change Flight / Drive Mode (e.g. AUTO, MANUAL, GUIDED, RTL, STEERING)
app.post('/api/mission-planner/mode', (req, res) => {
  const { mode } = req.body;
  if (mode) {
    vehicleState.mode = mode;
    if (mode === 'AUTO' && vehicleState.armed) {
      vehicleState.groundspeedKmh = 8.5;
      vehicleState.seederActive = true;
    }
  }
  res.json({
    success: true,
    mode: vehicleState.mode,
    armed: vehicleState.armed,
  });
});

// 5. Arm / Disarm Tractor Drive Motors
app.post('/api/mission-planner/arm', (req, res) => {
  const { arm } = req.body;
  vehicleState.armed = !!arm;
  if (!vehicleState.armed) {
    vehicleState.groundspeedKmh = 0;
    vehicleState.seederActive = false;
  }
  res.json({
    success: true,
    armed: vehicleState.armed,
    message: vehicleState.armed ? 'Motors ARMED — Drive & drill power enabled' : 'Motors DISARMED — Safety locked',
  });
});

// 6. Get Waypoints
app.get('/api/mission-planner/waypoints', (req, res) => {
  res.json({
    count: activeWaypoints.length,
    waypoints: activeWaypoints,
  });
});

// 7. Upload Waypoints to Mission Planner
app.post('/api/mission-planner/waypoints', (req, res) => {
  const { waypoints } = req.body;
  if (Array.isArray(waypoints)) {
    activeWaypoints = waypoints;
    vehicleState.totalWaypointsCount = waypoints.length;
    vehicleState.currentWaypointIndex = 1;
  }
  res.json({
    success: true,
    count: activeWaypoints.length,
    message: `Successfully uploaded ${activeWaypoints.length} waypoints & drill commands to Mission Planner`,
  });
});

// 8. Trigger Emergency Return to Launch (RTL)
app.post('/api/mission-planner/rtl', (req, res) => {
  vehicleState.mode = 'RTL';
  vehicleState.seederActive = false;
  vehicleState.groundspeedKmh = 5.0;
  res.json({
    success: true,
    mode: 'RTL',
    message: 'Tractor executing Return to Launch home waypoint',
  });
});

// --- Start Express & Vite Server ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgriControl Pro Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
