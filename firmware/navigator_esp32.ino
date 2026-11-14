/* =====================================================================================
 * NAVIGATOR ESP32 - ROVER BRAIN & NAVIGATION HOTSPOT (VERIFIED SAFE)
 * Features: Wi-Fi AP Hotspot (AURA32_ROVER), AgriControl Dark UI Dashboard,
 *           MAVLink UDP Stream, QMC5883L Compass, TinyGPSPlus, Ultrasonic Sonar,
 *           High-Speed Non-Blocking UART Bridge to Machinist.
 * =====================================================================================
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <QMC5883LCompass.h>
#include <MAVLink.h> 

#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// --- ACCESS POINT CREDENTIALS ---
const char* AP_SSID = "AURA32_ROVER";       
const char* AP_PASSWORD = "password123"; 

const uint8_t GPS_RX_PIN = 16;
const uint8_t GPS_TX_PIN = 17; 
const uint8_t MACHINIST_TX_PIN = 25; 
const uint8_t MACHINIST_RX_PIN = 26; 
const uint8_t I2C_SDA_PIN = 21;
const uint8_t I2C_SCL_PIN = 22;
const uint8_t TRIG_PIN = 32; 
const uint8_t ECHO_PIN = 33; 

const uint32_t SERIAL_BAUD = 115200;
const uint32_t GPS_BAUD = 9600;

HardwareSerial GPSSerial(1);
HardwareSerial MachinistSerial(2);
TinyGPSPlus gps; 
QMC5883LCompass compass; 
WiFiUDP udp; 
WebServer dashboardServer(80);

IPAddress broadcastIP(255, 255, 255, 255); 
const int UDP_PORT = 14550;
const uint8_t sysid = 1;      
const uint8_t compid = 1; 

const uint8_t MAX_WAYPOINTS = 50;
struct Waypoint { double lat; double lon; };
Waypoint mission[MAX_WAYPOINTS]; 
uint16_t missionCount = 0;
uint16_t currentWaypointIndex = 0;

enum NavState { IDLE, WAITING_FOR_GPS, NAVIGATING, ALIGNING, ARRIVED, MISSION_COMPLETE, AVOIDING };
NavState navState = IDLE;
bool autonomousEnabled = false;
bool gpsValid = false;
float headingDeg = 0;

uint32_t lastCommandAt = 0;
uint32_t lastMavlinkHeartbeat = 0;
uint32_t lastMavlinkPos = 0;
uint32_t lastPingAt = 0; 
uint32_t lastSonarCheck = 0;
String machinistRxBuffer = "";

void sendMachinistCommand(String command) { 
  MachinistSerial.println(command); 
  Serial.println("UART -> MACHINIST: " + command);
}

float getSonarDistance() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 10000); 
  if (duration == 0) return 999.0; 
  return duration * 0.034 / 2.0;   
}

void sendMavlinkMessage(mavlink_message_t* msg) {
  uint8_t buf[MAVLINK_MAX_PACKET_LEN];
  uint16_t len = mavlink_msg_to_send_buffer(buf, msg);
  udp.beginPacket(broadcastIP, UDP_PORT);
  udp.write(buf, len);
  udp.endPacket();
}

void requestMissionItem(uint16_t seq, uint8_t targetSys, uint8_t targetComp) { 
  mavlink_message_t msg; 
  mavlink_msg_mission_request_int_pack(sysid, compid, &msg, targetSys, targetComp, seq, MAV_MISSION_TYPE_MISSION); 
  sendMavlinkMessage(&msg); 
}

void processMavlink() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    uint8_t buf[MAVLINK_MAX_PACKET_LEN];
    int len = udp.read(buf, sizeof(buf));
    mavlink_message_t msg;
    mavlink_status_t status;
    
    for (int i = 0; i < len; ++i) {
      if (mavlink_parse_char(MAVLINK_COMM_0, buf[i], &msg, &status)) {
        if (msg.msgid == MAVLINK_MSG_ID_MISSION_COUNT) {
            mavlink_mission_count_t mc;
            mavlink_msg_mission_count_decode(&msg, &mc);
            missionCount = min((uint16_t)MAX_WAYPOINTS, mc.count);
            currentWaypointIndex = 0;
            if (missionCount > 0) requestMissionItem(0, msg.sysid, msg.compid);
        }
        else if (msg.msgid == MAVLINK_MSG_ID_MISSION_ITEM_INT) {
            mavlink_mission_item_int_t mi;
            mavlink_msg_mission_item_int_decode(&msg, &mi);
            if (mi.seq < MAX_WAYPOINTS) {
              mission[mi.seq].lat = (double)mi.x / 10000000.0;
              mission[mi.seq].lon = (double)mi.y / 10000000.0;
              
              if (mi.seq + 1 < missionCount) {
                requestMissionItem(mi.seq + 1, msg.sysid, msg.compid);
              } else {
                mavlink_message_t ack_msg;
                mavlink_msg_mission_ack_pack(sysid, compid, &ack_msg, msg.sysid, msg.compid, MAV_MISSION_ACCEPTED, MAV_MISSION_TYPE_MISSION, 0);
                sendMavlinkMessage(&ack_msg);
              }
            }
        }
      }
    }
  }
}

float getDistance(double lat1, double lon1, double lat2, double lon2) { return TinyGPSPlus::distanceBetween(lat1, lon1, lat2, lon2); }
float getBearing(double lat1, double lon1, double lat2, double lon2) { return TinyGPSPlus::courseTo(lat1, lon1, lat2, lon2); }
float getHeadingError(float target, float current) { 
  float e = target - current; 
  while (e > 180) e -= 360; 
  while (e < -180) e += 360; 
  return e; 
}

void updateNavigation() {
  if (!autonomousEnabled || missionCount == 0) return;
  
  if (!gpsValid) {
    if (millis() - lastCommandAt > 500) { sendMachinistCommand("STOP"); lastCommandAt = millis(); }
    navState = WAITING_FOR_GPS;
    return;
  }

  if (millis() - lastSonarCheck > 100) { 
    lastSonarCheck = millis();
    float obsDist = getSonarDistance();
    
    if (obsDist > 0 && obsDist < 30.0) { 
      if (navState != AVOIDING) {
        sendMachinistCommand("LEFT"); 
        navState = AVOIDING;
        Serial.println("OBSTACLE DETECTED! Dodging...");
      }
      return; 
    } else if (navState == AVOIDING) {
      navState = NAVIGATING; 
      Serial.println("Path clear, resuming GPS navigation.");
    }
  }
  
  if (navState == AVOIDING) return; 
  
  if (currentWaypointIndex >= missionCount) {
    if (navState != MISSION_COMPLETE) {
      sendMachinistCommand("STOP");
      navState = MISSION_COMPLETE;
      autonomousEnabled = false;
    }
    return;
  }

  Waypoint target = mission[currentWaypointIndex]; 
  float distance = getDistance(gps.location.lat(), gps.location.lng(), target.lat, target.lon); 
  float bearing = getBearing(gps.location.lat(), gps.location.lng(), target.lat, target.lon); 
  float error = getHeadingError(bearing, headingDeg);
  
  if (distance <= 1.5f) { 
      sendMachinistCommand("STOP"); 
      navState = ARRIVED; 
      currentWaypointIndex++;
      return; 
  }
  
  if (millis() - lastCommandAt < 400) return; 
  lastCommandAt = millis();
  
  if (abs(error) <= 15.0f) { sendMachinistCommand("FORWARD"); navState = NAVIGATING; }
  else if (error > 0) { sendMachinistCommand("RIGHT"); navState = ALIGNING; }
  else { sendMachinistCommand("LEFT"); navState = ALIGNING; }
}

void setupDashboard() {
  dashboardServer.on("/", []() {
    String html = "<!DOCTYPE html><html lang='en'><head>";
    html += "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>";
    html += "<title>AgriControl Pro - AURA32</title>";
    html += "<style>";
    html += "*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-tap-highlight-color:transparent;}";
    html += "body{background:#0B0F17;color:#F9FAFB;font-family:system-ui,sans-serif;padding:12px;display:flex;justify-content:center;}";
    html += ".wrap{width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;}";
    html += ".header{background:#111827;border:1px solid #1F2937;border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;}";
    html += ".header h1{font-size:16px;font-weight:900;letter-spacing:0.5px;}";
    html += ".header p{font-size:10px;color:#14B8A6;font-weight:700;text-transform:uppercase;}";
    html += ".badge{background:rgba(20,184,166,0.15);border:1px solid #14B8A6;color:#14B8A6;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;}";
    html += ".card{background:#111827;border:1px solid #1F2937;border-radius:14px;padding:12px;box-shadow:0 4px 10px rgba(0,0,0,0.4);}";
    html += ".card-t{font-size:11px;font-weight:800;color:#06B6D4;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;}";
    html += ".slider{width:100%;height:8px;accent-color:#06B6D4;margin:6px 0;}";
    html += ".dpad{position:relative;width:240px;height:240px;margin:4px auto;background:#080C13;border:2px solid #1F2937;border-radius:24px;}";
    html += ".btn-dp{position:absolute;width:64px;height:64px;background:#1E293B;border:2px solid #334155;color:#fff;font-size:11px;font-weight:900;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;}";
    html += ".btn-dp:active{transform:scale(0.92);background:#06B6D4;color:#000;border-color:#06B6D4;}";
    html += ".dp-u{top:8px;left:50%;transform:translateX(-50%);}";
    html += ".dp-d{bottom:8px;left:50%;transform:translateX(-50%);}";
    html += ".dp-l{top:50%;left:8px;transform:translateY(-50%);}";
    html += ".dp-r{top:50%;right:8px;transform:translateY(-50%);}";
    html += ".btn-stop{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:78px;height:78px;background:#DC2626;border:3px solid #EF4444;border-radius:16px;color:#fff;font-weight:900;font-size:15px;cursor:pointer;}";
    html += ".btn-stop:active{transform:translate(-50%,-50%) scale(0.9);}";
    html += ".g2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}";
    html += ".g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}";
    html += ".g4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}";
    html += ".btn{background:#1E293B;border:1px solid #334155;color:#fff;font-size:11px;font-weight:700;padding:9px 4px;border-radius:8px;cursor:pointer;text-align:center;}";
    html += ".btn:active{transform:scale(0.94);}";
    html += ".b-cyan{background:rgba(6,182,212,0.15);border-color:#06B6D4;color:#06B6D4;}";
    html += ".b-cyan:active{background:#06B6D4;color:#000;}";
    html += ".b-teal{background:rgba(20,184,166,0.15);border-color:#14B8A6;color:#14B8A6;}";
    html += ".b-teal:active{background:#14B8A6;color:#000;}";
    html += ".b-yel{background:rgba(234,179,8,0.15);border-color:#EAB308;color:#EAB308;}";
    html += ".b-yel:active{background:#EAB308;color:#000;}";
    html += ".b-red{background:rgba(239,68,68,0.15);border-color:#EF4444;color:#EF4444;}";
    html += ".b-red:active{background:#EF4444;color:#fff;}";
    html += ".crop-sel{width:100%;height:38px;background:#080C13;border:1px solid #1F2937;color:#fff;font-size:12px;font-weight:700;border-radius:8px;padding:0 8px;margin-bottom:6px;}";
    html += ".btn-estop{width:100%;background:#DC2626;color:#fff;border:2px solid #EF4444;padding:12px;font-size:13px;font-weight:900;letter-spacing:1px;border-radius:12px;cursor:pointer;}";
    html += ".btn-estop:active{transform:scale(0.96);}";
    html += "</style></head><body>";
    
    html += "<div class='wrap'>";
    html += "<div class='header'><div><h1>AURA32 ROVER</h1><p>AgriControl Dark Cockpit</p></div><div class='badge'>WIFI LIVE</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-t'><span>Motor Speed</span><span id='sv' style='color:#fff;'>255 / 255</span></div>";
    html += "<input type='range' min='80' max='255' value='255' class='slider' onchange=\"setSpeed(this.value)\" oninput=\"document.getElementById('sv').innerText=this.value+' / 255'\">";
    html += "</div>";

    html += "<div class='card'>";
    html += "<div class='card-t'>Movement Control</div>";
    html += "<div class='dpad'>";
    html += "<button class='btn-dp dp-u' onclick=\"cmd('FORWARD')\">FWD<br>[W]</button>";
    html += "<button class='btn-dp dp-l' onclick=\"cmd('LEFT')\">LFT<br>[A]</button>";
    html += "<button class='btn-stop' onclick=\"cmd('STOP')\">STOP</button>";
    html += "<button class='btn-dp dp-r' onclick=\"cmd('RIGHT')\">RGT<br>[D]</button>";
    html += "<button class='btn-dp dp-d' onclick=\"cmd('BACKWARD')\">REV<br>[S]</button>";
    html += "</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-t'>Mechanisms & Tools</div>";
    html += "<div style='display:flex;flex-direction:column;gap:6px;'>";
    html += "<div class='g2'><button class='btn b-yel' onclick=\"cmd('DRILL_ON')\">⚡ DRILL ON</button><button class='btn' onclick=\"cmd('DRILL_OFF')\">DRILL OFF</button></div>";
    html += "<div class='g4'><button class='btn b-cyan' onclick=\"cmd('HOPPER_LEFT')\">L +45°</button><button class='btn' onclick=\"cmd('HOPPER_CENTER')\">CTR 0°</button><button class='btn b-cyan' onclick=\"cmd('HOPPER_RIGHT')\">R -45°</button><button class='btn b-teal' onclick=\"cmd('HOPPER_MULTI_START')\">MULTI</button></div>";
    html += "<button class='btn' style='font-size:10px;' onclick=\"cmd('HOPPER_MULTI_STOP')\">STOP MULTI-SEED</button>";
    html += "<div class='g3'><button class='btn b-teal' onclick=\"cmd('ACT_DOWN')\">ACT DOWN</button><button class='btn b-red' onclick=\"cmd('ACT_STOP')\">ACT HOLD</button><button class='btn b-teal' onclick=\"cmd('ACT_UP')\">ACT UP</button></div>";
    html += "<div class='g2'><button class='btn b-cyan' onclick=\"cmd('NPK_DOWN')\">NPK DOWN</button><button class='btn' onclick=\"cmd('NPK_UP')\">NPK UP</button></div>";
    html += "</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-t'>Crop Distance Auto-Sow</div>";
    html += "<select id='cs' class='crop-sel'>";
    html += "<option value='18'>Wheat (18.0 cm)</option>";
    html += "<option value='25'>Maize (25.0 cm)</option>";
    html += "<option value='13'>Paddy (12.5 cm)</option>";
    html += "<option value='13'>Groundnut (12.5 cm)</option>";
    html += "<option value='9'>Green Gram (9.0 cm)</option>";
    html += "<option value='28'>Red Gram (27.5 cm)</option>";
    html += "<option value='4'>Flaxseed (4.0 cm)</option>";
    html += "<option value='53'>Castor (52.5 cm)</option>";
    html += "</select>";
    html += "<div class='g2'><button class='btn b-teal' style='font-weight:900;' onclick=\"cmd('SEED_RUN:'+document.getElementById('cs').value)\">▶ AUTO START</button><button class='btn b-red' style='font-weight:900;' onclick=\"cmd('SEED_STOP');cmd('STOP');\">■ AUTO STOP</button></div>";
    html += "</div>";

    html += "<button class='btn-estop' onclick=\"cmd('ESTOP')\">⚠ EMERGENCY STOP (ESTOP)</button>";
    html += "</div>";

    html += "<script>";
    html += "function cmd(a){fetch('/action?cmd='+encodeURIComponent(a),{cache:'no-store'});}";
    html += "function setSpeed(v){fetch('/action?cmd=SPEED:'+v,{cache:'no-store'});}";
    html += "</script></body></html>";

    dashboardServer.send(200, "text/html", html);
  });

  dashboardServer.on("/action", []() {
    if (dashboardServer.hasArg("cmd")) {
      String command = dashboardServer.arg("cmd");
      if (command == "AUTO:START") {
        autonomousEnabled = true; 
      }
      else if (command == "AUTO:STOP") { 
        autonomousEnabled = false; 
        sendMachinistCommand("STOP");
      }
      else if (command == "STOP" || command == "ESTOP") { 
        autonomousEnabled = false; 
        sendMachinistCommand(command);
      }
      else {
        sendMachinistCommand(command); 
      }
      dashboardServer.send(200, "text/plain", "OK");
    }
  });
  dashboardServer.begin();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); 

  Serial.begin(SERIAL_BAUD); 
  MachinistSerial.begin(SERIAL_BAUD, SERIAL_8N1, MACHINIST_RX_PIN, MACHINIST_TX_PIN);
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN); 

  // --- 1. START WI-FI AP & WEBSERVER FIRST (Guaranteed to boot immediately) ---
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  Serial.println("\nWi-Fi Hotspot Created!");
  Serial.print("Connect to Network: ");
  Serial.println(AP_SSID);
  Serial.print("Dashboard IP: ");
  Serial.println(WiFi.softAPIP()); 
  
  udp.begin(UDP_PORT);
  setupDashboard(); 

  // --- 2. SENSORS (Safe init after Wi-Fi) ---
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  compass.init();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  dashboardServer.handleClient(); 
  processMavlink(); 

  while (MachinistSerial.available()) {
    char c = MachinistSerial.read();
    if (c == '\n') {
      machinistRxBuffer.trim();
      if (machinistRxBuffer.length() > 0) {
        Serial.println("MACHINIST -> UART: " + machinistRxBuffer);
      }
      machinistRxBuffer = "";
    } else if (c != '\r') {
      machinistRxBuffer += c;
    }
  }

  if (millis() - lastPingAt >= 2000) {
    sendMachinistCommand("PING");
    lastPingAt = millis();
    
    compass.read();
    headingDeg = compass.getAzimuth();
    Serial.println("COMPASS HEADING: " + String(headingDeg) + " degrees");
    
    if (!gpsValid) {
       Serial.println("GPS: Waiting for satellites...");
    }
  }

  while (GPSSerial.available()) {
    if (gps.encode(GPSSerial.read())) {
      if (gps.location.isValid()) gpsValid = true;
    }
  }

  if (millis() - lastMavlinkHeartbeat >= 1000) { 
    lastMavlinkHeartbeat = millis(); 
    mavlink_message_t msg;
    uint8_t base_mode = autonomousEnabled ? MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_AUTO_ENABLED : MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_MANUAL_INPUT_ENABLED;
    mavlink_msg_heartbeat_pack(sysid, compid, &msg, MAV_TYPE_GROUND_ROVER, MAV_AUTOPILOT_GENERIC, base_mode, 0, MAV_STATE_ACTIVE);
    sendMavlinkMessage(&msg);
  }
  
  if (millis() - lastMavlinkPos >= 1000 && gpsValid) {
    lastMavlinkPos = millis();
    mavlink_message_t msg;
    int32_t lat = gps.location.lat() * 10000000;
    int32_t lon = gps.location.lng() * 10000000;
    int32_t alt = gps.altitude.meters() * 1000;
    mavlink_msg_global_position_int_pack(sysid, compid, &msg, millis(), lat, lon, alt, alt, 0, 0, 0, headingDeg * 100);
    sendMavlinkMessage(&msg);
  }

  updateNavigation(); 
}
