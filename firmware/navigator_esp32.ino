/* =====================================================================================
 * NAVIGATOR ESP32 - ROVER BRAIN & NAVIGATION HOTSPOT
 * Features: Wi-Fi AP Hotspot (AURA32_ROVER), Web Dashboard, MAVLink UDP Stream,
 *           QMC5883L Compass, TinyGPSPlus, Ultrasonic Sonar, UART to Machinist.
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

// --- BROWNOUT FIX LIBRARIES ---
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// --- ACCESS POINT (HOTSPOT) CREDENTIALS ---
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

// --- ULTRASONIC SENSOR (Fast 10ms timeout) ---
float getSonarDistance() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 10000); 
  if (duration == 0) return 999.0; 
  return duration * 0.034 / 2.0;   
}

// --- MAVLINK SYSTEM ---
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

// --- GPS MATH ---
float getDistance(double lat1, double lon1, double lat2, double lon2) { return TinyGPSPlus::distanceBetween(lat1, lon1, lat2, lon2); }
float getBearing(double lat1, double lon1, double lat2, double lon2) { return TinyGPSPlus::courseTo(lat1, lon1, lat2, lon2); }
float getHeadingError(float target, float current) { 
  float e = target - current; 
  while (e > 180) e -= 360; 
  while (e < -180) e += 360; 
  return e; 
}

// --- NAVIGATION & OBSTACLE AVOIDANCE ---
void updateNavigation() {
  if (!autonomousEnabled || missionCount == 0) return;
  
  // If GPS is not yet locked, do not stop autonomous mode - keep state waiting
  if (!gpsValid) {
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

// --- FULL MANUAL DASHBOARD ---
void setupDashboard() {
  dashboardServer.on("/", []() {
    String html = "<!DOCTYPE html><html lang='en'><head>";
    html += "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'>";
    html += "<title>AgriControl Pro - AURA32 Command Center</title>";
    html += "<style>";
    html += "*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-tap-highlight-color:transparent;}";
    html += "body{background:#0B0F17;color:#F9FAFB;font-family:system-ui,-apple-system,sans-serif;padding:12px;display:flex;justify-content:center;min-height:100vh;}";
    html += ".container{width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;}";
    html += ".header{background:#111827;border:1px solid #1F2937;border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.5);}";
    html += ".header h2{font-size:16px;font-weight:900;letter-spacing:0.5px;color:#fff;}";
    html += ".badge{background:rgba(20,184,166,0.15);border:1px solid #14B8A6;color:#14B8A6;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:0.5px;}";
    html += ".card{background:#111827;border:1px solid #1F2937;border-radius:14px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);}";
    html += ".card-title{font-size:11px;font-weight:800;color:#06B6D4;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;}";
    html += ".slider{width:100%;height:8px;accent-color:#06B6D4;margin:6px 0;}";
    html += ".dpad-wrap{position:relative;width:240px;height:240px;margin:6px auto;background:#080C13;border:2px solid #1F2937;border-radius:24px;box-shadow:inset 0 2px 10px rgba(0,0,0,0.8);}";
    html += ".btn-dp{position:absolute;width:66px;height:66px;background:#1E293B;border:2px solid #334155;color:#fff;font-size:11px;font-weight:900;border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.1s;}";
    html += ".btn-dp:active{transform:scale(0.92);background:#06B6D4;color:#000;border-color:#06B6D4;}";
    html += ".dp-u{top:8px;left:50%;transform:translateX(-50%);}";
    html += ".dp-d{bottom:8px;left:50%;transform:translateX(-50%);}";
    html += ".dp-l{top:50%;left:8px;transform:translateY(-50%);}";
    html += ".dp-r{top:50%;right:8px;transform:translateY(-50%);}";
    html += ".btn-stop-wheels{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:78px;height:78px;background:linear-gradient(135deg,#EF4444 0%,#B91C1C 100%);border:3px solid #F87171;border-radius:16px;color:#fff;font-weight:900;font-size:13px;cursor:pointer;letter-spacing:0.5px;box-shadow:0 0 14px rgba(239,68,68,0.4);}";
    html += ".btn-stop-wheels:active{transform:translate(-50%,-50%) scale(0.9);}";
    html += ".grid-2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}";
    html += ".grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}";
    html += ".btn-act{background:#1E293B;border:1px solid #334155;color:#F1F5F9;font-size:11px;font-weight:700;padding:10px 4px;border-radius:8px;cursor:pointer;text-align:center;transition:all 0.1s;}";
    html += ".btn-act:active{transform:scale(0.95);}";
    html += ".b-cyan{background:rgba(6,182,212,0.15);border-color:#06B6D4;color:#06B6D4;}";
    html += ".b-cyan:active{background:#06B6D4;color:#000;}";
    html += ".b-teal{background:rgba(20,184,166,0.15);border-color:#14B8A6;color:#14B8A6;}";
    html += ".b-teal:active{background:#14B8A6;color:#000;}";
    html += ".b-yellow{background:rgba(234,179,8,0.15);border-color:#EAB308;color:#EAB308;}";
    html += ".b-yellow:active{background:#EAB308;color:#000;}";
    html += ".b-purple{background:rgba(168,85,247,0.15);border-color:#A855F7;color:#A855F7;}";
    html += ".b-purple:active{background:#A855F7;color:#fff;}";
    html += ".b-red{background:rgba(239,68,68,0.15);border-color:#EF4444;color:#EF4444;}";
    html += ".b-red:active{background:#EF4444;color:#fff;}";
    html += ".btn-estop{width:100%;background:linear-gradient(135deg,#EF4444 0%,#991B1B 100%);color:#fff;border:2px solid #F87171;padding:12px;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;border-radius:12px;cursor:pointer;box-shadow:0 0 14px rgba(239,68,68,0.3);}";
    html += ".btn-estop:active{transform:scale(0.97);}";
    html += "</style></head><body>";
    
    html += "<div class='container'>";
    html += "<div class='header'><h2>AURA32 Command Center</h2><div class='badge'>ROVER LIVE</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-title'><span>Motor Speed</span><span id='spdVal' style='color:#fff;'>255 / 255</span></div>";
    html += "<input type='range' min='80' max='255' value='255' id='spdSlider' class='slider' onchange=\"setSpeed(this.value)\" oninput=\"document.getElementById('spdVal').innerText=this.value+' / 255'\">";
    html += "</div>";

    html += "<div class='card'>";
    html += "<div class='card-title'>Rover Movement</div>";
    html += "<div class='dpad-wrap'>";
    html += "<button class='btn-dp dp-u' onclick=\"cmd('FORWARD')\">▲<br>FWD</button>";
    html += "<button class='btn-dp dp-l' onclick=\"cmd('LEFT')\">◀<br>LFT</button>";
    html += "<button class='btn-stop-wheels' onclick=\"cmd('STOP')\">STOP<br>WHEELS</button>";
    html += "<button class='btn-dp dp-r' onclick=\"cmd('RIGHT')\">▶<br>RGT</button>";
    html += "<button class='btn-dp dp-d' onclick=\"cmd('BACKWARD')\">▼<br>REV</button>";
    html += "</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-title'>Tools & Mechanisms</div>";
    html += "<div style='display:flex;flex-direction:column;gap:6px;'>";
    html += "<div class='grid-2'>";
    html += "<button class='btn-act b-yellow' onclick=\"cmd('DRILL_ON')\">⚡ DRILL ON</button>";
    html += "<button class='btn-act' onclick=\"cmd('DRILL_OFF')\">DRILL OFF</button>";
    html += "</div>";
    
    html += "<div class='grid-3'>";
    html += "<button class='btn-act b-cyan' onclick=\"cmd('HOPPER_LEFT')\">LEFT (+45°)</button>";
    html += "<button class='btn-act' onclick=\"cmd('HOPPER_CENTER')\">CTR (0°)</button>";
    html += "<button class='btn-act b-cyan' onclick=\"cmd('HOPPER_RIGHT')\">RIGHT (-45°)</button>";
    html += "</div>";
    html += "<button class='btn-act b-teal' style='width:100%;' onclick=\"cmd('HOPPER_MULTI_START')\">MULTI-SEED (0 → +45 → 0 → -45)</button>";
    html += "<button class='btn-act' style='width:100%;font-size:10px;' onclick=\"cmd('HOPPER_MULTI_STOP')\">STOP MULTI-SEED</button>";

    html += "<div class='grid-2'>";
    html += "<button class='btn-act b-teal' onclick=\"cmd('ACT_DOWN')\">ACTUATOR DOWN</button>";
    html += "<button class='btn-act' onclick=\"cmd('ACT_UP')\">ACTUATOR UP</button>";
    html += "</div>";
    html += "<button class='btn-act b-red' style='width:100%;' onclick=\"cmd('ACT_STOP')\">ACTUATOR HOLD / STOP</button>";

    html += "<div class='grid-2'>";
    html += "<button class='btn-act b-cyan' onclick=\"cmd('NPK_DOWN')\">NPK DOWN</button>";
    html += "<button class='btn-act' onclick=\"cmd('NPK_UP')\">NPK UP</button>";
    html += "</div>";
    html += "</div></div>";

    html += "<div class='card'>";
    html += "<div class='card-title'><span>Autonomous Sowing (Crop-Specific)</span><span id='cropBadge' style='color:#06B6D4;font-size:11px;font-weight:900;'>18 cm</span></div>";
    html += "<select id='cropSelect' style='width:100%;padding:8px;background:#1E293B;border:1px solid #334155;color:#fff;border-radius:8px;font-weight:700;margin-bottom:8px;font-size:11px;' onchange='onCropChange(this.value)'>";
    html += "<option value='13'>1. Paddy (Oryza sativa) - 13 cm</option>";
    html += "<option value='18' selected>2. Wheat (Triticum aestivum) - 18 cm</option>";
    html += "<option value='23'>3. Maize (Zea mays) - 23 cm</option>";
    html += "<option value='13'>4. Groundnut (Arachis hypogaea) - 13 cm</option>";
    html += "<option value='11'>5. Bengal Gram (Cicer arietinum) - 11 cm</option>";
    html += "<option value='9'>6. Green Gram (Vigna radiata) - 9 cm</option>";
    html += "<option value='9'>7. Black Gram (Vigna mungo) - 9 cm</option>";
    html += "<option value='28'>8. Red Gram (Cajanus cajan) - 28 cm</option>";
    html += "<option value='7'>9. Soybean (Glycine max) - 7 cm</option>";
    html += "<option value='23'>10. Sunflower (Helianthus annuus) - 23 cm</option>";
    html += "<option value='13'>11. Sesame (Sesamum indicum) - 13 cm</option>";
    html += "<option value='53'>12. Castor (Ricinus communis) - 53 cm</option>";
    html += "<option value='11'>13. Cumin (Cuminum cyminum) - 11 cm</option>";
    html += "<option value='4'>14. Flaxseed (Linum usitatissimum) - 4 cm</option>";
    html += "<option value='18'>15. Safflower (Carthamus tinctorius) - 18 cm</option>";
    html += "<option value='13'>16. Mustard (Brassica juncea) - 13 cm</option>";
    html += "<option value='7'>17. Lentil (Lens culinaris) - 7 cm</option>";
    html += "<option value='11'>18. Horse Gram (Macrotyloma uniflorum) - 11 cm</option>";
    html += "<option value='9'>19. Field Pea (Pisum sativum) - 9 cm</option>";
    html += "</select>";
    html += "<div class='grid-2'>";
    html += "<button class='btn-act b-purple' style='font-weight:900;' onclick='startSowing()'>START SOWING</button>";
    html += "<button class='btn-act' style='font-weight:900;' onclick=\"cmd('SEED_STOP')\">STOP SOWING</button>";
    html += "</div></div>";

    html += "<button class='btn-estop' onclick=\"cmd('ESTOP')\">EMERGENCY STOP ALL</button>";
    html += "</div>";

    html += "<script>";
    html += "let currentSpacing = 18;";
    html += "function onCropChange(val){currentSpacing=parseInt(val)||18;document.getElementById('cropBadge').innerText=currentSpacing+' cm';}";
    html += "function startSowing(){cmd('SEED_RUN:'+currentSpacing);}";
    html += "function cmd(action){fetch('/action?cmd='+encodeURIComponent(action),{cache:'no-store'});}";
    html += "function setSpeed(val){fetch('/action?cmd=SPEED:'+val,{cache:'no-store'});}";
    html += "</script></body></html>";
    dashboardServer.send(200, "text/html", html);
  });

  dashboardServer.on("/action", []() {
    if (dashboardServer.hasArg("cmd")) {
      String command = dashboardServer.arg("cmd");
      if (command == "AUTO:START" || command == "AUTO_START") {
        autonomousEnabled = true; 
        sendMachinistCommand("AUTO_START"); // Forward auto-start directly to Machinist
      }
      else if (command.startsWith("SEED_RUN:")) {
        autonomousEnabled = true;
        sendMachinistCommand(command);
      }
      else if (command == "AUTO:STOP" || command == "SEED_STOP") { 
        autonomousEnabled = false; 
        sendMachinistCommand("SEED_STOP");
        sendMachinistCommand("STOP");
      }
      else if (command == "STOP" || command == "ESTOP") { 
        autonomousEnabled = false; 
        sendMachinistCommand(command);
      }
      else {
        if (command == "FORWARD" || command == "BACKWARD" || command == "LEFT" || command == "RIGHT") {
          autonomousEnabled = false;
        }
        sendMachinistCommand(command); 
      }
      dashboardServer.sendHeader("Access-Control-Allow-Origin", "*");
      dashboardServer.send(200, "text/plain", "OK");
    }
  });
  dashboardServer.begin();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); 

  Serial.begin(SERIAL_BAUD); 
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN); 
  MachinistSerial.begin(SERIAL_BAUD, SERIAL_8N1, MACHINIST_RX_PIN, MACHINIST_TX_PIN);
  
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  compass.init();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  Serial.println("\nWi-Fi Hotspot Created!");
  Serial.print("Connect to Network: ");
  Serial.println(AP_SSID);
  Serial.print("Dashboard IP: ");
  Serial.println(WiFi.softAPIP()); 
  
  udp.begin(UDP_PORT);
  setupDashboard(); 
}

void loop() {
  dashboardServer.handleClient(); 
  processMavlink(); 

  // Read Machinist UART
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

  // Compass and GPS Heartbeat
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

  // MAVLink Heartbeat
  if (millis() - lastMavlinkHeartbeat >= 1000) { 
    lastMavlinkHeartbeat = millis(); 
    mavlink_message_t msg;
    uint8_t base_mode = autonomousEnabled ? MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_AUTO_ENABLED : MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_MANUAL_INPUT_ENABLED;
    mavlink_msg_heartbeat_pack(sysid, compid, &msg, MAV_TYPE_GROUND_ROVER, MAV_AUTOPILOT_GENERIC, base_mode, 0, MAV_STATE_ACTIVE);
    sendMavlinkMessage(&msg);
  }
  
  // MAVLink Global Position Stream
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
