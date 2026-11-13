/* =====================================================================================
 * MACHINIST ESP32 - PRECISION CALIBRATED MOVEMENT & HIGH-SPEED SERVO CONTROLLER
 * WITH CROP-SPECIFIC AUTONOMOUS STEP-AND-SOW DISTANCE ENGINE
 * =====================================================================================
 * MOVEMENT MAPPING:
 *   [W] FORWARD:  Both Left & Right wheels drive Forward together (Straight)
 *   [S] BACKWARD: Both Left & Right wheels drive Reverse together (Straight)
 *   [A] LEFT:     Left wheel reverses, Right wheel drives forward (Pivots Left)
 *   [D] RIGHT:    Left wheel drives forward, Right wheel reverses (Pivots Right)
 *   [STOP]:       Cuts motor PWM to 0 immediately
 *
 * SERVO HIGH-SPEED DUAL-SIDE SEEDING:
 *   CENTER 0°:    Neutral / Hold (90 deg)
 *   LEFT +45°:    Left Seeding (135 deg)
 *   RIGHT -45°:   Right Seeding (45 deg)
 *   MULTI-SEED:   Fast 120ms automatic oscillation (0 -> +45 -> 0 -> -45)
 *
 * AUTONOMOUS STEP-AND-SOW (CROP-TO-CROP DISTANCE):
 *   Command:      SEED_RUN:<cm> (e.g., SEED_RUN:18 for Wheat, SEED_RUN:25 for Maize)
 *   Action:       Drives forward by exact crop spacing -> stops -> dispenses seed
 *                 via 45° hopper swing -> centers -> moves to next seed location!
 *   Stop:         SEED_STOP, STOP, or ESTOP immediately halts auto-sowing.
 * =====================================================================================
 * PINOUT ASSIGNMENTS:
 *   Left Motor PWM:    Pin 4
 *   Left Motor DIR:    Pin 5
 *   Right Motor PWM:   Pin 18
 *   Right Motor DIR:   Pin 19
 *   Actuator Enable:   Pin 23
 *   Actuator IN1:      Pin 25
 *   Actuator IN2:      Pin 26
 *   Drill Enable:      Pin 27
 *   Drill IN3:         Pin 32
 *   Drill IN4:         Pin 33
 *   Hopper Servo PWM:  Pin 14
 *   NPK Servo PWM:     Pin 13
 *   Navigator UART RX: Pin 16 <--- Connect to Navigator TX (Pin 25)
 *   Navigator UART TX: Pin 17 ---> Connect to Navigator RX (Pin 26)
 *   Left Encoder:      Pin 21
 *   Right Encoder:     Pin 22
 * =====================================================================================
 */

#include <Arduino.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// =====================================================================================
// --- MOTOR FORWARD DIRECTION CONFIGURATION ---
// If pressing W turns or one wheel goes reverse, flip that motor's FWD setting:
// =====================================================================================
const uint8_t LEFT_FWD_DIR  = HIGH; // Left wheel forward state
const uint8_t RIGHT_FWD_DIR = HIGH; // Right wheel forward state (change to LOW if right spins backward)

// Opposite reverse states computed automatically:
const uint8_t LEFT_REV_DIR  = (LEFT_FWD_DIR == HIGH) ? LOW : HIGH;
const uint8_t RIGHT_REV_DIR = (RIGHT_FWD_DIR == HIGH) ? LOW : HIGH;

// --- SAFE ESP32 PINOUT ---
const uint8_t LEFT_PWM_PIN = 4;
const uint8_t LEFT_DIR_PIN = 5;
const uint8_t RIGHT_PWM_PIN = 18; 
const uint8_t RIGHT_DIR_PIN = 19; 

const uint8_t ACT_EN_PIN = 23;    
const uint8_t ACT_IN1_PIN = 25;   
const uint8_t ACT_IN2_PIN = 26;   

const uint8_t DRILL_EN_PIN = 27;  
const uint8_t DRILL_IN3_PIN = 32; 
const uint8_t DRILL_IN4_PIN = 33; 

const uint8_t HOPPER_PIN = 14; 
const uint8_t NPK_SERVO_PIN = 13; 

const uint8_t NAV_RX_PIN = 16; 
const uint8_t NAV_TX_PIN = 17; 

const uint8_t ENCODER_LEFT_PIN = 21;  
const uint8_t ENCODER_RIGHT_PIN = 22; 

const uint32_t UART_BAUD = 115200;
const uint32_t MOTOR_PWM_HZ = 20000; 
const uint8_t MOTOR_PWM_BITS = 8;

const uint32_t SERVO_PWM_HZ = 50;
const uint8_t SERVO_PWM_BITS = 14; // 14-bit = 0 to 16383

// Hardware PWM Channels (Universal compatibility across ESP32 Core 2.x and 3.x)
const uint8_t HOPPER_CH = 0;
const uint8_t NPK_CH    = 1;
const uint8_t LEFT_CH   = 2;
const uint8_t RIGHT_CH  = 3;

uint8_t roverSpeed = 255; 
uint8_t turnSpeed = 200; 

// --- PRECISION 0° TO ±45° DUAL-SIDE SEEDING ---
const int HOPPER_CENTER_ANGLE = 90;  // 0° reference (Neutral / Closed)
const int HOPPER_LEFT_ANGLE   = 135; // +45° Left Seed (90 + 45)
const int HOPPER_RIGHT_ANGLE  = 45;  // -45° Right Seed (90 - 45)

bool isMultiSeeding = false;
uint32_t lastSeedStep = 0;
uint8_t multiSeedState = 0; 
const uint32_t SEED_STEP_DELAY = 120; // 120ms per step = rapid high-speed dispense

// --- AUTONOMOUS STEP-AND-SOW DISTANCE CALIBRATION ---
// 1 cm = ~42 milliseconds at roverSpeed (255)
// Or ~1.8 encoder pulses per cm
const uint32_t DRIVE_MS_PER_CM = 42; 
const float ENCODER_PULSES_PER_CM = 1.8f; 

enum AutoSowState {
  SOW_IDLE,
  SOW_MOVE,
  SOW_STOP_SETTLE,
  SOW_DISPENSE,
  SOW_RETURN_CENTER
};

AutoSowState autoSowState = SOW_IDLE;
bool isAutoSowing = false;
int targetSpacingCm = 18;
int seedCount = 0;
uint32_t sowStateStartTime = 0;
int32_t startLeftPulses = 0;
int32_t startRightPulses = 0;
bool alternateSide = false;

enum DriveState { DRIVE_STOP, DRIVE_FWD, DRIVE_BWD, DRIVE_LEFT, DRIVE_RIGHT };
DriveState currentDrive = DRIVE_STOP;

volatile int32_t pulsesLeft = 0;
volatile int32_t pulsesRight = 0;
uint32_t lastEncoderPrint = 0; 

HardwareSerial NavigatorSerial(2);
String rxLine = "";

// --- UNIVERSAL PWM WRITE HELPER ---
void writeServoAngle(uint8_t pin, uint8_t channel, int angle) {
  angle = constrain(angle, 0, 180);
  uint32_t us = map(angle, 0, 180, 700, 2300);
  uint32_t duty = (us * 16383) / 20000;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcWrite(pin, duty);
#else
  ledcWrite(channel, duty);
#endif
}

void writeMotorPwm(uint8_t pin, uint8_t channel, uint8_t duty) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcWrite(pin, duty);
#else
  ledcWrite(channel, duty);
#endif
}

// --- INTERRUPTS & ENCODER FILTER ---
volatile uint32_t lastLeftPulse = 0;
volatile uint32_t lastRightPulse = 0;
const uint32_t DEBOUNCE_DELAY = 5000; 

void IRAM_ATTR leftEncoderISR() { 
  if (digitalRead(ENCODER_LEFT_PIN) == HIGH) {
    uint32_t now = micros();
    if (now - lastLeftPulse > DEBOUNCE_DELAY) {
      pulsesLeft++; 
      lastLeftPulse = now;
    }
  }
}

void IRAM_ATTR rightEncoderISR() { 
  if (digitalRead(ENCODER_RIGHT_PIN) == HIGH) {
    uint32_t now = micros();
    if (now - lastRightPulse > DEBOUNCE_DELAY) {
      pulsesRight++; 
      lastRightPulse = now;
    }
  }
}

// --- ROVER WHEEL MOTION FUNCTIONS ---
void stopMotors() { 
  currentDrive = DRIVE_STOP;
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, 0); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, 0); 
}

// [W] KEY: Straight Forward (Both Wheels Move Forward Together)
void moveForward() { 
  currentDrive = DRIVE_FWD;
  digitalWrite(LEFT_DIR_PIN, LEFT_FWD_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_FWD_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, roverSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, roverSpeed); 
  Serial.println("DRIVE -> FORWARD [W]");
}

// [S] KEY: Straight Backward (Both Wheels Reverse Together)
void moveBackward() { 
  currentDrive = DRIVE_BWD;
  digitalWrite(LEFT_DIR_PIN, LEFT_REV_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_REV_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, roverSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, roverSpeed); 
  Serial.println("DRIVE -> BACKWARD [S]");
}

// [A] KEY: Rotate Left in Place (Left Reverse, Right Forward)
void rotateLeft() { 
  currentDrive = DRIVE_LEFT;
  digitalWrite(LEFT_DIR_PIN, LEFT_REV_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_FWD_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, turnSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, turnSpeed); 
  Serial.println("DRIVE -> ROTATE LEFT [A]");
}

// [D] KEY: Rotate Right in Place (Left Forward, Right Reverse)
void rotateRight() { 
  currentDrive = DRIVE_RIGHT;
  digitalWrite(LEFT_DIR_PIN, LEFT_FWD_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_REV_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, turnSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, turnSpeed); 
  Serial.println("DRIVE -> ROTATE RIGHT [D]");
}

// --- LINEAR ACTUATOR ---
void actuatorStop() { 
  digitalWrite(ACT_EN_PIN, LOW); 
  digitalWrite(ACT_IN1_PIN, LOW); 
  digitalWrite(ACT_IN2_PIN, LOW); 
}

void actuatorExtend() { 
  digitalWrite(ACT_IN1_PIN, HIGH); 
  digitalWrite(ACT_IN2_PIN, LOW); 
  digitalWrite(ACT_EN_PIN, HIGH); 
  Serial.println("HARDWARE -> Actuator Extending DOWN");
}

void actuatorRetract() { 
  digitalWrite(ACT_IN1_PIN, LOW); 
  digitalWrite(ACT_IN2_PIN, HIGH); 
  digitalWrite(ACT_EN_PIN, HIGH); 
  Serial.println("HARDWARE -> Actuator Retracting UP");
}

// --- SEED DRILL MOTOR ---
void stopDrill() { 
  digitalWrite(DRILL_EN_PIN, LOW); 
  digitalWrite(DRILL_IN3_PIN, LOW); 
  digitalWrite(DRILL_IN4_PIN, LOW); 
}

void startDrill() { 
  digitalWrite(DRILL_IN3_PIN, HIGH); 
  digitalWrite(DRILL_IN4_PIN, LOW); 
  digitalWrite(DRILL_EN_PIN, HIGH); 
  Serial.println("HARDWARE -> Drill Motor ON");
}

// --- HIGH-SPEED DUAL-SIDE HOPPER SEEDING ---
void hopperCenter() { 
  isMultiSeeding = false;
  writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE); 
  Serial.println("HARDWARE -> Hopper CENTER (0 deg neutral)");
}

void hopperLeft() { 
  isMultiSeeding = false;
  writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE); 
  Serial.println("HARDWARE -> Hopper LEFT (+45 deg)");
}

void hopperRight() { 
  isMultiSeeding = false;
  writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_RIGHT_ANGLE); 
  Serial.println("HARDWARE -> Hopper RIGHT (-45 deg)");
}

void hopperMultiStart() {
  isMultiSeeding = true;
  multiSeedState = 1;
  writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE);
  lastSeedStep = millis();
  Serial.println("HARDWARE -> High-Speed Multi-Seeding STARTED (120ms)");
}

void hopperMultiStop() {
  hopperCenter();
  Serial.println("HARDWARE -> Multi-Seeding STOPPED");
}

// --- NPK FERTILIZER SERVO ---
void npkUp() { 
  writeServoAngle(NPK_SERVO_PIN, NPK_CH, 0); 
  Serial.println("HARDWARE -> NPK Servo UP (0 deg)");
}   

void npkDown() { 
  writeServoAngle(NPK_SERVO_PIN, NPK_CH, 180); 
  Serial.println("HARDWARE -> NPK Servo DOWN (180 deg)");
} 

// --- EMERGENCY STOP ALL ---
void allActuatorsStop() { 
  isAutoSowing = false;
  autoSowState = SOW_IDLE;
  stopMotors(); 
  actuatorStop(); 
  stopDrill(); 
  hopperCenter(); 
  npkUp(); 
}

// --- PARSE INCOMING COMMANDS ---
void processCommand(String command) {
  command.trim(); 
  command.toUpperCase(); 
  if (command.length() == 0) return;

  if (command == "PING") { 
    NavigatorSerial.println("PONG"); 
    return; 
  }
  
  Serial.println("EXEC -> " + command);

  // Crop-Specific Autonomous Step-and-Sow Run
  if (command.startsWith("SEED_RUN:")) {
    int cm = command.substring(9).toInt();
    if (cm <= 0) cm = 18;
    targetSpacingCm = cm;
    isAutoSowing = true;
    seedCount = 0;
    alternateSide = false;
    autoSowState = SOW_MOVE;
    startLeftPulses = pulsesLeft;
    startRightPulses = pulsesRight;
    sowStateStartTime = millis();
    moveForward();
    Serial.println("AUTOSOW -> Started for " + String(targetSpacingCm) + " cm spacing");
    return;
  }

  if (command == "SEED_STOP") {
    isAutoSowing = false;
    autoSowState = SOW_IDLE;
    stopMotors();
    hopperCenter();
    Serial.println("AUTOSOW -> Stopped. Total seeds sown: " + String(seedCount));
    return;
  }

  // Speed Command
  if (command.startsWith("SPEED:")) {
    int spd = command.substring(6).toInt();
    roverSpeed = constrain(spd, 0, 255);
    turnSpeed = constrain(spd, 80, 255);
    if (currentDrive == DRIVE_FWD) moveForward();
    else if (currentDrive == DRIVE_BWD) moveBackward();
    else if (currentDrive == DRIVE_LEFT) rotateLeft();
    else if (currentDrive == DRIVE_RIGHT) rotateRight();
    return;
  }

  // Movements (W, S, A, D) - Immediately cancels auto-sowing if user manually drives
  if (command == "FORWARD") { isAutoSowing = false; moveForward(); return; }
  if (command == "BACKWARD") { isAutoSowing = false; moveBackward(); return; }
  if (command == "LEFT") { isAutoSowing = false; rotateLeft(); return; }
  if (command == "RIGHT") { isAutoSowing = false; rotateRight(); return; }
  if (command == "STOP") { isAutoSowing = false; stopMotors(); return; }
  if (command == "ESTOP") { allActuatorsStop(); return; }
  
  // Actuator
  if (command == "ACT_DOWN") actuatorExtend();
  else if (command == "ACT_UP") actuatorRetract();
  else if (command == "ACT_STOP") actuatorStop();

  // Drill
  else if (command == "DRILL_ON") startDrill();
  else if (command == "DRILL_OFF") stopDrill();
  
  // Hopper Seeder Commands
  else if (command == "HOPPER_LEFT" || command == "SEED_LEFT") hopperLeft();
  else if (command == "HOPPER_RIGHT" || command == "SEED_RIGHT") hopperRight();
  else if (command == "HOPPER_CENTER" || command == "HOPPER_CLOSE" || command == "SEED_CENTER") hopperCenter();
  else if (command == "HOPPER_MULTI_START" || command == "HOPPER_SWEEP_START" || command == "MULTI_SEED") hopperMultiStart();
  else if (command == "HOPPER_MULTI_STOP" || command == "HOPPER_SWEEP_STOP") hopperMultiStop();
  else if (command == "HOPPER_OPEN") hopperLeft();

  // NPK Dispenser
  else if (command == "NPK_UP") npkUp();
  else if (command == "NPK_DOWN") npkDown();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  NavigatorSerial.begin(UART_BAUD, SERIAL_8N1, NAV_RX_PIN, NAV_TX_PIN);
  
  // 1. SETUP PWM TIMERS (Compatible with Core v2.x and v3.x)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(HOPPER_PIN, SERVO_PWM_HZ, SERVO_PWM_BITS);
  ledcAttach(NPK_SERVO_PIN, SERVO_PWM_HZ, SERVO_PWM_BITS);
  ledcAttach(LEFT_PWM_PIN, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
  ledcAttach(RIGHT_PWM_PIN, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
#else
  ledcSetup(HOPPER_CH, SERVO_PWM_HZ, SERVO_PWM_BITS);
  ledcAttachPin(HOPPER_PIN, HOPPER_CH);
  ledcSetup(NPK_CH, SERVO_PWM_HZ, SERVO_PWM_BITS);
  ledcAttachPin(NPK_SERVO_PIN, NPK_CH);
  ledcSetup(LEFT_CH, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
  ledcAttachPin(LEFT_PWM_PIN, LEFT_CH);
  ledcSetup(RIGHT_CH, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
  ledcAttachPin(RIGHT_PWM_PIN, RIGHT_CH);
#endif

  // 2. Setup Direction Pins
  pinMode(LEFT_DIR_PIN, OUTPUT); 
  pinMode(RIGHT_DIR_PIN, OUTPUT);
  
  // 3. Setup Actuator & Drill Output Pins
  pinMode(ACT_EN_PIN, OUTPUT); 
  pinMode(ACT_IN1_PIN, OUTPUT); 
  pinMode(ACT_IN2_PIN, OUTPUT);
  pinMode(DRILL_EN_PIN, OUTPUT); 
  pinMode(DRILL_IN3_PIN, OUTPUT); 
  pinMode(DRILL_IN4_PIN, OUTPUT);

  // 4. Setup Encoders
  pinMode(ENCODER_LEFT_PIN, INPUT_PULLUP); 
  pinMode(ENCODER_RIGHT_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_LEFT_PIN), leftEncoderISR, RISING);
  attachInterrupt(digitalPinToInterrupt(ENCODER_RIGHT_PIN), rightEncoderISR, RISING);
  
  allActuatorsStop();
  Serial.println("==================================================");
  Serial.println("MACHINIST READY: W=FORWARD, S=BACK, A=LEFT, D=RIGHT");
  Serial.println("CROP DISTANCE AUTONOMOUS SEEDING ENABLED");
  Serial.println("==================================================");
}

void loop() {
  // 1. Read from Navigator ESP32
  while (NavigatorSerial.available()) {
    char c = NavigatorSerial.read();
    if (c == '\n') { 
      processCommand(rxLine); 
      rxLine = ""; 
    } 
    else if (c != '\r') { 
      rxLine += c; 
    }
  }

  // 2. Read from USB Serial Monitor for instant bench testing
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { 
      processCommand(rxLine); 
      rxLine = ""; 
    } 
    else if (c != '\r') { 
      rxLine += c; 
    }
  }

  // 3. Crop-Specific Autonomous Step-and-Sow Sequence
  if (isAutoSowing) {
    uint32_t elapsed = millis() - sowStateStartTime;

    if (autoSowState == SOW_MOVE) {
      int32_t pulsesMoved = (abs(pulsesLeft - startLeftPulses) + abs(pulsesRight - startRightPulses)) / 2;
      int32_t targetPulses = (int32_t)(targetSpacingCm * ENCODER_PULSES_PER_CM);
      uint32_t targetTimeMs = (uint32_t)(targetSpacingCm * DRIVE_MS_PER_CM);

      // Distance reached by encoder or time limit fallback
      if ((pulsesMoved >= targetPulses && targetPulses > 2) || elapsed >= targetTimeMs) {
        stopMotors();
        autoSowState = SOW_STOP_SETTLE;
        sowStateStartTime = millis();
        Serial.println("AUTOSOW -> Seed point #" + String(seedCount + 1) + " reached (" + String(targetSpacingCm) + " cm)");
      }
    }
    else if (autoSowState == SOW_STOP_SETTLE) {
      if (elapsed >= 80) { // 80ms motor inertia settle
        if (!alternateSide) {
          writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE); // +45 deg Left
        } else {
          writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_RIGHT_ANGLE); // -45 deg Right
        }
        alternateSide = !alternateSide;
        autoSowState = SOW_DISPENSE;
        sowStateStartTime = millis();
        Serial.println("AUTOSOW -> Dispensing seed #" + String(seedCount + 1));
      }
    }
    else if (autoSowState == SOW_DISPENSE) {
      if (elapsed >= 120) { // 120ms dispense open time
        writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE); // Return to 0 deg Center
        autoSowState = SOW_RETURN_CENTER;
        sowStateStartTime = millis();
      }
    }
    else if (autoSowState == SOW_RETURN_CENTER) {
      if (elapsed >= 80) { // 80ms return settle time
        seedCount++;
        autoSowState = SOW_MOVE;
        startLeftPulses = pulsesLeft;
        startRightPulses = pulsesRight;
        sowStateStartTime = millis();
        moveForward();
        Serial.println("AUTOSOW -> Advancing to next " + String(targetSpacingCm) + " cm seed position");
      }
    }
  }

  // 4. High-Speed Multi-Seeding Sequence: 0 -> +45° -> 0 -> -45° -> 0
  if (isMultiSeeding && (millis() - lastSeedStep >= SEED_STEP_DELAY)) {
    lastSeedStep = millis();
    if (multiSeedState == 0) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE); // 0° Center
      multiSeedState = 1;
    } else if (multiSeedState == 1) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE);   // +45° Left Seed
      multiSeedState = 2;
    } else if (multiSeedState == 2) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE); // 0° Center
      multiSeedState = 3;
    } else if (multiSeedState == 3) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_RIGHT_ANGLE);  // -45° Right Seed
      multiSeedState = 0;
    }
  }

  // 5. Encoder telemetry
  if (millis() - lastEncoderPrint >= 1000) {
    lastEncoderPrint = millis();
    Serial.println("L_ENC: " + String(pulsesLeft) + " | R_ENC: " + String(pulsesRight));
  }
}
