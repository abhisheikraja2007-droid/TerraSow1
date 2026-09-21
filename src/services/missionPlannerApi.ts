import { VehicleTelemetry, Waypoint, VehicleMode, MissionPlannerConfig } from '../types';

export class MissionPlannerService {
  private static config: MissionPlannerConfig = {
    apiUrl: 'http://127.0.0.1:56781',
    mavlinkPort: 56781,
    protocol: 'REST',
    baudRate: 115200,
    pollIntervalMs: 1000,
    autoSyncTelemetry: true,
    voiceAnnouncements: true,
  };

  public static setConfig(newConfig: Partial<MissionPlannerConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public static getConfig(): MissionPlannerConfig {
    return this.config;
  }

  // 1. Connect / Test Connection
  public static async connect(apiUrl?: string): Promise<{ success: boolean; message: string; telemetry?: VehicleTelemetry }> {
    try {
      const targetUrl = apiUrl || this.config.apiUrl;
      const res = await fetch('/api/mission-planner/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: targetUrl,
          port: this.config.mavlinkPort,
          protocol: this.config.protocol,
        }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Mission Planner connect error:', err);
      return { success: false, message: 'Failed to reach Mission Planner API Gateway' };
    }
  }

  // 2. Fetch Live Telemetry
  public static async getTelemetry(): Promise<VehicleTelemetry | null> {
    try {
      const res = await fetch('/api/mission-planner/telemetry');
      if (!res.ok) throw new Error('Telemetry fetch failed');
      return await res.json();
    } catch (err) {
      console.warn('Mission Planner telemetry error:', err);
      return null;
    }
  }

  // 3. Set Vehicle Flight / Drive Mode (AUTO, MANUAL, GUIDED, RTL, STEERING)
  public static async setMode(mode: VehicleMode): Promise<{ success: boolean; mode: VehicleMode }> {
    try {
      const res = await fetch('/api/mission-planner/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Set mode error:', err);
      return { success: false, mode: 'MANUAL' };
    }
  }

  // 4. Arm / Disarm Drive Motors
  public static async setArmed(arm: boolean): Promise<{ success: boolean; armed: boolean; message: string }> {
    try {
      const res = await fetch('/api/mission-planner/arm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arm }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Arm command error:', err);
      return { success: false, armed: false, message: 'Arming command failed' };
    }
  }

  // 5. Fetch Waypoints from Mission Planner
  public static async getWaypoints(): Promise<{ count: number; waypoints: Waypoint[] }> {
    try {
      const res = await fetch('/api/mission-planner/waypoints');
      return await res.json();
    } catch (err) {
      console.warn('Get waypoints error:', err);
      return { count: 0, waypoints: [] };
    }
  }

  // 6. Upload Sowing Waypoints to Mission Planner
  public static async uploadWaypoints(waypoints: Waypoint[]): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const res = await fetch('/api/mission-planner/waypoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Upload waypoints error:', err);
      return { success: false, count: 0, message: 'Waypoint upload failed' };
    }
  }

  // 7. Trigger Return to Launch (RTL)
  public static async triggerRTL(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/mission-planner/rtl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return await res.json();
    } catch (err) {
      console.warn('RTL error:', err);
      return { success: false, message: 'RTL trigger failed' };
    }
  }
}
