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

// --- FULL MANUAL DASHBOARD ---
void setupDashboard() {
  dashboardServer.on("/", []() {
    String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<style>body{text-align:center; font-family:sans-serif; background-color:#1a1a1a; color:white; margin:0; padding:15px;}";
    html += "button{padding:14px; font-size:15px; margin:5px; width:145px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; user-select:none;}";
    html += "button:active{transform:scale(0.95); opacity:0.8;}";
    html += ".nav{background:#007bff; color:white;} .stop{background:#dc3545; color:white;}";
    html += ".estop{background:#ff0000; color:white; width:300px; font-size:18px; border:2px solid white;}";
    html += ".tool-on{background:#28a745; color:white;} .tool-off{background:#6c757d; color:white;}";
    html += ".auto{background:#6f42c1; color:white;} hr{border:1px solid #333; margin:15px 0;}";
    html += ".slider-box{margin:10px auto; width:90%; max-width:320px; background:#2a2a2a; padding:12px; border-radius:10px;}";
    html += "input[type=range]{width:100%; height:25px;}</style></head><body>";
    
    html += "<h2>AURA32 Command Center</h2>";

    html += "<div class='slider-box'>";
    html += "<label style='font-size:16px; font-weight:bold;'>Motor Speed: <span id='spdVal'>255</span> / 255</label><br><br>";
    html += "<input type='range' min='80' max='255' value='255' id='spdSlider' onchange=\"setSpeed(this.value)\" oninput=\"document.getElementById('spdVal').innerText=this.value\">";
    html += "</div><hr>";
    
    html += "<h3>Rover Movement</h3>";
    html += "<button class='nav' onclick=\"cmd('FORWARD')\">FORWARD</button><br>";
    html += "<button class='nav' onclick=\"cmd('LEFT')\">LEFT</button>";
    html += "<button class='stop' onclick=\"cmd('STOP')\">STOP WHEELS</button>";
    html += "<button class='nav' onclick=\"cmd('RIGHT')\">RIGHT</button><br>";
    html += "<button class='nav' onclick=\"cmd('BACKWARD')\">BACKWARD</button><hr>";

    html += "<h3>Tools & Mechanisms</h3>";
    html += "<button class='tool-on' onclick=\"cmd('DRILL_ON')\">DRILL ON</button>";
    html += "<button class='tool-off' onclick=\"cmd('DRILL_OFF')\">DRILL OFF</button><br>";
    
    // --- 0° TO ±45° DUAL-SIDE SEEDING BUTTONS ---
    html += "<button class='tool-on' onclick=\"cmd('HOPPER_LEFT')\">LEFT SEED (+45°)</button>";
    html += "<button class='tool-off' onclick=\"cmd('HOPPER_CENTER')\">CENTER (0°)</button>";
    html += "<button class='tool-on' onclick=\"cmd('HOPPER_RIGHT')\">RIGHT SEED (-45°)</button><br>";
    html += "<button class='auto' style='width:300px;' onclick=\"cmd('HOPPER_MULTI_START')\">MULTI-SEED (0 &#8594; +45 &#8594; 0 &#8594; -45)</button><br>";
    html += "<button class='tool-off' style='width:300px;' onclick=\"cmd('HOPPER_MULTI_STOP')\">STOP MULTI-SEED</button><br>";
    
    html += "<button class='tool-on' onclick=\"cmd('ACT_DOWN')\">ACTUATOR DOWN</button>";
    html += "<button class='tool-off' onclick=\"cmd('ACT_UP')\">ACTUATOR UP</button><br>";
    html += "<button class='tool-off' style='width:300px;' onclick=\"cmd('ACT_STOP')\">ACTUATOR HOLD / STOP</button><br>";

    html += "<button class='tool-on' onclick=\"cmd('NPK_DOWN')\">NPK DOWN</button>";
    html += "<button class='tool-off' onclick=\"cmd('NPK_UP')\">NPK UP</button><hr>";

    html += "<button class='estop' onclick=\"cmd('ESTOP')\">EMERGENCY STOP ALL</button><hr>";

    html += "<h3>Autonomous Mode</h3>";
    html += "<button class='auto' onclick=\"cmd('AUTO:START')\">AUTO START</button>";
    html += "<button class='auto' onclick=\"cmd('AUTO:STOP')\">AUTO STOP</button>";

    html += "<script>";
    html += "function cmd(action) { fetch('/action?cmd=' + encodeURIComponent(action), {cache: 'no-store'}); }";
    html += "function setSpeed(val) { fetch('/action?cmd=SPEED:' + val, {cache: 'no-store'}); }";
    html += "</script>";
    html += "</body></html>";
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

  // --- NON-BLOCKING UART LISTENER ---
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

  // --- COMPASS AND GPS DEBUGGING (Every 2 seconds) ---
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
