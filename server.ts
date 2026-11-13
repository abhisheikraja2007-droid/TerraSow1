import express from 'express';
import path from 'path';
import dgram from 'dgram';
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

// --- ESP32 Rover Bridge State & HTTP/UDP Handlers ---
let esp32Host = process.env.ESP32_HOST || '192.168.4.1';
let esp32Status = {
  ip: esp32Host,
  connected: false,
  lastSeen: null as string | null,
  roverSpeed: 255,
  drillOn: false,
  hopperSweep: false,
  actuatorState: 'STOP',
  npkState: 'UP',
  lastCommand: '',
};

async function sendEsp32Command(command: string): Promise<{ success: boolean; message: string }> {
  esp32Status.lastCommand = command;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(`http://${esp32Host}/action?cmd=${encodeURIComponent(command)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      esp32Status.connected = true;
      esp32Status.lastSeen = new Date().toISOString();
      return { success: true, message: `Command '${command}' forwarded to ESP32 @ ${esp32Host}` };
    }
  } catch (err: any) {
    // If ESP32 is not currently on network (offline / dev simulator)
  }
  return { success: false, message: `ESP32 offline or unreachable at ${esp32Host} (Simulated locally)` };
}

// UDP MAVLink Listener on port 14550
const udpSocket = dgram.createSocket('udp4');
const MAVLINK_PORT = 14550;

udpSocket.on('error', (err) => {
  console.warn('UDP MAVLink socket warning:', err.message);
});

udpSocket.on('message', (msg, rinfo) => {
  if (msg.length >= 6 && msg[0] === 0xFE) {
    const payloadLen = msg[1];
    const msgId = msg[5];
    const payload = msg.subarray(6, 6 + payloadLen);

    esp32Status.connected = true;
    esp32Status.lastSeen = new Date().toISOString();
    esp32Host = rinfo.address;
    esp32Status.ip = rinfo.address;
    vehicleState.isConnected = true;
    vehicleState.lastHeartbeatTime = new Date().toISOString();

    if (msgId === 0 && payload.length >= 6) {
      // HEARTBEAT
      const baseMode = payload[5];
      vehicleState.armed = (baseMode & 0x80) !== 0;
      if (baseMode & 0x08) vehicleState.mode = 'AUTO';
    } else if (msgId === 33 && payload.length >= 28) {
      // GLOBAL_POSITION_INT
      const lat = payload.readInt32LE(4) / 1e7;
      const lon = payload.readInt32LE(8) / 1e7;
      const alt = payload.readInt32LE(12) / 1000;
      const hdg = payload.readUInt16LE(26) / 100;

      if (lat !== 0 || lon !== 0) {
        vehicleState.lat = lat;
        vehicleState.lng = lon;
        vehicleState.altitudeMeters = alt;
        vehicleState.headingDeg = hdg;
        vehicleState.gpsFixType = 'RTK_FIXED';
      }
    }
  }
});

try {
  udpSocket.bind(MAVLINK_PORT, '0.0.0.0', () => {
    console.log(`MAVLink UDP bridge active on port ${MAVLINK_PORT}`);
  });
} catch (e) {
  console.warn('MAVLink UDP bind skipped:', e);
}

// --- Rover Hardware Direct Endpoints ---
app.post('/api/rover/command', async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, message: 'Missing command parameter' });
  }

  // Update server state mirror
  if (command.startsWith('SPEED:')) {
    esp32Status.roverSpeed = parseInt(command.replace('SPEED:', ''), 10) || 255;
  } else if (command === 'DRILL_ON') esp32Status.drillOn = true;
  else if (command === 'DRILL_OFF') esp32Status.drillOn = false;
  else if (command === 'HOPPER_SWEEP_START') esp32Status.hopperSweep = true;
  else if (command === 'HOPPER_SWEEP_STOP') esp32Status.hopperSweep = false;
  else if (command === 'ACT_DOWN') esp32Status.actuatorState = 'DOWN';
  else if (command === 'ACT_UP') esp32Status.actuatorState = 'UP';
  else if (command === 'ACT_STOP') esp32Status.actuatorState = 'STOP';
  else if (command === 'NPK_DOWN') esp32Status.npkState = 'DOWN';
  else if (command === 'NPK_UP') esp32Status.npkState = 'UP';
  else if (command === 'ESTOP') {
    esp32Status.drillOn = false;
    esp32Status.hopperSweep = false;
    esp32Status.actuatorState = 'STOP';
    vehicleState.armed = false;
    vehicleState.mode = 'HOLD';
  } else if (command === 'AUTO:START') {
    vehicleState.mode = 'AUTO';
    vehicleState.armed = true;
  } else if (command === 'AUTO:STOP') {
    vehicleState.mode = 'MANUAL';
  }

  const result = await sendEsp32Command(command);
  res.json({
    ...result,
    status: esp32Status,
  });
});

app.get('/api/rover/status', (req, res) => {
  res.json({
    ...esp32Status,
    telemetry: vehicleState,
  });
});

app.post('/api/rover/config', (req, res) => {
  const { host } = req.body;
  if (host) {
    esp32Host = host;
    esp32Status.ip = host;
  }
  res.json({ success: true, host: esp32Host });
});

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
app.post('/api/mission-planner/connect', async (req, res) => {
  const { apiUrl, port, protocol } = req.body;
  vehicleState.lastHeartbeatTime = new Date().toISOString();
  vehicleState.isConnected = true;

  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl.startsWith('http') ? apiUrl : `http://${apiUrl}`);
      esp32Host = parsed.hostname;
      esp32Status.ip = parsed.hostname;
    } catch {
      esp32Host = apiUrl.replace('http://', '').replace('https://', '').split(':')[0];
      esp32Status.ip = esp32Host;
    }
  }

  const pingRes = await sendEsp32Command('PING');

  res.json({
    success: true,
    message: `Connected to Rover Gateway at ${esp32Host} via ${protocol || 'REST/MAVLink'} (${pingRes.success ? 'ESP32 Hardware Online ✓' : 'Simulator Mode'})`,
    telemetry: vehicleState,
    esp32Online: pingRes.success,
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
