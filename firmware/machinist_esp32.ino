/* =====================================================================================
 * MACHINIST ESP32 - PRECISION TIME-BASED AUTONOMOUS STEP-AND-SOW CONTROLLER
 * =====================================================================================
 */

#include <Arduino.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// --- MOTOR FORWARD DIRECTION CONFIGURATION ---
const uint8_t LEFT_FWD_DIR  = HIGH; 
const uint8_t RIGHT_FWD_DIR = HIGH; 

const uint8_t LEFT_REV_DIR  = (LEFT_FWD_DIR == HIGH) ? LOW : HIGH;
const uint8_t RIGHT_REV_DIR = (RIGHT_FWD_DIR == HIGH) ? LOW : HIGH;

// --- PINOUT ---
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
const uint8_t SERVO_PWM_BITS = 14;

const uint8_t HOPPER_CH = 0;
const uint8_t NPK_CH    = 1;
const uint8_t LEFT_CH   = 2;
const uint8_t RIGHT_CH  = 3;

uint8_t roverSpeed = 255; 
uint8_t turnSpeed = 200; 

// --- 0° TO ±45° DUAL-SIDE SEEDING ---
const int HOPPER_CENTER_ANGLE = 90;  // 0° reference (Neutral / Closed)
const int HOPPER_LEFT_ANGLE   = 135; // +45° Left Seed
const int HOPPER_RIGHT_ANGLE  = 45;  // -45° Right Seed

bool isMultiSeeding = false;
uint32_t lastSeedStep = 0;
uint8_t multiSeedState = 0; 
const uint32_t SEED_STEP_DELAY = 120; 

// --- TIME-BASED CALIBRATION: 1 cm = 45 ms at full motor speed ---
const uint32_t DRIVE_MS_PER_CM = 45; 

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
bool alternateSide = false;

enum DriveState { DRIVE_STOP, DRIVE_FWD, DRIVE_BWD, DRIVE_LEFT, DRIVE_RIGHT };
DriveState currentDrive = DRIVE_STOP;

volatile int32_t pulsesLeft = 0;
volatile int32_t pulsesRight = 0;
uint32_t lastEncoderPrint = 0; 

HardwareSerial NavigatorSerial(2);
String rxLine = "";

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

void stopMotors() { 
  currentDrive = DRIVE_STOP;
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, 0); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, 0); 
}

void moveForward() { 
  currentDrive = DRIVE_FWD;
  digitalWrite(LEFT_DIR_PIN, LEFT_FWD_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_FWD_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, roverSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, roverSpeed); 
  Serial.println("DRIVE -> FORWARD [W]");
}

void moveBackward() { 
  currentDrive = DRIVE_BWD;
  digitalWrite(LEFT_DIR_PIN, LEFT_REV_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_REV_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, roverSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, roverSpeed); 
  Serial.println("DRIVE -> BACKWARD [S]");
}

void rotateLeft() { 
  currentDrive = DRIVE_LEFT;
  digitalWrite(LEFT_DIR_PIN, LEFT_REV_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_FWD_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, turnSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, turnSpeed); 
  Serial.println("DRIVE -> ROTATE LEFT [A]");
}

void rotateRight() { 
  currentDrive = DRIVE_RIGHT;
  digitalWrite(LEFT_DIR_PIN, LEFT_FWD_DIR); 
  digitalWrite(RIGHT_DIR_PIN, RIGHT_REV_DIR); 
  writeMotorPwm(LEFT_PWM_PIN, LEFT_CH, turnSpeed); 
  writeMotorPwm(RIGHT_PWM_PIN, RIGHT_CH, turnSpeed); 
  Serial.println("DRIVE -> ROTATE RIGHT [D]");
}

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

void hopperCenter() { 
  isMultiSeeding = false;
  writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE); 
  Serial.println("HARDWARE -> Hopper CENTER (0 deg)");
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
  Serial.println("HARDWARE -> Multi-Seeding STARTED (120ms)");
}

void hopperMultiStop() {
  hopperCenter();
  Serial.println("HARDWARE -> Multi-Seeding STOPPED");
}

void npkUp() { 
  writeServoAngle(NPK_SERVO_PIN, NPK_CH, 0); 
  Serial.println("HARDWARE -> NPK Servo UP (0 deg)");
}   

void npkDown() { 
  writeServoAngle(NPK_SERVO_PIN, NPK_CH, 180); 
  Serial.println("HARDWARE -> NPK Servo DOWN (180 deg)");
} 

void startAutoSowing(int spacingCm) {
  targetSpacingCm = (spacingCm <= 0) ? 18 : spacingCm;
  isAutoSowing = true;
  seedCount = 0;
  alternateSide = false;
  autoSowState = SOW_MOVE;
  sowStateStartTime = millis();
  moveForward();
  Serial.println("AUTOSOW -> STARTED: Time-Based Step-and-Sow for " + String(targetSpacingCm) + " cm (" + String(targetSpacingCm * DRIVE_MS_PER_CM) + " ms per step)");
}

void stopAutoSowing() {
  isAutoSowing = false;
  autoSowState = SOW_IDLE;
  stopMotors();
  hopperCenter();
  Serial.println("AUTOSOW -> STOPPED. Total seeds sown: " + String(seedCount));
}

void allActuatorsStop() { 
  stopAutoSowing();
  actuatorStop(); 
  stopDrill(); 
  hopperCenter(); 
  npkUp(); 
}

void processCommand(String command) {
  command.trim(); 
  command.toUpperCase(); 
  if (command.length() == 0) return;

  if (command == "PING") { 
    NavigatorSerial.println("PONG"); 
    return; 
  }
  
  Serial.println("EXEC -> " + command);

  // Autonomous Seeding Triggers
  if (command == "AUTO_START" || command == "AUTO:START") {
    startAutoSowing(18);
    return;
  }
  if (command.startsWith("SEED_RUN:")) {
    int cm = command.substring(9).toInt();
    startAutoSowing(cm);
    return;
  }
  if (command == "SEED_STOP" || command == "AUTO_STOP" || command == "AUTO:STOP") {
    stopAutoSowing();
    return;
  }

  // Speed
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

  // Manual movements override autonomous
  if (command == "FORWARD") { isAutoSowing = false; moveForward(); return; }
  if (command == "BACKWARD") { isAutoSowing = false; moveBackward(); return; }
  if (command == "LEFT") { isAutoSowing = false; rotateLeft(); return; }
  if (command == "RIGHT") { isAutoSowing = false; rotateRight(); return; }
  if (command == "STOP") { stopAutoSowing(); return; }
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

  pinMode(LEFT_DIR_PIN, OUTPUT); 
  pinMode(RIGHT_DIR_PIN, OUTPUT);
  pinMode(ACT_EN_PIN, OUTPUT); 
  pinMode(ACT_IN1_PIN, OUTPUT); 
  pinMode(ACT_IN2_PIN, OUTPUT);
  pinMode(DRILL_EN_PIN, OUTPUT); 
  pinMode(DRILL_IN3_PIN, OUTPUT); 
  pinMode(DRILL_IN4_PIN, OUTPUT);

  pinMode(ENCODER_LEFT_PIN, INPUT_PULLUP); 
  pinMode(ENCODER_RIGHT_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_LEFT_PIN), leftEncoderISR, RISING);
  attachInterrupt(digitalPinToInterrupt(ENCODER_RIGHT_PIN), rightEncoderISR, RISING);
  
  allActuatorsStop();
  Serial.println("==================================================");
  Serial.println("MACHINIST READY: TIME-BASED AUTO SEEDING ACTIVE");
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

  // 2. Read from Serial Monitor
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

  // 3. PURE TIME-BASED AUTONOMOUS STEP-AND-SOW
  if (isAutoSowing) {
    uint32_t elapsed = millis() - sowStateStartTime;
    uint32_t targetDriveTimeMs = (uint32_t)targetSpacingCm * DRIVE_MS_PER_CM;

    if (autoSowState == SOW_MOVE) {
      if (elapsed >= targetDriveTimeMs) {
        stopMotors();
        autoSowState = SOW_STOP_SETTLE;
        sowStateStartTime = millis();
        Serial.println("AUTOSOW -> Reached seed point #" + String(seedCount + 1) + 
                       " (" + String(targetSpacingCm) + " cm, " + String(targetDriveTimeMs) + " ms)");
      }
    }
    else if (autoSowState == SOW_STOP_SETTLE) {
      if (elapsed >= 100) {
        if (!alternateSide) {
          writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE);
        } else {
          writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_RIGHT_ANGLE);
        }
        alternateSide = !alternateSide;
        autoSowState = SOW_DISPENSE;
        sowStateStartTime = millis();
        Serial.println("AUTOSOW -> Dispensing seed #" + String(seedCount + 1));
      }
    }
    else if (autoSowState == SOW_DISPENSE) {
      if (elapsed >= 130) {
        writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE);
        autoSowState = SOW_RETURN_CENTER;
        sowStateStartTime = millis();
      }
    }
    else if (autoSowState == SOW_RETURN_CENTER) {
      if (elapsed >= 100) {
        seedCount++;
        autoSowState = SOW_MOVE;
        sowStateStartTime = millis();
        moveForward();
        Serial.println("AUTOSOW -> Advancing to next seed spot (" + String(targetSpacingCm) + " cm)...");
      }
    }
  }

  // 4. Manual Multi-Seed Oscillation
  if (isMultiSeeding && (millis() - lastSeedStep >= SEED_STEP_DELAY)) {
    lastSeedStep = millis();
    if (multiSeedState == 0) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE);
      multiSeedState = 1;
    } else if (multiSeedState == 1) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_LEFT_ANGLE);
      multiSeedState = 2;
    } else if (multiSeedState == 2) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_CENTER_ANGLE);
      multiSeedState = 3;
    } else if (multiSeedState == 3) {
      writeServoAngle(HOPPER_PIN, HOPPER_CH, HOPPER_RIGHT_ANGLE);
      multiSeedState = 0;
    }
  }

  // 5. Telemetry
  if (millis() - lastEncoderPrint >= 1000) {
    lastEncoderPrint = millis();
    Serial.println("L_ENC: " + String(pulsesLeft) + " | R_ENC: " + String(pulsesRight));
  }
}
